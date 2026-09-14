"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  History,
  Layers,
  RotateCcw,
  Users,
  WifiOff,
} from "lucide-react";
import { toast } from "sonner";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/lib/i18n";
import {
  flushQueue,
  getQueueSize,
  queueRequest,
} from "@/lib/offline-queue";
import { cn } from "@/lib/utils";

// ── Completed order and phase types ─────────────────────────────────────────

export interface CompletedPhase {
  id: string;
  name: string;
  stepOrder: number;
  status: string;
  workerName: string | null;
  qtyIn: number | null;
  qtyOut: number | null;
  notes: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

export interface CompletedWorkOrder {
  id: string;
  fabricBatchId: string;
  phaseTemplateId: string;
  productType: string;
  quantity: number;
  status: string;
  createdAt: string;
  batchNumber: string;
  fabricType: string;
  templateName: string;
  phases: CompletedPhase[];
}

// ── Worker load types ───────────────────────────────────────────────────────

export interface WorkerLoad {
  workerName: string;
  inProgressCount: number;
}

// ── Existing types (in-progress) ────────────────────────────────────────────

// One phase inside a work order (shape returned by GET /api/work-orders).
export interface WorkOrderPhase {
  id: string;
  name: string;
  stepOrder: number;
  status: string;
  workerName: string | null;
  qtyIn: number | null;
  qtyOut: number | null;
  notes: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

// A work order (shape returned by GET /api/work-orders).
export interface WorkOrder {
  id: string;
  fabricBatchId: string;
  phaseTemplateId: string;
  productType: string;
  quantity: number;
  status: string;
  createdAt: string;
  batchNumber: string;
  fabricType: string;
  templateName: string;
  phases: WorkOrderPhase[];
}

async function fetcher<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.message ?? "Something went wrong");
  }
  return response.json() as Promise<T>;
}

