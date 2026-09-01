"use client";

import { useState, type FormEvent } from "react";
import useSWR from "swr";
import { Loader2, Printer, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

// Sale payload returned by GET /api/sales/[id].
interface InvoiceData {
  id: string;
  invoiceNumber: string;
  subtotal: number;
  discount: number;
  total: number;
  amountPaid: number;
  paymentMethod: string;
  paymentStatus: string;
  createdAt: string;
  client: {
    name: string;
    phone: string;
    address: string | null;
    type: string;
  };
  items: {
    id: string;
    barcode: string;
    productType: string;
    batchNumber: string;
    quantity: number;
    returnedQuantity: number;
    unitPrice: number;
    lineTotal: number;
  }[];
}

async function fetcher<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.message ?? "Something went wrong");
  }
  return response.json() as Promise<T>;
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  BKASH: "bKash",
  NAGAD: "Nagad",
  BANK_TRANSFER: "Bank transfer",
};

function formatMoney(value: number) {
  return `৳${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function InvoiceClient({ saleId }: { saleId: string }) {
  const [isPrinting, setIsPrinting] = useState(false);

  // Record-return dialog state.
  const [returnItem, setReturnItem] = useState<InvoiceData["items"][number] | null>(null);
  const [returnQuantity, setReturnQuantity] = useState("1");
  const [returnReason, setReturnReason] = useState("");
  const [isSavingReturn, setIsSavingReturn] = useState(false);

  const {
    data: sale,
    error,
    isLoading,
    mutate,
  } = useSWR<InvoiceData>(`/api/sales/${saleId}`, fetcher<InvoiceData>);

  function handlePrint() {
    setIsPrinting(true);
    // Give the state a tick to paint, then open the print dialog.
    setTimeout(() => {
      window.print();
      setIsPrinting(false);
    }, 50);
  }

  function openReturn(item: InvoiceData["items"][number]) {
    setReturnItem(item);
    // Default to one piece; the operator can raise it up to the cap.
    setReturnQuantity("1");
    setReturnReason("");
  }

  // POST the return, then refresh so returnedQuantity updates.
  async function handleRecordReturn(event: FormEvent) {
    event.preventDefault();
    if (!returnItem) return;

    const quantity = Number(returnQuantity);
    const maxReturnable = returnItem.quantity - returnItem.returnedQuantity;
    if (!Number.isFinite(quantity) || quantity <= 0) {
      toast.error("Quantity must be a number greater than 0.");
      return;
    }
    if (quantity > maxReturnable) {
      toast.error(
        `Only ${maxReturnable} of the ${returnItem.quantity} sold can still be returned.`
      );
      return;
    }

    setIsSavingReturn(true);
    try {
      const response = await fetch("/api/returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          saleItemId: returnItem.id,
          quantity,
          reason: returnReason.trim(),
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(payload?.message ?? "Could not record the return.");
        return;
      }
      toast.success(
        `Return recorded for "${returnItem.productType}" — stock has been restored.`
      );
      setReturnItem(null);
      mutate();
    } catch {
      toast.error("Could not reach the server. Please check your connection.");
    } finally {
      setIsSavingReturn(false);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (error || !sale) {
    return (
      <div className="rounded-xl border bg-white p-6 text-sm text-muted-foreground">
        {error?.message ?? "Invoice not found."}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Actions */}
      <div className="flex items-center justify-between print:hidden">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Point of sale
          </p>
          <h1 className="mt-1 font-display text-3xl font-bold text-foreground">
            Invoice
          </h1>
        </div>
        <Button onClick={handlePrint} disabled={isPrinting}>
          <Printer className="size-4" />
          Print
        </Button>
      </div>

      {/* Printable invoice card */}
      <div className="rounded-xl border bg-white p-6 md:p-8">
        {/* Header row */}
        <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-5">
          <div>
            <p className="font-display text-2xl font-bold">Jamil Creations</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Garments manufacturer &amp; wholesaler
            </p>
          </div>
          <div className="text-right">
            <p className="font-mono text-lg font-semibold">
              {sale.invoiceNumber}
            </p>
            <p className="text-sm text-muted-foreground">
              {formatDate(sale.createdAt)}
            </p>
          </div>
        </div>

        {/* Client + payment info */}
        <div className="grid gap-6 py-5 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Billed to
            </p>
            <p className="mt-1.5 font-medium">{sale.client.name}</p>
            <p className="text-sm text-muted-foreground">{sale.client.phone}</p>
            {sale.client.address && (
              <p className="text-sm text-muted-foreground">
                {sale.client.address}
              </p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              {sale.client.type === "WHOLESALE" ? "Wholesale" : "Retail"} client
            </p>
          </div>
          <div className="sm:text-right">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Payment
            </p>
            <p className="mt-1.5 text-sm">
              {PAYMENT_METHOD_LABELS[sale.paymentMethod] ?? sale.paymentMethod}
            </p>
            <span
              className={cn(
                "mt-1.5 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium",
                sale.paymentStatus === "PAID"
                  ? "bg-emerald-100 text-emerald-800"
                  : sale.paymentStatus === "PARTIAL"
                    ? "bg-amber-100 text-amber-800"
                    : "bg-red-100 text-red-800"
              )}
            >
              {sale.paymentStatus === "PAID"
                ? "Paid in full"
                : sale.paymentStatus === "PARTIAL"
                  ? "Partially paid"
                  : "Due"}
            </span>
          </div>
        </div>

        {/* Items */}
        <table className="w-full text-sm">
          <thead>
            <tr className="border-y bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2.5 font-medium">Product</th>
              <th className="px-3 py-2.5 text-center font-medium">Qty</th>
              <th className="px-3 py-2.5 text-right font-medium">Unit price</th>
              <th className="px-3 py-2.5 text-right font-medium">Total</th>
              <th className="print:hidden px-3 py-2.5 text-right font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {sale.items.map((item) => {
              const maxReturnable = item.quantity - item.returnedQuantity;
              return (
                <tr key={item.id} className="border-b">
                  <td className="px-3 py-3">
                    <p className="font-medium">{item.productType}</p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {item.barcode} · {item.batchNumber}
                    </p>
                  </td>
                  <td className="px-3 py-3 text-center">
                    {item.quantity}
                    {item.returnedQuantity > 0 && (
                      <p className="text-xs text-amber-700">
                        {item.returnedQuantity} returned
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {formatMoney(item.unitPrice)}
                  </td>
                  <td className="px-3 py-3 text-right font-medium">
                    {formatMoney(item.lineTotal)}
                  </td>
                  <td className="print:hidden px-3 py-3 text-right">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => openReturn(item)}
                      disabled={maxReturnable <= 0}
                      title={
                        maxReturnable <= 0
                          ? "Fully returned"
                          : `Return up to ${maxReturnable}`
                      }
                      className="h-8 rounded-lg border-border bg-white px-3 text-xs font-medium text-charcoal transition-colors hover:border-gold hover:bg-gold/5 disabled:opacity-50"
                    >
                      <RotateCcw className="size-3.5" aria-hidden />
                      {maxReturnable <= 0 ? "Returned" : "Record return"}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Totals */}
        <div className="mt-5 flex justify-end">
          <dl className="w-full max-w-xs space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd>{formatMoney(sale.subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Discount</dt>
              <dd>-{formatMoney(sale.discount)}</dd>
            </div>
            <div className="flex justify-between border-t pt-2 text-base font-semibold">
              <dt>Total</dt>
              <dd className="font-display">{formatMoney(sale.total)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Amount paid</dt>
              <dd>{formatMoney(sale.amountPaid)}</dd>
            </div>
            <div className="flex justify-between">
              <dt
                className={cn(
                  sale.total - sale.amountPaid > 0 && "text-rust font-medium"
                )}
              >
                Due
              </dt>
              <dd
                className={cn(
                  sale.total - sale.amountPaid > 0
                    ? "text-rust font-semibold"
                    : "text-muted-foreground"
                )}
              >
                {formatMoney(Math.max(sale.total - sale.amountPaid, 0))}
              </dd>
            </div>
          </dl>
        </div>

        <p className="mt-6 border-t pt-4 text-center text-xs text-muted-foreground">
          Thank you for your business — Jamil Creations
        </p>



      </div>

      {/* Record return dialog (rendered outside the printable card) */}
      <Dialog
        open={returnItem !== null}
        onOpenChange={(open) => {
          if (!open) setReturnItem(null);
        }}
      >
        <DialogContent className="max-w-md gap-0 rounded-xl p-0 ring-border sm:max-w-md">
          <div className="border-b border-border bg-cream px-6 py-4">
            <DialogHeader className="gap-1 text-left">
              <DialogTitle className="text-base font-semibold text-charcoal">
                Record return
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                {returnItem && (
                  <>
                    {returnItem.productType} · {returnItem.barcode}
                  </>
                )}{" "}
                — the returned quantity goes back into stock. The invoice total
                is not changed; any refund is handled by the Owner.
              </DialogDescription>
            </DialogHeader>
          </div>

          <form onSubmit={handleRecordReturn}>
            <div className="space-y-4 px-6 py-5">
              <div className="flex flex-col gap-2">
                <Label htmlFor="return-quantity" className="text-sm font-semibold text-charcoal">
                  Quantity
                  {returnItem && (
                    <span className="font-normal text-muted-foreground">
                      {" "}
                      — up to{" "}
                      {returnItem.quantity - returnItem.returnedQuantity}
                    </span>
                  )}
                </Label>
                <Input
                  id="return-quantity"
                  type="number"
                  min="0.01"
                  step="any"
                  max={returnItem ? returnItem.quantity - returnItem.returnedQuantity : undefined}
                  value={returnQuantity}
                  onChange={(event) => setReturnQuantity(event.target.value)}
                  required
                  autoFocus
                  className="h-10 rounded-lg border-input bg-white px-3 text-sm focus-visible:border-gold focus-visible:ring-4 focus-visible:ring-gold/20"
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="return-reason" className="text-sm font-semibold text-charcoal">
                  Reason <span className="font-normal text-muted-foreground">(optional)</span>
                </Label>
                <Textarea
                  id="return-reason"
                  value={returnReason}
                  onChange={(event) => setReturnReason(event.target.value)}
                  placeholder="e.g. stitching defect on 2 pieces"
                  rows={3}
                  className="rounded-lg border-input bg-white px-3 py-2 text-sm focus-visible:border-gold focus-visible:ring-4 focus-visible:ring-gold/20"
                />
              </div>
            </div>

            <DialogFooter className="gap-3 border-t border-border bg-cream/60 px-6 py-3.5 sm:justify-end">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setReturnItem(null)}
                disabled={isSavingReturn}
                className="h-9 rounded-lg text-sm font-medium text-muted-foreground hover:text-charcoal"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSavingReturn}
                className="h-9 rounded-lg bg-charcoal px-6 text-sm font-semibold text-cream shadow-sm transition-all hover:bg-charcoal/85 active:scale-[0.99] disabled:opacity-50"
              >
                {isSavingReturn ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    Saving…
                  </>
                ) : (
                  "Record return"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
