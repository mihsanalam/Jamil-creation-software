"use client";

import { useState, type FormEvent } from "react";
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

export function FabricIntakeForm() {
  const [fabricType, setFabricType] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState<FabricUnit>("meters");
  const [supplierName, setSupplierName] = useState("");
  const [dateReceived, setDateReceived] = useState(today);
  const [description, setDescription] = useState("");
  const [processNotes, setProcessNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  // The most recent batch number this session generated — stays visible in
  // the read-only strip even after the form resets for the next entry.
  const [lastBatchNumber, setLastBatchNumber] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);

    try {
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
