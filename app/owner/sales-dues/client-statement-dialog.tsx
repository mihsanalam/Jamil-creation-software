"use client";

import { FileText, RotateCcw, Wallet } from "lucide-react";
import useSWR from "swr";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useLanguage } from "@/lib/i18n";

interface StatementClient {
  id: string;
  name: string;
  phone: string;
  address: string | null;
  type: "WHOLESALE" | "RETAIL";
}

interface StatementEvent {
  id: string;
  type: "INVOICE" | "PAYMENT" | "RETURN";
  date: string;
  amount: number;
  label: string;
  note?: string;
  balance: number;
}

interface StatementData {
  client: StatementClient;
  summary: {
    totalInvoiced: number;
    totalPaid: number;
    totalReturned: number;
    balance: number;
  };
  events: StatementEvent[];
}

async function statementFetcher(url: string): Promise<StatementData> {
  const res = await fetch(url);
  if (!res.ok) {
    const { message } = await res.json().catch(() => ({}));
    throw new Error(message || "Failed to load the client statement");
  }
  return res.json();
}

function formatMoney(amount: number) {
  return `৳${amount.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

interface ClientStatementDialogProps {
  /** Client to show, or null to keep the dialog closed. */
  clientId: string | null;
  onOpenChange: (open: boolean) => void;
}

/**
 * Per-client statement/ledger dialog: chronological sales, payments and
 * returns with a running balance (sales − payments − returns = balance).
 * Data comes from GET /api/clients/[id]/statement.
 */
export function ClientStatementDialog({
  clientId,
  onOpenChange,
}: ClientStatementDialogProps) {
  const { t } = useLanguage();

  const { data, error, isLoading } = useSWR<StatementData>(
    clientId ? `/api/clients/${clientId}/statement` : null,
    statementFetcher
  );

  const client = data?.client;
  const summary = data?.summary;
  const events = data?.events ?? [];

  const typeIcon = {
    INVOICE: FileText,
    PAYMENT: Wallet,
    RETURN: RotateCcw,
  } as const;

  const typeLabel = {
    INVOICE: t("Invoice"),
    PAYMENT: t("Payment"),
    RETURN: t("Return"),
  } as const;

  return (
    <Dialog open={Boolean(clientId)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] gap-0 overflow-y-auto rounded-xl p-0 ring-border sm:max-w-2xl">
        <div className="border-b border-border bg-cream px-6 py-4">
          <DialogHeader className="gap-1 text-left">
            <DialogTitle className="text-base font-semibold text-charcoal">
              {isLoading ? t("Client statement") : `${client?.name} — ${t("statement")}`}
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              {client
                ? `${client.phone} · ${client.type === "WHOLESALE" ? t("Wholesale") : t("Retail")}`
                : t("Sales, payments and returns with a running balance.")}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="space-y-4 px-6 py-5">
          {error && (
            <div className="rounded-lg border border-rust/20 bg-rust/5 p-4 text-sm text-rust">
              {error.message}
            </div>
          )}

          {isLoading && (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full" />
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          )}

          {summary && (
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="rounded-lg border bg-charcoal/5 p-3">
                <div className="text-xs text-muted-foreground">{t("Invoiced")}</div>
                <div className="font-heading text-lg font-semibold">
                  {formatMoney(summary.totalInvoiced)}
                </div>
              </div>
              <div className="rounded-lg border bg-emerald-50 p-3">
                <div className="text-xs text-emerald-700">{t("Paid")}</div>
                <div className="font-heading text-lg font-semibold text-emerald-700">
                  {formatMoney(summary.totalPaid)}
                </div>
              </div>
              <div className="rounded-lg border bg-amber-50 p-3">
                <div className="text-xs text-amber-700">{t("Returned")}</div>
                <div className="font-heading text-lg font-semibold text-amber-700">
                  {formatMoney(summary.totalReturned)}
                </div>
              </div>
              <div
                className={`rounded-lg border p-3 ${
                  summary.balance > 0 ? "bg-rust/10" : "bg-charcoal/5"
                }`}
              >
                <div className="text-xs text-muted-foreground">{t("Balance")}</div>
                <div
                  className={`font-heading text-lg font-semibold ${
                    summary.balance > 0 ? "text-rust" : ""
                  }`}
                >
                  {formatMoney(summary.balance)}
                </div>
              </div>
            </div>
          )}

          {!isLoading && !error && events.length === 0 && (
            <div className="py-10 text-center text-sm text-muted-foreground">
              {t("No transactions for this client yet.")}
            </div>
          )}

          {!isLoading && events.length > 0 && (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("Date")}</TableHead>
                    <TableHead>{t("Event")}</TableHead>
                    <TableHead className="text-right">{t("Amount")}</TableHead>
                    <TableHead className="text-right">{t("Balance")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.map((event) => {
                    const Icon = typeIcon[event.type];
                    return (
                      <TableRow key={`${event.type}-${event.id}`}>
                        <TableCell className="whitespace-nowrap text-sm">
                          {formatDate(event.date)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              event.type === "INVOICE"
                                ? "border-charcoal/20 text-charcoal"
                                : event.type === "PAYMENT"
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                  : "border-amber-200 bg-amber-50 text-amber-700"
                            }
                          >
                            <Icon className="size-3" aria-hidden />
                            {typeLabel[event.type]}
                          </Badge>
                          <div className="mt-1 text-sm">{event.label}</div>
                          {event.note && (
                            <div className="text-xs text-muted-foreground">{event.note}</div>
                          )}
                        </TableCell>
                        <TableCell
                          className={`whitespace-nowrap font-mono text-right ${
                            event.amount < 0 ? "text-emerald-700" : "text-charcoal"
                          }`}
                        >
                          {event.amount < 0 ? "−" : "+"}
                          {formatMoney(Math.abs(event.amount))}
                        </TableCell>
                        <TableCell className="whitespace-nowrap font-mono text-right">
                          {formatMoney(event.balance)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              {t("Close")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
