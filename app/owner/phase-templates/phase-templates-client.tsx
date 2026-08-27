"use client";

import { useRef, useState, type DragEvent } from "react";
import useSWR from "swr";
import { GripVertical, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";

export interface PhaseTemplate {
  id: string;
  name: string;
  createdAt: string;
  steps: string[];
}

async function fetcher(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.message ?? "Failed to load templates");
  }
  return response.json() as Promise<PhaseTemplate[]>;
}

const FIELD =
  "h-10 rounded-lg border-input bg-white px-3 text-sm focus-visible:border-gold focus-visible:ring-4 focus-visible:ring-gold/20";

export function PhaseTemplatesClient() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Draft copy of the selected template — the editor works on this and
  // only pushes it to the API when the user hits "Save template".
  const [draftName, setDraftName] = useState("");
  const [draftSteps, setDraftSteps] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newStep, setNewStep] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  // Mirror of selectedId that survives re-renders inside SWR callbacks.
  const selectedRef = useRef<string | null>(null);

  const { data, error, isLoading, mutate } = useSWR<PhaseTemplate[]>(
    "/api/phase-templates",
    fetcher,
    {
      refreshInterval: 15000,
      // On the very first successful load, select the newest template and
      // seed the editor draft (a state-update *callback*, which is allowed
      // here — unlike inside an effect body).
      onSuccess(newData) {
        if (selectedRef.current === null && newData.length > 0) {
          const [first] = newData;
          selectedRef.current = first.id;
          setSelectedId(first.id);
          setDraftName(first.name);
          setDraftSteps([...first.steps]);
        }
      },
    }
  );

  function selectTemplate(template: PhaseTemplate) {
    selectedRef.current = template.id;
    setSelectedId(template.id);
    setDraftName(template.name);
    setDraftSteps([...template.steps]);
  }

  async function handleSave() {
    if (!selectedId) return;
    setIsSaving(true);
    try {
      const response = await fetch(`/api/phase-templates/${selectedId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: draftName, steps: draftSteps }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(payload?.message ?? "Could not save the template.");
        return;
      }
      await mutate();
      toast.success(`Template "${payload.name}" saved`);
    } catch {
      toast.error("Could not reach the server. Please check your connection.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCreate() {
    setIsCreating(true);
    try {
      const response = await fetch("/api/phase-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), steps: [newStep.trim()] }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(payload?.message ?? "Could not create the template.");
        return;
      }
      await mutate();
      setSelectedId(payload.id);
      setDialogOpen(false);
      setNewName("");
      setNewStep("");
      toast.success(`Template "${payload.name}" created`);
    } catch {
      toast.error("Could not reach the server. Please check your connection.");
    } finally {
      setIsCreating(false);
    }
  }

  function updateStep(index: number, value: string) {
    setDraftSteps((prev) => prev.map((s, i) => (i === index ? value : s)));
  }

  function removeStep(index: number) {
    setDraftSteps((prev) => prev.filter((_, i) => i !== index));
  }

  // Native HTML5 drag-and-drop reordering for the step rows.
  // Keep the source index in a ref and just call the list's own move handler,
  // so the editor (draftSteps) is reordered and the reorder "sticks" when the
  // user hits Save — the PUT already sends steps array in order.
  const draggedIndex = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  function handleDragStart(index: number) {
    draggedIndex.current = index;
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>, index: number) {
    event.preventDefault(); // required to allow dropping
    if (dragOverIndex !== index) setDragOverIndex(index);
  }

  function handleDrop(index: number) {
    const from = draggedIndex.current;
    draggedIndex.current = null;
    setDragOverIndex(null);
    if (from === null || from === index) return;
    setDraftSteps((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(index, 0, moved);
      return next;
    });
  }

  function handleDragEnd() {
    draggedIndex.current = null;
    setDragOverIndex(null);
  }

  const canCreate = newName.trim() !== "" && newStep.trim() !== "";
  const dirty =
    draftName.trim() === "" ||
    draftSteps.length === 0 ||
    draftSteps.some((step) => step.trim() === "");

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-3xl font-semibold tracking-tight text-charcoal md:text-4xl">
          Phase templates
        </h1>
        <Button
          onClick={() => setDialogOpen(true)}
          className="h-11 gap-2 rounded-lg bg-gold px-6 text-sm font-semibold text-charcoal shadow-sm transition-all hover:bg-gold/90 active:scale-[0.99]"
        >
          <Plus className="size-4" aria-hidden />
          New template
        </Button>
      </header>

      {error && (
        <div className="rounded-xl border border-rust/30 bg-rust/10 px-6 py-4 text-sm text-rust">
          {error.message}
        </div>
      )}

      {isLoading && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl" />
            ))}
          </div>
          <div className="md:col-span-2">
            <Skeleton className="h-96 w-full rounded-xl" />
          </div>
        </div>
      )}

      {!isLoading && !error && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Left column — template list (~30%) */}
          <div className="flex flex-col gap-3">
            {(data?.length ?? 0) === 0 && (
              <div className="rounded-xl border border-dashed border-border bg-white/60 px-4 py-10 text-center text-sm text-muted-foreground">
                No templates yet
              </div>
            )}
            {data?.map((template) => {
              const isSelected = template.id === selectedId;
              return (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => selectTemplate(template)}
                  aria-pressed={isSelected}
                  className={cn(
                    "w-full rounded-xl bg-white p-4 text-left shadow-sm ring-1 ring-border transition-colors hover:ring-gold/40",
                    isSelected && "border-l-4 border-gold"
                  )}
                >
                  <p className={cn("text-sm", isSelected ? "font-semibold text-charcoal" : "font-medium text-charcoal/80")}>
                    {template.name}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {template.steps.length}{" "}
                    {template.steps.length === 1 ? "step" : "steps"}
                  </p>
                </button>
              );
            })}
          </div>

          {/* Right column — editor (~70%) */}
          <div className="rounded-xl bg-white shadow-sm ring-1 ring-border lg:col-span-2">
            {!selectedId ? (
              <div className="px-8 py-16 text-center text-sm text-muted-foreground">
                Select a template to view its phases
              </div>
            ) : (
              <>
                <div className="border-b border-border bg-cream px-6 py-4">
                  <Label
                    htmlFor="template-name"
                    className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    Template name
                  </Label>
                  <Input
                    id="template-name"
                    value={draftName}
                    onChange={(event) => setDraftName(event.target.value)}
                    placeholder="e.g. Embroidered garment"
                    className={`${FIELD} mt-2`}
                  />
                </div>

                <div className="space-y-3 px-6 py-5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Steps (in order)
                  </Label>
                  <p className="-mt-1 text-xs text-muted-foreground">
                    Drag the grip handle to reorder. Your changes apply when you
                    save the template.
                  </p>

                  {draftSteps.map((step, index) => (
                    <div
                      key={index}
                      onDragOver={(event) => handleDragOver(event, index)}
                      onDrop={(event) => {
                        event.preventDefault();
                        handleDrop(index);
                      }}
                      className={cn(
                        "flex items-center gap-2 rounded-lg border border-transparent transition-colors",
                        dragOverIndex === index &&
                          "border-gold/50 bg-gold/10"
                      )}
                    >
                      <span
                        draggable
                        onDragStart={() => handleDragStart(index)}
                        onDragEnd={handleDragEnd}
                        title="Drag to reorder"
                        className="cursor-grab select-none rounded-md p-1.5 text-muted-foreground hover:bg-muted active:cursor-grabbing"
                        aria-hidden
                      >
                        <GripVertical className="size-4" />
                      </span>
                      <Input
                        value={step}
                        onChange={(event) => updateStep(index, event.target.value)}
                        placeholder={`Step ${index + 1}`}
                        className={FIELD}
                        aria-label={`Step ${index + 1}`}
                      />
                      <button
                        type="button"
                        onClick={() => removeStep(index)}
                        aria-label={`Remove step ${index + 1}`}
                        title="Remove step"
                        className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-transparent text-muted-foreground transition-colors hover:border-destructive/30 hover:text-destructive focus-visible:border-destructive focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-destructive/20"
                      >
                        <X className="size-4" aria-hidden />
                      </button>
                    </div>
                  ))}

                  {draftSteps.length === 0 && (
                    <p className="rounded-lg border border-dashed border-border bg-white/60 px-4 py-6 text-center text-sm text-muted-foreground">
                      No steps yet — add the first one below.
                    </p>
                  )}

                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setDraftSteps((prev) => [...prev, ""])}
                    className="mt-1 w-full rounded-lg border border-dashed border-border font-medium text-muted-foreground hover:border-gold hover:bg-gold/10 hover:text-charcoal"
                  >
                    <Plus className="size-4" aria-hidden />
                    Add step
                  </Button>
                </div>

                {/* Footer actions */}
                <div className="flex items-center justify-between gap-3 border-t border-border bg-cream/60 px-6 py-3.5">
                  <p className="text-xs text-muted-foreground">
                    Saving replaces all steps with the list above.
                  </p>
                  <Button
                    onClick={handleSave}
                    disabled={isSaving || dirty}
                    title={dirty ? "Fill in the name and every step first" : undefined}
                    className="h-10 rounded-lg bg-charcoal px-6 text-sm font-semibold text-cream shadow-sm transition-all hover:bg-charcoal/85 active:scale-[0.99] disabled:opacity-50"
                  >
                    {isSaving ? "Saving…" : "Save template"}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* New template dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md gap-0 rounded-xl p-0 ring-border sm:max-w-md">
          <div className="border-b border-border bg-cream px-6 py-4">
            <DialogHeader className="gap-1 text-left">
              <DialogTitle className="text-base font-semibold text-charcoal">
                New phase template
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                Name it and add its first step — you can edit the rest after.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="space-y-4 px-6 py-5">
            <div className="flex flex-col gap-2">
              <Label htmlFor="new-template-name" className="text-sm font-semibold text-charcoal">
                Template name
              </Label>
              <Input
                id="new-template-name"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="e.g. Chikankari suit"
                className={FIELD}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="new-template-step" className="text-sm font-semibold text-charcoal">
                First step
              </Label>
              <Input
                id="new-template-step"
                value={newStep}
                onChange={(event) => setNewStep(event.target.value)}
                placeholder="e.g. Cutting"
                className={FIELD}
              />
            </div>
          </div>

          <DialogFooter className="gap-3 border-t border-border bg-cream/60 px-6 py-3.5 sm:justify-end">
            <Button
              variant="ghost"
              onClick={() => setDialogOpen(false)}
              className="h-9 rounded-lg text-sm font-medium text-muted-foreground hover:text-charcoal"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!canCreate || isCreating}
              className="h-9 rounded-lg bg-gold px-6 text-sm font-semibold text-charcoal shadow-sm transition-all hover:bg-gold/90 active:scale-[0.99] disabled:opacity-50"
            >
              {isCreating ? "Creating…" : "Create template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
