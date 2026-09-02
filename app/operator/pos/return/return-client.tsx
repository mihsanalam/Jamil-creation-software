"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  Check,
  CircleAlert,
  Loader2,
  RotateCcw,
  ScanBarcode,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

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
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

// Client option in the picker (from GET /api/clients).
interface ClientOption {
  id: string;
  name: string;
  phone: string;
  type: string;
}

// Lightweight hit from GET /api/sales/lookup?number=...
interface InvoiceSummary {
  id: string;
  invoiceNumber: string;
  total: number;
  createdAt: string;
  clientName: string;
  clientPhone: string;
}

// Line from GET /api/sales/[id].
interface InvoiceItem {
  id: string;
  barcode: string;
  productType: string;
  batchNumber: string;
  quantity: number;
  returnedQuantity: number;
  unitPrice: number;
  lineTotal: number;
}

// Product returned by GET /api/finished-products/lookup (IN_STOCK only).
interface LookupProduct {
  id: string;
  barcode: string;
  quantityRemaining: number;
  productType: string;
  batchNumber: string;
  storageLocation: string;
}

// One exchange line the operator is giving the client.
interface ExchangeItem {
  productId: string;
  barcode: string;
  productType: string;
  batchNumber: string;
  quantity: number;
  available: number;
  unitPrice: string;
}

async function fetcher<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.message ?? "Something went wrong");
  }
  return response.json() as Promise<T>;
}