// Whole days a phase has been running, from its started_at to now.
function daysInPhase(startedAt: string | null): number {
  if (!startedAt) return 0;
  const start = new Date(startedAt).getTime();
  if (Number.isNaN(start)) return 0;
  const diff = Date.now() - start;
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

// Build the ordered list of distinct phase names that appear across the
// fetched work orders, using each name's lowest step_order so columns line
// up with the templates. Columns are dynamic — never hardcoded.
function buildColumns(orders: WorkOrder[]): string[] {
  const firstStep = new Map<string, number>();
  for (const order of orders) {
    for (const phase of order.phases) {
      const existing = firstStep.get(phase.name);
      if (existing === undefined || phase.stepOrder < existing) {
        firstStep.set(phase.name, phase.stepOrder);
      }
    }
  }
  return [...firstStep.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([name]) => name);
}

// The single IN_PROGRESS phase of a work order, if any.
function activePhase(order: WorkOrder): WorkOrderPhase | null {
  return order.phases.find((phase) => phase.status === "IN_PROGRESS") ?? null;
}

export function PhaseBoardClient() {
  const { t } = useLanguage();
// Screen an operator keeps open — poll every 5s so it feels live.
  const { data, error, isLoading } = useSWR<WorkOrder[]>(
    "/api/work-orders?status=IN_PROGRESS",
    fetcher<WorkOrder[]>,
    { refreshInterval: 5000, keepPreviousData: true }
  );

  const [productType, setProductType] = useState<string>("ALL");
  // "board" is the live kanban; "workload" is the per-worker load report (#17).
  const [view, setView] = useState<"board" | "workload">("board");
  // Completed-history toggle (#18): fetches completed orders on demand.
  const [showCompleted, setShowCompleted] = useState(false);
  const [undoingId, setUndoingId] = useState<string | null>(null);

  // Completed orders are only fetched while the toggle is on, so the board
  // keeps its lightweight 5s poll in the normal case.
  const {
    data: completedOrders,
    isLoading: completedLoading,
    mutate: mutateCompleted,
  } = useSWR<CompletedWorkOrder[]>(
    showCompleted ? "/api/work-orders/completed" : null,
    fetcher<CompletedWorkOrder[]>
  );

  // Worker load report — only fetched in the workload view.
  const { data: workerLoad, isLoading: loadLoading } = useSWR<WorkerLoad[]>(
    view === "workload" ? "/api/workers/load" : null,
    fetcher<WorkerLoad[]>
  );

  const maxLoad = Math.max(1, ...(workerLoad ?? []).map((w) => w.inProgressCount));

  // #16 Offline resilience: any status change queued while offline is replayed
  // when the board loads (or the browser reports "online"); while requests are
  // still pending a banner shows the count with a manual retry button.
  const [pendingCount, setPendingCount] = useState(0);
  useEffect(() => {
    // Sync the banner count from localStorage in a microtask callback —
    // localStorage is an external system, and updating state from it
    // synchronously in the effect body would cascade renders.
    Promise.resolve().then(() => setPendingCount(getQueueSize()));
    if (getQueueSize() === 0) return;
    void flushQueue().then((sent) => {
      setPendingCount(getQueueSize());
      if (sent > 0) {
        toast.success(t("All changes sent."));
      }
    });
  }, [t]);

  async function handleRetryPending() {
    const sent = await flushQueue();
    setPendingCount(getQueueSize());
    if (sent > 0) {
      toast.success(t("All changes sent."));
    } else if (getQueueSize() > 0) {
      toast.error(t("Could not send offline changes."));
    }
  }

  // Re-open a mistakenly completed phase: POST to the undo endpoint, then
  // refresh both the completed list and the live board.
  async function handleUndoPhase(phaseId: string) {
    if (
      !confirm(
        `${t("Are you sure you want to re-open this phase?")} ${t("This will move the phase back to IN_PROGRESS.")}`
      )
    ) {
      return;
    }
    setUndoingId(phaseId);
    try {
      const response = await fetch(`/api/work-order-phases/${phaseId}/undo`, {
        method: "POST",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(payload?.message ?? t("Could not re-open the phase."));
        return;
      }
      toast.success(t("Phase re-opened. It is back on the board."));
      mutateCompleted();
    } catch {
      // Offline (#16): queue the undo so the correction still happens when
      // the connection returns.
      queueRequest(`/api/work-order-phases/${phaseId}/undo`, "POST", null);
      setPendingCount(getQueueSize());
      toast.warning(t("Offline mode"), {
        description: t(
          "Your changes are saved locally and will be sent when the connection returns."
        ),
      });
    } finally {
      setUndoingId(null);
    }
  }

  // The API only returns IN_PROGRESS orders; guard anyway.
  const orders = (data ?? []).filter((o) => o.status === "IN_PROGRESS");

  // Build the "Product type" filter options from whatever actually exists.
  const productTypes = useMemo(() => {
    const set = new Set<string>();
    for (const order of orders) set.add(order.productType);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [orders]);

  const filteredOrders =
    productType === "ALL"
      ? orders
      : orders.filter((o) => o.productType === productType);

  // Columns are derived from the filtered set so the counts stay honest.
  const columns = useMemo(() => buildColumns(filteredOrders), [filteredOrders]);

  // For every column, the cards that belong to it (each work order appears
  // in exactly one column — its active phase) plus per-column totals.
  const cardsByColumn = useMemo(() => {
    const map = new Map<string, WorkOrder[]>();
    for (const columnName of columns) map.set(columnName, []);
    for (const order of filteredOrders) {
      const phase = activePhase(order);
      if (phase && map.has(phase.name)) {
        map.get(phase.name)!.push(order);
      }
    }
    return map;
  }, [columns, filteredOrders]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-charcoal md:text-4xl">
            {t("Phase board")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("Every in-progress work order, one active phase on the board. Click a card to open it.")}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("Product type")}
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant={view === "board" ? "default" : "outline"}
              onClick={() => setView("board")}
              className="h-9 gap-1.5 rounded-lg px-3 text-sm"
            >
              <Layers className="size-4" aria-hidden />
              {t("Board")}
            </Button>
            <Button
              type="button"
              variant={view === "workload" ? "default" : "outline"}
              onClick={() => setView("workload")}
              className="h-9 gap-1.5 rounded-lg px-3 text-sm"
            >
              <Users className="size-4" aria-hidden />
              {t("Worker workload")}
            </Button>
            <Button
              type="button"
              variant={showCompleted ? "default" : "outline"}
              onClick={() => setShowCompleted((current) => !current)}
              aria-pressed={showCompleted}
              className="h-9 gap-1.5 rounded-lg px-3 text-sm"
            >
              <History className="size-4" aria-hidden />
              {showCompleted ? t("Show in-progress only") : t("Show completed only")}
            </Button>
          <Select
            value={productType}
            onValueChange={(v) => setProductType(v as string)}
          >
            <SelectTrigger className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end" className="w-52">
              <SelectItem value="ALL">{t("All")}</SelectItem>
              {productTypes.map((type) => (
                <SelectItem key={type} value={type}>
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          </div>
        </div>
      </header>

      {/* #16 Offline banner — shown while requests sit in the local queue */}
      {pendingCount > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm text-charcoal">
          <WifiOff className="size-4 shrink-0 text-gold" aria-hidden />
          <span>
            {t("Pending changes")}:{" "}
            <span className="font-mono font-semibold">{pendingCount}</span>
            <span className="hidden md:inline">
              {" "}
              —{" "}
              {t(
                "Your changes are saved locally and will be sent when the connection returns."
              )}
            </span>
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleRetryPending}
            className="ml-auto h-7 gap-1 rounded-md px-2 text-xs"
          >
            {t("Retry sending")}
          </Button>
        </div>
      )}

      {/* Worker workload view (#17) — who is carrying what right now */}
      {view === "workload" && (
        <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-border">
          <h2 className="text-lg font-semibold text-charcoal">
            {t("Worker workload")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("Current load")}
          </p>
          {loadLoading ? (
            <div className="mt-4 space-y-2">
              {[0, 1, 2].map((index) => (
                <Skeleton key={index} className="h-10 w-full rounded-lg" />
              ))}
            </div>
          ) : (workerLoad?.length ?? 0) === 0 ? (
            <p className="mt-4 rounded-lg border border-dashed border-border bg-white/60 px-4 py-6 text-center text-sm text-muted-foreground">
              {t("No workers with active phases.")}
            </p>
          ) : (
            <ul className="mt-4 space-y-2">
              {workerLoad!.map((worker, index) => (
                <li
                  key={worker.workerName}
                  className="flex items-center gap-3 rounded-lg border border-border bg-cream/40 px-4 py-2.5"
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-charcoal font-mono text-xs font-bold text-cream">
                    {worker.workerName.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="text-sm font-medium text-charcoal">
                    {worker.workerName}
                  </span>
                  {index === 0 && workerLoad!.length > 1 && (
                    <span className="rounded-md bg-rust/10 px-1.5 py-0.5 text-[11px] font-semibold text-rust">
                      {t("Bottleneck")}
                    </span>
                  )}
                  <div className="ml-auto flex w-40 items-center gap-2">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-border">
                      <div
                        className="h-full rounded-full bg-gold"
                        style={{
                          width: `${Math.round((worker.inProgressCount / maxLoad) * 100)}%`,
                        }}
                      />
                    </div>
                    <span className="w-6 text-right font-mono text-xs font-semibold text-charcoal">
                      {worker.inProgressCount}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Error state */}
      {view === "board" && error && (
        <div className="rounded-xl border border-rust/30 bg-rust/10 px-6 py-4 text-sm text-rust">
          {error.message}
        </div>
      )}

      {/* Loading skeleton */}
      {view === "board" && isLoading && (
        <div className="grid auto-cols-[220px] grid-flow-col gap-4 overflow-x-auto pb-2 md:auto-cols-[minmax(220px,1fr)]">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="w-55 space-y-3">
              <Skeleton className="h-9 w-full rounded-lg" />
              <Skeleton className="h-28 w-full rounded-xl" />
              <Skeleton className="h-28 w-full rounded-xl" />
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {view === "board" && !isLoading && !error && filteredOrders.length === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-white/60 px-6 py-14 text-center text-sm text-muted-foreground">
          {t("No work orders in progress right now.")}
        </div>
      )}
{/* Kanban-style phase columns */}
      {view === "board" && !isLoading && !error && filteredOrders.length > 0 && (
        <div className="grid auto-cols-[230px] grid-flow-col gap-4 overflow-x-auto pb-4 md:auto-cols-[minmax(230px,1fr)]">
          {columns.map((columnName) => {
            const cardOrders = cardsByColumn.get(columnName) ?? [];
            return (
              <section
                key={columnName}
                className="flex w-57.5 shrink-0 flex-col gap-3"
              >
                <header className="flex items-center justify-between rounded-lg bg-charcoal px-4 py-2.5 text-cream">
                  <h2 className="text-sm font-semibold">{columnName}</h2>
                  <span className="rounded-full bg-gold px-2 py-0.5 font-mono text-xs font-semibold text-charcoal">
                    {cardOrders.length}
                  </span>
                </header>

                <div className="flex flex-col gap-3">
                  {cardOrders.map((order) => {
                    const phase = activePhase(order)!;
                    const days = daysInPhase(phase.startedAt);
                    const over = days > 5;
                    return (
                      <Link
                        key={order.id}
                        href={`/operator/batch/${order.id}`}
                        className="group rounded-xl bg-white p-4 shadow-sm ring-1 ring-border transition-all hover:-translate-y-0.5 hover:shadow-md hover:ring-gold/50"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-mono text-sm font-semibold text-charcoal">
                            {order.batchNumber}
                          </p>
                          <Layers
                            className="size-4 shrink-0 text-gold"
                            aria-hidden
                          />
                        </div>
                        <p className="mt-1 text-sm text-charcoal">
                          {order.productType}
                        </p>
                        <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                          {order.quantity} {t("pcs")}
                        </p>

                        <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
                          <span className="truncate text-xs text-muted-foreground">
                            {phase.workerName ?? t("Unassigned")}
                          </span>
                          <span
                            className={cn(
                              "shrink-0 rounded-md px-1.5 py-0.5 font-mono text-xs font-medium",
                              over
                                ? "bg-rust/10 text-rust"
                                : "text-muted-foreground"
                            )}
                          >
                            {days} {t("days")}
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
      {/* Completed history (#18) — review finished orders and undo mistakes */}
      {view === "board" && showCompleted && (
        <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-border">
          <h2 className="text-lg font-semibold text-charcoal">
            {t("Completed orders")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("Mistaken completion? Re-open the phase and it returns to the board.")}
          </p>
          {completedLoading ? (
            <div className="mt-4 space-y-2">
              {[0, 1, 2].map((index) => (
                <Skeleton key={index} className="h-10 w-full rounded-lg" />
              ))}
            </div>
          ) : (completedOrders?.length ?? 0) === 0 ? (
            <p className="mt-4 rounded-lg border border-dashed border-border bg-white/60 px-4 py-6 text-center text-sm text-muted-foreground">
              {t("No completed orders yet.")}
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {completedOrders!.map((order) => (
                <li
                  key={order.id}
                  className="rounded-lg border border-border bg-cream/40 px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm font-semibold text-charcoal">
                      {order.batchNumber}
                    </span>
                    <span className="text-sm text-charcoal">
                      {order.productType}
                    </span>
                    <span className="ml-auto font-mono text-xs text-muted-foreground">
                      {order.quantity} {t("pcs")}
                    </span>
                  </div>
                  <ul className="mt-2 space-y-1.5 border-t border-border pt-2">
                    {order.phases.map((phase) => (
                      <li
                        key={phase.id}
                        className="flex items-center gap-2 text-sm"
                      >
                        <span className="grid size-5 shrink-0 place-items-center rounded-full bg-gold text-charcoal">
                          ✓
                        </span>
                        <span className="text-charcoal">{phase.name}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          {phase.workerName ?? t("Unassigned")}
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={undoingId === phase.id}
                          onClick={() => handleUndoPhase(phase.id)}
                          className="ml-auto h-7 gap-1 rounded-md px-2 text-xs"
                        >
                          <RotateCcw className="size-3" aria-hidden />
                          {undoingId === phase.id ? t("Undoing…") : t("Undo")}
                        </Button>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}