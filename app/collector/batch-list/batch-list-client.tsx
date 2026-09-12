"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import useSWR from "swr";
import { Eye, Search } from "lucide-react";
import { toast } from "sonner";

import { BatchDetailDialog } from "@/app/collector/batch-list/batch-detail-dialog";
import { DataTable, type SortDirection } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/lib/i18n";

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
  imageUrl: string | null;
  status: string;
  currentPhase: string | null;
  createdAt: string;
  recordedByName: string;
}

// One page of batches returned by GET /api/fabric-batches.
interface BatchPage {
  items: FabricBatch[];
  total: number;
  hasMore: boolean;
}

// Rows per fetch — page 1 arrives via SWR, later pages via "Load more".
const PAGE_SIZE = 25;

// Sort keys the batch-list API accepts (a whitelist lives server-side too).
const SORTABLE_KEYS = new Set([
  "createdAt",
  "batchNumber",
  "fabricType",
  "quantity",
  "dateReceived",
  "status",
  "supplier",
  "recordedByName",
]);

// SWR fetcher — throws on non-2xx so isLoading/error behave predictably.
async function fetcher(url: string): Promise<BatchPage> {
  const response = await fetch(url);
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.message ?? "Failed to load batches");
  }
  return response.json() as Promise<BatchPage>;
}

