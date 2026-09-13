"use client";

import { useState } from "react";
import { ArrowDownRight, ArrowUpRight, Download, FileText, Users, TrendingUp, Wallet, type LucideIcon } from "lucide-react";
import useSWR from "swr";
import {
  LineChart as RechartsLineChart,
  Line as RechartsLine,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { MetricCard } from "@/components/shared/metric-card";
import { ClientStatementDialog } from "@/app/owner/sales-dues/client-statement-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Sidebar } from "@/components/sidebar/sidebar";
import { useLanguage } from "@/lib/i18n";

interface SalesReport {
  totalSales: number;
  retailSales: number;
  wholesaleSales: number;
  totalOutstandingDues: number;
  salesTrend: { date: string; amount: number; due: number }[];
  allSales: {
    id: string;
    invoiceNumber: string;
    date: Date | string;
    client: string;
    type: "RETAIL" | "WHOLESALE";
    amount: number;
    paymentStatus: "PAID" | "PARTIAL" | "DUE";
  }[];
  clientsWithDues: {
    id: string;
    name: string;
    phone: string;
    type: "RETAIL" | "WHOLESALE";
    totalDue: number;
    lastPaymentDate: string | null;
  }[];
  comparison: {
    totalSalesChange: number | null;
    retailSalesChange: number | null;
    wholesaleSalesChange: number | null;
    previousTotalSales: number;
    previousRetailSales: number;
    previousWholesaleSales: number;
  } | null;
}

const RANGE_OPTIONS = [
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "all", label: "All time" },
] as const;

/** One client row of the dues aging report (GET /api/dues-aging). */
interface AgingClient {
  id: string;
  name: string;
  phone: string;
  type: "RETAIL" | "WHOLESALE";
  totalDue: number;
  invoiceCount: number;
  bucket: "0-15" | "16-30" | "31-60" | "60+";
  oldestInvoice: { invoiceNumber: string; date: string; days: number };
}

interface AgingReport {
  totalDue: number;
  buckets: Record<AgingClient["bucket"], { total: number; clients: number }>;
  clients: AgingClient[];
}

const AGING_BUCKETS: { key: AgingClient["bucket"]; label: string; tone: string }[] = [
  { key: "0-15", label: "0–15 days", tone: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { key: "16-30", label: "16–30 days", tone: "bg-amber-50 text-amber-700 border-amber-200" },
  { key: "31-60", label: "31–60 days", tone: "bg-orange-50 text-orange-700 border-orange-200" },
  { key: "60+", label: "60+ days", tone: "bg-red-50 text-red-700 border-red-200" },
];

async function fetcher(url: string): Promise<SalesReport> {
  const res = await fetch(url);
  if (!res.ok) {
    const { message } = await res.json().catch(() => ({}));
    throw new Error(message || "Failed to load the sales report");
  }
  return res.json();
}

async function agingFetcher(url: string): Promise<AgingReport> {
  const res = await fetch(url);
  if (!res.ok) {
    const { message } = await res.json().catch(() => ({}));
    throw new Error(message || "Failed to load the dues aging report");
  }
  return res.json();
}

/**
 * Sales-trend line chart. Declared at module scope (not inside the page
 * component) so React doesn't treat it as a dynamically-created component,
 * which would trigger the "Cannot create components during render" lint/rule
 * and reset its state on every render.
 */
function SalesTrendChart({ data }: { data: SalesReport["salesTrend"] }) {
  return (
    <ChartContainer
      config={{
        amount: { label: "Sales", color: "#D4A73D" },
        due: { label: "Due", color: "#C2410C" },
      }}
      className="h-[200px] w-full"
    >
      <RechartsLineChart
        data={data}
        margin={{ top: 10, right: 12, bottom: 0, left: 0 }}
      >
        <CartesianGrid strokeDasharray="4 4" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: string) =>
            new Date(v).toLocaleDateString("en-GB", {
              month: "short",
              day: "numeric",
            })
          }
          minTickGap={10}
        />
        <YAxis
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => "৳" + v}
          width={40}
        />
          <ChartTooltip
            content={
              <ChartTooltipContent
                className="w-[120px] text-xs"
              />
            }
          />
        <RechartsLine
          type="monotone"
          dataKey="amount"
          stroke="var(--color-amount, #D4A73D)"
          strokeWidth={2}
          dot={{ r: 3 }}
          activeDot={{ r: 5 }}
        />
        <RechartsLine
          type="monotone"
          dataKey="due"
          stroke="var(--color-due, #C2410C)"
          strokeWidth={2}
          strokeDasharray="5 3"
          dot={{ r: 3 }}
          activeDot={{ r: 5 }}
        />
      </RechartsLineChart>
    </ChartContainer>
  );
}

