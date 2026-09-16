"use client";

import { useState } from "react";
import useSWR from "swr";
import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/lib/i18n";

// Payment payload returned by GET /api/payments/[id].
interface PaymentReceipt {
  id: string;
  amount: number;
  method: string;
  date: string;
  client: {
    id: string;
    name: string;
    phone: string;
    type: string;
  };
  appliedToInvoice: string | null;
  receivedByName: string | null;
  balanceDue: number;
}

// Shop profile from GET /api/settings (#28) — same fallbacks as the invoice.
interface ShopSettings {
  shopName: string;
  shopPhone: string;
  receiptFooter: string;
}

async function fetcher<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.message ?? "Something went wrong");
  }
  return response.json() as Promise<T>;
}

const METHOD_LABELS: Record<string, string> = {
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

export function MoneyReceiptClient({ paymentId }: { paymentId: string }) {
  const { t } = useLanguage();
  const [isPrinting, setIsPrinting] = useState(false);

  const {
    data: payment,
    error,
    isLoading,
  } = useSWR<PaymentReceipt>(`/api/payments/${paymentId}`, fetcher);

  // The shop profile is printed on the receipt header.
  const { data: shopSettings } = useSWR<ShopSettings>("/api/settings", fetcher);
  const shopName = shopSettings?.shopName ?? "Jamil Creations";
  const shopPhone = shopSettings?.shopPhone ?? "";
  const receiptFooter = shopSettings?.receiptFooter ?? "";

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
      <div className="mx-auto w-full max-w-xl space-y-4 rounded-xl border bg-white p-8">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    );
  }

  if (error || !payment) {
    return (
      <p className="text-sm text-rust">
        {error instanceof Error
          ? error.message
          : t("Could not load the money receipt. Please try again.")}
      </p>
    );
  }

  // Short, human-friendly receipt number (e.g. MR-3F9A21C7). The full UUID
  // stays in the API; the print just needs a reference the operator can read.
  const receiptNumber = `MR-${payment.id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;

  return (
    <div className="space-y-5">
      {/* Screen-only toolbar */}
      <div className="flex items-center justify-between print:hidden">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
            {t("Due collection")}
          </p>
          <h1 className="mt-1 font-display text-3xl font-bold text-foreground">
            {t("Money receipt")}
          </h1>
        </div>
        <Button onClick={handlePrint} disabled={isPrinting}>
          <Printer className="size-4" />
          {t("Print")}
        </Button>
      </div>

      {/* Printable receipt card */}
      <div className="mx-auto w-full max-w-xl rounded-xl border bg-white p-6 md:p-8">
        {/* Header */}
        <div className="border-b pb-4 text-center">
          <p className="font-display text-2xl font-bold">{shopName}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {receiptFooter}
          </p>
          {shopPhone && (
            <p className="mt-0.5 text-sm text-muted-foreground">
              {t("Phone")}: {shopPhone}
            </p>
          )}
          <p className="mt-3 inline-block rounded-full bg-cream px-4 py-1 text-sm font-semibold uppercase tracking-[0.2em] text-charcoal">
            {t("Money receipt")}
          </p>
        </div>

        {/* Receipt number + date */}
        <div className="flex flex-wrap items-center justify-between gap-2 py-4 text-sm">
          <p className="font-mono font-semibold">{receiptNumber}</p>
          <p className="text-muted-foreground">{formatDate(payment.date)}</p>
        </div>

        {/* Body */}
        <div className="space-y-4 text-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("Received from")}
              </p>
              <p className="mt-1 font-medium">{payment.client.name}</p>
              <p className="text-muted-foreground">{payment.client.phone}</p>
            </div>
            <p className="text-right">
              <span className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("Payment")}
              </span>
              <span className="mt-1 block text-lg font-bold text-charcoal">
                {formatMoney(payment.amount)}
              </span>
              <span className="text-muted-foreground">
                {t(METHOD_LABELS[payment.method] ?? payment.method)}
              </span>
            </p>
          </div>

          <div className="rounded-lg bg-cream/60 p-3.5">
            <p>
              {t("Being payment received against")}{" "}
              <span className="font-medium">
                {payment.appliedToInvoice
                  ? `${t("invoice")} ${payment.appliedToInvoice}`
                  : t("outstanding dues")}
              </span>
              .
            </p>
            <p className="mt-1 text-muted-foreground">
              {t("Balance due")}{" "}
              <span
                className={
                  payment.balanceDue > 0
                    ? "font-semibold text-rust"
                    : "font-semibold text-emerald-700"
                }
              >
                {payment.balanceDue > 0
                  ? formatMoney(payment.balanceDue)
                  : t("Nothing — fully settled")}
              </span>
            </p>
          </div>

          <p className="text-muted-foreground">
            {t("In words")}:{" "}
            <span className="font-medium text-charcoal">
              {formatMoney(payment.amount)} {t("only")}
            </span>
          </p>
        </div>

        {/* Signatures */}
        <div className="mt-10 flex items-end justify-between gap-6 text-sm">
          <div className="flex-1 border-t pt-2 text-center text-muted-foreground">
            {payment.receivedByName ?? shopName}
          </div>
          <div className="flex-1 border-t pt-2 text-center text-muted-foreground">
            {t("Client signature")}
          </div>
        </div>

        <p className="mt-6 border-t pt-4 text-center text-xs text-muted-foreground">
          {t("Thank you for your business")} — {shopName}
        </p>
      </div>
    </div>
  );
}