// Combines the live first page with any "Load more" pages, keeping one row
// per id (a row can briefly appear on both when the first page refreshes).
function mergePages(firstPage: FabricBatch[], extra: FabricBatch[]): FabricBatch[] {
  const seen = new Set<string>();
  const merged: FabricBatch[] = [];
  for (const batch of [...firstPage, ...extra]) {
    if (seen.has(batch.id)) continue;
    seen.add(batch.id);
    merged.push(batch);
  }
  return merged;
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
  const { t } = useLanguage();
  const [status, setStatus] = useState<string>("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [selectedBatch, setSelectedBatch] = useState<FabricBatch | null>(null);
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");

  // Rows already fetched beyond the first page ("Load more"). The first page
  // always comes from SWR; these are appended to it so the 8s refresh never
  // wipes them out.
  const [extraItems, setExtraItems] = useState<FabricBatch[]>([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Debounce the search box so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const timeout = setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => clearTimeout(timeout);
  }, [searchInput]);

  // Changing the filter/sort starts a fresh result set — drop extra pages.
  function handleStatusChange(next: string) {
    setStatus(next);
    setExtraItems([]);
  }

  function handleSearchChange(next: string) {
    setSearchInput(next);
    setExtraItems([]);
  }

  function handleSortChange(key: string, dir: SortDirection) {
    if (!SORTABLE_KEYS.has(key)) return;
    setSortBy(key);
    setSortDir(dir);
    setExtraItems([]);
  }

  const query = new URLSearchParams();
  query.set("limit", String(PAGE_SIZE));
  if (status !== "all") query.set("status", status);
  if (search) query.set("search", search);
  // Only send the sort params when they differ from the default, so SWR's
  // cache key stays short for the common "newest first" view.
  if (sortBy !== "createdAt" || sortDir !== "desc") {
    query.set("sortBy", sortBy);
    query.set("sortDir", sortDir);
  }

  const { data, error, isLoading, mutate } = useSWR<BatchPage>(
    `/api/fabric-batches?${query.toString()}`,
    fetcher,
    { refreshInterval: 8000, keepPreviousData: true }
  );

  const visible = mergePages(data?.items ?? [], extraItems);
  const total = data?.total ?? 0;
  const hasMore = total > visible.length;

  async function handleLoadMore() {
    if (isLoadingMore || !data || !hasMore) return;
    setIsLoadingMore(true);
    try {
      const params = new URLSearchParams();
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(visible.length));
      if (status !== "all") params.set("status", status);
      if (search) params.set("search", search);
      if (sortBy !== "createdAt" || sortDir !== "desc") {
        params.set("sortBy", sortBy);
        params.set("sortDir", sortDir);
      }

      const response = await fetch(`/api/fabric-batches?${params.toString()}`);
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(payload?.message ?? t("Failed to load batches"));
        return;
      }
      setExtraItems((current) => [...current, ...(payload.items ?? [])]);
    } catch {
      toast.error(t("Failed to load batches"));
    } finally {
      setIsLoadingMore(false);
    }
  }

  // Called by the detail dialog after a photo add/change/remove PATCH, so the
  // list (and the open dialog) reflect the change without waiting for the
  // next 8s poll.
  function handleBatchUpdated(updated: Partial<FabricBatch> & { id: string }) {
    setSelectedBatch((current) =>
      current && current.id === updated.id ? { ...current, ...updated } : current
    );
    mutate(
      (page) =>
        page && page.items
          ? {
              ...page,
              items: page.items.map((batch) =>
                batch.id === updated.id ? { ...batch, ...updated } : batch
              ),
            }
          : page,
      { revalidate: false }
    );
    setExtraItems((rows) =>
      rows.map((batch) =>
        batch.id === updated.id ? { ...batch, ...updated } : batch
      )
    );
  }

  return (
    <div className="space-y-5">
      {/* Filter row */}
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-white p-4 shadow-sm md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-2">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("Status")}
          </Label>
          <div className="flex flex-wrap gap-2">
            {STATUS_FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                onClick={() => handleStatusChange(filter.value)}
                aria-pressed={status === filter.value}
                className={cn(
                  "rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
                  status === filter.value
                    ? "border-gold bg-gold text-charcoal"
                    : "border-border bg-white text-muted-foreground hover:border-gold hover:text-charcoal"
                )}
              >
                {t(filter.label)}
              </button>
            ))}
          </div>
        </div>

        <div className="flex w-full flex-col gap-2 md:w-72">
          <Label htmlFor="batch-search" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("Search")}
          </Label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              id="batch-search"
              placeholder={t("Batch number or supplier")}
              value={searchInput}
              onChange={(event) => handleSearchChange(event.target.value)}
              className="h-10 rounded-lg border-input bg-white pl-9 text-base focus-visible:border-gold focus-visible:ring-4 focus-visible:ring-gold/20"
            />
          </div>
        </div>
      </div>

      {/* Row count */}
      <p className="text-sm text-muted-foreground">
        {isLoading ? t("Loading…") : `${visible.length} ${t("batches")}`}
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
      {!isLoading && !error && visible.length === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-white/60 px-6 py-12 text-center text-sm text-muted-foreground">
          {t("No batches recorded yet")}
        </div>
      )}

      {/* Data table */}
      {!isLoading && !error && visible.length > 0 && (
        <DataTable
          columns={[
            {
              key: "batchNumber",
              header: t("Batch number"),
              sortable: true,
              renderCell: (batch) => (
                <div className="flex items-center gap-2.5">
                  {batch.imageUrl && (
                    <Image
                      src={batch.imageUrl}
                      alt={`Fabric photo of batch ${batch.batchNumber}`}
                      width={36}
                      height={36}
                      className="size-9 shrink-0 rounded-md border border-border object-cover"
                    />
                  )}
                  <span className="font-mono text-sm font-medium text-charcoal">
                    {batch.batchNumber}
                  </span>
                </div>
              ),
            },
            {
              key: "fabricType",
              header: t("Fabric type"),
              sortable: true,
              cellClassName: "text-charcoal",
            },
            {
              key: "supplier",
              header: t("Supplier"),
              sortable: true,
              cellClassName: "text-charcoal",
            },
            {
              key: "quantity",
              header: t("Quantity"),
              sortable: true,
              cellClassName: "font-mono text-charcoal",
              renderCell: (batch) => <>{batch.quantity} {batch.unit}</>,
            },
            {
              key: "dateReceived",
              header: t("Date received"),
              sortable: true,
              cellClassName: "text-charcoal",
              renderCell: (batch) => formatDate(batch.dateReceived),
            },
            {
              key: "recordedByName",
              header: t("Recorded by"),
              sortable: true,
              cellClassName: "text-charcoal",
            },
            {
              key: "status",
              header: t("Status"),
              align: "right",
              sortable: true,
              getSortValue: (batch) => batch.status,
              renderCell: (batch) => (
                <div className="flex flex-col items-end gap-1">
                  <StatusBadge status={batch.status} />
                  {batch.status === "IN_PRODUCTION" && batch.currentPhase && (
                    <span className="rounded-md bg-gold/15 px-1.5 py-0.5 text-[11px] font-medium text-charcoal">
                      {t("In:")} {batch.currentPhase}
                    </span>
                  )}
                </div>
              ),
            },
            {
              key: "actions",
              header: t("Actions"),
              align: "right",
              hideHeader: true,
              renderCell: (batch) => (
                <button
                  type="button"
                  onClick={() => setSelectedBatch(batch)}
                  aria-label={`${t("View details")} · ${batch.batchNumber}`}
                  title={t("View details")}
                  className="inline-flex size-8 items-center justify-center rounded-lg border border-border bg-white text-muted-foreground transition-colors hover:border-gold hover:text-charcoal focus-visible:border-gold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-gold/20"
                >
                  <Eye className="size-4" aria-hidden />
                </button>
              ),
            },
          ]}
          rows={visible}
          rowKey={(batch) => batch.id}
          onSortChange={handleSortChange}
          sortBy={sortBy}
          sortDir={sortDir}
        />
      )}

      {/* Load more — shown only while more pages remain */}
      {!isLoading && !error && hasMore && (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="outline"
            onClick={handleLoadMore}
            disabled={isLoadingMore}
            className="h-10 rounded-lg border border-border bg-white px-6 text-sm font-medium text-charcoal transition-colors hover:border-gold hover:bg-gold/5"
          >
            {isLoadingMore ? t("Loading…") : t("Load more")}
          </Button>
        </div>
      )}

      {/* Detail modal */}
      <BatchDetailDialog
        batch={selectedBatch}
        onClose={() => setSelectedBatch(null)}
        onUpdated={handleBatchUpdated}
      />
    </div>
  );
}
