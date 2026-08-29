"use client";

import { useState } from "react";
import useSWR from "swr";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

// A client with an outstanding balance — from GET /api/sales/dues (used for
// the picker list and to default the amount field to the full balance).
interface ClientDueRow {
  id: string;
  name: string;
  phone: string;
  type: string;
  totalDue: number;
  invoiceCount: number;
}

// Per-client due summary — GET /api/sales/dues?clientId=X.
interface ClientDuesResponse {
  client: {
    id: string;
    name: string;
    phone: string;
    type: string;
  };
  invoices: {
    id: string;
    invoiceNumber: string;
    total: number;
    amountPaid: number;
    amountDue: number;
    date: string;
  }[];
}

// One payment-history row — GET /api/payments?clientId=X.
interface PaymentRow {
  id: string;
  clientId: string;
  saleId: string | null;
  saleInvoiceNumber: string | null;
  amount: number;
  method: string;
  date: string;
}

const PAYMENT_METHODS = [
  { value: "CASH", label: "Cash" },
  { value: "BKASH", label: "bKash" },
  { value: "NAGAD", label: "Nagad" },
  { value: "BANK_TRANSFER", label: "Bank transfer" },
] as const;

// SWR fetcher — throws on non-2xx so isLoading/error behave predictably.
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

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// Value placed in a number input, e.g. 3000 -> "3000", 3000.5 -> "3000.50".
function toInputAmount(value: number) {
  return value.toFixed(2).replace(/\.?0+$/, "");
}

// Today's date as YYYY-MM-DD in local time, for the date input's default.
function todayISO() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

// Gold pill for wholesale, muted for retail — mirrors other POS screens.
function TypeBadge({ type }: { type: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        type === "WHOLESALE"
          ? "border-gold bg-gold/15 text-charcoal"
          : "border-border bg-muted text-muted-foreground"
      )}
    >
      {type === "WHOLESALE" ? "Wholesale" : "Retail"}
    </Badge>
  );
}

