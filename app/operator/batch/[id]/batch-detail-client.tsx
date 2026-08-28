"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ArrowLeft, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

// Shape returned by GET /api/work-orders/[id].
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

const FIELD =
  "h-10 rounded-lg border-input bg-white px-3 text-sm focus-visible:border-gold focus-visible:ring-4 focus-visible:ring-gold/20";

function formatDate(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function BatchDetailClient({ workOrderId }: { workOrderId: string }) {
  const { data, error, isLoading, mutate } = useSWR<WorkOrder>(
    `/api/work-orders/${workOrderId}`,
    fetcher<WorkOrder>,
    { refreshInterval: 10000 }
  );

  // Draft inputs for the current (active) phase's qtyOut + notes.
  const [qtyOut, setQtyOut] = useState("");
  const [notes, setNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const activePhase = useMemo(
    () => data?.phases.find((phase) => phase.status === "IN_PROGRESS") ?? null,
    [data]
  );

  const completedPhases = useMemo(
    () =>
      (data?.phases ?? []).filter((phase) => phase.status === "COMPLETED"),
    [data]
  );

  const allComplete =
    (data?.phases.length ?? 0) > 0 &&
    completedPhases.length === data?.phases.length;

async function handleMarkComplete() {
    if (!activePhase) return;

    setIsSaving(true);
    try {
      const response = await fetch(`/api/work-order-phases/${activePhase.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "COMPLETED",
          qtyOut: qtyOut.trim() === "" ? null : Number(qtyOut),
          notes: notes.trim() === "" ? null : notes.trim(),
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(payload?.message ?? "Could not mark the phase complete.");
        return;
      }
      await mutate();
      setQtyOut("");
      setNotes("");
      toast.success(
        payload?.nextPhase
          ? `"${activePhase.name}" complete — ${payload.nextPhase.name} started.`
          : "All phases complete — work order finished."
      );
    } catch {
      toast.error("Could not reach the server. Please check your connection.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/operator/phase-board"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-charcoal/70 transition-colors hover:text-charcoal"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Back to phase board
      </Link>

      {/* Loading skeleton */}
      {isLoading && (
        <div className="space-y-4">
          <Skeleton className="h-10 w-1/2 rounded-lg" />
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="rounded-xl border border-rust/30 bg-rust/10 px-6 py-4 text-sm text-rust">
          {error.message}
        </div>
      )}

      {data && !error && (
        <>
          {/* Header */}
          <header>
            <h1 className="font-mono text-3xl font-semibold tracking-tight text-charcoal md:text-4xl">
              {data.batchNumber}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {data.productType} &middot; {data.quantity} pcs &middot;{" "}
              {data.templateName}
            </p>
          </header>

          {/* Stepper */}
          <ol className="flex items-start gap-2 overflow-x-auto pb-1">
            {data.phases.map((phase, index) => {
              const isCurrent = phase.status === "IN_PROGRESS";
              const isDone = phase.status === "COMPLETED";
              return (
                <li key={phase.id} className="flex min-w-0 flex-1 items-start gap-2">
                  <div className="flex flex-col items-center">
                    <span
                      className={cn(
                        "grid size-8 shrink-0 place-items-center rounded-full border-2 transition-colors",
                        isDone && "border-gold bg-gold text-charcoal",
                        isCurrent && "border-gold bg-white text-gold ring-2 ring-gold/30",
                        !isDone && !isCurrent && "border-border bg-muted text-muted-foreground"
                      )}
                    >
                      {isDone ? (
                        <Check className="size-4" aria-hidden />
                      ) : (
                        <span className="font-mono text-xs font-semibold">{index + 1}</span>
                      )}
                    </span>
                  </div>
                  <div className="min-w-0 pb-6">
                    <p
                      className={cn(
                        "text-sm font-semibold",
                        isCurrent ? "text-charcoal" : isDone ? "text-charcoal/70" : "text-muted-foreground"
                      )}
                    >
                      {phase.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {isDone
                        ? `Done ${formatDate(phase.completedAt)}`
                        : isCurrent
                          ? "In progress"
                          : "Waiting"}
                    </p>
                  </div>
                  {index < data.phases.length - 1 && (
                    <span className="mt-4 h-px flex-1 bg-border" aria-hidden />
                  )}
                </li>
              );
            })}
          </ol>
{/* Current phase card / all-complete state */}
          {allComplete ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-green-200 bg-green-50 px-6 py-12 text-center">
              <span className="grid size-12 place-items-center rounded-full bg-green-100 text-green-700">
                <Check className="size-6" aria-hidden />
              </span>
              <h2 className="text-lg font-semibold text-charcoal">
                All phases complete
              </h2>
              <p className="text-sm text-muted-foreground">
                This work order is finished and the batch is ready.
              </p>
            </div>
          ) : activePhase ? (
            <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-border">
              <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-charcoal">
                    Current phase
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {activePhase.name}
                  </p>
                </div>
                <span className="rounded-full bg-gold px-3 py-1 text-xs font-semibold text-charcoal">
                  In progress
                </span>
              </div>

              <dl className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Worker
                  </dt>
                  <dd className="mt-1 text-sm font-medium text-charcoal">
                    {activePhase.workerName ?? "Unassigned"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Started
                  </dt>
                  <dd className="mt-1 text-sm font-medium text-charcoal">
                    {formatDate(activePhase.startedAt)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Quantity in
                  </dt>
                  <dd className="mt-1 font-mono text-sm font-medium text-charcoal">
                    {activePhase.qtyIn ?? "—"}
                  </dd>
                </div>
              </dl>
<div className="mb-5 grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="qty-out" className="text-sm font-semibold text-charcoal">
                    Quantity out
                  </Label>
                  <Input
                    id="qty-out"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={qtyOut}
                    onChange={(event) => setQtyOut(event.target.value)}
                    className={FIELD}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="notes" className="text-sm font-semibold text-charcoal">
                    Notes
                  </Label>
                  <Textarea
                    id="notes"
                    placeholder="Any notes on this phase…"
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    className="min-h-10 rounded-lg border-input bg-white px-3 text-sm focus-visible:border-gold focus-visible:ring-4 focus-visible:ring-gold/20"
                  />
                </div>
              </div>

              <Button
                onClick={handleMarkComplete}
                disabled={isSaving}
                className="h-11 rounded-lg bg-gold px-6 text-sm font-semibold text-charcoal shadow-sm transition-all hover:bg-gold/90 active:scale-[0.99] disabled:opacity-50"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    Saving…
                  </>
                ) : (
                  "Mark phase complete"
                )}
              </Button>
            </section>
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-white/60 px-6 py-12 text-center text-sm text-muted-foreground">
              No active phase to update.
            </div>
          )}

          {/* Activity log — completed phases */}
          {completedPhases.length > 0 && (
            <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-border">
              <h2 className="mb-4 text-base font-semibold text-charcoal">
                Activity log
              </h2>
              <ul className="divide-y divide-border">
                {[...completedPhases]
                  .sort((a, b) => (a.stepOrder > b.stepOrder ? 1 : -1))
                  .map((phase) => (
                    <li key={phase.id} className="flex items-center justify-between gap-3 py-3">
                      <div className="flex items-center gap-3">
                        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-gold text-charcoal">
                          <Check className="size-3.5" aria-hidden />
                        </span>
                        <span className="text-sm font-medium text-charcoal">
                          {phase.name}
                        </span>
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {phase.workerName ?? "Unassigned"} &middot;{" "}
                        {formatDate(phase.completedAt)}
                      </span>
                    </li>
                  ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}