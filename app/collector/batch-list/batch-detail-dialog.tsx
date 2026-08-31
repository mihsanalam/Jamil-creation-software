"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { toast } from "sonner";
import { ImagePlus, Trash2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import Image from "next/image";
import { cn } from "@/lib/utils";

import type { FabricBatch } from "./batch-list-client";

interface BatchDetailDialogProps {
  /** Batch to show; null closes the dialog. */
  batch: FabricBatch | null;
  onClose: () => void;
  /** Called after a photo add/change/remove so the list refreshes too. */
  onUpdated?: (updated: Partial<FabricBatch> & { id: string }) => void;
}

// Must match the server-side limit in /api/uploads.
const PHOTO_MAX_BYTES = 5 * 1024 * 1024;

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
 * opening a row costs no extra request. The fabric photo can be added,
 * changed or removed here — this is how batches recorded before photos
 * existed (or any batch without one) get their image.
 */
export function BatchDetailDialog({
  batch,
  onClose,
  onUpdated,
}: BatchDetailDialogProps) {
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  if (!batch) {
    return (
      <Dialog open={false} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="w-full max-w-lg gap-0 rounded-xl p-0 ring-border" />
      </Dialog>
    );
  }

  async function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !batch) return;

    if (file.size > PHOTO_MAX_BYTES) {
      toast.error("Image is too large — the limit is 5 MB.");
      return;
    }

    setIsUploading(true);
    try {
      // Upload the file first, then point the batch at the saved path.
      const uploadForm = new FormData();
      uploadForm.append("file", file);
      const uploadResponse = await fetch("/api/uploads", {
        method: "POST",
        body: uploadForm,
      });
      if (!uploadResponse.ok) {
        const data = await uploadResponse.json().catch(() => null);
        toast.error(
          data?.message ?? "Could not upload the photo. Please try again."
        );
        return;
      }
      const { path } = (await uploadResponse.json()) as { path: string };

      const patchResponse = await fetch(`/api/fabric-batches/${batch.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: path }),
      });
      if (!patchResponse.ok) {
        const data = await patchResponse.json().catch(() => null);
        toast.error(
          data?.message ?? "Could not save the photo. Please try again."
        );
        return;
      }

      onUpdated?.({ id: batch.id, imageUrl: path });
      toast.success(`Photo saved for ${batch.batchNumber}`);
    } catch {
      toast.error("Could not reach the server. Please check your connection.");
    } finally {
      setIsUploading(false);
    }
  }

  async function handlePhotoRemove() {
    if (!batch) return;
    setIsUploading(true);
    try {
      const response = await fetch(`/api/fabric-batches/${batch.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: null }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        toast.error(
          data?.message ?? "Could not remove the photo. Please try again."
        );
        return;
      }
      onUpdated?.({ id: batch.id, imageUrl: null });
      toast.success(`Photo removed from ${batch.batchNumber}`);
    } catch {
      toast.error("Could not reach the server. Please check your connection.");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <Dialog open={batch !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-full max-w-lg gap-0 rounded-xl p-0 ring-border">
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
                {batch.status === "IN_PRODUCTION" && batch.currentPhase && (
                  <span className="ml-2 inline-flex rounded-md bg-gold/15 px-2 py-0.5 text-xs font-medium text-charcoal">
                    Current phase: {batch.currentPhase}
                  </span>
                )}
              </div>
            </div>

            {/* Body */}
            <div className="space-y-5 px-6 py-5">
              {/* Fabric photo — add / change / remove */}
              <div className="flex items-center gap-4 rounded-lg border border-border bg-cream/60 p-3">
                {batch.imageUrl ? (
                  <Image
                    src={batch.imageUrl}
                    alt={`Fabric photo of batch ${batch.batchNumber}`}
                    width={72}
                    height={72}
                    className="size-18 shrink-0 rounded-lg border border-border object-cover"
                  />
                ) : (
                  <div className="flex size-18 shrink-0 items-center justify-center rounded-lg border border-dashed border-border bg-white text-muted-foreground">
                    <ImagePlus className="size-6" aria-hidden />
                  </div>
                )}
                <div className="flex flex-1 flex-col gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Fabric photo
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <label
                      className={cn(
                        "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-white px-3 text-xs font-semibold text-charcoal transition-colors hover:border-gold",
                        isUploading && "pointer-events-none opacity-60"
                      )}
                    >
                      {batch.imageUrl ? "Change photo" : "Add photo"}
                      <input
                        ref={photoInputRef}
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        onChange={handlePhotoChange}
                        disabled={isUploading}
                      />
                    </label>
                    {batch.imageUrl && (
                      <button
                        type="button"
                        onClick={handlePhotoRemove}
                        disabled={isUploading}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-white px-3 text-xs font-semibold text-muted-foreground transition-colors hover:border-rust hover:text-rust disabled:opacity-60"
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                        Remove
                      </button>
                    )}
                    {isUploading && (
                      <span className="text-xs text-muted-foreground">
                        Saving…
                      </span>
                    )}
                  </div>
                </div>
              </div>

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