export function DueCollectionClient() {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<ClientDueRow | null>(
    null
  );

  const [amountInput, setAmountInput] = useState("");
  const [method, setMethod] = useState<string>("CASH");
  const [date, setDate] = useState(todayISO());
  const [isSubmitting, setIsSubmitting] = useState(false);

  // All clients with an outstanding balance — drives the picker and the
  // "totalDue" default for the amount field.
  const {
    data: clients,
    isLoading: clientsLoading,
    mutate: mutateClients,
  } = useSWR<ClientDueRow[]>("/api/sales/dues", fetcher<ClientDueRow[]>, {
    refreshInterval: 30000,
  });

  // Selected client's individual unpaid invoices + their total outstanding.
  const {
    data: dues,
    error: duesError,
    isLoading: duesLoading,
    mutate: mutateDues,
  } = useSWR<ClientDuesResponse>(
    selectedClient ? `/api/sales/dues?clientId=${selectedClient.id}` : null,
    fetcher<ClientDuesResponse>,
    { keepPreviousData: true }
  );

  // Selected client's payment history (newest first).
  const {
    data: payments,
    error: paymentsError,
    isLoading: paymentsLoading,
    mutate: mutatePayments,
  } = useSWR<PaymentRow[]>(
    selectedClient ? `/api/payments?clientId=${selectedClient.id}` : null,
    fetcher<PaymentRow[]>,
    { keepPreviousData: true }
  );

  // When a client is chosen, the amount input defaults to their full balance
  // (see pickClient). The selected client is only ever set through the picker.
  const totalDue =
    dues?.invoices.reduce((sum, invoice) => sum + invoice.amountDue, 0) ?? 0;
  const amount = Number(amountInput) || 0;

  function pickClient(client: ClientDueRow) {
    setSelectedClient(client);
    setAmountInput(toInputAmount(client.totalDue));
    setPickerOpen(false);
  }

  // Record a payment against the overall balance (saleId null) then refresh
  // the due summary, the payment history and the client picker list.
  async function handleRecordPayment() {
    if (!selectedClient) return;
    if (!(amount > 0)) {
      toast.error("Enter an amount greater than 0.");
      return;
    }
    if (amount > totalDue) {
      toast.error("Amount cannot exceed the outstanding balance.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: selectedClient.id,
          saleId: null,
          amount,
          method,
          date,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(payload?.message ?? "Could not record the payment.");
        return;
      }

      // Re-fetch everything that this payment changed.
      const updatedDues = await mutateDues();
      await Promise.all([mutatePayments(), mutateClients()]);

      const newTotal =
        updatedDues?.invoices.reduce((sum, i) => sum + i.amountDue, 0) ?? 0;
      setAmountInput(toInputAmount(newTotal));

      toast.success(
        `Payment of ${formatMoney(amount)} recorded for ${selectedClient.name}.`
      );
    } catch {
      toast.error("Could not reach the server. Please check your connection.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const canRecord = selectedClient !== null && amount > 0 && !isSubmitting;

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Point of sale
        </p>
        <h1 className="mt-1 font-display text-3xl font-bold text-foreground">
          Due collection
        </h1>
      </div>

      {/* Searchable client picker — only clients with an outstanding balance */}
      <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
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
            <span>Search client with outstanding due</span>
          )}
          <ChevronDown
            className={cn(
              "size-4 text-muted-foreground transition-transform",
              pickerOpen && "rotate-180"
            )}
            aria-hidden
          />
        </PopoverTrigger>
        <PopoverContent className="w-[min(36rem,90vw)] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search client with outstanding due…" />
            <CommandList>
              {clientsLoading ? (
                <div className="space-y-2 p-3">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-3/4" />
                </div>
              ) : (
                <>
                  <CommandEmpty>
                    No client with outstanding due found.
                  </CommandEmpty>
                  <CommandGroup>
                    {(clients ?? []).map((client) => (
                      <CommandItem
                        key={client.id}
                        value={client.name}
                        onSelect={() => pickClient(client)}
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
                          {client.type === "WHOLESALE" ? "Wholesale" : "Retail"}{" "}
                          ·{" "}
                          <span className="font-medium text-rust">
                            {formatMoney(client.totalDue)}
                          </span>
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

      {/* SELECTED_CLIENT_BLOCK */}
      {selectedClient && (
        <div className="grid items-start gap-5 lg:grid-cols-[1fr_26rem]">
          {/* Due summary card */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle>{selectedClient.name}</CardTitle>
                <TypeBadge type={selectedClient.type} />
              </div>
              <p className="text-sm text-muted-foreground">
                {selectedClient.phone}
              </p>
            </CardHeader>
            <CardContent>
              <p
                className={
                  "text-xs font-medium uppercase tracking-wide text-muted-foreground"
                }
              >
                Total outstanding due
              </p>

              {duesLoading ? (
                <Skeleton className="mt-2 h-10 w-44" />
              ) : (
                <p className="mt-1 font-display text-4xl font-bold text-rust">
                  {formatMoney(totalDue)}
                </p>
              )}

              {/* Individual unpaid invoices */}
              <div className="mt-5 divide-y divide-border border-t">
                {duesError ? (
                  <p className="py-4 text-sm text-muted-foreground">
                    Could not load this client&apos;s invoices. Please refresh.
                  </p>
                ) : duesLoading ? (
                  <div className="space-y-2 py-4">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ) : (dues?.invoices ?? []).length === 0 ? (
                  <p className="py-4 text-sm text-muted-foreground">
                    No unpaid invoices.
                  </p>
                ) : (
                  (dues?.invoices ?? []).map((invoice) => (
                    <div
                      key={invoice.id}
                      className="flex items-center justify-between gap-3 py-3 text-sm"
                    >
                      <div>
                        <p className="font-medium text-charcoal">
                          {invoice.invoiceNumber}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(invoice.date)} ·{" "}
                          <span>Original {formatMoney(invoice.total)}</span>
                        </p>
                      </div>
                      <p className="text-right font-semibold text-rust">
                        {formatMoney(invoice.amountDue)} due
                      </p>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {/* RIGHT_COLUMN */}
          {/* Record payment + payment history */}
          <div className="space-y-5">
            {/* Record payment */}
            <Card>
              <CardHeader>
                <CardTitle>Record payment</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col gap-2">
                  <Label
                    htmlFor="payment-amount"
                    className="text-sm font-semibold text-charcoal"
                  >
                    Amount (৳)
                  </Label>
                  <Input
                    id="payment-amount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={amountInput}
                    onChange={(event) => setAmountInput(event.target.value)}
                    className="h-10 rounded-lg border-input bg-white px-3 text-sm focus-visible:border-gold focus-visible:ring-4 focus-visible:ring-gold/20"
                  />
                  <p className="text-xs text-muted-foreground">
                    Due after this payment:{" "}
                    <span className="font-medium text-rust">
                      {formatMoney(Math.max(totalDue - amount, 0))}
                    </span>
                  </p>
                </div>

                <div className="flex flex-col gap-2">
                  <Label className="text-sm font-semibold text-charcoal">
                    Payment method
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {PAYMENT_METHODS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setMethod(option.value)}
                        aria-pressed={method === option.value}
                        className={cn(
                          "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                          method === option.value
                            ? "border-gold bg-gold text-charcoal"
                            : "border-border bg-white text-muted-foreground hover:border-gold hover:text-charcoal"
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <Label
                    htmlFor="payment-date"
                    className="text-sm font-semibold text-charcoal"
                  >
                    Date
                  </Label>
                  <Input
                    id="payment-date"
                    type="date"
                    value={date}
                    onChange={(event) => setDate(event.target.value)}
                    className="h-10 rounded-lg border-input bg-white px-3 text-sm focus-visible:border-gold focus-visible:ring-4 focus-visible:ring-gold/20"
                  />
                </div>

                <Button
                  size="lg"
                  disabled={!canRecord}
                  onClick={handleRecordPayment}
                  className="w-full rounded-lg bg-gold px-6 text-sm font-semibold text-charcoal shadow-sm transition-all hover:bg-gold/90 active:scale-[0.99] disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    "Record payment"
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* HISTORY_CARD */}
            {/* Payment history */}
            <Card>
              <CardHeader>
                <CardTitle>Payment history</CardTitle>
              </CardHeader>
              <CardContent>
                {paymentsLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-9 w-full" />
                    <Skeleton className="h-9 w-full" />
                  </div>
                ) : paymentsError ? (
                  <p className="text-sm text-muted-foreground">
                    Could not load the payment history.
                  </p>
                ) : (payments ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No payments recorded yet.
                  </p>
                ) : (
                  <div className="divide-y divide-border">
                    {(payments ?? []).map((payment) => (
                      <div
                        key={payment.id}
                        className="flex items-center justify-between gap-3 py-2.5 text-sm"
                      >
                        <div>
                          <p className="font-medium text-charcoal">
                            {formatDate(payment.date)}
                          </p>
                          {payment.saleInvoiceNumber && (
                            <p className="text-xs text-muted-foreground">
                              {payment.saleInvoiceNumber}
                            </p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="font-semibold">
                            {formatMoney(payment.amount)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {payment.method === "BANK_TRANSFER"
                              ? "Bank transfer"
                              : payment.method === "BKASH"
                                ? "bKash"
                                : payment.method.charAt(0) +
                                  payment.method.slice(1).toLowerCase()}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {!selectedClient && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <p className="text-sm text-muted-foreground">
              Select a client above to see their outstanding invoices, record a
              payment, and review their payment history.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