function formatMoney(value: number) {
  return `৳${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

const FIELD =
  "h-10 rounded-lg border-input bg-white px-3 text-sm focus-visible:border-gold focus-visible:ring-4 focus-visible:ring-gold/20";

export function ReturnClient() {
  // Step 1 — client.
  const [clientOpen, setClientOpen] = useState(false);
  const [pickedClient, setPickedClient] = useState<ClientOption | null>(null);
  const { data: clients } = useSWR<ClientOption[]>("/api/clients", fetcher, {
    refreshInterval: 30000,
  });

  // Step 2 — invoice lookup.
  const [invoiceInput, setInvoiceInput] = useState("");
  const [foundSale, setFoundSale] = useState<InvoiceSummary | null>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);

  // Full invoice details, loaded once the lookup hits.
  const { data: sale, isLoading: saleLoading } = useSWR(
    foundSale ? `/api/sales/${foundSale.id}` : null,
    fetcher<{
      id: string;
      invoiceNumber: string;
      total: number;
      amountPaid: number;
      client: { name: string; phone: string };
      items: InvoiceItem[];
    }>
  );

  // Step 3 — per-line return quantities and reasons.
  const [returnQty, setReturnQty] = useState<Record<string, string>>({});
  const [returnReason, setReturnReason] = useState<Record<string, string>>({});

  // Step 4 — exchange lines (products given back to the client).
  const [exchanges, setExchanges] = useState<ExchangeItem[]>([]);
  const [barcodeInput, setBarcodeInput] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  // Step 5 — cashback + notes. The cashback field follows the suggested
  // value (returned value − exchange value) until the operator edits it by
  // hand, which is modelled as an explicit override instead of an effect.
  const [cashbackOverride, setCashbackOverride] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState<{ id: string } | null>(null);

  const returnedValue = (sale?.items ?? []).reduce(
    (sum, item) => sum + (Number(returnQty[item.id]) || 0) * item.unitPrice,
    0
  );
  const exchangeValue = exchanges.reduce(
    (sum, item) => sum + item.quantity * (Number(item.unitPrice) || 0),
    0
  );
  const suggestedCashback =
    Math.round((returnedValue - exchangeValue) * 100) / 100;
  const cashbackInput = cashbackOverride ?? suggestedCashback.toFixed(2);
  // How much of the invoice is still unpaid — cashback credits this first.
  const saleDue = sale ? Math.max(sale.total - sale.amountPaid, 0) : 0;
  const dueCredit = Math.min(Math.max(Number(cashbackInput) || 0, 0), saleDue);
  const handedCashback =
    Math.round(((Number(cashbackInput) || 0) - dueCredit) * 100) / 100;

  function resetForm() {
    setPickedClient(null);
    setFoundSale(null);
    setInvoiceInput("");
    setReturnQty({});
    setReturnReason({});
    setExchanges([]);
    setNotes("");
    setCashbackOverride(null);
    setSuccess(null);
  }

  // Resolve the invoice number to a sale.
  async function handleLookup(event: FormEvent) {
    event.preventDefault();
    const number = invoiceInput.trim();
    if (number === "") return;

    setIsLookingUp(true);
    try {
      const response = await fetch(
        `/api/sales/lookup?number=${encodeURIComponent(number)}`
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(payload?.message ?? "Invoice not found.");
        return;
      }
      // Guard against returns against the wrong customer's invoice.
      if (
        pickedClient &&
        payload.clientName.toLowerCase() !== pickedClient.name.toLowerCase()
      ) {
        toast.error(
          `Invoice ${payload.invoiceNumber} belongs to "${payload.clientName}", not "${pickedClient.name}".`
        );
        return;
      }
      setFoundSale(payload);
      setReturnQty({});
      setReturnReason({});
    } catch {
      toast.error("Could not reach the server. Please check your connection.");
    } finally {
      setIsLookingUp(false);
    }
  }

  // Exchange products: scan or type a barcode, Enter adds the lot.
  async function processScan(barcode: string): Promise<boolean> {
    try {
      const response = await fetch(
        `/api/finished-products/lookup?barcode=${encodeURIComponent(barcode)}`
      );
      const payload = (await response.json().catch(() => null)) as
        | LookupProduct
        | null;
      if (!response.ok || !payload?.id) {
        toast.error("Product not found or out of stock.");
        return false;
      }
      if (exchanges.some((item) => item.productId === payload.id)) {
        toast.error(`${payload.barcode} is already in the exchange list.`);
        return false;
      }
      setExchanges((current) => [
        ...current,
        {
          productId: payload.id,
          barcode: payload.barcode,
          productType: payload.productType,
          batchNumber: payload.batchNumber,
          quantity: 1,
          available: payload.quantityRemaining,
          unitPrice: "",
        },
      ]);
      return true;
    } catch {
      toast.error("Could not reach the server. Please check your connection.");
      return false;
    }
  }

  async function handleScan(event: FormEvent) {
    event.preventDefault();
    const barcode = barcodeInput.trim();
    if (barcode === "" || isScanning) return;

    setIsScanning(true);
    try {
      const added = await processScan(barcode);
      if (added) {
        setBarcodeInput("");
        barcodeInputRef.current?.focus();
      }
    } finally {
      setIsScanning(false);
    }
  }

  function updateExchangeQuantity(productId: string, value: string) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    setExchanges((current) =>
      current.map((item) =>
        item.productId === productId
          ? { ...item, quantity: Math.min(Math.max(parsed, 1), item.available) }
          : item
      )
    );
  }

  function updateExchangePrice(productId: string, value: string) {
    setExchanges((current) =>
      current.map((item) =>
        item.productId === productId ? { ...item, unitPrice: value } : item
      )
    );
  }

  function removeExchange(productId: string) {
    setExchanges((current) =>
      current.filter((item) => item.productId !== productId)
    );
  }

  const returnLines = (sale?.items ?? [])
    .map((item) => ({
      item,
      quantity: Number(returnQty[item.id]) || 0,
      maxReturnable: item.quantity - item.returnedQuantity,
    }))
    .filter((line) => line.quantity > 0);

  const canConfirm =
    sale !== undefined &&
    returnLines.length > 0 &&
    returnLines.every((line) => line.quantity <= line.maxReturnable) &&
    exchanges.every((item) => item.unitPrice.trim() !== "") &&
    !isSubmitting;

  // Record the whole session.
  async function handleConfirm() {
    if (!sale) return;

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/returns/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          saleId: sale.id,
          items: returnLines.map((line) => ({
            saleItemId: line.item.id,
            quantity: line.quantity,
            reason: returnReason[line.item.id]?.trim() || "",
          })),
          exchanges: exchanges.map((item) => ({
            finishedProductId: item.productId,
            quantity: item.quantity,
            unitPrice: Number(item.unitPrice) || 0,
          })),
          cashback: Number(cashbackInput) || 0,
          notes,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(payload?.message ?? "Could not record the return.");
        return;
      }
      toast.success("Return recorded — stock updated.");
      setSuccess({ id: payload.id });
    } catch {
      toast.error("Could not reach the server. Please check your connection.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Point of sale
        </p>
        <h1 className="mt-1 font-display text-3xl font-bold text-foreground">
          Return &amp; Exchange
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Take products back, swap them for others, and hand back the difference.
        </p>
      </div>

      {success ? (
        /* ---------- Success ---------- */
        <div className="mx-auto max-w-lg rounded-xl border bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-green-100 text-green-700">
            <Check className="size-6" aria-hidden />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-charcoal">
            Return recorded
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Returned goods are back in stock
            {exchanges.length > 0
              ? " and the exchange items have been taken out of stock"
              : ""}
            .{" "}
            {dueCredit > 0 ? (
              <>
                <span className="font-semibold text-charcoal">
                  {formatMoney(dueCredit)}
                </span>{" "}
                was credited against the invoice&apos;s due
                {handedCashback > 0 ? (
                  <>
                    {" "}and{" "}
                    <span className="font-semibold text-charcoal">
                      {formatMoney(handedCashback)}
                    </span>{" "}
                    handed over in cash
                  </>
                ) : (
                  " — no cash needed"
                )}
                .
              </>
            ) : (
              <>
                Cashback handed over:{" "}
                <span className="font-semibold text-charcoal">
                  {formatMoney(handedCashback)}
                </span>
              </>
            )}
          </p>
          <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
            <Button variant="outline" onClick={resetForm}>
              <RotateCcw className="size-4" aria-hidden />
              Record another return
            </Button>
            {foundSale && (
              <Link
                href={`/operator/pos/invoice/${foundSale.id}`}
                className="inline-flex h-10 items-center justify-center rounded-lg bg-gold px-6 text-sm font-semibold text-charcoal transition-colors hover:bg-gold/90"
              >
                View invoice
              </Link>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* ---------- Steps 1 + 2: client & invoice ---------- */}
          <div className="grid gap-4 rounded-xl border bg-white p-5 shadow-sm md:grid-cols-2">
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                1 · Client
              </Label>
              <Popover open={clientOpen} onOpenChange={setClientOpen}>
                <PopoverTrigger
                  disabled={foundSale !== null}
                  className={cn(
                    "mt-2 flex h-10 w-full items-center justify-between rounded-lg border px-3 text-sm",
                    foundSale ? "opacity-60" : "bg-white"
                  )}
                >
                  {pickedClient ? (
                    <span className="font-medium text-charcoal">
                      {pickedClient.name} · {pickedClient.phone}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">
                      Select the client making the return…
                    </span>
                  )}
                </PopoverTrigger>
                <PopoverContent className="w-[320px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search name or phone…" />
                    <CommandList>
                      <CommandEmpty>No client found.</CommandEmpty>
                      <CommandGroup>
                        {(clients ?? []).map((client) => (
                          <CommandItem
                            key={client.id}
                            value={`${client.name} ${client.phone}`}
                            onSelect={() => {
                              setPickedClient(client);
                              setClientOpen(false);
                            }}
                          >
                            <span className="font-medium">{client.name}</span>
                            <span className="ml-auto text-xs text-muted-foreground">
                              {client.phone}
                            </span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <div>
              <Label
                htmlFor="invoice-number"
                className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                2 · Invoice number
              </Label>
              <form onSubmit={handleLookup} className="mt-2 flex gap-2">
                <Input
                  id="invoice-number"
                  value={invoiceInput}
                  onChange={(event) => setInvoiceInput(event.target.value)}
                  placeholder="e.g. 0005"
                  disabled={foundSale !== null}
                  className={FIELD}
                />
                <Button
                  type="submit"
                  disabled={isLookingUp || foundSale !== null}
                  className="h-10 shrink-0 bg-charcoal px-4 text-sm font-semibold text-cream hover:bg-charcoal/85"
                >
                  {isLookingUp ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <Search className="size-4" aria-hidden />
                  )}
                  Find
                </Button>
              </form>
            </div>
          </div>

          {/* ---------- Client confirmation ---------- */}
          {foundSale && (
            <div className="flex items-start gap-3 rounded-xl border border-green-600/30 bg-green-600/5 px-5 py-4">
              <Check className="mt-0.5 size-5 shrink-0 text-green-700" aria-hidden />
              <div className="text-sm">
                <p className="font-medium text-charcoal">
                  Invoice {foundSale.invoiceNumber} · {formatMoney(foundSale.total)}
                </p>
                <p className="mt-0.5 text-muted-foreground">
                  Client:{" "}
                  <span className="font-medium text-charcoal">
                    {foundSale.clientName}
                  </span>{" "}
                  ({foundSale.clientPhone}) — confirm this is the customer at
                  the counter before recording the return.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="ml-auto shrink-0 text-muted-foreground hover:text-charcoal"
                onClick={() => setFoundSale(null)}
              >
                Change
              </Button>
            </div>
          )}

          {/* ---------- Step 3: invoice lines to return ---------- */}
          {foundSale && saleLoading && (
            <div className="space-y-3 rounded-xl border bg-white p-6 shadow-sm">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          )}

          {foundSale && sale && (
            <div className="rounded-xl border bg-white shadow-sm">
              <div className="border-b px-5 py-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-charcoal">
                  3 · What is coming back
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Enter the quantity being returned per line (already returned
                  amounts are excluded from the cap).
                </p>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2.5 font-medium">Product</th>
                    <th className="px-3 py-2.5 text-center font-medium">Sold</th>
                    <th className="px-3 py-2.5 text-center font-medium">Returned</th>
                    <th className="px-3 py-2.5 text-right font-medium">Unit price</th>
                    <th className="px-3 py-2.5 text-center font-medium">Return qty</th>
                    <th className="px-4 py-2.5 font-medium">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {sale.items.map((item) => {
                    const maxReturnable = item.quantity - item.returnedQuantity;
                    return (
                      <tr key={item.id} className="border-b last:border-b-0">
                        <td className="px-4 py-3">
                          <p className="font-medium text-charcoal">{item.productType}</p>
                          <p className="font-mono text-xs text-muted-foreground">
                            {item.barcode} · {item.batchNumber}
                          </p>
                        </td>
                        <td className="px-3 py-3 text-center">{item.quantity}</td>
                        <td className="px-3 py-3 text-center text-muted-foreground">
                          {item.returnedQuantity}
                        </td>
                        <td className="px-3 py-3 text-right font-mono">
                          {formatMoney(item.unitPrice)}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <Input
                            type="number"
                            min="0"
                            max={maxReturnable}
                            step="any"
                            value={returnQty[item.id] ?? "0"}
                            disabled={maxReturnable <= 0}
                            onChange={(event) =>
                              setReturnQty((current) => ({
                                ...current,
                                [item.id]: event.target.value,
                              }))
                            }
                            aria-label={`Return quantity for ${item.productType}`}
                            className={cn(FIELD, "w-24 text-center")}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <Input
                            value={returnReason[item.id] ?? ""}
                            disabled={maxReturnable <= 0}
                            onChange={(event) =>
                              setReturnReason((current) => ({
                                ...current,
                                [item.id]: event.target.value,
                              }))
                            }
                            placeholder="e.g. defect"
                            aria-label={`Return reason for ${item.productType}`}
                            className={cn(FIELD, "w-44")}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* ---------- Step 4: exchange products ---------- */}
          {foundSale && sale && (
            <div className="rounded-xl border bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-charcoal">
                4 · Exchange (optional)
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Scan or type the barcode of anything the client takes in
                exchange — same price, lower, or higher.
              </p>

              <form onSubmit={handleScan} className="mt-3 flex max-w-md gap-2">
                <div className="relative flex-1">
                  <ScanBarcode
                    className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden
                  />
                  <Input
                    ref={barcodeInputRef}
                    value={barcodeInput}
                    onChange={(event) => setBarcodeInput(event.target.value)}
                    placeholder="Scan exchange barcode…"
                    className={cn(FIELD, "pl-9")}
                  />
                </div>
                <Button
                  type="submit"
                  disabled={isScanning}
                  variant="outline"
                  className="h-10 shrink-0 border-border bg-white px-4 text-sm font-medium text-charcoal hover:border-gold"
                >
                  {isScanning ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    "Add"
                  )}
                </Button>
              </form>

              {exchanges.length > 0 && (
                <table className="mt-4 w-full text-sm">
                  <thead>
                    <tr className="border-y bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2.5 font-medium">Product</th>
                      <th className="px-3 py-2.5 text-center font-medium">Qty</th>
                      <th className="px-3 py-2.5 text-right font-medium">Unit price</th>
                      <th className="px-3 py-2.5 text-right font-medium">Total</th>
                      <th className="px-3 py-2.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {exchanges.map((item) => (
                      <tr key={item.productId} className="border-b last:border-b-0">
                        <td className="px-3 py-3">
                          <p className="font-medium text-charcoal">{item.productType}</p>
                          <p className="font-mono text-xs text-muted-foreground">
                            {item.barcode} · {item.batchNumber}
                          </p>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <Input
                            type="number"
                            min="1"
                            max={item.available}
                            step="any"
                            value={item.quantity}
                            onChange={(event) =>
                              updateExchangeQuantity(item.productId, event.target.value)
                            }
                            aria-label={`Exchange quantity for ${item.productType}`}
                            className={cn(FIELD, "w-20 text-center")}
                          />
                        </td>
                        <td className="px-3 py-3 text-right">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.unitPrice}
                            onChange={(event) =>
                              updateExchangePrice(item.productId, event.target.value)
                            }
                            placeholder="0.00"
                            aria-label={`Exchange price for ${item.productType}`}
                            className={cn(FIELD, "w-28 text-right")}
                          />
                        </td>
                        <td className="px-3 py-3 text-right font-mono">
                          {formatMoney(item.quantity * (Number(item.unitPrice) || 0))}
                        </td>
                        <td className="px-3 py-3 text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeExchange(item.productId)}
                            className="text-muted-foreground hover:text-rust"
                            aria-label={`Remove ${item.productType} from exchange`}
                          >
                            <Trash2 className="size-4" aria-hidden />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* ---------- Step 5: cashback, notes, confirm ---------- */}
          {foundSale && sale && (
            <div className="rounded-xl border bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-charcoal">
                5 · Settle up &amp; confirm
              </h2>

              <dl className="mt-3 max-w-sm space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Returned value</dt>
                  <dd className="font-mono">{formatMoney(returnedValue)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Exchange value</dt>
                  <dd className="font-mono">-{formatMoney(exchangeValue)}</dd>
                </div>
                <div className="flex justify-between border-t pt-1.5 text-base font-semibold">
                  <dt>Suggested cashback</dt>
                  <dd className="font-mono">{formatMoney(suggestedCashback)}</dd>
                </div>
              </dl>

              {saleDue > 0 && (Number(cashbackInput) || 0) > 0 && (
                <div className="mt-3 flex items-start gap-2 max-w-xl rounded-lg border border-gold/40 bg-gold/10 px-4 py-2.5 text-xs text-charcoal">
                  <CircleAlert className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden />
                  <p>
                    This invoice has{" "}
                    <span className="font-semibold">{formatMoney(saleDue)}</span>{" "}
                    due. The cashback reduces that due first —{" "}
                    {dueCredit > 0 ? (
                      <>
                        <span className="font-semibold">
                          {formatMoney(dueCredit)}
                        </span>{" "}
                        goes to the due
                        {handedCashback > 0 ? (
                          <>
                            {" "}
                            and only{" "}
                            <span className="font-semibold">
                              {formatMoney(handedCashback)}
                            </span>{" "}
                            is handed over in cash
                          </>
                        ) : (
                          " — no cash changes hands"
                        )}
                        .
                      </>
                    ) : (
                      <>
                        but the due is already covered — confirm how much cash
                        to hand over below.
                      </>
                    )}
                  </p>
                </div>
              )}

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="cashback" className="text-sm font-semibold text-charcoal">
                    Cashback to hand over (৳)
                  </Label>
                  <Input
                    id="cashback"
                    type="number"
                    step="0.01"
                    value={cashbackInput}
                    onChange={(event) => setCashbackOverride(event.target.value)}
                    className={cn(FIELD, "mt-1.5")}
                  />
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {suggestedCashback < 0
                      ? "Exchange is worth more — the client pays the difference."
                      : saleDue > 0
                        ? "Credited against the invoice's due first; only the rest is paid in cash."
                        : "Auto-filled from the difference — adjust if you agreed otherwise."}
                  </p>
                </div>
                <div>
                  <Label
                    htmlFor="return-notes"
                    className="text-sm font-semibold text-charcoal"
                  >
                    Notes{" "}
                    <span className="font-normal text-muted-foreground">
                      (optional)
                    </span>
                  </Label>
                  <Textarea
                    id="return-notes"
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="e.g. client exchanged for a bigger size, defect confirmed"
                    rows={3}
                    className="mt-1.5 rounded-lg border-input bg-white px-3 py-2 text-sm focus-visible:border-gold focus-visible:ring-4 focus-visible:ring-gold/20"
                  />
                </div>
              </div>

              {returnLines.some((line) => line.quantity > line.maxReturnable) && (
                <p className="mt-4 flex items-center gap-2 rounded-lg border border-rust/30 bg-rust/10 px-4 py-2.5 text-sm text-rust">
                  <CircleAlert className="size-4 shrink-0" aria-hidden />
                  A return quantity is above what can still be returned on its line.
                </p>
              )}

              <Button
                size="lg"
                className="mt-5 w-full bg-gold text-charcoal hover:bg-gold/90 disabled:opacity-50 sm:w-auto sm:px-10"
                disabled={!canConfirm}
                onClick={handleConfirm}
              >
                {isSubmitting ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <RotateCcw className="size-4" aria-hidden />
                )}
                Confirm return
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

