"use client";

import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type FabricUnit = "meters" | "kg";

// Shared field styling — compact inputs with the gold brand accent on focus.
const FIELD =
  "h-10 rounded-lg border-input bg-white px-3 text-sm focus-visible:border-gold focus-visible:ring-4 focus-visible:ring-gold/20";
const TEXTAREA_FIELD =
  "min-h-[64px] rounded-lg border-input bg-white px-3 py-2 text-sm leading-relaxed focus-visible:border-gold focus-visible:ring-4 focus-visible:ring-gold/20";

function today() {
  // yyyy-mm-dd for the <input type="date"> default (deterministic between
  // server render and hydration because both sides use the UTC date).
  return new Date().toISOString().slice(0, 10);
}

// Must match the server-side limit in /api/uploads.
const PHOTO_MAX_BYTES = 5 * 1024 * 1024;

function clearPreview(url: string | null) {
  if (url) URL.revokeObjectURL(url);
}

export function FabricIntakeForm() {
  const [fabricType, setFabricType] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState<FabricUnit>("meters");
  const [supplierName, setSupplierName] = useState("");
  const [dateReceived, setDateReceived] = useState(today);
  const [description, setDescription] = useState("");
  const [processNotes, setProcessNotes] = useState("");
  // Optional fabric photo — kept as a File until submit, then uploaded via
  // /api/uploads first so the batch row can reference the saved path.
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // The most recent batch number this session generated — stays visible in
  // the read-only strip even after the form resets for the next entry.
  const [lastBatchNumber, setLastBatchNumber] = useState<string | null>(null);

  // Thumbnail preview on file select; the size is checked here too so the
  // user learns about a too-large photo before waiting on an upload.
  function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    if (!file) {
      clearPhoto();
      return;
    }
    if (file.size > PHOTO_MAX_BYTES) {
      toast.error("Image is too large — the limit is 5 MB.");
      event.target.value = "";
      return;
    }
    clearPreview(photoPreview);
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  function clearPhoto() {
    clearPreview(photoPreview);
    setPhotoFile(null);
    setPhotoPreview(null);
    if (photoInputRef.current) photoInputRef.current.value = "";
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      // Upload the photo first (if one was picked) so the batch row can
      // reference the saved path; the file never goes through the JSON POST.
      let imageUrl: string | null = null;
      if (photoFile) {
        const uploadForm = new FormData();
        uploadForm.append("file", photoFile);
        const uploadResponse = await fetch("/api/uploads", {
          method: "POST",
          body: uploadForm,
        });
        if (!uploadResponse.ok) {
          const uploadData = await uploadResponse.json().catch(() => null);
          toast.error(
            uploadData?.message ??
              "Could not upload the fabric photo. Please try again."
          );
          return;
        }
        const uploadData = await uploadResponse.json();
        imageUrl = uploadData.path;
      }

      const response = await fetch("/api/fabric-batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fabricType,
          quantity,
          unit,
          supplier: supplierName,
          dateReceived,
          description,
          processNotes,
          imageUrl,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        toast.error(data?.message ?? "Something went wrong while saving. Please try again.");
        return;
      }

      const data = await response.json();

      // Keep the generated number on screen; reset only the editable fields.
      setLastBatchNumber(data.batchNumber);
      setFabricType("");
      setQuantity("");
      setUnit("meters");
      setSupplierName("");
      setDateReceived(today());
      setDescription("");
      setProcessNotes("");
      clearPhoto();

      toast.success(`Batch ${data.batchNumber} saved`, {
        description: `${quantity} ${unit} of ${fabricType} from ${supplierName}.`,
      });
    } catch {
      toast.error("Could not reach the server. Please check your connection.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="overflow-hidden rounded-xl border border-border bg-white shadow-sm">
      {/* Batch number header strip (read-only) */}
      <div className="flex items-center justify-between gap-4 border-b border-border bg-cream px-6 py-3 sm:px-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Batch number
          </p>
          {lastBatchNumber ? (
            <p className="mt-0.5 font-mono text-base font-semibold text-charcoal">
              {lastBatchNumber}
            </p>
          ) : (
            <p className="mt-0.5 font-mono text-sm italic text-muted-foreground">
              Will be generated on save
            </p>
          )}
        </div>
        <span
          className={cn(
            "rounded-full px-3 py-1 text-xs font-semibold",
            lastBatchNumber
              ? "bg-green-100 text-green-800"
              : "bg-gold/15 text-charcoal/80"
          )}
        >
          {lastBatchNumber ? `Saved · ${lastBatchNumber}` : "Auto-generated"}
        </span>
      </div>

      <div className="space-y-4 px-6 py-5 sm:px-8">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* Fabric type */}
          <div className="flex flex-col gap-2 md:col-span-2">
            <Label htmlFor="fabric-type" className="text-sm font-semibold text-charcoal">
              Fabric type
            </Label>
            <Input
              id="fabric-type"
              placeholder="Cotton, Georgette, Silk..."
              required
              value={fabricType}
              onChange={(event) => setFabricType(event.target.value)}
              className={FIELD}
            />
          </div>

          {/* Quantity + unit */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="quantity" className="text-sm font-semibold text-charcoal">
              Quantity
            </Label>
            <div className="flex">
              <Input
                id="quantity"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                required
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                className={`${FIELD} rounded-r-none border-r-0 font-mono`}
              />
              <Select
                value={unit}
                onValueChange={(value) => setUnit(value as FabricUnit)}
              >
                <SelectTrigger
                  aria-label="Unit"
                  className="w-28 rounded-l-none bg-muted hover:bg-muted/70"
                  style={{ height: "2.5rem" }}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="end">
                  <SelectItem value="meters">meters</SelectItem>
                  <SelectItem value="kg">kg</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Date received */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="date-received" className="text-sm font-semibold text-charcoal">
              Date received
            </Label>
            <Input
              id="date-received"
              type="date"
              required
              value={dateReceived}
              onChange={(event) => setDateReceived(event.target.value)}
              className={FIELD}
            />
          </div>

          {/* Supplier name */}
          <div className="flex flex-col gap-2 md:col-span-2">
            <Label htmlFor="supplier-name" className="text-sm font-semibold text-charcoal">
              Supplier name
            </Label>
            <Input
              id="supplier-name"
              placeholder="Enter supplier name"
              required
              value={supplierName}
              onChange={(event) => setSupplierName(event.target.value)}
              className={FIELD}
            />
          </div>

          {/* Fabric photo (optional) */}
          <div className="flex flex-col gap-2 md:col-span-2">
            <Label htmlFor="fabric-photo" className="text-sm font-semibold text-charcoal">
              Fabric photo (optional)
            </Label>
            <div className="flex items-center gap-3">
              {photoPreview ? (
                /* eslint-disable-next-line @next/next/no-img-element -- local blob preview, not a servable asset yet */
                <img
                  src={photoPreview}
                  alt="Selected fabric photo preview"
                  className="size-16 shrink-0 rounded-lg border border-border object-cover"
                />
              ) : null}
              <Input
                ref={photoInputRef}
                id="fabric-photo"
                type="file"
                accept="image/*"
                onChange={handlePhotoChange}
                className={cn(
                  FIELD,
                  "file:mr-3 file:rounded-md file:border-0 file:bg-gold/15 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-charcoal hover:file:bg-gold/25"
                )}
              />
              {photoPreview ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={clearPhoto}
                  className="h-10 shrink-0 rounded-lg"
                >
                  Remove
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        {/* Notes section */}
        <div className="space-y-4 border-t border-border pt-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="description" className="text-sm font-semibold text-charcoal">
              Description
            </Label>
            <Textarea
              id="description"
              rows={2}
              placeholder="Describe this fabric batch — color, texture, any notable details"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className={TEXTAREA_FIELD}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="process-notes" className="text-sm font-semibold text-charcoal">
              Process notes
            </Label>
            <Textarea
              id="process-notes"
              rows={2}
              placeholder="Notes on how this fabric should be processed"
              value={processNotes}
              onChange={(event) => setProcessNotes(event.target.value)}
              className={TEXTAREA_FIELD}
            />
          </div>
        </div>
      </div>

      {/* Actions footer */}
      <div className="flex flex-col gap-3 border-t border-border bg-cream/60 px-6 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <p className="text-xs text-muted-foreground">
          Saved batches are registered with status{" "}
          <span className="font-semibold text-charcoal">PENDING</span>.
        </p>
        <Button
          type="submit"
          disabled={isSubmitting}
          className="h-10 w-full rounded-lg bg-gold px-8 text-sm font-semibold tracking-wide text-charcoal shadow-sm transition-all hover:bg-gold/90 active:scale-[0.99] disabled:opacity-60 sm:w-auto"
        >
          {isSubmitting ? "Saving…" : "Save and continue"}
        </Button>
      </div>
    </form>
  );
}
