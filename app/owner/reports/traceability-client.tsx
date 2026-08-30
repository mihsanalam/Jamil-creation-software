"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import {
  ArrowLeft,
  Check,
  PackageSearch,
  PackageX,
  Search,
  Warehouse,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { cn } from "@/lib/utils";

// One finished product from GET /api/finished-products — the "done batches"
// listing that shows on the page before anything has been selected.
export interface FinishedProductRow {
  id: string;
  workOrderId: string;
  barcode: string;
  quantity: number;
  quantityRemaining: number;
  storageLocation: string;
  status: "IN_STOCK" | "SOLD";
  dateAdded: string;
  batchNumber: string;
  productType: string;
}

// The full trace from GET /api/traceability/[finishedProductId].
export interface ProductTrace {
  product: {
    id: string;
    barcode: string;
    quantity: number;
    quantityRemaining: number;
    status: "IN_STOCK" | "SOLD";
  };
  productType: string;
  batch: {
    batchNumber: string;
    fabricType: string;
    quantity: number;
    unit: string;
    supplier: string;
    dateReceived: string;
  };
  phases: {
    name: string;
    stepOrder: number;
    workerName: string | null;
    status: "PENDING" | "IN_PROGRESS" | "COMPLETED";
    completedAt: string | null;
  }[];
  storage: {
    location: string;
    dateAdded: string;
  };
  sales: {
    invoiceNumber: string;
    clientName: string;
    date: string;
    quantity: number;
    amount: number;
    paymentStatus: string;
  }[];
}

