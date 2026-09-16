"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import {
  Camera,
  Check,
  ChevronDown,
  CircleAlert,
  History,
  Loader2,
  ScanBarcode,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { BarcodeScannerDialog } from "@/components/shared/barcode-scanner-dialog";
import { ProductPhotoThumb } from "@/components/shared/product-photo-thumb";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/lib/i18n";
import { computeSaleTotals } from "@/lib/sales-totals";
import { cn } from "@/lib/utils";

// Client option in the picker (from GET /api/clients).
interface ClientOption {
  id: string;
  name: string;
  phone: string;
  type: string;
  outstandingDue: number;
}

// Snapshot returned by GET /api/clients/[id]/purchase-summary — drives the
// inline purchase-history card and the block-DUE-clients enforcement.
interface PurchaseSummary {
  client: {
    id: string;
    name: string;
    phone: string;
    type: string;
  };
  outstandingDue: number;
  unpaidInvoiceCount: number;
  lastPurchases: {
    id: string;
    invoiceNumber: string;
    total: number;
    amountPaid: number;
    paymentStatus: string;
    date: string;
  }[];
  blockDueClients: boolean;
}

// Product returned by GET /api/finished-products/lookup.
interface LookupProduct {
  id: string;
  barcode: string;
  quantityRemaining: number;
  productType: string;
  batchNumber: string;
  storageLocation: string;
  imageUrl: string | null;
}

// Product returned by GET /api/finished-products/lookup-by-type.
interface TypeLookupProduct {
  id: string;
  barcode: string;
  productType: string;
  quantity: number;
  quantityRemaining: number;
  batchNumber: string;
  storageLocation: string;
  imageUrl: string | null;
}

// One line in the cart. NOTE: there is no price list table yet, so the
// operator types the unit price manually per item (flagged limitation).
// `available` is the stock left on the shelf for the lot; `quantity` may be
// reduced below it to sell just part of a lot.
interface CartItem {
  productId: string;
  barcode: string;
  productType: string;
  batchNumber: string;
  quantity: number;
  available: number;
  unitPrice: string;
  imageUrl: string | null;
}

// SWR fetcher — throws on non-2xx so isLoading/error behave predictably.
async function fetcher<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.message ?? "Something went wrong");
  }
  return response.json() as Promise<T>;
}

const PAYMENT_METHODS = [
  { value: "CASH", label: "Cash" },
  { value: "BKASH", label: "bKash" },
  { value: "NAGAD", label: "Nagad" },
  { value: "BANK_TRANSFER", label: "Bank transfer" },
] as const;

