"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { Eye, Search } from "lucide-react";

import { BatchDetailDialog } from "@/app/collector/batch-list/batch-detail-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export interface FabricBatch {
  id: string;
  batchNumber: string;
  fabricType: string;
  quantity: number;
  unit: string;
  supplier: string;
  dateReceived: string;
  description: string | null;
  processNotes: string | null;
  status: string;
  currentPhase: string | null;
  createdAt: string;
  recordedByName: string;
}

// SWR fetcher — throws on non-2xx so isLoading/error behave predictably.
async function fetcher(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.message ?? "Failed to load batches");
  }
  return response.json() as Promise<FabricBatch[]>;
}

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "PENDING", label: "Pending" },
  { value: "IN_PRODUCTION", label: "In production" },
  { value: "READY", label: "Ready" },
  { value: "SOLD", label: "Sold" },
] as const;

function formatDate(value: string) {
  // date_received arrives as an ISO timestamp; show just the calendar date.
  return new Date(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function BatchListClient() {
  const [status, setStatus] = useState<string>("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [selectedBatch, setSelectedBatch] = useState<FabricBatch | null>(null);

  // Debounce the search box so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const timeout = setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => clearTimeout(timeout);
  }, [searchInput]);

  const query = new URLSearchParams();
  if (status !== "all") query.set("status", status);
  if (search) query.set("search", search);

  const { data, error, isLoading } = useSWR<FabricBatch[]>(
    `/api/fabric-batches?${query.toString()}`,
    fetcher,
    { refreshInterval: 8000, keepPreviousData: true }
  );

  return (
    <div className="space-y-5">
      {/* Filter row */}
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-white p-4 shadow-sm md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-2">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Status
          </Label>
          <div className="flex flex-wrap gap-2">
            {STATUS_FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                onClick={() => setStatus(filter.value)}
                aria-pressed={status === filter.value}
                className={cn(
                  "rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
                  status === filter.value
                    ? "border-gold bg-gold text-charcoal"
                    : "border-border bg-white text-muted-foreground hover:border-gold hover:text-charcoal"
                )}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex w-full flex-col gap-2 md:w-72">
          <Label htmlFor="batch-search" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Search
          </Label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              id="batch-search"
              placeholder="Batch number or supplier"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              className="h-10 rounded-lg border-input bg-white pl-9 text-base focus-visible:border-gold focus-visible:ring-4 focus-visible:ring-gold/20"
            />
          </div>
        </div>
      </div>

      {/* Row count */}
      <p className="text-sm text-muted-foreground">
        {isLoading ? "Loading…" : `${data?.length ?? 0} batches`}
      </p>

      {/* Error state */}
      {error && (
        <div className="rounded-xl border border-rust/30 bg-rust/10 px-6 py-4 text-sm text-rust">
          {error.message}
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading && (
        <div className="space-y-3 rounded-xl border border-border bg-white p-6 shadow-sm">
          <Skeleton className="h-8 w-full" />
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && (data?.length ?? 0) === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-white/60 px-6 py-12 text-center text-sm text-muted-foreground">
          No batches recorded yet
        </div>
      )}

      {/* Data table */}
      {!isLoading && !error && (data?.length ?? 0) > 0 && (
        <div className="overflow-hidden rounded-xl border border-border bg-white shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead className="h-11 pl-6 text-xs font-semibold uppercase tracking-wider text-charcoal">
                  Batch number
                </TableHead>
                <TableHead className="h-11 text-xs font-semibold uppercase tracking-wider text-charcoal">
                  Fabric type
                </TableHead>
                <TableHead className="h-11 text-xs font-semibold uppercase tracking-wider text-charcoal">
                  Supplier
                </TableHead>
                <TableHead className="h-11 text-xs font-semibold uppercase tracking-wider text-charcoal">
                  Quantity
                </TableHead>
                <TableHead className="h-11 text-xs font-semibold uppercase tracking-wider text-charcoal">
                  Date received
                </TableHead>
                <TableHead className="h-11 text-xs font-semibold uppercase tracking-wider text-charcoal">
                  Recorded by
                </TableHead>
                <TableHead className="h-11 pr-6 text-right text-xs font-semibold uppercase tracking-wider text-charcoal">
                  Status
                </TableHead>
                <TableHead className="h-11 pr-6 text-right text-xs font-semibold uppercase tracking-wider text-charcoal">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.map((batch) => (
                <TableRow key={batch.id} className="hover:bg-gold/6">
                  <TableCell className="py-3.5 pl-6 font-mono text-sm font-medium text-charcoal">
                    {batch.batchNumber}
                  </TableCell>
                  <TableCell className="py-3.5 text-charcoal">{batch.fabricType}</TableCell>
                  <TableCell className="py-3.5 text-charcoal">{batch.supplier}</TableCell>
                  <TableCell className="py-3.5 font-mono text-charcoal">
                    {batch.quantity} {batch.unit}
                  </TableCell>
                  <TableCell className="py-3.5 text-charcoal">
                    {formatDate(batch.dateReceived)}
                  </TableCell>
                  <TableCell className="py-3.5 text-charcoal">{batch.recordedByName}</TableCell>
                  <TableCell className="py-3.5 pr-6 text-right">
                    <div className="flex flex-col items-end gap-1">
                      <StatusBadge status={batch.status} />
                      {batch.status === "IN_PRODUCTION" && batch.currentPhase && (
                        <span className="rounded-md bg-gold/15 px-1.5 py-0.5 text-[11px] font-medium text-charcoal">
                          In: {batch.currentPhase}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="py-3.5 pr-6 text-right">
                    <button
                      type="button"
                      onClick={() => setSelectedBatch(batch)}
                      aria-label={`View details of batch ${batch.batchNumber}`}
                      title="View details"
                      className="inline-flex size-8 items-center justify-center rounded-lg border border-border bg-white text-muted-foreground transition-colors hover:border-gold hover:text-charcoal focus-visible:border-gold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-gold/20"
                    >
                      <Eye className="size-4" aria-hidden />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Detail modal */}
      <BatchDetailDialog
        batch={selectedBatch}
        onClose={() => setSelectedBatch(null)}
      />
    </div>
  );
}
