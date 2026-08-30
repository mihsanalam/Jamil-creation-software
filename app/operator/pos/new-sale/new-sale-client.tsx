"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { Check, ChevronDown, Loader2, ScanBarcode, Trash2 } from "lucide-react";
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
import { cn } from "@/lib/utils";

// Client option in the picker (from GET /api/clients).
interface ClientOption {
  id: string;
  name: string;
  phone: string;
  type: string;
}

// Product returned by GET /api/finished-products/lookup.
interface LookupProduct {
  id: string;
  barcode: string;
  quantityRemaining: number;
  productType: string;
  batchNumber: string;
  storageLocation: string;
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
  const router = useRouter();
  const searchParams = useSearchParams();

  const [clientOpen, setClientOpen] = useState(false);
  const [pickedClient, setPickedClient] = useState<ClientOption | null>(null);
  const [barcodeInput, setBarcodeInput] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discountInput, setDiscountInput] = useState("0");
  const [paymentMethod, setPaymentMethod] = useState<string>("CASH");
  const [payMode, setPayMode] = useState<"FULL" | "CREDIT">("FULL");
  const [amountPaidInput, setAmountPaidInput] = useState("0");
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  const subtotal = cart.reduce(
    (sum, item) => sum + item.quantity * (Number(item.unitPrice) || 0),
    0
  );
  const discount = Number(discountInput) || 0;
  const total = Math.max(subtotal - discount, 0);
  const amountPaid = payMode === "FULL" ? total : Number(amountPaidInput) || 0;

  // Barcode scanner / Enter handler — look the product up and add it.
  async function handleScan(event: FormEvent) {
    event.preventDefault();
    const barcode = barcodeInput.trim();
    if (barcode === "" || isScanning) return;

    setIsScanning(true);
    try {
      const response = await fetch(
        `/api/finished-products/lookup?barcode=${encodeURIComponent(barcode)}`
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(payload?.message ?? "Product not found.");
        return;
      }

      const product = payload as LookupProduct;
      if (cart.some((item) => item.productId === product.id)) {
        toast.error(`${product.barcode} is already in the cart.`);
        return;
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
          unitPrice: "",
        },
      ]);
      setBarcodeInput("");
    } catch {
      toast.error("Could not reach the server. Please check your connection.");
    } finally {
      setIsScanning(false);
    }
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
      toast.error("Every item needs a unit price before completing the sale.");
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
        toast.error(payload?.message ?? "Could not record the sale.");
        return;
      }

      toast.success("Sale recorded — opening the invoice…");
      router.push(`/operator/pos/invoice/${payload.id}`);
    } catch {
      toast.error("Could not reach the server. Please check your connection.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const canComplete =
    selectedClient !== null &&
    cart.length > 0 &&
    cart.every((item) => Number(item.unitPrice) > 0) &&
    !isSubmitting;

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Point of sale
        </p>
        <h1 className="mt-1 font-display text-3xl font-bold text-foreground">
          New sale
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
            <span>Select a client…</span>
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
            <CommandInput placeholder="Search clients by name…" />
            <CommandList>
              {clientsLoading ? (
                <div className="space-y-2 p-3">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-3/4" />
                </div>
              ) : (
                <>
                  <CommandEmpty>No client found.</CommandEmpty>
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
                        <span className="text-xs text-muted-foreground">
                          {client.phone} ·{" "}
                          {client.type === "WHOLESALE" ? "Wholesale" : "Retail"}
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

      {/* Barcode scan */}
      <form onSubmit={handleScan} className="flex max-w-xl gap-2">
        <div className="relative flex-1">
          <ScanBarcode className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={barcodeInput}
            onChange={(event) => setBarcodeInput(event.target.value)}
            placeholder="Scan barcode or type JC-0001 then press Enter"
            className="h-11 pl-9 font-mono"
            autoFocus
          />
        </div>
        <Button type="submit" disabled={barcodeInput.trim() === "" || isScanning}>
          {isScanning ? <Loader2 className="size-4 animate-spin" /> : "Add"}
        </Button>
      </form>

      {/* Cart */}
      {cart.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-white/60 p-8 text-center text-sm text-muted-foreground">
          No items yet — scan a barcode above to start the sale.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Product</th>
                <th className="px-4 py-2.5 font-medium">Quantity</th>
                <th className="px-4 py-2.5 font-medium">Unit price (৳)</th>
                <th className="px-4 py-2.5 font-medium">Line total</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {cart.map((item) => (
                <tr key={item.productId} className="border-b last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-medium">{item.productType}</p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {item.barcode} · {item.batchNumber}
                    </p>
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
                      {item.available} left in stock
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
        <h2 className="font-display text-lg font-semibold">Payment summary</h2>

        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd className="font-medium">{formatMoney(subtotal)}</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted-foreground">Discount</dt>
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
            <dt className="font-semibold">Total</dt>
            <dd className="font-display font-bold">{formatMoney(total)}</dd>
          </div>
        </dl>

        {/* Payment method pills */}
        <div className="mt-4">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            Payment method
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
                {method.label}
              </button>
            ))}
          </div>
        </div>

        {/* Paid in full vs wholesale credit */}
        <div className="mt-4">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            Payment
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
              Paid in full
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
              Wholesale credit
            </button>
          </div>
        </div>

        {payMode === "CREDIT" && (
          <div className="mt-4">
            <Label htmlFor="amount-paid">Amount paid now (৳)</Label>
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
              Due after this payment:{" "}
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
            "Complete sale"
          )}
        </Button>
      </div>



      {/* MAIN_GRID_ANCHOR */}
    </div>
  );
}
