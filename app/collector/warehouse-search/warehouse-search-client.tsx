"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import useSWR from "swr";
import { ImagePlus, PackageSearch, Search } from "lucide-react";

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
import { useLanguage } from "@/lib/i18n";
import { FinishedProductPhotoDialog } from "@/components/shared/finished-product-photo-dialog";

// A finished product row from GET /api/finished-products.
export interface FinishedProduct {
  id: string;
  workOrderId: string;
  barcode: string;
  quantity: number;
  quantityRemaining: number;
  storageLocation: string;
  branch: string;
  imageUrl: string | null;
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
  const { t } = useLanguage();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  // Optional branch filter (#30) — applied client-side over the loaded rows;
  // "all" shows every branch.
  const [branchFilter, setBranchFilter] = useState("all");
  const [selectedProduct, setSelectedProduct] =
    useState<FinishedProduct | null>(null);

  // Debounce the search box (~300ms) so typing doesn't fire a request per
  // keystroke; only update the actual query after the user pauses.
  useEffect(() => {
    const timeout = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(timeout);
  }, [searchInput]);

  const query = new URLSearchParams();
  if (search) query.set("search", search);

  const { data, error, isLoading, mutate } = useSWR<FinishedProduct[]>(
    `/api/finished-products?${query.toString()}`,
    fetcher,
    { refreshInterval: 15000, keepPreviousData: true }
  );

  // Distinct branch names for the filter dropdown, from the loaded rows.
  const branches = Array.from(
    new Set((data ?? []).map((product) => product.branch))
  ).sort((a, b) => a.localeCompare(b));

  // Rows after the optional branch filter.
  const visibleProducts =
    data && branchFilter !== "all"
      ? data.filter((product) => product.branch === branchFilter)
      : data;

  // A photo add/change/remove from the dialog updates the row in place.
  function handleProductUpdated(updated: { id: string; imageUrl: string | null }) {
    if (selectedProduct && selectedProduct.id === updated.id) {
      setSelectedProduct({ ...selectedProduct, imageUrl: updated.imageUrl });
    }
    void mutate();
  }

  return (
    <div className="space-y-5">
      {/* Search + branch filter row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            id="warehouse-search"
            placeholder={t("Search by barcode, batch number, or product type…")}
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            aria-label={t("Search finished products")}
            className="h-14 rounded-xl border-input bg-white pl-12 text-base shadow-sm focus-visible:border-gold focus-visible:ring-4 focus-visible:ring-gold/20"
          />
        </div>

        {/* Branch filter (#30) — options come from the loaded stock */}
        <select
          value={branchFilter}
          onChange={(event) => setBranchFilter(event.target.value)}
          aria-label={t("Filter by branch")}
          className="h-12 shrink-0 rounded-xl border border-input bg-white px-3 text-sm text-charcoal shadow-sm focus-visible:border-gold focus-visible:ring-4 focus-visible:ring-gold/20 sm:self-center"
        >
          <option value="all">{t("All branches")}</option>
          {branches.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>

      {/* Row count */}
      <p className="text-sm text-muted-foreground">
        {isLoading
          ? t("Loading…")
          : `${visibleProducts?.length ?? 0} ${t("products")}`}
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
              ? `${t("No products found for")} “${search}”.`
              : t("No products found. Finished goods you add to stock will appear here.")}
          </p>
        </div>
      )}

      {/* Results table */}
      {!isLoading && !error && (data?.length ?? 0) > 0 && (
        <div className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead className="h-11 pl-6 text-xs font-semibold uppercase tracking-wider text-charcoal">
                  {t("Photo")}
                </TableHead>
                <TableHead className="h-11 text-xs font-semibold uppercase tracking-wider text-charcoal">
                  {t("Product / batch number")}
                </TableHead>
                <TableHead className="h-11 text-xs font-semibold uppercase tracking-wider text-charcoal">
                  {t("Quantity")}
                </TableHead>
                <TableHead className="h-11 text-xs font-semibold uppercase tracking-wider text-charcoal">
                  {t("Branch")}
                </TableHead>
                <TableHead className="h-11 text-xs font-semibold uppercase tracking-wider text-charcoal">
                  {t("Storage location")}
                </TableHead>
                <TableHead className="h-11 pr-6 text-right text-xs font-semibold uppercase tracking-wider text-charcoal">
                  {t("Date added")}
                </TableHead>
                <TableHead className="h-11 pr-6 text-right text-xs font-semibold uppercase tracking-wider text-charcoal">
                  {t("Status")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleProducts?.map((product) => (
                <TableRow
                  key={product.id}
                  onClick={() => setSelectedProduct(product)}
                  title={`${t("Manage photo of")} ${product.barcode}`}
                  className="cursor-pointer hover:bg-gold/6"
                >
                  <TableCell className="py-3.5 pl-6">
                    {product.imageUrl ? (
                      <Image
                        src={product.imageUrl}
                        alt={`Garment photo for ${product.barcode}`}
                        width={48}
                        height={48}
                        className="size-12 rounded-lg border border-border object-cover"
                      />
                    ) : (
                      <span
                        className="grid size-12 place-items-center rounded-lg border border-dashed border-border bg-muted/40 text-muted-foreground"
                        aria-label={t("No garment photo")}
                      >
                        <ImagePlus className="size-5" aria-hidden />
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="py-3.5">
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
                    {product.quantityRemaining} {t("pcs")}
                  </TableCell>
                  <TableCell className="py-3.5 text-charcoal">
                    {product.branch}
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

      {/* Photo manager — add/change/remove the garment photo */}
      <FinishedProductPhotoDialog
        product={selectedProduct}
        onClose={() => setSelectedProduct(null)}
        onUpdated={handleProductUpdated}
      />
    </div>
  );
}