// SWR fetcher — throws on non-2xx so isLoading/error behave predictably.
async function fetcher<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.message ?? "Something went wrong");
  }
  return response.json() as Promise<T>;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatMoney(value: number) {
  return `৳${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// One label/value pair used inside the cards (same style as the batch dialog).
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
export function TraceabilityClient() {
  const [searchInput, setSearchInput] = useState("");
  // Debounced copy of the input so keystrokes don't fire a request each time.
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const timeout = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(timeout);
  }, [searchInput]);

  const query = new URLSearchParams();
  if (search) query.set("search", search);

  // The listing — every finished batch, filtered by the search box.
  const {
    data: products,
    error: listError,
    isLoading: listLoading,
  } = useSWR<FinishedProductRow[]>(
    `/api/finished-products?${query.toString()}`,
    fetcher<FinishedProductRow[]>,
    { refreshInterval: 15000, keepPreviousData: true }
  );

  // The full trace for the selected product.
  const { data: trace, error: traceError, isLoading: traceLoading } =
    useSWR<ProductTrace>(
      selectedId ? `/api/traceability/${selectedId}` : null,
      fetcher<ProductTrace>,
      { keepPreviousData: true }
    );

  function handleSelect(product: FinishedProductRow) {
    setSelectedId(product.id);
    setSearchInput("");
    setSearch("");
  }

  return (
    <div className="space-y-6">
      {/* Search bar — filters the listing below */}
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          id="traceability-search"
          placeholder="Search by barcode, batch number, or product type…"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          aria-label="Search finished products"
          className="h-14 rounded-xl border-input bg-white pl-12 text-base shadow-sm focus-visible:border-gold focus-visible:ring-4 focus-visible:ring-gold/20"
        />
      </div>

      {selectedId ? (
        /* ===== Full trace for the selected product ===== */
        <>
          <button
            type="button"
            onClick={() => setSelectedId(null)}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-charcoal/70 transition-colors hover:text-charcoal"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Back to all batches
          </button>

          {traceError && (
            <div className="flex items-center gap-2 rounded-xl border border-rust/30 bg-rust/10 px-6 py-4 text-sm text-rust">
              <PackageX className="size-4 shrink-0" aria-hidden />
              {traceError.message}
            </div>
          )}

          {traceLoading && (
            <div className="space-y-4">
              <Skeleton className="h-32 w-full rounded-xl" />
              <Skeleton className="h-40 w-full rounded-xl" />
              <div className="grid gap-5 md:grid-cols-2">
                <Skeleton className="h-36 w-full rounded-xl" />
                <Skeleton className="h-36 w-full rounded-xl" />
              </div>
            </div>
          )}

          {!traceLoading && !traceError && trace && (
            <>
              <TraceSummary trace={trace} />
              <TraceStepper trace={trace} />
              <div className="grid gap-5 md:grid-cols-2">
                <StorageCard trace={trace} />
                <SaleCard trace={trace} />
              </div>
            </>
          )}
        </>
      ) : (
        /* ===== Listing of finished batches ===== */
        <>
          {/* Row count */}
          <p className="text-sm text-muted-foreground">
            {listLoading ? "Loading…" : `${products?.length ?? 0} batches`}
          </p>

          {/* Error state */}
          {listError && (
            <div className="rounded-xl border border-rust/30 bg-rust/10 px-6 py-4 text-sm text-rust">
              {listError.message}
            </div>
          )}

          {/* Loading skeleton */}
          {listLoading && (
            <div className="space-y-3 rounded-xl border border-border bg-white p-6 shadow-sm">
              <Skeleton className="h-8 w-full" />
              {[0, 1, 2].map((index) => (
                <Skeleton key={index} className="h-12 w-full" />
              ))}
            </div>
          )}

          {/* Empty state */}
          {!listLoading && !listError && (products?.length ?? 0) === 0 && (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-white/60 px-6 py-14 text-center">
              <PackageSearch className="size-8 text-muted-foreground/60" aria-hidden />
              <p className="text-sm text-muted-foreground">
                {search
                  ? `No batches match “${search}”.`
                  : "No finished batches yet. Finished goods that have come into stock will appear here."}
              </p>
            </div>
          )}

          {/* Batches table — click any row to open its trace */}
          {!listLoading && !listError && (products?.length ?? 0) > 0 && (
            <div className="overflow-hidden rounded-xl border border-border bg-white shadow-sm">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="h-11 pl-6 text-xs font-semibold uppercase tracking-wider text-charcoal">
                      Product / batch
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
                  {products?.map((product) => (
                    <TableRow
                      key={product.id}
                      onClick={() => handleSelect(product)}
                      title={`View trace of ${product.barcode}`}
                      className="cursor-pointer hover:bg-gold/6"
                    >
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
                        {product.quantityRemaining} pcs
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
        </>
      )}
    </div>
  );
}
/** Summary card — the fabric batch this product came from. */
function TraceSummary({ trace }: { trace: ProductTrace }) {
  return (
    <Card className="bg-white shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <CardTitle className="text-base font-semibold text-charcoal">
          Product summary
        </CardTitle>
        <Badge
          variant="outline"
          className={cn(
            trace.product.status === "SOLD"
              ? "border-rust bg-rust/10 text-rust"
              : "border-green-600/30 bg-green-50 text-green-800"
          )}
        >
          {trace.product.status === "SOLD" ? "Sold" : "In stock"}
        </Badge>
      </CardHeader>
      <CardContent className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
        <DetailRow label="Batch number" value={trace.batch.batchNumber} mono />
        <DetailRow label="Product type" value={trace.productType} />
        <DetailRow
          label="Fabric"
          value={`${trace.batch.fabricType} · ${trace.batch.quantity} ${trace.batch.unit}`}
        />
        <DetailRow label="Supplier" value={trace.batch.supplier} />
        <DetailRow label="Date received" value={formatDate(trace.batch.dateReceived)} />
        <DetailRow label="Barcode" value={trace.product.barcode} mono />
        <DetailRow
          label="Quantity remaining"
          value={`${trace.product.quantityRemaining} pcs`}
          mono
        />
      </CardContent>
    </Card>
  );
}

/** Horizontal stepper: Fabric in → each phase → Warehouse → Sold (if applicable). */
function TraceStepper({ trace }: { trace: ProductTrace }) {
  const steps: {
    key: string;
    label: string;
    meta: string;
    completed: boolean;
  }[] = [
    {
      key: "fabric",
      label: "Fabric in",
      meta: formatDate(trace.batch.dateReceived),
      completed: true,
    },
    ...trace.phases.map((phase) => ({
      key: `phase-${phase.stepOrder}`,
      label: phase.name,
      meta:
        phase.status === "COMPLETED" && phase.completedAt
          ? `${phase.workerName ?? "Worker"} · ${formatDate(phase.completedAt)}`
          : phase.status === "IN_PROGRESS"
            ? "In progress"
            : "Pending",
      completed: phase.status === "COMPLETED",
    })),
    {
      key: "warehouse",
      label: "Warehouse",
      meta: formatDate(trace.storage.dateAdded),
      completed: true,
    },
    {
      key: "sold",
      label:
        trace.sales.length > 0
          ? trace.product.status === "SOLD"
            ? "Sold"
            : "Partially sold"
          : "Awaiting sale",
      meta:
        trace.sales.length > 0
          ? `${trace.sales[0].clientName} · ${formatDate(trace.sales[0].date)}`
          : "In stock",
      completed: trace.product.status === "SOLD",
    },
  ];

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
      <ol className="flex min-w-max items-start px-6 py-6">
        {steps.map((step, index) => (
          <li key={step.key} className="flex items-start">
            <div className="flex w-28 flex-col items-center">
              <div
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-full border-2",
                  step.completed
                    ? "border-gold bg-gold text-charcoal"
                    : "border-border bg-muted text-muted-foreground"
                )}
              >
                {step.completed ? (
                  <Check className="size-4" aria-hidden />
                ) : (
                  <span className="size-2 rounded-full bg-muted-foreground/40" />
                )}
              </div>
              <p
                className={cn(
                  "mt-2 text-center text-sm font-semibold leading-tight",
                  step.completed ? "text-charcoal" : "text-muted-foreground"
                )}
              >
                {step.label}
              </p>
              <p className="mt-0.5 text-center text-xs leading-snug text-muted-foreground">
                {step.meta}
              </p>
            </div>

            {index < steps.length - 1 && (
              <div
                className={cn(
                  "mt-4.25 h-0.5 w-8 flex-none",
                  steps[index].completed && steps[index + 1].completed
                    ? "bg-gold"
                    : "bg-border"
                )}
              />
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
/** Storage card — where the product sits now and when it arrived. */
function StorageCard({ trace }: { trace: ProductTrace }) {
  return (
    <Card className="bg-white shadow-sm">
      <CardHeader className="flex flex-row items-center gap-2">
        <Warehouse className="size-4 text-muted-foreground" aria-hidden />
        <CardTitle className="text-base font-semibold text-charcoal">
          Storage
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <DetailRow
          label="Storage location"
          value={trace.storage.location}
          mono
        />
        <DetailRow label="Date added" value={formatDate(trace.storage.dateAdded)} />
      </CardContent>
    </Card>
  );
}

/** Sale card — every sale the lot has been part of. A partial lot can appear
 * in several sales, so each sale gets its own entry with the units sold. */
function SaleCard({ trace }: { trace: ProductTrace }) {
  return (
    <Card className="bg-white shadow-sm">
      <CardHeader>
        <CardTitle className="text-base font-semibold text-charcoal">
          Sale details
        </CardTitle>
      </CardHeader>
      <CardContent>
        {trace.sales.length > 0 ? (
          <div className="flex flex-col gap-3">
            {trace.sales.map((sale) => (
              <div
                key={sale.invoiceNumber}
                className="flex flex-col gap-3 rounded-lg border border-border bg-muted/20 p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <DetailRow label="Invoice" value={sale.invoiceNumber} mono />
                  <DetailRow
                    label="Quantity sold"
                    value={`${sale.quantity} pcs`}
                    mono
                  />
                </div>
                <DetailRow label="Client" value={sale.clientName} />
                <DetailRow
                  label="Amount"
                  value={formatMoney(sale.amount)}
                  mono
                />
                <div className="flex items-center gap-2">
                  <StatusBadge status={sale.paymentStatus} />
                  <span className="text-xs text-muted-foreground">
                    {formatDate(sale.date)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
            <PackageX className="size-4 shrink-0" aria-hidden />
            Not yet sold — still in stock.
          </p>
        )}
      </CardContent>
    </Card>
  );
}