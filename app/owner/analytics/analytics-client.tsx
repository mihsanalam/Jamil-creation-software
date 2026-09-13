"use client";

import { useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Calendar,
  Download,
  Layers,
  Package,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import useSWR from "swr";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/lib/i18n";

// Analytics payload from GET /api/analytics
interface AnalyticsData {
  period: { start: string; end: string };
  financials: {
    totalSales: number;
    retailSales: number;
    wholesaleSales: number;
    outstandingDues: number;
  };
  production: {
    batchesInProduction: number;
    totalStock: number;
    phaseBreakdown: Record<string, number>;
  };
  trends: { date: string; amount: number; due: number }[];
  topClients: { name: string; total: number; due: number }[];
  comparison: {
    totalSalesChange: number | null;
    retailSalesChange: number | null;
    wholesaleSalesChange: number | null;
    previousTotalSales: number;
    previousRetailSales: number;
    previousWholesaleSales: number;
    previousPeriod: { start: string; end: string };
  } | null;
}

// Sale-intelligence payload from GET /api/sale-analytics
interface SaleAnalyticsData {
  period: { start: string; end: string };
  discounts: {
    totalDiscount: number;
    totalSalesValue: number;
    avgDiscountPct: number;
    salesWithDiscount: number;
    salesCount: number;
    discountHeavyDays: { day: string; discount: number; total: number }[];
    topDiscountedSales: {
      id: string;
      invoiceNumber: string;
      discount: number;
      total: number;
      date: string;
    }[];
  };
  paymentMix: {
    method: "CASH" | "BKASH" | "NAGAD" | "BANK_TRANSFER";
    count: number;
    amount: number;
    sharePct: number;
  }[];
  bestSellers: { productType: string; pcsSold: number; revenue: number }[];
}

// Wastage/defect payload from GET /api/wastage-analytics
interface WastageAnalyticsData {
  period: { start: string; end: string };
  summary: {
    returnLines: number;
    returnedQty: number;
    returnedValue: number;
    returnedQtyPctOfRevenue: number;
  };
  reasons: { reason: string | null; count: number; qty: number }[];
  products: {
    productType: string;
    returnCount: number;
    returnedQty: number;
    returnedValue: number;
  }[];
  batches: {
    batchNumber: string;
    productType: string;
    fabricType: string;
    supplier: string;
    returnedQty: number;
    returnedValue: number;
  }[];
  monthTrend: { month: string; returnedQty: number; cashback: number }[];
}

async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.message ?? "Failed to load analytics");
  }
  return res.json();
}

