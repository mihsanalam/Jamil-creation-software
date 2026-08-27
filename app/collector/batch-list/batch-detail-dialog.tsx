"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { cn } from "@/lib/utils";

import type { FabricBatch } from "./batch-list-client";

interface BatchDetailDialogProps {
  /** Batch to show; null closes the dialog. */
  batch: FabricBatch | null;
  onClose: () => void;
}

function DetailRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          "text-sm text-charcoal",
          mono && "font-mono font-medium"
        )}
      >
        {value}
      </span>
    </div>
  );
}

function NotesBlock({ label, text }: { label: string; text: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <p className="whitespace-pre-wrap rounded-lg bg-cream px-3 py-2 text-sm leading-relaxed text-charcoal">
        {text}
      </p>
    </div>
  );
}

/**
 * Modal showing every field of one fabric batch. Data comes straight from
 * the list response (the GET handler already returns all columns), so
 * opening a row costs no extra request.
 */
export function BatchDetailDialog({ batch, onClose }: BatchDetailDialogProps) {
  return (
    <Dialog open={batch !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-full max-w-lg gap-0 rounded-xl p-0 ring-border">
        {batch && (
          <>
            {/* Header — cream strip matching the intake form */}
            <div className="border-b border-border bg-cream px-6 py-4">
              <DialogHeader className="gap-1 text-left">
                <DialogTitle className="font-mono text-lg font-bold text-charcoal">
                  {batch.batchNumber}
                </DialogTitle>
                <DialogDescription className="text-sm text-muted-foreground">
                  Fabric batch details
                </DialogDescription>
              </DialogHeader>
              <div className="mt-2">
                <StatusBadge status={batch.status} />
              </div>
            </div>

            {/* Body */}
            <div className="space-y-5 px-6 py-5">
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                <DetailRow label="Fabric type" value={batch.fabricType} />
                <DetailRow
                  label="Quantity"
                  value={`${batch.quantity} ${batch.unit}`}
                  mono
                />
                <DetailRow label="Supplier" value={batch.supplier} />
                <DetailRow label="Date received" value={formatDateOnly(batch.dateReceived)} />
                <DetailRow
                  label="Recorded by"
                  value={batch.recordedByName}
                />
                <DetailRow label="Recorded at" value={formatDate(batch.createdAt)} />
              </div>

              <div className="space-y-4 border-t border-border pt-4">
                <NotesBlock
                  label="Description"
                  text={batch.description ?? "No description provided."}
                />
                <NotesBlock
                  label="Process notes"
                  text={batch.processNotes ?? "No process notes provided."}
                />
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function formatDate(value: string) {
  // Full timestamp for audit info ("27 Aug 2026, 17:06").
  const date = new Date(value);
  return `${formatDateOnly(value)}, ${date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function formatDateOnly(value: string) {
  // Calendar-date only, matching the table's format.
  return new Date(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
