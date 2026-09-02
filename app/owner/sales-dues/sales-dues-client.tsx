"use client";

import { useState } from "react";
import { FileText, Users, TrendingUp, Wallet, type LucideIcon } from "lucide-react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Sidebar } from "@/components/sidebar/sidebar";

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
}

const RANGE_OPTIONS = [
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "all", label: "All time" },
] as const;

async function fetcher(url: string): Promise<SalesReport> {
  const res = await fetch(url);
  if (!res.ok) {
    const { message } = await res.json().catch(() => ({}));
    throw new Error(message || "Failed to load the sales report");
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

export default function SalesDuesClient() {
  // "all" is the default so the trend line always has enough points to draw
  // a meaningful line (a month with one sale day renders as a single dot).
  const [range, setRange] = useState("all");

  const {
    data: report,
    error,
    isLoading,
  } = useSWR<SalesReport>(
    `/api/sales-report?range=${range}`,
    fetcher,
    { refreshInterval: 60000, dedupingInterval: 5000, keepPreviousData: true }
  );

  const renderMetric = (
    label: string,
    value: string,
        icon: LucideIcon,
    variant: "default" | "rust" = "default",
    description?: string
  ) => (
    <MetricCard
      label={label}
      value={value}
      icon={icon}
      variant={variant}
      description={description}
    />
  );

  function PaymentStatusBadge({ status }: { status: SalesReport["allSales"][0]["paymentStatus"] }) {
    if (status === "PAID") {
      return (
        <Badge variant="outline" className="border-green-200 bg-green-50 text-green-700">
          Paid
        </Badge>
      );
    }
    return (
      <Badge className="bg-rust/15 text-rust">
        {status === "PARTIAL" ? "Partial" : "Due"}
      </Badge>
    );
  }

  function ClientTypeBadge({ type }: { type: "RETAIL" | "WHOLESALE" }) {
    return type === "WHOLESALE" ? (
      <Badge variant="secondary" className="bg-gold/20 text-charcoal">
        Wholesale
      </Badge>
    ) : (
      <Badge variant="secondary" className="bg-charcoal/10 text-charcoal">
        Retail
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
    if (err) return <EmptyState message="Could not load sales." />;
    if (isLoading) {
      return (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      );
    }
    if (sales.length === 0) return <EmptyState message="No sales found for this period." />;
    return (
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Invoice</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Status</TableHead>
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
    if (err) return <EmptyState message="Could not load client balances." />;
    if (isLoading) {
      return (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      );
    }
    if (clients.length === 0) return <EmptyState message="No outstanding dues at the moment." />;
    return (
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Client</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Total owed</TableHead>
              <TableHead>Last payment</TableHead>
              <TableHead className="text-center">Actions</TableHead>
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
                  <Button variant="outline" size="sm" disabled>Contact</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

    // --- Page body ---

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <div className="flex flex-1 overflow-hidden">
        <Sidebar role="OWNER" activeRoute="sales-dues" />

        <main className="flex-1 overflow-y-auto bg-background">
          <div className="w-full px-6 py-6">
            {/* Header + range picker */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="font-heading text-2xl font-semibold text-charcoal">
                  Sales and dues
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Revenue and outstanding client balances across all sales.
                </p>
              </div>

                            <Select value={range} onValueChange={(value) => setRange(value ?? "this_month")}>
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="Select range" />
                </SelectTrigger>
                <SelectContent>
                  {RANGE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Error banner */}
            {error && (
              <div className="mt-6 rounded-lg border border-rust/20 bg-rust/5 p-4 text-sm text-rust">
                {error.message}
              </div>
            )}

            {/* Metric cards */}
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {renderMetric(
                "Total sales",
                isLoading ? "—" : formatCurrency(report?.totalSales ?? 0),
                TrendingUp
              )}
              {renderMetric(
                "Retail sales",
                isLoading ? "—" : formatCurrency(report?.retailSales ?? 0),
                FileText
              )}
              {renderMetric(
                "Wholesale sales",
                isLoading ? "—" : formatCurrency(report?.wholesaleSales ?? 0),
                Users
              )}
              {renderMetric(
                "Outstanding dues",
                isLoading ? "—" : formatCurrency(report?.totalOutstandingDues ?? 0),
                Wallet,
                "rust"
              )}
            </div>

            {/* Sales trend chart */}
            <Card className="mt-6 border-0 shadow-none">
              <CardHeader className="pb-3">
                <CardTitle>Sales trend</CardTitle>
                <CardDescription>
                  Daily sales (gold) and the unpaid part of each day&apos;s invoices
                  (dashed) — {RANGE_OPTIONS.find((o) => o.value === range)?.label}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-[200px] w-full" />
                ) : report?.salesTrend && report.salesTrend.length > 0 ? (
                  <SalesTrendChart data={report.salesTrend} />
                ) : (
                  <div className="text-center text-sm text-muted-foreground">
                    No sales in this period.
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Tabs: All sales / Clients with dues */}
            <Tabs defaultValue="all-sales" className="mt-6">
              <TabsList variant="line">
                <TabsTrigger value="all-sales">All sales</TabsTrigger>
                <TabsTrigger value="clients-with-dues">
                  Clients with dues
                </TabsTrigger>
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
            </Tabs>
          </div>
        </main>
      </div>
    </div>
  );
}
