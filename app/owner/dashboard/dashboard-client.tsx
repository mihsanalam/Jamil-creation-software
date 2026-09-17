"use client";

import { useState, type FormEvent } from "react";
import useSWR from "swr";
import {
  Layers,
  Package,
  RotateCcw,
  Settings,
  ShoppingCart,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

import { MetricCard } from "@/components/shared/metric-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/lib/i18n";

// Full payload returned by GET /api/dashboard/summary.
interface DashboardSummary {
  batchesInProduction: number;
  totalStock: number;
  salesToday: number;
  outstandingDues: number;
  phaseBreakdown: Record<string, number>;
  bottleneck: { name: string; count: number } | null;
  bottleneckThreshold: number;
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

// Payload from GET /api/stock-alerts — lots tripping low-stock/aging rules.
interface StockAlertsData {
  summary: {
    lowStockThreshold: number;
    agingStockDays: number;
    lowStockCount: number;
    agingStockCount: number;
    totalRemainingUnits: number;
  };
  alerts: {
    id: string;
    barcode: string;
    productType: string;
    fabricType: string;
    storageLocation: string;
    branch: string;
    quantity: number;
    quantityRemaining: number;
    daysInStock: number;
    lowStock: boolean;
    agingStock: boolean;
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
  const { t } = useLanguage();
  // The Owner keeps this screen open — poll every 10s so it feels live.
  const { data, error, isLoading, mutate } = useSWR<DashboardSummary>(
    "/api/dashboard/summary",
    fetcher<DashboardSummary>,
    { refreshInterval: 10000, keepPreviousData: true }
  );

  // Settings dialog — edits the bottleneck alert threshold, the
  // block-DUE-clients policy and the printed-receipt shop profile
  // (see /api/settings).
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsInput, setSettingsInput] = useState("");
  const [blockDueInput, setBlockDueInput] = useState(false);
  const [shopNameInput, setShopNameInput] = useState("");
  const [shopPhoneInput, setShopPhoneInput] = useState("");
  const [receiptFooterInput, setReceiptFooterInput] = useState("");
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // Low-stock / aging-stock warnings (Tier 2 #9) — poll a bit slower than
  // the pipeline because stock moves only when the POS sells.
  const {
    data: stockAlerts,
    error: stockAlertsError,
    isLoading: stockAlertsLoading,
  } = useSWR<StockAlertsData>("/api/stock-alerts", fetcher<StockAlertsData>, {
    refreshInterval: 60000,
    keepPreviousData: true,
  });
  const stockAlertsList = stockAlerts?.alerts ?? [];

  // Pre-fill the form from GET /api/settings (which carries every value with
  // its default).
  async function openSettings() {
    setSettingsInput(String(data?.bottleneckThreshold ?? 8));
    setBlockDueInput(false);
    setShopNameInput("");
    setShopPhoneInput("");
    setReceiptFooterInput("");
    setSettingsOpen(true);
    try {
      const response = await fetch("/api/settings");
      if (!response.ok) return;
      const settings = (await response.json()) as {
        bottleneckThreshold?: number;
        blockDueClients?: boolean;
        shopName?: string;
        shopPhone?: string;
        receiptFooter?: string;
      };
      if (typeof settings.bottleneckThreshold === "number") {
        setSettingsInput(String(settings.bottleneckThreshold));
      }
      if (typeof settings.blockDueClients === "boolean") {
        setBlockDueInput(settings.blockDueClients);
      }
      if (typeof settings.shopName === "string") {
        setShopNameInput(settings.shopName);
      }
      if (typeof settings.shopPhone === "string") {
        setShopPhoneInput(settings.shopPhone);
      }
      if (typeof settings.receiptFooter === "string") {
        setReceiptFooterInput(settings.receiptFooter);
      }
    } catch {
      // The pre-filled defaults stay; the save attempt will surface errors.
    }
  }

  async function handleSaveSettings(event: FormEvent) {
    event.preventDefault();
    const value = Number(settingsInput);
    if (!Number.isInteger(value) || value < 1 || value > 100) {
      toast.error(
        t("Flag a phase as a bottleneck when more than this many batches wait in it (1–100).")
      );
      return;
    }

    setIsSavingSettings(true);
    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bottleneckThreshold: value,
          blockDueClients: blockDueInput,
          shopName: shopNameInput,
          shopPhone: shopPhoneInput,
          receiptFooter: receiptFooterInput,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(
          payload?.message ?? t("Could not save the threshold. Please try again.")
        );
        return;
      }
      toast.success(t("Settings saved"));
      setSettingsOpen(false);
      // Refresh the summary so the pipeline banner reacts to the new value.
      mutate();
    } catch {
      toast.error(t("Could not save the threshold. Please try again."));
    } finally {
      setIsSavingSettings(false);
    }
  }

  const phaseBreakdown = data?.phaseBreakdown ?? {};
  const phases = Object.entries(phaseBreakdown).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-display text-3xl font-bold text-foreground">
          {t("Dashboard")}
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
              label={t("Batches in production")}
              value={data?.batchesInProduction ?? 0}
              icon={Layers}
            />
            <MetricCard
              label={t("Total stock")}
              value={(data?.totalStock ?? 0).toLocaleString()}
              icon={Package}
            />
            <MetricCard
              label={t("Sales today")}
              value={formatMoney(data?.salesToday ?? 0)}
              icon={ShoppingCart}
            />
            <MetricCard
              label={t("Outstanding dues")}
              value={formatMoney(data?.outstandingDues ?? 0)}
              icon={Wallet}
              variant="rust"
            />
            <MetricCard
              label={t("Returned today")}
              value={`${data?.returnedPcsToday ?? 0} ${t("pcs")}`}
              icon={RotateCcw}
            />
            <MetricCard
              label={t("Cashback given")}
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
          <AlertTitle>{t("Could not load the dashboard")}</AlertTitle>
          <AlertDescription>
            {error.message}. {t("Showing the last known values.")}
          </AlertDescription>
        </Alert>
      )}

      {/* Production pipeline — counts per in-progress phase */}
      {/* BOTTLENECK_BANNER */}
      {!isLoading && data?.bottleneck && (
        <Alert variant="destructive" className="border-rust/30 bg-rust/10">
          <TriangleAlert className="text-rust" aria-hidden />
          <AlertTitle className="text-rust">
            {data.bottleneck.name} {t("is backed up")}
          </AlertTitle>
          <AlertDescription>
            {data.bottleneck.name} {t("has batches waiting")} {data.bottleneck.count}{" "}
            — {t("— check staffing.")}
          </AlertDescription>
        </Alert>
      )}

      {/* PIPELINE_SECTION */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-heading text-lg font-medium text-charcoal">
            {t("Production pipeline")}
          </h2>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={openSettings}
            className="h-9 rounded-lg border border-border bg-white px-3 text-xs font-medium text-charcoal transition-colors hover:border-gold hover:bg-gold/5"
          >
            <Settings className="size-4" aria-hidden />
            {t("Settings")}
          </Button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
          </div>
        ) : phases.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-white/60 px-6 py-12 text-center text-sm text-muted-foreground">
            {t("No phases in progress right now.")}
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
                  {count} {t("batches in this phase")}
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
            <CardTitle>{t("Recent sales")}</CardTitle>
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
                {t("No sales recorded yet.")}
              </p>
            ) : (
              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("Client")}</TableHead>
                    <TableHead className="text-right">{t("Amount")}</TableHead>
                    <TableHead>{t("Status")}</TableHead>
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
              </div>
            )}
          </CardContent>
        </Card>

        {/* Clients with dues */}
        <Card>
          <CardHeader>
            <CardTitle>{t("Clients with dues")}</CardTitle>
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
                {t("No outstanding dues — everyone is settled. 🎉")}
              </p>
            ) : (
              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("Client")}</TableHead>
                    <TableHead className="text-right">{t("Amount owed")}</TableHead>
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
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent returns & exchanges */}
      <Card>
        <CardHeader>
          <CardTitle>{t("Recent returns & exchanges")}</CardTitle>
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
              {t("No returns or exchanges recorded yet.")}
            </p>
          ) : (
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("Date")}</TableHead>
                  <TableHead>{t("Invoice")}</TableHead>
                  <TableHead>{t("Product")}</TableHead>
                  <TableHead className="text-center">{t("Qty")}</TableHead>
                  <TableHead>{t("Type")}</TableHead>
                  <TableHead>{t("Reason")}</TableHead>
                  <TableHead className="text-right">{t("Cashback")}</TableHead>
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
                        {entry.isExchange ? t("Exchange") : t("Return")}
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
                                ? `${t("client paid")} ${formatMoney(Math.abs(entry.cashback))}`
                                : formatMoney(entry.cashback),
                            entry.dueCredit && entry.dueCredit > 0
                              ? `${formatMoney(entry.dueCredit)} ${t("to due")}`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" + ") || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          )}
          {!isLoading &&
            ((data?.exchangedPcsTotal ?? 0) > 0 ||
              (data?.dueCreditTotal ?? 0) > 0) && (
              <p className="mt-3 text-xs text-muted-foreground">
                {(data?.exchangedPcsTotal ?? 0) > 0 &&
                  `${data?.exchangedPcsTotal} ${t("pcs have been handed out in exchanges in total.")} `}
                {(data?.dueCreditTotal ?? 0) > 0 &&
                  `${formatMoney(data?.dueCreditTotal ?? 0)} ${t("of cashback was credited against client dues (no cash moved).")}`}
              </p>
            )}
        </CardContent>
      </Card>

      {/* Stock alerts — low stock & aging stock (Tier 2 #9) */}
      <Card>
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <TriangleAlert className="size-4 text-rust" aria-hidden />
              {t("Stock alerts")}
            </CardTitle>
            {!stockAlertsLoading && stockAlerts && (
              <p className="text-xs text-muted-foreground">
                {t("Low stock")} ≤ {stockAlerts.summary.lowStockThreshold} {t("pcs")} ·{" "}
                {t("on shelf over")} {stockAlerts.summary.agingStockDays} {t("days")}
              </p>
            )}
          </div>
          {!stockAlertsLoading &&
            !stockAlertsError &&
            stockAlertsList.length > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full border border-rust/30 bg-rust/10 px-2.5 py-0.5 text-xs font-semibold text-rust">
                {stockAlertsList.length} {t("lot(s)")}
              </span>
            )}
        </CardHeader>
        <CardContent>
          {stockAlertsLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-3/4" />
            </div>
          ) : stockAlertsError ? (
            <p className="py-4 text-sm text-rust">
              {stockAlertsError.message}
            </p>
          ) : stockAlertsList.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">
              {t("All lots are healthy — no low or aging stock.")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("Barcode")}</TableHead>
                    <TableHead>{t("Product")}</TableHead>
                    <TableHead>{t("Location")}</TableHead>
                    <TableHead className="text-center">{t("On shelf")}</TableHead>
                    <TableHead>{t("In stock")}</TableHead>
                    <TableHead>{t("Alerts")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stockAlertsList.map((lot) => (
                    <TableRow key={lot.id}>
                      <TableCell className="font-mono text-xs">{lot.barcode}</TableCell>
                      <TableCell className="font-medium text-charcoal">
                        {lot.productType}
                        <span className="block font-mono text-xs font-normal text-muted-foreground">
                          {lot.fabricType}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {lot.storageLocation}
                        <span className="block text-xs">{lot.branch}</span>
                      </TableCell>
                      <TableCell className="text-center font-mono">
                        {lot.quantityRemaining}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {lot.daysInStock} {t("days")}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {lot.lowStock && (
                            <span className="inline-flex items-center rounded-full border border-rust/30 bg-rust/10 px-2 py-0.5 text-xs font-medium text-rust">
                              {t("Low stock")}
                            </span>
                          )}
                          {lot.agingStock && (
                            <span className="inline-flex items-center rounded-full border border-gold bg-gold/20 px-2 py-0.5 text-xs font-medium text-charcoal">
                              {t("Aging")}
                            </span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Settings dialog — Owner-adjustable bottleneck alert threshold */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-md gap-0 rounded-xl p-0 ring-border sm:max-w-md">
          <div className="border-b border-border bg-cream px-6 py-4">
            <DialogHeader className="gap-1 text-left">
              <DialogTitle className="text-base font-semibold text-charcoal">
                {t("Settings")}
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                {t("Pipeline alert threshold, printed-receipt details and the due-clients policy.")}
              </DialogDescription>
            </DialogHeader>
          </div>

          <form onSubmit={handleSaveSettings}>
            <div className="space-y-5 px-6 py-5">
              <div className="flex flex-col gap-2">
                <Label
                  htmlFor="bottleneck-threshold"
                  className="text-sm font-semibold text-charcoal"
                >
                  {t("Alert threshold")}
                </Label>
                <Input
                  id="bottleneck-threshold"
                  type="number"
                  min={1}
                  max={100}
                  step={1}
                  value={settingsInput}
                  onChange={(event) => setSettingsInput(event.target.value)}
                  placeholder="8"
                  required
                  autoFocus
                  className="h-10 rounded-lg border-input bg-white px-3 text-sm focus-visible:border-gold focus-visible:ring-4 focus-visible:ring-gold/20"
                />
              </div>

              {/* #28 Shop profile printed on invoices + money receipts. */}
              <div className="space-y-3 rounded-lg border border-border bg-cream/40 p-3.5">
                <p className="text-sm font-semibold text-charcoal">
                  {t("Receipt details")}
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <Label
                      htmlFor="shop-name"
                      className="text-xs font-semibold text-charcoal"
                    >
                      {t("Shop name")}
                    </Label>
                    <Input
                      id="shop-name"
                      value={shopNameInput}
                      onChange={(event) => setShopNameInput(event.target.value)}
                      placeholder="Jamil Creations"
                      maxLength={120}
                      className="h-10 rounded-lg border-input bg-white px-3 text-sm focus-visible:border-gold focus-visible:ring-4 focus-visible:ring-gold/20"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label
                      htmlFor="shop-phone"
                      className="text-xs font-semibold text-charcoal"
                    >
                      {t("Shop phone")}
                    </Label>
                    <Input
                      id="shop-phone"
                      value={shopPhoneInput}
                      onChange={(event) => setShopPhoneInput(event.target.value)}
                      placeholder="01XXXXXXXXX"
                      maxLength={120}
                      className="h-10 rounded-lg border-input bg-white px-3 text-sm focus-visible:border-gold focus-visible:ring-4 focus-visible:ring-gold/20"
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <Label
                    htmlFor="receipt-footer"
                    className="text-xs font-semibold text-charcoal"
                  >
                    {t("Receipt footer note")}
                  </Label>
                  <Input
                    id="receipt-footer"
                    value={receiptFooterInput}
                    onChange={(event) => setReceiptFooterInput(event.target.value)}
                    placeholder={t("Shown at the bottom of every printed invoice and money receipt.")}
                    maxLength={120}
                    className="h-10 rounded-lg border-input bg-white px-3 text-sm focus-visible:border-gold focus-visible:ring-4 focus-visible:ring-gold/20"
                  />
                </div>
              </div>

              {/* #27 Policy: refuse new credit sales to DUE clients. */}
              <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-cream/40 p-3.5">
                <div>
                  <Label
                    htmlFor="block-due-clients"
                    className="text-sm font-semibold text-charcoal"
                  >
                    {t("Block credit sales to clients with dues")}
                  </Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t(
                      "When on, a client with outstanding dues cannot make a new partially-paid sale. Full payments are always allowed."
                    )}
                  </p>
                </div>
                <Switch
                  id="block-due-clients"
                  checked={blockDueInput}
                  onCheckedChange={(checked) => setBlockDueInput(checked)}
                  className="mt-0.5 shrink-0"
                />
              </div>
            </div>

            <DialogFooter className="gap-3 border-t border-border bg-cream/60 px-6 py-3.5 sm:justify-end">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setSettingsOpen(false)}
                disabled={isSavingSettings}
                className="h-9 rounded-lg text-sm font-medium text-muted-foreground hover:text-charcoal"
              >
                {t("Cancel")}
              </Button>
              <Button
                type="submit"
                disabled={isSavingSettings}
                className="h-9 rounded-lg bg-charcoal px-6 text-sm font-semibold text-cream shadow-sm transition-all hover:bg-charcoal/85 active:scale-[0.99] disabled:opacity-50"
              >
                {isSavingSettings ? t("Saving…") : t("Save threshold")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