function formatMoney(value: number) {
  return `৳${value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
  });
}

/** Trend indicator badge with arrow and percentage. */
function TrendIndicator({ change }: { change: number | null }) {
  if (change === null || change === 0) return null;
  const isPositive = change > 0;
  return (
    <span
      className={`ml-1 inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
        isPositive
          ? "bg-emerald-50 text-emerald-700"
          : "bg-red-50 text-red-700"
      }`}
    >
      {isPositive ? (
        <ArrowUpRight className="size-3" />
      ) : (
        <ArrowDownRight className="size-3" />
      )}
      {Math.abs(change)}%
    </span>
  );
}

/** Method display names for the payment mix. */
const METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  BKASH: "bKash",
  NAGAD: "Nagad",
  BANK_TRANSFER: "Bank transfer",
};

const METHOD_COLORS: Record<string, string> = {
  CASH: "bg-emerald-500",
  BKASH: "bg-pink-500",
  NAGAD: "bg-orange-500",
  BANK_TRANSFER: "bg-blue-500",
};

/**
 * "Discounts & mix" tab: how much margin was given away in discounts, how
 * clients pay (bKash vs cash vs ...), and which product types sell best.
 */
function SaleIntelTab({
  data,
  error,
  isLoading,
}: {
  data: SaleAnalyticsData | undefined;
  error: Error | undefined;
  isLoading: boolean;
}) {
  const { t } = useLanguage();

  if (error) {
    return (
      <Card className="bg-white">
        <CardContent className="py-8 text-center text-sm text-rust">
          {error.message}
        </CardContent>
      </Card>
    );
  }

  const discounts = data?.discounts;
  const paymentMix = data?.paymentMix ?? [];
  const bestSellers = data?.bestSellers ?? [];

  return (
    <div className="space-y-4">
      {/* Discount summary cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="bg-white">
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground">{t("Total discounts given")}</p>
            <p className="font-heading text-2xl font-semibold text-rust">
              {isLoading ? "—" : formatMoney(discounts?.totalDiscount ?? 0)}
            </p>
            <p className="text-xs text-muted-foreground">
              {isLoading ? "" : `${discounts?.avgDiscountPct ?? 0}% ${t("of pre-discount value")}`}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-white">
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground">{t("Invoices discounted")}</p>
            <p className="font-heading text-2xl font-semibold text-charcoal">
              {isLoading ? "—" : `${discounts?.salesWithDiscount ?? 0}/${discounts?.salesCount ?? 0}`}
            </p>
            <p className="text-xs text-muted-foreground">{t("sales with a discount applied")}</p>
          </CardContent>
        </Card>
        <Card className="bg-white">
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground">{t("Net revenue (after discounts)")}</p>
            <p className="font-heading text-2xl font-semibold text-charcoal">
              {isLoading ? "—" : formatMoney(discounts?.totalSalesValue ?? 0)}
            </p>
            <p className="text-xs text-muted-foreground">
              {isLoading
                ? ""
                : `${t("before discounts")}: ${formatMoney(
                    (discounts?.totalSalesValue ?? 0) + (discounts?.totalDiscount ?? 0)
                  )}`}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Payment method mix */}
        <Card className="bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{t("Payment method mix")}</CardTitle>
            <CardDescription>
              {t("How the period's revenue was collected.")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : paymentMix.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("No sales in this period.")}</p>
            ) : (
              paymentMix.map((mix) => (
                <div key={mix.method}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {t(METHOD_LABELS[mix.method] ?? mix.method)} · {mix.count}
                    </span>
                    <span className="font-mono text-xs">
                      {formatMoney(mix.amount)} ({mix.sharePct}%)
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-charcoal/10">
                    <div
                      className={`h-full rounded-full ${METHOD_COLORS[mix.method] ?? "bg-gold"}`}
                      style={{ width: `${Math.min(mix.sharePct, 100)}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
        {/* Best sellers by product type */}
        <Card className="bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{t("Best sellers by product type")}</CardTitle>
            <CardDescription>
              {t("Pieces sold and revenue per product type.")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : bestSellers.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("No sales in this period.")}</p>
            ) : (
              <div className="space-y-1">
                {bestSellers.map((seller) => (
                  <div
                    key={seller.productType}
                    className="flex items-center justify-between border-b border-border/60 py-1.5 text-sm last:border-0"
                  >
                    <span className="truncate font-medium">{seller.productType}</span>
                    <span className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                      {seller.pcsSold} {t("pcs")} · {formatMoney(seller.revenue)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Most discounted invoices */}
      <Card className="bg-white">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{t("Most discounted invoices")}</CardTitle>
          <CardDescription>
            {t("The five invoices with the largest discount in the period.")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (discounts?.topDiscountedSales.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">{t("No discounted sales in this period.")}</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("Invoice")}</TableHead>
                    <TableHead>{t("Date")}</TableHead>
                    <TableHead className="text-right">{t("Invoice total")}</TableHead>
                    <TableHead className="text-right">{t("Discount")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {discounts?.topDiscountedSales.map((sale) => (
                    <TableRow key={sale.id}>
                      <TableCell className="font-mono text-xs">{sale.invoiceNumber}</TableCell>
                      <TableCell className="text-sm">{formatDate(sale.date)}</TableCell>
                      <TableCell className="text-right font-mono">{formatMoney(sale.total)}</TableCell>
                      <TableCell className="text-right font-mono text-rust">
                        −{formatMoney(sale.discount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * "Returns & wastage" tab: defect intelligence built on the returns table —
 * totals, reasons, worst product types and problem batches/suppliers, plus a
 * month-by-month returned-quantity trend.
 */
function WastageTab({
  data,
  error,
  isLoading,
}: {
  data: WastageAnalyticsData | undefined;
  error: Error | undefined;
  isLoading: boolean;
}) {
  const { t } = useLanguage();

  if (error) {
    return (
      <Card className="bg-white">
        <CardContent className="py-8 text-center text-sm text-rust">
          {error.message}
        </CardContent>
      </Card>
    );
  }

  const summary = data?.summary;
  const reasons = data?.reasons ?? [];
  const products = data?.products ?? [];
  const batches = data?.batches ?? [];
  const monthTrend = data?.monthTrend ?? [];

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-white">
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground">{t("Returned pieces")}</p>
            <p className="font-heading text-2xl font-semibold text-charcoal">
              {isLoading ? "—" : (summary?.returnedQty ?? 0).toLocaleString("en-US")}
            </p>
            <p className="text-xs text-muted-foreground">
              {summary?.returnLines ?? 0} {t("return lines")}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-white">
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground">{t("Refund value")}</p>
            <p className="font-heading text-2xl font-semibold text-rust">
              {isLoading ? "—" : formatMoney(summary?.returnedValue ?? 0)}
            </p>
            <p className="text-xs text-muted-foreground">{t("cash handed back on returns")}</p>
          </CardContent>
        </Card>
        <Card className="bg-white">
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground">{t("Return rate")}</p>
            <p className="font-heading text-2xl font-semibold text-charcoal">
              {isLoading ? "—" : `${summary?.returnedQtyPctOfRevenue ?? 0}%`}
            </p>
            <p className="text-xs text-muted-foreground">{t("of sold quantity came back")}</p>
          </CardContent>
        </Card>
        <Card className="bg-white">
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground">{t("Top reason")}</p>
            <p className="truncate font-heading text-2xl font-semibold text-charcoal">
              {isLoading ? "—" : reasons[0]?.reason || t("—")}
            </p>
            <p className="text-xs text-muted-foreground">
              {reasons[0] ? `${reasons[0].qty} ${t("pcs returned")}` : t("no returns yet")}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Return reasons breakdown */}
      <Card className="bg-white">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{t("Return reasons")}</CardTitle>
          <CardDescription>
            {t("Why pieces came back, ranked by returned quantity.")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : reasons.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("No returns in this period.")}</p>
          ) : (
            reasons.map((item, index) => (
              <div key={`${item.reason ?? "unspecified"}-${index}`}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="truncate text-muted-foreground">
                    {item.reason?.trim() || t("Unspecified")} · {item.count}{" "}
                    {t("return lines")}
                  </span>
                  <span className="font-mono text-xs">{item.qty} pcs</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-charcoal/10">
                  <div
                    className="h-full rounded-full bg-rust"
                    style={{
                      width: `${Math.min(
                        summary && summary.returnedQty > 0
                          ? (item.qty / summary.returnedQty) * 100
                          : 0,
                        100
                      )}%`,
                    }}
                  />
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Most returned product types */}
        <Card className="bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{t("Most returned product types")}</CardTitle>
            <CardDescription>
              {t("Product types with the highest returned quantity and refund value.")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : products.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("No returns in this period.")}</p>
            ) : (
              <div className="space-y-1">
                {products.map((product) => (
                  <div
                    key={product.productType}
                    className="flex items-center justify-between border-b border-border/60 py-1.5 text-sm last:border-0"
                  >
                    <span className="truncate font-medium">{product.productType}</span>
                    <span className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="font-mono">
                        {product.returnedQty} pcs · {product.returnCount}{" "}
                        {t("return lines")}
                      </span>
                      <span className="font-mono text-rust">
                        {formatMoney(product.returnedValue)}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        {/* Problem batches & suppliers */}
        <Card className="bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{t("Problem batches & suppliers")}</CardTitle>
            <CardDescription>
              {t("Batches with the most returned pieces — supplier follows the batch.")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : batches.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("No returns in this period.")}</p>
            ) : (
              <div className="space-y-1">
                {batches.map((batch) => (
                  <div
                    key={batch.batchNumber}
                    className="flex items-center justify-between border-b border-border/60 py-1.5 text-sm last:border-0"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        #{batch.batchNumber} · {batch.productType}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {batch.fabricType} · {batch.supplier}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                      <span className="font-mono">{batch.returnedQty} pcs</span>
                      <span className="font-mono text-rust">
                        {formatMoney(batch.returnedValue)}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Month-by-month returned quantity trend */}
      <Card className="bg-white">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{t("Returned quantity by month")}</CardTitle>
          <CardDescription>
            {t("How many pieces came back each month, with the cashback handed out.")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : monthTrend.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("No returns in this period.")}</p>
          ) : (
            <div className="space-y-3">
              {(() => {
                const maxQty = Math.max(...monthTrend.map((m) => m.returnedQty), 1);
                return monthTrend.map((month) => (
                  <div key={month.month}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="truncate text-muted-foreground">{month.month}</span>
                      <span className="flex items-center gap-3 text-xs">
                        <span className="font-mono">{month.returnedQty} pcs</span>
                        <span className="font-mono text-rust">
                          {formatMoney(month.cashback)}
                        </span>
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-charcoal/10">
                      <div
                        className="h-full rounded-full bg-gold"
                        style={{ width: `${(month.returnedQty / maxQty) * 100}%` }}
                      />
                    </div>
                  </div>
                ));
              })()}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function AnalyticsClient() {
  const { t } = useLanguage();
  const [start, setStart] = useState<string | undefined>(undefined);
  const [end, setEnd] = useState<string | undefined>(undefined);

  const params = new URLSearchParams();
  if (start) params.set("start", start);
  if (end) params.set("end", end);
  const queryString = params.toString();

  const { data, error, isLoading } = useSWR<AnalyticsData>(
    `/api/analytics${queryString ? `?${queryString}` : ""}`,
    fetcher<AnalyticsData>,
    { refreshInterval: 30000, keepPreviousData: true }
  );

  // Discount / payment-mix / best-seller intelligence — same date range.
  const {
    data: saleIntel,
    error: saleIntelError,
    isLoading: saleIntelLoading,
  } = useSWR<SaleAnalyticsData>(
    `/api/sale-analytics${queryString ? `?${queryString}` : ""}`,
    fetcher<SaleAnalyticsData>,
    { refreshInterval: 30000, keepPreviousData: true }
  );

  // Returns/defect intelligence — same date range.
  const {
    data: wastage,
    error: wastageError,
    isLoading: wastageLoading,
  } = useSWR<WastageAnalyticsData>(
    `/api/wastage-analytics${queryString ? `?${queryString}` : ""}`,
    fetcher<WastageAnalyticsData>,
    { refreshInterval: 30000, keepPreviousData: true }
  );

  // Download the sales CSV for the currently selected date range.
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  async function handleExport() {
    setExporting(true);
    setExportError(null);
    try {
      const exportParams = new URLSearchParams({ type: "sales" });
      if (start) exportParams.set("start", start);
      if (end) exportParams.set("end", end);
      const res = await fetch(`/api/export?${exportParams.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message ?? "Export failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sales_${start || "all"}_to_${end || "today"}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header with date range */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-charcoal">
            {t("Business Analytics")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("Combined financial and production overview with period comparisons.")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="size-4 text-muted-foreground" />
          <input
            type="date"
            value={start || ""}
            onChange={(e) => setStart(e.target.value || undefined)}
            className="h-9 rounded-lg border border-input bg-white px-2 text-sm"
          />
          <span className="text-xs text-muted-foreground">to</span>
          <input
            type="date"
            value={end || ""}
            onChange={(e) => setEnd(e.target.value || undefined)}
            className="h-9 rounded-lg border border-input bg-white px-2 text-sm"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setStart(undefined); setEnd(undefined); }}
          >
            {t("Reset")}
          </Button>
          <Button size="sm" onClick={handleExport} disabled={exporting}>
            <Download className="size-4" aria-hidden />
            {exporting ? t("Exporting…") : t("Export CSV")}
          </Button>
        </div>
      </div>

      {exportError && (
        <div className="rounded-lg border border-rust/20 bg-rust/5 p-4 text-sm text-rust">
          {exportError}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-rust/20 bg-rust/5 p-4 text-sm text-rust">
          {error.message}
        </div>
      )}
      {/* Financial metrics row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-white">
          <CardContent className="flex items-center gap-4 py-4">
            <div className="flex size-10 items-center justify-center rounded-xl bg-gold/20">
              <TrendingUp className="size-5 text-gold" />
            </div>
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm text-muted-foreground">{t("Total sales")}</span>
              <span className="flex items-center font-heading text-2xl font-semibold text-charcoal">
                {isLoading ? "—" : formatMoney(data?.financials.totalSales ?? 0)}
                {!isLoading && data?.comparison && (
                  <TrendIndicator change={data.comparison.totalSalesChange} />
                )}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white">
          <CardContent className="flex items-center gap-4 py-4">
            <div className="flex size-10 items-center justify-center rounded-xl bg-gold/20">
              <BarChart3 className="size-5 text-gold" />
            </div>
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm text-muted-foreground">{t("Retail sales")}</span>
              <span className="flex items-center font-heading text-2xl font-semibold text-charcoal">
                {isLoading ? "—" : formatMoney(data?.financials.retailSales ?? 0)}
                {!isLoading && data?.comparison && (
                  <TrendIndicator change={data.comparison.retailSalesChange} />
                )}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white">
          <CardContent className="flex items-center gap-4 py-4">
            <div className="flex size-10 items-center justify-center rounded-xl bg-gold/20">
              <Users className="size-5 text-gold" />
            </div>
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm text-muted-foreground">{t("Wholesale sales")}</span>
              <span className="flex items-center font-heading text-2xl font-semibold text-charcoal">
                {isLoading ? "—" : formatMoney(data?.financials.wholesaleSales ?? 0)}
                {!isLoading && data?.comparison && (
                  <TrendIndicator change={data.comparison.wholesaleSalesChange} />
                )}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white">
          <CardContent className="flex items-center gap-4 py-4">
            <div className="flex size-10 items-center justify-center rounded-xl bg-rust/15">
              <Wallet className="size-5 text-rust" />
            </div>
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm text-muted-foreground">{t("Outstanding dues")}</span>
              <span className="font-heading text-2xl font-semibold text-rust">
                {isLoading ? "—" : formatMoney(data?.financials.outstandingDues ?? 0)}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
      {/* Production metrics row */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="bg-white">
          <CardContent className="flex items-center gap-4 py-4">
            <div className="flex size-10 items-center justify-center rounded-xl bg-charcoal/10">
              <Layers className="size-5 text-charcoal" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t("Batches in production")}</p>
              <p className="font-heading text-2xl font-semibold text-charcoal">
                {isLoading ? "—" : data?.production.batchesInProduction ?? 0}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white">
          <CardContent className="flex items-center gap-4 py-4">
            <div className="flex size-10 items-center justify-center rounded-xl bg-charcoal/10">
              <Package className="size-5 text-charcoal" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t("Stock remaining (pcs)")}</p>
              <p className="font-heading text-2xl font-semibold text-charcoal">
                {isLoading ? "—" : data?.production.totalStock ?? 0}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("Phase load")}</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : data && Object.keys(data.production.phaseBreakdown).length > 0 ? (
              <div className="space-y-1">
                {Object.entries(data.production.phaseBreakdown).map(([name, count]) => (
                  <div key={name} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{name}</span>
                    <Badge variant="secondary" className="text-xs">{count}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">{t("No active phases.")}</p>
            )}
          </CardContent>
        </Card>
      </div>
      {/* Charts and tables */}
      <Tabs defaultValue="trends" className="mt-2">
        <TabsList variant="line">
          <TabsTrigger value="trends">{t("Sales trend")}</TabsTrigger>
          <TabsTrigger value="clients">{t("Top clients")}</TabsTrigger>
          <TabsTrigger value="sale-intel">{t("Discounts & mix")}</TabsTrigger>
          <TabsTrigger value="wastage">{t("Returns & wastage")}</TabsTrigger>
        </TabsList>

        <TabsContent value="trends" className="mt-4">
          <Card className="bg-white">
            <CardHeader>
              <CardTitle>{t("Daily sales vs dues")}</CardTitle>
              <CardDescription>
                {t("Sales (gold) and unpaid amounts (red) per day in the selected period.")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-[250px] w-full" />
              ) : data && data.trends.length > 0 ? (
                <ChartContainer
                  config={{
                    amount: { label: t("Sales"), color: "#D4A73D" },
                    due: { label: t("Due"), color: "#C2410C" },
                  }}
                  className="h-[250px] w-full"
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.trends} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="4 4" vertical={false} />
                      <XAxis
                        dataKey="date"
                        tickFormatter={formatDate}
                        tick={{ fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                        minTickGap={10}
                      />
                      <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="amount" fill="var(--color-amount)" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="due" fill="var(--color-due)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartContainer>
              ) : (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  {t("No sales data in this period.")}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="clients" className="mt-4">
          <Card className="bg-white">
            <CardHeader>
              <CardTitle>{t("Top clients by sales")}</CardTitle>
              <CardDescription>
                {t("Clients ranked by total sales volume in the selected period.")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-[200px] w-full" />
              ) : data && data.topClients.length > 0 ? (
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("Client")}</TableHead>
                        <TableHead className="text-right">{t("Sales")}</TableHead>
                        <TableHead className="text-right">{t("Due")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.topClients.map((client) => (
                        <TableRow key={client.name}>
                          <TableCell className="font-medium">{client.name}</TableCell>
                          <TableCell className="text-right font-mono">
                            {formatMoney(client.total)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {client.due > 0 ? (
                              <span className="text-rust">{formatMoney(client.due)}</span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  {t("No client data in this period.")}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sale-intel" className="mt-4">
          <SaleIntelTab
            data={saleIntel}
            error={saleIntelError}
            isLoading={saleIntelLoading}
          />
        </TabsContent>

        <TabsContent value="wastage" className="mt-4">
          <WastageTab
            data={wastage}
            error={wastageError}
            isLoading={wastageLoading}
          />
        </TabsContent>
      </Tabs>

      {/* Comparison summary footer */}
      {data?.comparison && (
        <p className="text-xs text-muted-foreground">
          {t("Percentages show change vs")}{" "}
          {formatDate(data.comparison.previousPeriod.start)} – {formatDate(data.comparison.previousPeriod.end)}
        </p>
      )}
    </div>
  );
}