function formatMoney(value: number) {
  return `৳${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function NewSaleClient() {
  const { t } = useLanguage();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [clientOpen, setClientOpen] = useState(false);
  const [pickedClient, setPickedClient] = useState<ClientOption | null>(null);
  const [barcodeInput, setBarcodeInput] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discountInput, setDiscountInput] = useState("0");
  const [paymentMethod, setPaymentMethod] = useState<string>("CASH");
  const [payMode, setPayMode] = useState<"FULL" | "CREDIT">("FULL");
  const [amountPaidInput, setAmountPaidInput] = useState("0");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // #15 Type-ahead on product type: as the operator types (2+ chars that are
  // NOT a barcode like JC-0001), in-stock lots whose product type matches are
  // offered in a dropdown. Arrow keys + Enter pick one; a real scan flow is
  // untouched. typeQuery is debounced so typing "lun" fires one request.
  const [typeQuery, setTypeQuery] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(0);
  // Remembers the exact text the operator dismissed with Escape, so the
  // dropdown stays closed until the input changes again. Set only from event
  // handlers — never from an effect.
  const [dismissedQuery, setDismissedQuery] = useState<string | null>(null);
  // Openness is DERIVED from the input rather than mirrored through an effect:
  // barcode-shaped input (JC-… or pure digits) goes through the scan flow,
  // never the type-ahead; anything else with 2+ chars opens the dropdown.
  const trimmedInput = barcodeInput.trim();
  const looksLikeBarcode = /^jc-/i.test(trimmedInput) || /^\d+$/.test(trimmedInput);
  const typeaheadOpen =
    !looksLikeBarcode && trimmedInput.length >= 2 && dismissedQuery !== trimmedInput;
  // typeQuery is debounced so typing "lun" fires one request. State updates
  // happen inside the timer callback, not synchronously in the effect body.
  useEffect(() => {
    if (!typeaheadOpen) return;
    const timer = setTimeout(() => {
      setTypeQuery(trimmedInput);
      setHighlightIndex(0);
    }, 200);
    return () => clearTimeout(timer);
  }, [typeaheadOpen, trimmedInput]);

  const {
    data: typeMatches,
    isLoading: typeMatchesLoading,
  } = useSWR<TypeLookupProduct[]>(
    typeaheadOpen && typeQuery.length >= 2
      ? `/api/finished-products/lookup-by-type?type=${encodeURIComponent(typeQuery)}`
      : null,
    fetcher<TypeLookupProduct[]>
  );
  const typeResults = typeMatches ?? [];

  // Scanner handling refs. A USB barcode scanner "types" the barcode and
  // presses Enter, so the input must hold focus at all times and lookup must
  // run on Enter only. The pending ref queues a scan that lands while a
  // lookup is still in flight (fast multi-scanning) instead of dropping it,
  // and the cart mirror lets the duplicate check see the latest cart without
  // stale closures during queued scans.
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const pendingScanRef = useRef<string | null>(null);
  const cartRef = useRef<CartItem[]>([]);
  // Mirrors canComplete so the global Enter-to-finalize handler sees the
  // latest values without re-binding the window listener on every render.
  const canCompleteRef = useRef(false);
  useEffect(() => {
    cartRef.current = cart;
  }, [cart]);
  // autoFocus covers the common case, but this client is wrapped in
  // <Suspense>, so focus once mounted to guarantee the scanner's very first
  // "typing" lands in this field.
  useEffect(() => {
    barcodeInputRef.current?.focus();
  }, []);

  // Keyboard-first POS: whatever the operator types on a physical keyboard
  // should land in the barcode field unless they are deliberately typing in
  // another field (price, discount, client search…). When focus is NOT in an
  // editable element and a key is pressed, bounce focus back to the scanner.
  // Excludes whitespace-only presses (Tab navigation) so Tab still works.
  useEffect(() => {
    function handleGlobalKeydown(event: KeyboardEvent) {
      if (event.key.length !== 1 && event.key !== "Backspace") return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toUpperCase() ?? "";
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target?.isContentEditable
      ) {
        return;
      }
      barcodeInputRef.current?.focus();
    }
    window.addEventListener("keydown", handleGlobalKeydown);
    return () => window.removeEventListener("keydown", handleGlobalKeydown);
  }, []);

  const {
    data: clients,
    isLoading: clientsLoading,
  } = useSWR<ClientOption[]>("/api/clients", fetcher<ClientOption[]>, {
    refreshInterval: 30000,
  });

  // Deep link: /new-sale?client=<id> (from the Clients screen) preselects.
  // Derived during render instead of synced via an effect: the deep-linked
  // client applies until the user explicitly picks another one.
  const clientParam = searchParams.get("client");
  const selectedClient =
    pickedClient ??
    (clientParam && clients
      ? clients.find((client) => client.id === clientParam) ?? null
      : null);

  // #27 Inline client snapshot: last 3 purchases + total dues, refreshed on
  // the same cadence as the client list. Only fetched once a client is picked.
  const {
    data: clientSummary,
    isLoading: clientSummaryLoading,
  } = useSWR<PurchaseSummary>(
    selectedClient
      ? `/api/clients/${selectedClient.id}/purchase-summary`
      : null,
    fetcher<PurchaseSummary>,
    { refreshInterval: 30000, keepPreviousData: true }
  );

  // Money math is shared with POST /api/sales via lib/sales-totals.ts, so the
  // totals shown here are exactly what gets stored.
  const discount = Number(discountInput) || 0;
  const { subtotal, total } = computeSaleTotals(
    cart.map((item) => ({
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice) || 0,
    })),
    discount
  );
  const amountPaid = payMode === "FULL" ? total : Number(amountPaidInput) || 0;

  // On a failed/duplicate scan keep the scanned text visible (so the operator
  // can see what they scanned) but select it — the next scan then replaces it
  // instead of appending to it.
  function keepAndSelectBarcodeInput() {
    const input = barcodeInputRef.current;
    input?.focus();
    input?.select();
  }

  // Add an in-stock lot (from a scan or from the type-ahead) to the cart.
  // Shared by both flows so the duplicate + shape logic lives in one place.
  function addProductToCart(
    product: Pick<
      LookupProduct,
      | "id"
      | "barcode"
      | "productType"
      | "batchNumber"
      | "quantityRemaining"
      | "imageUrl"
    >
  ) {
    if (cartRef.current.some((item) => item.productId === product.id)) {
      toast.error(`${product.barcode} ${t("is already in the cart.")}`);
      keepAndSelectBarcodeInput();
      return false;
    }
    setCart((current) => [
      ...current,
      {
        productId: product.id,
        barcode: product.barcode,
        productType: product.productType,
        batchNumber: product.batchNumber,
        quantity: product.quantityRemaining,
        available: product.quantityRemaining,
        imageUrl: product.imageUrl,
        unitPrice: "",
      },
    ]);
    setBarcodeInput("");
    // The input is now empty, so the derived typeaheadOpen is already false;
    // just forget any Escape dismissal so re-typing the same text re-opens.
    setDismissedQuery(null);
    barcodeInputRef.current?.focus();
    return true;
  }

  // Look one barcode up and add it to the cart. Never throws — every path
  // shows its own feedback. On success the input is cleared and re-focused
  // for the next scan; on failure the text is kept and selected.
  async function processScan(barcode: string) {
    try {
      const response = await fetch(
        `/api/finished-products/lookup?barcode=${encodeURIComponent(barcode)}`
      );
      // The lookup endpoint only returns IN_STOCK lots with stock left, so a
      // non-ok response covers both "unknown barcode" and "nothing left".
      if (!response.ok) {
        toast.error(t("Product not found or out of stock."));
        keepAndSelectBarcodeInput();
        return;
      }

      const payload = await response.json().catch(() => null);
      const product = payload as LookupProduct | null;
      if (!product?.id) {
        toast.error(t("Product not found or out of stock."));
        keepAndSelectBarcodeInput();
        return;
      }

      if (
        !addProductToCart({
          id: product.id,
          barcode: product.barcode,
          productType: product.productType,
          batchNumber: product.batchNumber,
          quantityRemaining: product.quantityRemaining,
          imageUrl: product.imageUrl,
        })
      ) {
        return;
      }
    } catch {
      toast.error(t("Could not reach the server. Please check your connection."));
      keepAndSelectBarcodeInput();
    }
  }

  // Barcode scanner / Enter handler — a USB scanner "types" the barcode and
  // hits Enter, so the form's onSubmit IS the scan event. The lookup runs on
  // Enter only, never on every keystroke. While one lookup is in flight a
  // fast second scan is queued (latest wins) and processed right after, so
  // rapid multi-scanning never silently drops an item. The phone-camera
  // scanner feeds the exact same queue through runScanLoop().
  async function runScanLoop(firstBarcode: string) {
    if (isScanning) {
      pendingScanRef.current = firstBarcode;
      return;
    }

    let current = firstBarcode;
    setIsScanning(true);
    try {
      do {
        await processScan(current);
        current = pendingScanRef.current ?? "";
        pendingScanRef.current = null;
      } while (current !== "");
    } finally {
      setIsScanning(false);
    }
  }

  function handleScan(event: FormEvent) {
    event.preventDefault();
    const barcode = barcodeInput.trim();
    if (barcode !== "") void runScanLoop(barcode);
  }

  // #15 Keyboard navigation for the type-ahead dropdown: ArrowUp/ArrowDown
  // move the highlight, Enter picks the highlighted lot (instead of scanning),
  // Escape closes the dropdown. A plain scan (barcode-shaped text) never opens
  // the dropdown, so scanner Enter is unaffected.
  function handleBarcodeKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (typeaheadOpen && typeResults.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setHighlightIndex((current) => (current + 1) % typeResults.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setHighlightIndex((current) =>
          current <= 0 ? typeResults.length - 1 : current - 1
        );
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        pickTypeahead(typeResults[highlightIndex]);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        // Keep the typed text but close the dropdown; typing anything
        // different re-opens it (derived from the input, no effect needed).
        setDismissedQuery(trimmedInput);
        return;
      }
    }

    // #14 Enter-to-finalize: with an empty barcode field, a full cart and a
    // valid client, Enter completes the sale — no mouse needed at the counter.
    if (
      event.key === "Enter" &&
      barcodeInput.trim() === "" &&
      canCompleteRef.current
    ) {
      event.preventDefault();
      void handleCompleteSale();
    }
  }

  // Pick a lot from the type-ahead dropdown and add it to the cart.
  function pickTypeahead(product: TypeLookupProduct) {
    addProductToCart({
      id: product.id,
      barcode: product.barcode,
      productType: product.productType,
      batchNumber: product.batchNumber,
      quantityRemaining: product.quantityRemaining,
      imageUrl: product.imageUrl,
    });
  }

  function updateItemUnitPrice(productId: string, value: string) {
    setCart((current) =>
      current.map((item) =>
        item.productId === productId ? { ...item, unitPrice: value } : item
      )
    );
  }

  // Sell just part of a lot: clamp the requested quantity to the stock that
  // is actually left on the shelf (>= 1, <= available). The server performs
  // the same validation again when the sale is recorded.
  function updateItemQuantity(productId: string, value: string) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    setCart((current) =>
      current.map((item) =>
        item.productId === productId
          ? {
              ...item,
              quantity: Math.min(Math.max(parsed, 1), item.available),
            }
          : item
      )
    );
  }

  function removeItem(productId: string) {
    setCart((current) =>
      current.filter((item) => item.productId !== productId)
    );
  }

  // Complete the sale, then redirect to the printable invoice.
  async function handleCompleteSale() {
    if (!selectedClient || cart.length === 0) return;
    if (cart.some((item) => !(Number(item.unitPrice) > 0))) {
      toast.error(t("Every item needs a unit price before completing the sale."));
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: selectedClient.id,
          items: cart.map((item) => ({
            finishedProductId: item.productId,
            quantity: item.quantity,
            unitPrice: Number(item.unitPrice),
          })),
          discount,
          paymentMethod,
          amountPaid,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(payload?.message ?? t("Could not record the sale."));
        return;
      }

      toast.success(t("Sale recorded — opening the invoice…"));
      router.push(`/operator/pos/invoice/${payload.id}`);
    } catch {
      toast.error(t("Could not reach the server. Please check your connection."));
    } finally {
      setIsSubmitting(false);
    }
  }

  const canComplete =
    selectedClient !== null &&
    cart.length > 0 &&
    cart.every((item) => Number(item.unitPrice) > 0) &&
    !isSubmitting;

  // Keep the ref in sync for the keyboard finalize shortcut.
  useEffect(() => {
    canCompleteRef.current = canComplete;
  }, [canComplete]);

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
          {t("Point of sale")}
        </p>
        <h1 className="mt-1 font-display text-3xl font-bold text-foreground">
          {t("New sale")}
        </h1>
      </div>

      {/* Client selector */}
      <Popover open={clientOpen} onOpenChange={setClientOpen}>
        <PopoverTrigger
          className={cn(
            "flex h-11 w-full max-w-xl items-center justify-between rounded-lg border border-input bg-white px-3 text-left text-sm transition-colors focus-visible:border-gold focus-visible:ring-4 focus-visible:ring-gold/20",
            !selectedClient && "text-muted-foreground"
          )}
        >
          {selectedClient ? (
            <span className="flex items-center gap-2">
              <span className="font-medium text-charcoal">
                {selectedClient.name}
              </span>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">
                {selectedClient.phone}
              </span>
            </span>
          ) : (
            <span>{t("Select a client…")}</span>
          )}
          <ChevronDown
            className={cn(
              "size-4 text-muted-foreground transition-transform",
              clientOpen && "rotate-180"
            )}
            aria-hidden
          />
        </PopoverTrigger>
        <PopoverContent className="w-[min(36rem,90vw)] p-0" align="start">
          <Command>
            <CommandInput placeholder={t("Search clients by name…")} />
            <CommandList>
              {clientsLoading ? (
                <div className="space-y-2 p-3">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-3/4" />
                </div>
              ) : (
                <>
                  <CommandEmpty>{t("No client found.")}</CommandEmpty>
                  <CommandGroup>
                    {(clients ?? []).map((client) => (
                      <CommandItem
                        key={client.id}
                        value={client.name}
                        onSelect={() => {
                          setPickedClient(client);
                          setClientOpen(false);
                        }}
                      >
                        <Check
                          className={cn(
                            "mr-2 size-4",
                            selectedClient?.id === client.id
                              ? "opacity-100"
                              : "opacity-0"
                          )}
                        />
                        <span className="flex-1">{client.name}</span>
                        {client.outstandingDue > 0 && (
                          <span className="mr-2 rounded-full bg-rust/15 px-2 py-0.5 text-[10px] font-semibold text-rust">
                            {t("DUE")} {formatMoney(client.outstandingDue)}
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {client.phone} ·{" "}
                          {t(client.type === "WHOLESALE" ? "Wholesale" : "Retail")}
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* #27 Inline client snapshot — last purchases + dues, so the operator
          can upsell and never unknowingly sells to a DUE client. */}
      {selectedClient && (
        <div className="max-w-xl rounded-xl border bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-border bg-cream/50 px-4 py-2.5">
            <History className="size-4 text-gold" aria-hidden />
            <h2 className="text-xs font-semibold uppercase tracking-wide text-charcoal">
              {t("Client history")}
            </h2>
          </div>

          {clientSummaryLoading && !clientSummary ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-5 w-1/2" />
            </div>
          ) : clientSummary ? (
            <div className="p-4">
              {/* Last 3 purchases (upsell view — any status). */}
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("Last purchases")}
              </p>
              {clientSummary.lastPurchases.length === 0 ? (
                <p className="mt-1.5 text-sm text-muted-foreground">
                  {t("No purchases yet")}
                </p>
              ) : (
                <ul className="mt-1.5 space-y-1.5">
                  {clientSummary.lastPurchases.map((purchase) => (
                    <li
                      key={purchase.id}
                      className="flex flex-wrap items-center gap-2 text-sm"
                    >
                      <span className="font-mono text-xs text-muted-foreground">
                        {purchase.invoiceNumber}
                      </span>
                      <span className="text-muted-foreground">
                        {new Date(purchase.date).toLocaleDateString("en-GB", {
                          day: "2-digit",
                          month: "short",
                        })}
                      </span>
                      <span className="font-medium text-charcoal">
                        {formatMoney(purchase.total)}
                      </span>
                      <StatusBadge status={purchase.paymentStatus} />
                    </li>
                  ))}
                </ul>
              )}

              {/* Total dues across all unpaid invoices. */}
              <p
                className={cn(
                  "mt-3 flex items-center gap-1.5 border-t pt-3 text-sm font-medium",
                  clientSummary.outstandingDue > 0
                    ? "text-rust"
                    : "text-muted-foreground"
                )}
              >
                {t("Total dues")}:
                <span className="font-mono">
                  {formatMoney(clientSummary.outstandingDue)}
                </span>
                {clientSummary.unpaidInvoiceCount > 0 && (
                  <span className="text-xs font-normal text-muted-foreground">
                    · {clientSummary.unpaidInvoiceCount}{" "}
                    {t("unpaid invoices")}
                  </span>
                )}
              </p>

              {/* Owner policy: DUE clients must not be sold on credit. */}
              {clientSummary.blockDueClients &&
                clientSummary.outstandingDue > 0 && (
                  <div className="mt-3 flex items-start gap-2 rounded-lg border border-rust/40 bg-rust/10 px-3 py-2 text-xs text-charcoal">
                    <CircleAlert
                      className="mt-0.5 size-4 shrink-0 text-rust"
                      aria-hidden
                    />
                    <p className="font-medium">
                      {t(
                        "This client has outstanding dues. Credit sales are blocked — collect the dues or take full payment."
                      )}
                    </p>
                  </div>
                )}
            </div>
          ) : null}
        </div>
      )}

      {/* Barcode scan */}
      <div className="relative max-w-xl">
        <form onSubmit={handleScan} className="flex gap-2">
          <div className="relative flex-1">
            <ScanBarcode className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={barcodeInputRef}
              value={barcodeInput}
              onChange={(event) => setBarcodeInput(event.target.value)}
              onKeyDown={handleBarcodeKeyDown}
              placeholder={t("Scan barcode or type JC-0001 then press Enter")}
              className="h-11 pl-9 font-mono"
              autoFocus
            />
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => setCameraOpen(true)}
            aria-label={t("Scan with the camera")}
            title={t("Scan with the camera")}
            className="size-11 shrink-0"
          >
            <Camera className="size-4" />
          </Button>
          <Button type="submit" disabled={barcodeInput.trim() === "" || isScanning}>
            {isScanning ? <Loader2 className="size-4 animate-spin" /> : t("Add")}
          </Button>
        </form>

        {/* #15 Product-type type-ahead dropdown. Barcode-shaped input never
            opens it, so the scanner flow is completely unaffected. */}
        {typeaheadOpen && (
          <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-lg border border-border bg-white shadow-lg">
            {typeMatchesLoading ? (
              <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                {t("Looking up products…")}
              </div>
            ) : typeResults.length === 0 ? (
              <p className="px-4 py-3 text-sm text-muted-foreground">
                {t("No products match that type.")}
              </p>
            ) : (
              <ul className="max-h-72 overflow-y-auto" role="listbox">
                {typeResults.map((product, index) => (
                  <li key={product.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={index === highlightIndex}
                      onMouseEnter={() => setHighlightIndex(index)}
                      onClick={() => pickTypeahead(product)}
                      className={cn(
                        "flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors",
                        index === highlightIndex
                          ? "bg-gold/15"
                          : "hover:bg-muted/40"
                      )}
                    >
                      <ProductPhotoThumb
                        imageUrl={product.imageUrl}
                        alt={product.barcode}
                      />
                      <span className="font-mono text-xs text-muted-foreground">
                        {product.barcode}
                      </span>
                      <span className="font-medium text-charcoal">
                        {product.productType}
                      </span>
                      <span className="ml-auto font-mono text-xs text-muted-foreground">
                        {product.quantityRemaining} {t("left in stock")}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Manual fallback for PCs without a scanner attached. */}
        <p className="mt-2 text-xs text-muted-foreground">
          {t("No scanner at this PC?")}{" "}
          <button
            type="button"
            onClick={keepAndSelectBarcodeInput}
            className="font-semibold text-charcoal underline decoration-gold underline-offset-2 transition-colors hover:text-gold"
          >
            {t("Or enter barcode manually")}
          </button>{" "}
          {t("— type it (e.g. JC-0001) and press Enter, exactly like a scan.")}{" "}
          {t("You can also type a product type (e.g. Lungi) and press Enter.")}
        </p>
      </div>

      {/* Cart */}
      {cart.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-white/60 p-8 text-center text-sm text-muted-foreground">
          {t("No items yet — scan a barcode above to start the sale.")}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">{t("Product")}</th>
                <th className="px-4 py-2.5 font-medium">{t("Quantity")}</th>
                <th className="px-4 py-2.5 font-medium">{t("Unit price (৳)")}</th>
                <th className="px-4 py-2.5 font-medium">{t("Line total")}</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {cart.map((item) => (
                <tr key={item.productId} className="border-b last:border-0">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <ProductPhotoThumb
                        imageUrl={item.imageUrl}
                        alt={item.barcode}
                      />
                      <div>
                        <p className="font-medium">{item.productType}</p>
                        <p className="font-mono text-xs text-muted-foreground">
                          {item.barcode} · {item.batchNumber}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Input
                      type="number"
                      min="1"
                      max={item.available}
                      step="1"
                      value={item.quantity}
                      onChange={(event) =>
                        updateItemQuantity(item.productId, event.target.value)
                      }
                      aria-label={`Quantity of ${item.barcode}`}
                      className="h-9 w-24"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.available} {t("left in stock")}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.unitPrice}
                      onChange={(event) =>
                        updateItemUnitPrice(item.productId, event.target.value)
                      }
                      placeholder="0.00"
                      className="h-9 w-28"
                    />
                  </td>
                  <td className="px-4 py-3 font-medium">
                    {formatMoney(
                      item.quantity * (Number(item.unitPrice) || 0)
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${item.barcode}`}
                      onClick={() => removeItem(item.productId)}
                    >
                      <Trash2 className="size-4 text-muted-foreground" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Payment summary panel */}
      <div className="max-w-xl rounded-xl border bg-white p-5">
        <h2 className="font-display text-lg font-semibold">{t("Payment summary")}</h2>

        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">{t("Subtotal")}</dt>
            <dd className="font-medium">{formatMoney(subtotal)}</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted-foreground">{t("Discount")}</dt>
            <dd>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={discountInput}
                onChange={(event) => setDiscountInput(event.target.value)}
                className="h-9 w-28 text-right"
              />
            </dd>
          </div>
          <div className="flex justify-between border-t pt-2 text-base">
            <dt className="font-semibold">{t("Total")}</dt>
            <dd className="font-display font-bold">{formatMoney(total)}</dd>
          </div>
        </dl>

        {/* Payment method pills */}
        <div className="mt-4">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            {t("Payment method")}
          </Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {PAYMENT_METHODS.map((method) => (
              <button
                key={method.value}
                type="button"
                onClick={() => setPaymentMethod(method.value)}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
                  paymentMethod === method.value
                    ? "border-gold bg-gold text-gold-foreground"
                    : "bg-muted/40 hover:bg-muted"
                )}
              >
                {t(method.label)}
              </button>
            ))}
          </div>
        </div>

        {/* Paid in full vs wholesale credit */}
        <div className="mt-4">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            {t("Payment")}
          </Label>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => setPayMode("FULL")}
              className={cn(
                "flex-1 rounded-lg border px-3 py-2 text-sm transition-colors",
                payMode === "FULL"
                  ? "border-gold bg-gold/10 font-medium"
                  : "bg-muted/40 hover:bg-muted"
              )}
            >
              {t("Paid in full")}
            </button>
            <button
              type="button"
              onClick={() => setPayMode("CREDIT")}
              className={cn(
                "flex-1 rounded-lg border px-3 py-2 text-sm transition-colors",
                payMode === "CREDIT"
                  ? "border-gold bg-gold/10 font-medium"
                  : "bg-muted/40 hover:bg-muted"
              )}
            >
              {t("Wholesale credit")}
            </button>
          </div>
        </div>

        {payMode === "CREDIT" && (
          <div className="mt-4">
            <Label htmlFor="amount-paid">{t("Amount paid now (৳)")}</Label>
            <Input
              id="amount-paid"
              type="number"
              min="0"
              step="0.01"
              value={amountPaidInput}
              onChange={(event) => setAmountPaidInput(event.target.value)}
              className="mt-1.5 h-10"
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              {t("Due after this payment:")}{" "}
              <span className="font-medium text-rust">
                {formatMoney(Math.max(total - amountPaid, 0))}
              </span>
            </p>
          </div>
        )}

        <Button
          size="lg"
          className="mt-5 w-full bg-gold hover:bg-gold/90"
          disabled={!canComplete}
          onClick={handleCompleteSale}
        >
          {isSubmitting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            t("Complete sale")
          )}
        </Button>
      </div>



      {/* MAIN_GRID_ANCHOR */}

      {/* Phone-camera scanner — same lookup pipeline as the USB input. */}
      <BarcodeScannerDialog
        open={cameraOpen}
        onOpenChange={setCameraOpen}
        onDetected={(barcode) => void runScanLoop(barcode)}
      />
    </div>
  );
}
