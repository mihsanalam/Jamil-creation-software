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