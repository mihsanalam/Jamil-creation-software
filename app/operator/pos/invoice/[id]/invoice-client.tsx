"use client";

import { useState } from "react";
import useSWR from "swr";
import { Loader2, Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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

  const {
    data: sale,
    error,
    isLoading,
  } = useSWR<InvoiceData>(`/api/sales/${saleId}`, fetcher<InvoiceData>);

  function handlePrint() {
    setIsPrinting(true);
    // Give the state a tick to paint, then open the print dialog.
    setTimeout(() => {
      window.print();
      setIsPrinting(false);
    }, 50);
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
            </tr>
          </thead>
          <tbody>
            {sale.items.map((item) => (
              <tr key={item.id} className="border-b">
                <td className="px-3 py-3">
                  <p className="font-medium">{item.productType}</p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {item.barcode} · {item.batchNumber}
                  </p>
                </td>
                <td className="px-3 py-3 text-center">{item.quantity}</td>
                <td className="px-3 py-3 text-right">
                  {formatMoney(item.unitPrice)}
                </td>
                <td className="px-3 py-3 text-right font-medium">
                  {formatMoney(item.lineTotal)}
                </td>
              </tr>
            ))}
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
    </div>
  );
}
