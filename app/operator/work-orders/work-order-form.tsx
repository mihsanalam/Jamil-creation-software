"use client";

import { useState } from "react";
import useSWR from "swr";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// A PENDING fabric batch eligible for a new work order.
export interface Batch {
  id: string;
  batchNumber: string;
  fabricType: string;
  quantity: number;
  unit: string;
  supplier: string;
  status: string;
}

// A phase template; steps are ordered strings.
export interface PhaseTemplate {
  id: string;
  name: string;
  createdAt?: string;
  steps: string[];
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

// Small numbered badge used for each step of the form.
function StepBadge({ n }: { n: number }) {
  return (
    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-gold font-serif text-base font-bold text-charcoal">
      {n}
    </span>
  );
}

export function WorkOrderForm() {
  const [batchOpen, setBatchOpen] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<Batch | null>(null);

  const [selectedTemplate, setSelectedTemplate] = useState<PhaseTemplate | null>(null);
  const [workerNames, setWorkerNames] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: batches, isLoading: batchesLoading } = useSWR<Batch[]>(
    "/api/fabric-batches?status=PENDING",
    fetcher<Batch[]>,
    { refreshInterval: 15000 }
  );

  const { data: templates, isLoading: templatesLoading } = useSWR<PhaseTemplate[]>(
    "/api/phase-templates",
    fetcher<PhaseTemplate[]>,
    { refreshInterval: 15000 }
  );

  function selectBatch(batch: Batch) {
    setSelectedBatch(batch);
    setBatchOpen(false);
  }

  function selectTemplate(template: PhaseTemplate) {
    setSelectedTemplate(template);
    // One worker name per step; switching templates resets the inputs.
    setWorkerNames(template.steps.map(() => ""));
  }

  function setWorkerName(index: number, value: string) {
    setWorkerNames((prev) => prev.map((name, i) => (i === index ? value : name)));
  }

  const allWorkersFilled =
    selectedTemplate !== null &&
    workerNames.length === selectedTemplate.steps.length &&
    workerNames.every((name) => name.trim() !== "");

  const canCreate =
    selectedBatch !== null && selectedTemplate !== null && allWorkersFilled;

