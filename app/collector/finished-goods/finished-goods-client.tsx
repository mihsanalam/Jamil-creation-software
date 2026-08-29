"use client";

import { useState } from "react";
import useSWR from "swr";
import QRCode from "qrcode";
import { Check, ChevronDown, Loader2, Printer } from "lucide-react";
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
import Image from "next/image";

// A phase inside a ready work order (shape from GET /api/work-orders/ready).
export interface ReadyOrderPhase {
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

// A completed work order eligible to become stock.
export interface ReadyOrder {
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
  phases: ReadyOrderPhase[];
}

// The finished product returned by POST /api/finished-products.
export interface CreatedProduct {
  id: string;
  workOrderId: string;
  barcode: string;
  quantity: number;
  storageLocation: string;
  status: string;
  dateAdded: string;
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

// Small labeled block used in the summary card.
function SummaryRow({
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
          mono && "font-mono font-semibold"
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function FinishedGoodsClient() {
  const [readyOpen, setReadyOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<ReadyOrder | null>(null);
  const [storageLocation, setStorageLocation] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createdProduct, setCreatedProduct] = useState<CreatedProduct | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  const {
    data: readyOrders,
    isLoading,
    error,
    mutate,
  } = useSWR<ReadyOrder[]>("/api/work-orders/ready", fetcher<ReadyOrder[]>, {
    refreshInterval: 15000,
  });

  // Switching the batch or the storage location invalidates a previously
  // generated barcode (it is bound to the exact batch + location).
  function selectOrder(order: ReadyOrder) {
    setSelectedOrder(order);
    setCreatedProduct(null);
    setQrDataUrl(null);
  }

  function handleStorageChange(value: string) {
    setStorageLocation(value);
    if (createdProduct) {
      setCreatedProduct(null);
      setQrDataUrl(null);
    }
  }

  // POST the work order to /api/finished-products (transaction generates the
  // barcode, copies quantity, inserts the row). Returns the created product
  // or null on failure; the QR data URL is stored for rendering the label.
  async function createProduct(): Promise<CreatedProduct | null> {
    if (!selectedOrder || storageLocation.trim() === "") return null;

    setIsCreating(true);
    try {
      const response = await fetch("/api/finished-products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workOrderId: selectedOrder.id,
          storageLocation: storageLocation.trim(),
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(payload?.message ?? "Could not add the product to stock.");
        return null;
      }

      const qr = await QRCode.toDataURL(payload.barcode, {
        width: 168,
        margin: 1,
      });
      setQrDataUrl(qr);
      return payload as CreatedProduct;
    } catch {
      toast.error("Could not reach the server. Please check your connection.");
      return null;
    } finally {
      setIsCreating(false);
    }
  }

  // "Generate" — call the POST endpoint and reveal the barcode + QR.
  async function handleGenerate() {
    const product = await createProduct();
    if (product) setCreatedProduct(product);
  }

  // "Confirm and add to stock" — uses the already-generated barcode when one
  // exists (so the row is never created twice), otherwise creates it now.
  async function handleConfirm() {
    if (!selectedOrder) return;

    const product = createdProduct ?? (await createProduct());
    if (!product) return;

    toast.success(`Added to stock · Barcode ${product.barcode}`, {
      description: `${selectedOrder.productType} · ${selectedOrder.batchNumber} stored at ${product.storageLocation}.`,
    });

    // Reset the form; the consumed work order disappears from the picker.
    setSelectedOrder(null);
    setStorageLocation("");
    setCreatedProduct(null);
    setQrDataUrl(null);
    setReadyOpen(false);
    mutate();
  }

  function handlePrint() {
    window.print();
  }

  const confirmEnabled =
    selectedOrder !== null && storageLocation.trim() !== "";

  return (
<div className="space-y-5">
      {/* STEP 1 — Find the ready batch */}
      <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-border">
        <div className="mb-4">
          <Label className="text-sm font-semibold text-charcoal">
            Find batch marked ready
          </Label>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Only completed work orders that haven&apos;t been stocked yet appear here.
          </p>
        </div>

        {isLoading ? (
          <Skeleton className="h-11 w-full rounded-lg" />
        ) : error ? (
          <p className="rounded-lg border border-dashed border-border bg-white/60 px-4 py-4 text-sm text-red-600">
            Could not load ready batches. Please try again.
          </p>
        ) : (readyOrders?.length ?? 0) === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-white/60 px-4 py-6 text-center text-sm text-muted-foreground">
            No completed batches waiting to become stock yet.
          </p>
        ) : (
          <Popover open={readyOpen} onOpenChange={setReadyOpen}>
            <PopoverTrigger
              className={cn(
                "flex h-11 w-full items-center justify-between rounded-lg border border-input bg-white px-3 text-left text-sm transition-colors focus-visible:border-gold focus-visible:ring-4 focus-visible:ring-gold/20",
                !selectedOrder && "text-muted-foreground"
              )}
            >
              {selectedOrder ? (
                <span className="flex items-center gap-2 font-medium text-charcoal">
                  <span className="font-mono">{selectedOrder.batchNumber}</span>
                  <span className="text-muted-foreground">·</span>
                  <span>{selectedOrder.productType}</span>
                  <span className="text-muted-foreground">·</span>
                  <span className="font-mono">{selectedOrder.quantity} pcs</span>
                </span>
              ) : (
                <span>Search batches…</span>
              )}
              <ChevronDown
                className={cn(
                  "size-4 text-muted-foreground transition-transform",
                  readyOpen && "rotate-180"
                )}
                aria-hidden
              />
            </PopoverTrigger>

            <PopoverContent className="w-150 p-0" align="start" sideOffset={6}>
              <Command>
                <CommandInput placeholder="Search batch number or product type…" />
                <CommandList>
                  <CommandEmpty>No ready batches match.</CommandEmpty>
                  <CommandGroup>
                    {(readyOrders ?? []).map((order) => (
                      <CommandItem
                        key={order.id}
                        value={`${order.batchNumber} ${order.productType}`}
                        onSelect={() => {
                          selectOrder(order);
                          setReadyOpen(false);
                        }}
                      >
                        <span className="flex w-full items-center gap-2">
                          <span className="font-mono">{order.batchNumber}</span>
                          <span className="text-muted-foreground">·</span>
                          <span>{order.productType}</span>
                          <span className="ml-auto font-mono text-xs text-muted-foreground">
                            {order.quantity} pcs
                          </span>
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        )}
      </section>

      {/* STEP 2 — Selected batch summary + completed-phases checklist */}
      {selectedOrder && (
        <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-border">
          <div className="mb-4">
            <Label className="text-sm font-semibold text-charcoal">
              Batch summary
            </Label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              All phases are complete — this batch is ready to become stock.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-x-6 gap-y-4">
            <SummaryRow
              label="Batch number"
              value={selectedOrder.batchNumber}
              mono
            />
            <SummaryRow label="Product type" value={selectedOrder.productType} />
            <SummaryRow
              label="Quantity"
              value={`${selectedOrder.quantity} pcs`}
              mono
            />
          </div>

          {/* Completed phases — every one shows as checked */}
          <ol className="mt-5 space-y-2 border-t border-border pt-5">
            {selectedOrder.phases.map((phase) => (
              <li
                key={phase.id}
                className="flex items-center gap-3 rounded-lg border border-border bg-cream/40 px-4 py-2.5"
              >
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-gold text-charcoal">
                  <Check className="size-3.5" aria-hidden />
                </span>
                <span className="text-sm font-medium text-charcoal">
                  {phase.name}
                </span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {phase.workerName ?? "Unassigned"}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}
{/* STEP 3 — Barcode + storage location side by side */}
      <div className="grid gap-5 lg:grid-cols-2">
        {/* Left — barcode generation */}
        <section className="flex flex-col rounded-xl bg-white p-6 shadow-sm ring-1 ring-border">
          <div className="mb-4">
            <Label className="text-sm font-semibold text-charcoal">Barcode</Label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Generate a unique barcode for this finished product.
            </p>
          </div>

          {!createdProduct || !qrDataUrl ? (
            <div className="flex flex-1 flex-col gap-3">
              <Button
                type="button"
                onClick={handleGenerate}
                disabled={!confirmEnabled || isCreating}
                title={
                  confirmEnabled
                    ? undefined
                    : "Select a batch and enter a storage location first."
                }
                className="h-11 rounded-lg bg-charcoal px-6 text-sm font-semibold text-cream shadow-sm transition-all hover:bg-charcoal/90 active:scale-[0.99] disabled:opacity-50"
              >
                {isCreating ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    Generating…
                  </>
                ) : (
                  "Generate"
                )}
              </Button>
              <p className="text-xs text-muted-foreground">
                {confirmEnabled
                  ? "Creates the product and shows its scannable barcode."
                  : "Pick a batch above and fill in the storage location to enable this."}
              </p>
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center gap-4">
              <div className="rounded-xl border border-border bg-white p-4">
                <Image
                  src={qrDataUrl}
                  alt={`QR code for barcode ${createdProduct.barcode}`}
                  className="size-36"
                />
              </div>
              <div className="text-center">
                <p className="font-mono text-xl font-bold tracking-widest text-charcoal">
                  {createdProduct.barcode}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {createdProduct.quantity} pcs · {createdProduct.storageLocation}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={handlePrint}
                className="h-10 rounded-lg border border-border bg-white px-4 text-sm font-semibold text-charcoal transition-colors hover:border-gold hover:bg-gold/5"
              >
                <Printer className="size-4" aria-hidden />
                Print label
              </Button>
            </div>
          )}
        </section>

        {/* Right — storage location */}
        <section className="flex flex-col rounded-xl bg-white p-6 shadow-sm ring-1 ring-border">
          <div className="mb-4">
            <Label htmlFor="storage-location" className="text-sm font-semibold text-charcoal">
              Storage location
            </Label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Shelf or rack code where this product will be stored.
            </p>
          </div>

          <Input
            id="storage-location"
            value={storageLocation}
            onChange={(event) => handleStorageChange(event.target.value)}
            placeholder="e.g. Shelf A-3"
            disabled={selectedOrder === null}
            className={FIELD}
          />
          {selectedOrder === null && (
            <p className="mt-2 text-xs text-muted-foreground">
              Select a ready batch first.
            </p>
          )}
        </section>
      </div>

      {/* STEP 4 — Confirm and add to stock */}
      <div className="flex justify-end">
        <Button
          type="button"
          onClick={handleConfirm}
          disabled={!confirmEnabled || isCreating}
          title={
            confirmEnabled
              ? undefined
              : "Select a batch and enter a storage location first."
          }
          className="h-11 rounded-lg bg-gold px-6 text-sm font-semibold text-charcoal shadow-sm transition-all hover:bg-gold/90 active:scale-[0.99] disabled:opacity-50"
        >
          {isCreating ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Adding…
            </>
          ) : (
            "Confirm and add to stock"
          )}
        </Button>
      </div>
    </div>
  );
}
