"use client";

import useSWR from "swr";
import {
  Layers,
  Package,
  RotateCcw,
  ShoppingCart,
  TriangleAlert,
  Wallet,
} from "lucide-react";

import { MetricCard } from "@/components/shared/metric-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

// Full payload returned by GET /api/dashboard/summary.
interface DashboardSummary {
  batchesInProduction: number;
  totalStock: number;
  salesToday: number;
  outstandingDues: number;
  phaseBreakdown: Record<string, number>;
  bottleneck: { name: string; count: number } | null;
  recentSales: {
    invoiceNumber: string;
    clientName: string;
    amount: number;
    paymentStatus: string;
    date: string;
  }[];
  clientsWithDues: { name: string; amountOwed: number }[];
  returnedPcsToday: number;
  cashbackTotal: number;
  dueCreditTotal: number;
  exchangedPcsTotal: number;
  recentReturns: {
    invoiceNumber: string;
    productType: string;
    batchNumber: string;
    quantity: number;
    reason: string | null;
    cashback: number | null;
    dueCredit: number | null;
    isExchange: boolean;
    date: string;
  }[];
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

function formatMoney(value: number) {
  return `৳${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatToday() {
  return new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function DashboardClient() {
  // The Owner keeps this screen open — poll every 10s so it feels live.
  const { data, error, isLoading } = useSWR<DashboardSummary>(
    "/api/dashboard/summary",
    fetcher<DashboardSummary>,
    { refreshInterval: 10000, keepPreviousData: true }
  );

  const phaseBreakdown = data?.phaseBreakdown ?? {};
  const phases = Object.entries(phaseBreakdown).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-display text-3xl font-bold text-foreground">
          Dashboard
        </h1>
        <p className="text-sm text-muted-foreground">{formatToday()}</p>
      </div>

      {/* Row of 6 metric cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {isLoading ? (
          <>
            <Skeleton className="h-23 w-full rounded-xl" />
            <Skeleton className="h-23 w-full rounded-xl" />
            <Skeleton className="h-23 w-full rounded-xl" />
            <Skeleton className="h-23 w-full rounded-xl" />
            <Skeleton className="h-23 w-full rounded-xl" />
            <Skeleton className="h-23 w-full rounded-xl" />
          </>
        ) : (
          <>
            <MetricCard
              label="Batches in production"
              value={data?.batchesInProduction ?? 0}
              icon={Layers}
            />
            <MetricCard
              label="Total stock"
              value={(data?.totalStock ?? 0).toLocaleString()}
              icon={Package}
            />
            <MetricCard
              label="Sales today"
              value={formatMoney(data?.salesToday ?? 0)}
              icon={ShoppingCart}
            />
            <MetricCard
              label="Outstanding dues"
              value={formatMoney(data?.outstandingDues ?? 0)}
              icon={Wallet}
              variant="rust"
            />
            <MetricCard
              label="Returned today"
              value={`${data?.returnedPcsToday ?? 0} pcs`}
              icon={RotateCcw}
            />
            <MetricCard
              label="Cashback given"
              value={formatMoney(data?.cashbackTotal ?? 0)}
              icon={Wallet}
              variant="rust"
            />
          </>
        )}
      </div>

      {error && (
        <Alert variant="destructive">
          <TriangleAlert className="size-4" aria-hidden />
          <AlertTitle>Could not load the dashboard</AlertTitle>
          <AlertDescription>
            {error.message}. Showing the last known values.
          </AlertDescription>
        </Alert>
      )}

      {/* Production pipeline — counts per in-progress phase */}
      {/* BOTTLENECK_BANNER */}
      {!isLoading && data?.bottleneck && (
        <Alert variant="destructive" className="border-rust/30 bg-rust/10">
          <TriangleAlert className="text-rust" aria-hidden />
          <AlertTitle className="text-rust">
            {data.bottleneck.name} is backed up
          </AlertTitle>
          <AlertDescription>
            {data.bottleneck.name} has {data.bottleneck.count} batches waiting
            — check staffing.
          </AlertDescription>
        </Alert>
      )}

      {/* PIPELINE_SECTION */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-heading text-lg font-medium text-charcoal">
            Production pipeline
          </h2>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
          </div>
        ) : phases.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-white/60 px-6 py-12 text-center text-sm text-muted-foreground">
            No phases in progress right now.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {phases.map(([name, count]) => (
              <section
                key={name}
                className="flex flex-col gap-2 rounded-xl bg-white p-4 shadow-sm ring-1 ring-border"
              >
                <span className="text-sm font-medium text-charcoal">{name}</span>
                <span
                  className={
                    "font-display text-3xl font-bold text-charcoal"
                  }
                >
                  {count}
                </span>
                <span className="text-xs text-muted-foreground">
                  {count === 1 ? "batch" : "batches"} in this phase
                </span>
              </section>
            ))}
          </div>
        )}
      </section>

      {/* Recent sales + Clients with dues */}
      {/* TABLES_ROW */}
      <div className="grid items-start gap-5 lg:grid-cols-2">
        {/* Recent sales */}
        <Card>
          <CardHeader>
            <CardTitle>Recent sales</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-3/4" />
              </div>
            ) : (data?.recentSales ?? []).length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">
                No sales recorded yet.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.recentSales ?? []).map((sale) => (
                    <TableRow key={sale.invoiceNumber}>
                      <TableCell className="font-medium text-charcoal">
                        {sale.clientName}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatMoney(sale.amount)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={sale.paymentStatus} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Clients with dues */}
        <Card>
          <CardHeader>
            <CardTitle>Clients with dues</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-3/4" />
              </div>
            ) : (data?.clientsWithDues ?? []).length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">
                No outstanding dues — everyone is settled. 🎉
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead className="text-right">Amount owed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.clientsWithDues ?? []).map((client) => (
                    <TableRow key={client.name}>
                      <TableCell className="font-medium text-charcoal">
                        {client.name}
                      </TableCell>
                      <TableCell className="text-right font-mono text-rust">
                        {formatMoney(client.amountOwed)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent returns & exchanges */}
      <Card>
        <CardHeader>
          <CardTitle>Recent returns &amp; exchanges</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-3/4" />
            </div>
          ) : (data?.recentReturns ?? []).length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">
              No returns or exchanges recorded yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-center">Qty</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="text-right">Cashback</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.recentReturns ?? []).map((entry) => (
                  <TableRow key={`${entry.invoiceNumber}-${entry.date}-${entry.productType}`}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {new Date(entry.date).toLocaleDateString("en-GB", {
                        day: "2-digit",
                        month: "short",
                      })}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {entry.invoiceNumber}
                    </TableCell>
                    <TableCell className="font-medium text-charcoal">
                      {entry.productType}
                      <span className="block font-mono text-xs font-normal text-muted-foreground">
                        {entry.batchNumber}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">{entry.quantity}</TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
                          entry.isExchange
                            ? "border-gold bg-gold/15 text-charcoal"
                            : "border-charcoal/20 bg-charcoal text-cream"
                        )}
                      >
                        {entry.isExchange ? "Exchange" : "Return"}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-56 truncate text-muted-foreground">
                      {entry.reason ?? "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {entry.cashback === null && entry.dueCredit === null
                        ? "—"
                        : [
                            entry.cashback === null || entry.cashback === 0
                              ? null
                              : entry.cashback < 0
                                ? `client paid ${formatMoney(Math.abs(entry.cashback))}`
                                : formatMoney(entry.cashback),
                            entry.dueCredit && entry.dueCredit > 0
                              ? `${formatMoney(entry.dueCredit)} to due`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" + ") || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {!isLoading &&
            ((data?.exchangedPcsTotal ?? 0) > 0 ||
              (data?.dueCreditTotal ?? 0) > 0) && (
              <p className="mt-3 text-xs text-muted-foreground">
                {(data?.exchangedPcsTotal ?? 0) > 0 &&
                  `${data?.exchangedPcsTotal} pcs have been handed out in exchanges in total. `}
                {(data?.dueCreditTotal ?? 0) > 0 &&
                  `${formatMoney(data?.dueCreditTotal ?? 0)} of cashback was credited against client dues (no cash moved).`}
              </p>
            )}
        </CardContent>
      </Card>
    </div>
  );
}
