"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Layers } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

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
// Screen an operator keeps open — poll every 5s so it feels live.
  const { data, error, isLoading } = useSWR<WorkOrder[]>(
    "/api/work-orders?status=IN_PROGRESS",
    fetcher<WorkOrder[]>,
    { refreshInterval: 5000, keepPreviousData: true }
  );

  const [productType, setProductType] = useState<string>("ALL");

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
            Phase board
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every in-progress work order, one active phase on the board.
            Click a card to open it.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Product type
          </label>
          <Select
            value={productType}
            onValueChange={(v) => setProductType(v as string)}
          >
            <SelectTrigger className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end" className="w-52">
              <SelectItem value="ALL">All</SelectItem>
              {productTypes.map((type) => (
                <SelectItem key={type} value={type}>
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </header>

      {/* Error state */}
      {error && (
        <div className="rounded-xl border border-rust/30 bg-rust/10 px-6 py-4 text-sm text-rust">
          {error.message}
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading && (
        <div className="grid auto-cols-[minmax(220px,1fr)] grid-flow-col gap-4 overflow-x-auto pb-2">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="w-[220px] space-y-3">
              <Skeleton className="h-9 w-full rounded-lg" />
              <Skeleton className="h-28 w-full rounded-xl" />
              <Skeleton className="h-28 w-full rounded-xl" />
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && filteredOrders.length === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-white/60 px-6 py-14 text-center text-sm text-muted-foreground">
          No work orders in progress right now.
        </div>
      )}
{/* Kanban-style phase columns */}
      {!isLoading && !error && filteredOrders.length > 0 && (
        <div className="grid auto-cols-[minmax(230px,1fr)] grid-flow-col gap-4 overflow-x-auto pb-4">
          {columns.map((columnName) => {
            const cardOrders = cardsByColumn.get(columnName) ?? [];
            return (
              <section
                key={columnName}
                className="flex w-[230px] shrink-0 flex-col gap-3"
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
                          {order.quantity} pcs
                        </p>

                        <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
                          <span className="truncate text-xs text-muted-foreground">
                            {phase.workerName ?? "Unassigned"}
                          </span>
                          <span
                            className={cn(
                              "shrink-0 rounded-md px-1.5 py-0.5 font-mono text-xs font-medium",
                              over
                                ? "bg-rust/10 text-rust"
                                : "text-muted-foreground"
                            )}
                          >
                            {days} {days === 1 ? "day" : "days"}
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
    </div>
  );
}