/**
 * Trend badge showing period-over-period percentage change.
 * Renders a green up-arrow for positive, red down-arrow for negative.
 * Returns null when there is no comparison data.
 * Declared at module scope so React doesn't recreate it every render.
 */
function TrendBadge({ change }: { change: number | null }) {
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

export default function SalesDuesClient() {
  const { t } = useLanguage();
  // "all" is the default so the trend line always has enough points to draw
  // a meaningful line (a month with one sale day renders as a single dot).
  const [range, setRange] = useState("all");
  // Which client's statement/ledger dialog is open (null = closed).
  const [statementClientId, setStatementClientId] = useState<string | null>(null);

  const {
    data: report,
    error,
    isLoading,
  } = useSWR<SalesReport>(
    `/api/sales-report?range=${range}`,
    fetcher,
    { refreshInterval: 60000, dedupingInterval: 5000, keepPreviousData: true }
  );

  // Dues aging (0-15/16-30/31-60/60+ days) — independent of the range picker
  // because aging is about the age of unpaid invoices, not the sale window.
  const {
    data: aging,
    error: agingError,
    isLoading: agingLoading,
  } = useSWR<AgingReport>("/api/dues-aging", agingFetcher, {
    refreshInterval: 60000,
    keepPreviousData: true,
  });

  // Triggers a CSV download via the /api/export endpoint.
  const handleExport = (type: "sales" | "dues") => {
    const params = new URLSearchParams({ type });
    // Map the range selector to start/end dates for the export.
    const now = new Date();
    if (range === "this_month") {
      const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
      params.set("start", start);
      params.set("end", end);
    } else if (range === "last_month") {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10);
      const end = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10);
      params.set("start", start);
      params.set("end", end);
    }
    window.open(`/api/export?${params.toString()}`, "_blank");
  };

  const renderMetric = (
    label: string,
    value: string,
    icon: LucideIcon,
    variant: "default" | "rust" = "default",
    description?: string,
    extra?: React.ReactNode
  ) => (
    <MetricCard
      label={label}
      value={value}
      icon={icon}
      variant={variant}
      description={description}
      extra={extra}
    />
  );

  function PaymentStatusBadge({ status }: { status: SalesReport["allSales"][0]["paymentStatus"] }) {
    if (status === "PAID") {
      return (
        <Badge variant="outline" className="border-green-200 bg-green-50 text-green-700">
          {t("Paid")}
        </Badge>
      );
    }
    return (
      <Badge className="bg-rust/15 text-rust">
        {t(status === "PARTIAL" ? "Partial" : "Due")}
      </Badge>
    );
  }

  function ClientTypeBadge({ type }: { type: "RETAIL" | "WHOLESALE" }) {
    return type === "WHOLESALE" ? (
      <Badge variant="secondary" className="bg-gold/20 text-charcoal">
        {t("Wholesale")}
      </Badge>
    ) : (
      <Badge variant="secondary" className="bg-charcoal/10 text-charcoal">
        {t("Retail")}
      </Badge>
    );
  }

  function formatDate(value: Date | string) {
    const date = new Date(value);
    return date.toLocaleDateString("en-GB", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  function formatCurrency(amount: number) {
    return "৳ " + amount.toLocaleString("en-BD", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  /**
   * Trend badge showing period-over-period percentage change.
   * Renders a green up-arrow for positive, red down-arrow for negative.
   * Returns null when there is no comparison data.
   */

  const EmptyState = ({ message }: { message: string }) => (
    <div className="py-10 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );

    function renderAllSalesTab(
    isLoading: boolean,
    sales: SalesReport["allSales"],
    err: unknown
  ) {
    if (err) return <EmptyState message={t("Could not load sales.")} />;
    if (isLoading) {
      return (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      );
    }
    if (sales.length === 0) return <EmptyState message={t("No sales in this period.")} />;
    return (
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("Date")}</TableHead>
              <TableHead>{t("Invoice")}</TableHead>
              <TableHead>{t("Client")}</TableHead>
              <TableHead>{t("Type")}</TableHead>
              <TableHead className="text-right">{t("Amount")}</TableHead>
              <TableHead>{t("Status")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sales.map((sale) => (
              <TableRow key={sale.id}>
                <TableCell>{formatDate(sale.date)}</TableCell>
                <TableCell className="font-mono text-xs">{sale.invoiceNumber}</TableCell>
                <TableCell>{sale.client}</TableCell>
                <TableCell><ClientTypeBadge type={sale.type} /></TableCell>
                <TableCell className="font-mono text-right">{formatCurrency(sale.amount)}</TableCell>
                <TableCell><PaymentStatusBadge status={sale.paymentStatus} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

    function renderClientsWithDuesTab(
    isLoading: boolean,
    clients: SalesReport["clientsWithDues"],
    err: unknown
  ) {
    if (err) return <EmptyState message={t("Could not load client balances.")} />;
    if (isLoading) {
      return (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      );
    }
    if (clients.length === 0) return <EmptyState message={t("No outstanding dues at the moment.")} />;
    return (
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("Client")}</TableHead>
              <TableHead>{t("Type")}</TableHead>
              <TableHead className="text-right">{t("Total owed")}</TableHead>
              <TableHead>{t("Last payment")}</TableHead>
              <TableHead className="text-center">{t("Actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {clients.map((client) => (
              <TableRow key={client.id}>
                <TableCell>
                  <div className="font-medium">{client.name}</div>
                  <div className="text-sm text-muted-foreground">{client.phone}</div>
                </TableCell>
                <TableCell><ClientTypeBadge type={client.type} /></TableCell>
                <TableCell className="font-mono text-right">{formatCurrency(client.totalDue)}</TableCell>
                <TableCell>{client.lastPaymentDate ? formatDate(client.lastPaymentDate) : "—"}</TableCell>
                <TableCell className="text-center">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setStatementClientId(client.id)}
                  >
                    {t("Statement")}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  /**
   * Dues aging tab: bucket summary cards (0-15/16-30/31-60/60+ days) plus a
   * per-client table ordered worst-first, so the owner knows who to chase.
   */
  function renderAgingTab() {
    if (agingError)
      return <EmptyState message={t("Could not load the dues aging report.")} />;
    if (agingLoading) {
      return (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      );
    }
    const clients = aging?.clients ?? [];
    if (clients.length === 0)
      return <EmptyState message={t("No outstanding dues right now.")} />;

    return (
      <div className="space-y-6">
        {/* Bucket summary */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {AGING_BUCKETS.map(({ key, label, tone }) => {
            const bucket = aging?.buckets?.[key];
            return (
              <div
                key={key}
                className={`rounded-lg border p-4 ${tone}`}
              >
                <div className="text-xs font-semibold uppercase tracking-wide">
                  {t(label)}
                </div>
                <div className="mt-1 font-heading text-xl font-semibold">
                  {formatCurrency(bucket?.total ?? 0)}
                </div>
                <div className="mt-0.5 text-xs opacity-80">
                  {bucket?.clients ?? 0} {t("client(s)")}
                </div>
              </div>
            );
          })}
        </div>

        {/* Per-client breakdown, worst bucket first */}
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("Client")}</TableHead>
                <TableHead>{t("Type")}</TableHead>
                <TableHead className="text-center">{t("Invoices")}</TableHead>
                <TableHead className="text-right">{t("Total owed")}</TableHead>
                <TableHead>{t("Oldest invoice")}</TableHead>
                <TableHead>{t("Age")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clients.map((client) => {
                const tone =
                  AGING_BUCKETS.find((b) => b.key === client.bucket)?.tone ??
                  "bg-charcoal/10 text-charcoal";
                return (
                  <TableRow key={client.id}>
                    <TableCell>
                      <div className="font-medium">{client.name}</div>
                      <div className="text-sm text-muted-foreground">{client.phone}</div>
                    </TableCell>
                    <TableCell><ClientTypeBadge type={client.type} /></TableCell>
                    <TableCell className="text-center">{client.invoiceCount}</TableCell>
                    <TableCell className="font-mono text-right">
                      {formatCurrency(client.totalDue)}
                    </TableCell>
                    <TableCell>
                      <div className="font-mono text-xs">{client.oldestInvoice.invoiceNumber}</div>
                      <div className="text-sm text-muted-foreground">
                        {formatDate(client.oldestInvoice.date)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`border ${tone}`}>
                        {client.oldestInvoice.days} {t("days")}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }

    // --- Page body ---

  return (
    <div className="flex h-screen flex-col overflow-hidden md:flex-row">
      <Sidebar role="OWNER" activeRoute="sales-dues" />

      <main className="flex-1 overflow-y-auto bg-background">
          <div className="w-full px-6 py-6">
            {/* Header + range picker */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="font-heading text-2xl font-semibold text-charcoal">
                  {t("Sales and dues")}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("Revenue and outstanding client balances across all sales.")}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Select value={range} onValueChange={(value) => setRange(value ?? "this_month")}>
                  <SelectTrigger className="w-44">
                    <SelectValue placeholder={t("Select range")} />
                  </SelectTrigger>
                  <SelectContent>
                    {RANGE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {t(opt.label)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleExport("sales")}
                  title={t("Export sales as CSV")}
                >
                  <Download className="size-3.5" />
                  <span className="hidden sm:inline">{t("Export sales")}</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleExport("dues")}
                  title={t("Export dues as CSV")}
                >
                  <Download className="size-3.5" />
                  <span className="hidden sm:inline">{t("Export dues")}</span>
                </Button>
              </div>
            </div>

            {/* Error banner */}
            {error && (
              <div className="mt-6 rounded-lg border border-rust/20 bg-rust/5 p-4 text-sm text-rust">
                {error.message}
              </div>
            )}

            {/* Metric cards with period comparison badges */}
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {renderMetric(
                t("Total sales"),
                isLoading ? "—" : formatCurrency(report?.totalSales ?? 0),
                TrendingUp,
                "default",
                undefined,
                !isLoading && report?.comparison ? (
                  <TrendBadge change={report.comparison.totalSalesChange} />
                ) : undefined
              )}
              {renderMetric(
                t("Retail sales"),
                isLoading ? "—" : formatCurrency(report?.retailSales ?? 0),
                FileText,
                "default",
                undefined,
                !isLoading && report?.comparison ? (
                  <TrendBadge change={report.comparison.retailSalesChange} />
                ) : undefined
              )}
              {renderMetric(
                t("Wholesale sales"),
                isLoading ? "—" : formatCurrency(report?.wholesaleSales ?? 0),
                Users,
                "default",
                undefined,
                !isLoading && report?.comparison ? (
                  <TrendBadge change={report.comparison.wholesaleSalesChange} />
                ) : undefined
              )}
              {renderMetric(
                t("Outstanding dues"),
                isLoading ? "—" : formatCurrency(report?.totalOutstandingDues ?? 0),
                Wallet,
                "rust"
              )}
            </div>

            {/* Sales trend chart */}
            <Card className="mt-6 border-0 shadow-none">
              <CardHeader className="pb-3">
                <CardTitle>{t("Sales trend")}</CardTitle>
                <CardDescription>
                  {t("Daily sales (gold) and the unpaid part of each day's invoices")}{" "}
                  (dashed) — {t(RANGE_OPTIONS.find((o) => o.value === range)?.label ?? "")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-[200px] w-full" />
                ) : report?.salesTrend && report.salesTrend.length > 0 ? (
                  <SalesTrendChart data={report.salesTrend} />
                ) : (
                  <div className="text-center text-sm text-muted-foreground">
                    {t("No sales in this period.")}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Tabs: All sales / Clients with dues */}
            <Tabs defaultValue="all-sales" className="mt-6">
              <TabsList variant="line">
                <TabsTrigger value="all-sales">{t("All sales")}</TabsTrigger>
                <TabsTrigger value="clients-with-dues">
                  {t("Clients with dues")}
                </TabsTrigger>
                <TabsTrigger value="dues-aging">{t("Dues aging")}</TabsTrigger>
              </TabsList>

              <TabsContent value="all-sales" className="mt-4">
                {renderAllSalesTab(isLoading, report?.allSales ?? [], error)}
              </TabsContent>

              <TabsContent value="clients-with-dues" className="mt-4">
                {renderClientsWithDuesTab(
                  isLoading,
                  report?.clientsWithDues ?? [],
                  error
                )}
              </TabsContent>

              <TabsContent value="dues-aging" className="mt-4">
                {renderAgingTab()}
              </TabsContent>
            </Tabs>
      </div>
        </main>

      {/* Per-client statement/ledger dialog (opened from the dues table) */}
      <ClientStatementDialog
        clientId={statementClientId}
        onOpenChange={(open) => !open && setStatementClientId(null)}
      />
    </div>
  );
}
