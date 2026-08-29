"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { PackageSearch, Search } from "lucide-react";

import { StatusBadge } from "@/components/shared/status-badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// A finished product row from GET /api/finished-products.
export interface FinishedProduct {
  id: string;
  workOrderId: string;
  barcode: string;
  quantity: number;
  storageLocation: string;
  status: string;
  dateAdded: string;
  batchNumber: string;
  productType: string;
}

// SWR fetcher — throws on non-2xx so isLoading/error behave predictably.
async function fetcher(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.message ?? "Failed to load products");
  }
  return response.json() as Promise<FinishedProduct[]>;
}

function formatDate(value: string) {
  // date_added arrives as an ISO timestamp; show just the calendar date.
  return new Date(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function WarehouseSearchClient() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  // Debounce the search box (~300ms) so typing doesn't fire a request per
  // keystroke; only update the actual query after the user pauses.
  useEffect(() => {
    const timeout = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(timeout);
  }, [searchInput]);

  const query = new URLSearchParams();
  if (search) query.set("search", search);

  const { data, error, isLoading } = useSWR<FinishedProduct[]>(
    `/api/finished-products?${query.toString()}`,
    fetcher,
    { refreshInterval: 15000, keepPreviousData: true }
  );

  return (
    <div className="space-y-5">
      {/* Large, prominent search input */}
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          id="warehouse-search"
          placeholder="Search by barcode, batch number, or product type…"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          aria-label="Search finished products"
          className="h-14 rounded-xl border-input bg-white pl-12 text-base shadow-sm focus-visible:border-gold focus-visible:ring-4 focus-visible:ring-gold/20"
        />
      </div>

      {/* Row count */}
      <p className="text-sm text-muted-foreground">
        {isLoading ? "Loading…" : `${data?.length ?? 0} products`}
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

      {/* Empty state — search returned nothing */}
      {!isLoading && !error && (data?.length ?? 0) === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-white/60 px-6 py-14 text-center">
          <PackageSearch className="size-8 text-muted-foreground/60" aria-hidden />
          <p className="text-sm text-muted-foreground">
            {search
              ? `No products found for “${search}”.`
              : "No products found. Finished goods you add to stock will appear here."}
          </p>
        </div>
      )}

      {/* Results table */}
      {!isLoading && !error && (data?.length ?? 0) > 0 && (
        <div className="overflow-hidden rounded-xl border border-border bg-white shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead className="h-11 pl-6 text-xs font-semibold uppercase tracking-wider text-charcoal">
                  Product / batch number
                </TableHead>
                <TableHead className="h-11 text-xs font-semibold uppercase tracking-wider text-charcoal">
                  Quantity
                </TableHead>
                <TableHead className="h-11 text-xs font-semibold uppercase tracking-wider text-charcoal">
                  Storage location
                </TableHead>
                <TableHead className="h-11 pr-6 text-right text-xs font-semibold uppercase tracking-wider text-charcoal">
                  Date added
                </TableHead>
                <TableHead className="h-11 pr-6 text-right text-xs font-semibold uppercase tracking-wider text-charcoal">
                  Status
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.map((product) => (
                <TableRow key={product.id} className="hover:bg-gold/6">
                  <TableCell className="py-3.5 pl-6">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-mono text-sm font-semibold text-charcoal">
                        {product.barcode}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {product.productType} ·{" "}
                        <span className="font-mono">{product.batchNumber}</span>
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="py-3.5 font-mono text-charcoal">
                    {product.quantity} pcs
                  </TableCell>
                  <TableCell className="py-3.5 text-charcoal">
                    {product.storageLocation}
                  </TableCell>
                  <TableCell className="py-3.5 pr-6 text-right text-charcoal">
                    {formatDate(product.dateAdded)}
                  </TableCell>
                  <TableCell className="py-3.5 pr-6 text-right">
                    <StatusBadge status={product.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