  async function handleCreate() {
    if (!selectedBatch || !selectedTemplate || !canCreate) return;

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/work-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fabricBatchId: selectedBatch.id,
          phaseTemplateId: selectedTemplate.id,
          workerAssignments: selectedTemplate.steps.map((name, index) => ({
            name,
            workerName: workerNames[index].trim(),
          })),
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(payload?.message ?? "Could not create the work order.");
        return;
      }
      toast.success(`Work order created from batch ${selectedBatch.batchNumber}`);
      // The batch is now IN_PRODUCTION, so clear it from the picker.
      setSelectedBatch(null);
      setSelectedTemplate(null);
      setWorkerNames([]);
    } catch {
      toast.error("Could not reach the server. Please check your connection.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight text-charcoal md:text-4xl">
          Work order
        </h1>
        <p className="text-sm text-muted-foreground">
          Turn a PENDING fabric batch into a work order and assign a worker to each phase.
        </p>
      </header>
{/* STEP 1 — Pick the fabric batch */}
      <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-border">
        <div className="mb-4 flex items-center gap-3">
          <StepBadge n={1} />
          <div>
            <Label className="text-sm font-semibold text-charcoal">Select a fabric batch</Label>
            <p className="text-xs text-muted-foreground">
              Only batches with a PENDING status are eligible.
            </p>
          </div>
        </div>

        {batchesLoading ? (
          <Skeleton className="h-10 w-full rounded-lg" />
        ) : (
          <Popover open={batchOpen} onOpenChange={setBatchOpen}>
            <PopoverTrigger
              className={cn(
                "flex h-10 w-full items-center justify-between rounded-lg border border-input bg-white px-3 text-left text-sm transition-colors focus-visible:border-gold focus-visible:ring-4 focus-visible:ring-gold/20",
                !selectedBatch && "text-muted-foreground"
              )}
            >
              {selectedBatch ? (
                <span className="flex items-center gap-2 font-medium text-charcoal">
                  <span className="font-mono">{selectedBatch.batchNumber}</span>
                  <span className="text-muted-foreground">·</span>
                  <span>{selectedBatch.fabricType}</span>
                  <span className="text-muted-foreground">·</span>
                  <span className="font-mono">
                    {selectedBatch.quantity} {selectedBatch.unit}
                  </span>
                </span>
              ) : (
                <span>Choose a batch…</span>
              )}
              <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", batchOpen && "rotate-180")} aria-hidden />
            </PopoverTrigger>

            <PopoverContent className="w-[380px] p-0" align="start" sideOffset={6}>
              <Command>
                <CommandInput placeholder="Search by batch number, fabric or supplier…" />
                <CommandList>
                  <CommandEmpty>No batches found.</CommandEmpty>
                  <CommandGroup>
                    {(batches ?? []).map((batch) => (
                      <CommandItem
                        key={batch.id}
                        value={`${batch.batchNumber} ${batch.fabricType} ${batch.supplier}`}
                        onSelect={() => selectBatch(batch)}
                        className="flex flex-col items-start gap-0.5 py-2.5"
                      >
                        <span className="flex w-full items-center gap-2 text-sm font-medium text-charcoal">
                          <span className="font-mono">{batch.batchNumber}</span>
                          <span className="text-muted-foreground">·</span>
                          <span>{batch.fabricType}</span>
                          <span className="ml-auto font-mono text-xs text-muted-foreground">
                            {batch.quantity} {batch.unit}
                          </span>
                        </span>
                        <span className="text-xs text-muted-foreground">{batch.supplier}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        )}
      </section>
      {/* STEP 2 — Pick the phase template */}
      <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-border">
        <div className="mb-4 flex items-center gap-3">
          <StepBadge n={2} />
          <div>
            <Label className="text-sm font-semibold text-charcoal">Select a phase template</Label>
            <p className="text-xs text-muted-foreground">Pick the production plan for this batch.</p>
          </div>
        </div>

        {templatesLoading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
          </div>
        ) : (templates?.length ?? 0) === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-white/60 px-4 py-8 text-center text-sm text-muted-foreground">
            No phase templates yet — an Owner needs to create one first.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {(templates ?? []).map((template) => {
              const isSelected = selectedTemplate?.id === template.id;
              return (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => selectTemplate(template)}
                  aria-pressed={isSelected}
                  className={cn(
                    "flex flex-col gap-1 rounded-xl border-2 p-4 text-left transition-colors",
                    isSelected
                      ? "border-gold bg-gold/5"
                      : "border-border bg-white hover:border-gold/40"
                  )}
                >
                  <span className="flex items-center justify-between gap-2 text-sm font-semibold text-charcoal">
                    {template.name}
                    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      {template.steps.length} {template.steps.length === 1 ? "phase" : "phases"}
                    </span>
                  </span>
                  <span className="text-xs leading-relaxed text-muted-foreground">
                    {template.steps.join(" → ")}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* STEP 3 — Read-only phase list */}
      <section
        className={cn(
          "rounded-xl bg-white p-6 shadow-sm ring-1 ring-border transition-opacity",
          !selectedTemplate && "opacity-50"
        )}
      >
        <div className="mb-4 flex items-center gap-3">
          <StepBadge n={3} />
          <div>
            <Label className="text-sm font-semibold text-charcoal">Phases</Label>
            <p className="text-xs text-muted-foreground">
              The production steps for the selected template, in order.
            </p>
          </div>
        </div>

        {!selectedTemplate ? (
          <p className="rounded-lg border border-dashed border-border bg-white/60 px-4 py-6 text-center text-sm text-muted-foreground">
            Select a template to preview its phases.
          </p>
        ) : (
          <ol className="space-y-2">
            {selectedTemplate.steps.map((step, index) => (
              <li key={index} className="flex items-center gap-3 rounded-lg border border-border bg-cream/40 px-4 py-3">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-charcoal font-mono text-xs font-semibold text-cream">
                  {index + 1}
                </span>
                <span className="text-sm font-medium text-charcoal">{step}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
      {/* STEP 4 — Assign a worker to each phase */}
      <section
        className={cn(
          "rounded-xl bg-white p-6 shadow-sm ring-1 ring-border transition-opacity",
          !selectedTemplate && "opacity-50"
        )}
      >
        <div className="mb-4 flex items-center gap-3">
          <StepBadge n={4} />
          <div>
            <Label className="text-sm font-semibold text-charcoal">Assign workers</Label>
            <p className="text-xs text-muted-foreground">Enter the worker name for each phase.</p>
          </div>
        </div>

        {!selectedTemplate ? (
          <p className="rounded-lg border border-dashed border-border bg-white/60 px-4 py-6 text-center text-sm text-muted-foreground">
            Select a template first.
          </p>
        ) : (
          <div className="space-y-3">
            {selectedTemplate.steps.map((step, index) => (
              <div key={index} className="grid items-center gap-3 sm:grid-cols-[1fr_2fr]">
                <Label htmlFor={`worker-${index}`} className="text-sm font-medium text-charcoal sm:text-right">
                  {step}
                </Label>
                <Input
                  id={`worker-${index}`}
                  value={workerNames[index] ?? ""}
                  onChange={(event) => setWorkerName(index, event.target.value)}
                  placeholder="Worker name"
                  className={FIELD}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Create button */}
      <div className="flex flex-col items-start gap-2">
        <Button
          onClick={handleCreate}
          disabled={!canCreate || isSubmitting}
          title={
            canCreate
              ? undefined
              : "Select a batch and template, and fill every worker name, to create the work order."
          }
          className="h-11 rounded-lg bg-gold px-8 text-sm font-semibold text-charcoal shadow-sm transition-all hover:bg-gold/90 active:scale-[0.99] disabled:opacity-50"
        >
          {isSubmitting ? "Creating…" : "Create work order"}
        </Button>
        <p className="text-xs text-muted-foreground">
          {canCreate
            ? "Ready — this will move the batch into production."
            : "The button unlocks once a batch, a template, and every worker are set."}
        </p>
      </div>
    </div>
  );
}