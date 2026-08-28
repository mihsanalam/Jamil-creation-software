"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Eye, Plus, Search, ShoppingCart } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

// A client row from GET /api/clients (includes the computed purchase stats).
export interface Client {
  id: string;
  name: string;
  phone: string;
  address: string | null;
  type: string;
  createdAt: string;
  totalPurchased: number;
  outstandingDue: number;
}

// SWR fetcher — throws on non-2xx so isLoading/error behave predictably.
async function fetcher(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.message ?? "Failed to load clients");
  }
  return response.json() as Promise<Client[]>;
}

const TYPE_FILTERS = [
  { value: "all", label: "All" },
  { value: "WHOLESALE", label: "Wholesale" },
  { value: "RETAIL", label: "Retail" },
] as const;

const EMPTY_FORM = { name: "", phone: "", address: "", type: "RETAIL" };

// Gold pill for wholesale, muted for retail — mirrors StatusBadge styling.
function TypeBadge({ type }: { type: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        type === "WHOLESALE"
          ? "border-gold bg-gold/15 text-charcoal"
          : "border-border bg-muted text-muted-foreground"
      )}
    >
      {type === "WHOLESALE" ? "Wholesale" : "Retail"}
    </Badge>
  );
}

function formatMoney(value: number) {
  return `৳${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function ClientsClient() {
  const [type, setType] = useState<string>("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Debounce the search box so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const timeout = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(timeout);
  }, [searchInput]);

  const query = new URLSearchParams();
  if (type !== "all") query.set("type", type);
  if (search) query.set("search", search);

  const { data, error, isLoading, mutate } = useSWR<Client[]>(
    `/api/clients?${query.toString()}`,
    fetcher,
    { refreshInterval: 15000, keepPreviousData: true }
  );

  // POST the new client, then refresh the list.
  async function handleAddClient(event: FormEvent) {
    event.preventDefault();
    if (form.name.trim() === "" || form.phone.trim() === "") {
      toast.error("Name and phone are required.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          phone: form.phone.trim(),
          address: form.address.trim(),
          type: form.type,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(payload?.message ?? "Could not create the client.");
        return;
      }

      toast.success(`Client "${payload.name}" added.`);
      setAddOpen(false);
      setForm(EMPTY_FORM);
      mutate();
    } catch {
      toast.error("Could not reach the server. Please check your connection.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Header + Add client */}
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-semibold tracking-tight text-charcoal md:text-4xl">
            Clients
          </h1>
          <p className="text-sm text-muted-foreground">
            Wholesale and retail customers, their purchases and outstanding dues.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => setAddOpen(true)}
          className="h-11 shrink-0 rounded-lg bg-gold px-6 text-sm font-semibold text-charcoal shadow-sm transition-all hover:bg-gold/90 active:scale-[0.99]"
        >
          <Plus className="size-4" aria-hidden />
          Add client
        </Button>
      </header>

      {/* Filter pills + search */}
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-white p-4 shadow-sm md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-2">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Type
          </Label>
          <div className="flex flex-wrap gap-2">
            {TYPE_FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                onClick={() => setType(filter.value)}
                aria-pressed={type === filter.value}
                className={cn(
                  "rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
                  type === filter.value
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
          <Label
            htmlFor="client-search"
            className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
          >
            Search
          </Label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              id="client-search"
              placeholder="Client name"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              className="h-10 rounded-lg border-input bg-white pl-9 text-base focus-visible:border-gold focus-visible:ring-4 focus-visible:ring-gold/20"
            />
          </div>
        </div>
      </div>

      {/* Row count */}
      <p className="text-sm text-muted-foreground">
        {isLoading ? "Loading…" : `${data?.length ?? 0} clients`}
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
          {search || type !== "all"
            ? "No clients match the current filters."
            : "No clients yet. Add your first client to start selling."}
        </div>
      )}

      {/* Clients table */}
      {!isLoading && !error && (data?.length ?? 0) > 0 && (
        <div className="overflow-hidden rounded-xl border border-border bg-white shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead className="h-11 pl-6 text-xs font-semibold uppercase tracking-wider text-charcoal">
                  Client name
                </TableHead>
                <TableHead className="h-11 text-xs font-semibold uppercase tracking-wider text-charcoal">
                  Type
                </TableHead>
                <TableHead className="h-11 text-xs font-semibold uppercase tracking-wider text-charcoal">
                  Phone
                </TableHead>
                <TableHead className="h-11 text-xs font-semibold uppercase tracking-wider text-charcoal">
                  Total purchased
                </TableHead>
                <TableHead className="h-11 text-xs font-semibold uppercase tracking-wider text-charcoal">
                  Outstanding due
                </TableHead>
                <TableHead className="h-11 pr-6 text-right text-xs font-semibold uppercase tracking-wider text-charcoal">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.map((client) => (
                <TableRow key={client.id} className="hover:bg-gold/[0.06]">
                  <TableCell className="py-3.5 pl-6 text-sm font-medium text-charcoal">
                    {client.name}
                  </TableCell>
                  <TableCell className="py-3.5">
                    <TypeBadge type={client.type} />
                  </TableCell>
                  <TableCell className="py-3.5 font-mono text-sm text-charcoal">
                    {client.phone}
                  </TableCell>
                  <TableCell className="py-3.5 font-mono text-sm text-charcoal">
                    {formatMoney(client.totalPurchased)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "py-3.5 font-mono text-sm",
                      client.outstandingDue > 0
                        ? "font-semibold text-rust"
                        : "text-muted-foreground"
                    )}
                  >
                    {client.outstandingDue > 0
                      ? formatMoney(client.outstandingDue)
                      : "—"}
                  </TableCell>
                  <TableCell className="py-3.5 pr-6 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/operator/pos/due-collection?clientId=${client.id}`}
                        aria-label={`View dues of ${client.name}`}
                        title="View dues"
                        className="inline-flex size-8 items-center justify-center rounded-lg border border-border bg-white text-muted-foreground transition-colors hover:border-gold hover:text-charcoal focus-visible:border-gold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-gold/20"
                      >
                        <Eye className="size-4" aria-hidden />
                      </Link>
                      <Link
                        href={`/operator/pos/new-sale?client=${client.id}`}
                        aria-label={`Start a new sale for ${client.name}`}
                        title="New sale"
                        className="inline-flex size-8 items-center justify-center rounded-lg border border-border bg-white text-muted-foreground transition-colors hover:border-gold hover:text-charcoal focus-visible:border-gold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-gold/20"
                      >
                        <ShoppingCart className="size-4" aria-hidden />
                      </Link>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}


      {/* Add client dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="w-full max-w-md gap-0 rounded-xl p-0">
          <div className="border-b border-border bg-cream px-6 py-4">
            <DialogHeader className="gap-1 text-left">
              <DialogTitle className="text-lg font-semibold text-charcoal">
                Add client
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                Create a new wholesale or retail customer.
              </DialogDescription>
            </DialogHeader>
          </div>

          <form onSubmit={handleAddClient} className="space-y-4 px-6 py-5">
            <div className="flex flex-col gap-2">
              <Label htmlFor="client-name" className="text-sm font-semibold text-charcoal">
                Name
              </Label>
              <Input
                id="client-name"
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
                placeholder="e.g. Rahman Textiles"
                required
                className="h-10 rounded-lg border-input bg-white px-3 text-sm focus-visible:border-gold focus-visible:ring-4 focus-visible:ring-gold/20"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="client-phone" className="text-sm font-semibold text-charcoal">
                Phone
              </Label>
              <Input
                id="client-phone"
                value={form.phone}
                onChange={(event) =>
                  setForm({ ...form, phone: event.target.value })
                }
                placeholder="e.g. 01712345678"
                required
                className="h-10 rounded-lg border-input bg-white px-3 text-sm focus-visible:border-gold focus-visible:ring-4 focus-visible:ring-gold/20"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="client-address" className="text-sm font-semibold text-charcoal">
                Address <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="client-address"
                value={form.address}
                onChange={(event) =>
                  setForm({ ...form, address: event.target.value })
                }
                placeholder="e.g. Keraniganj, Dhaka"
                className="h-10 rounded-lg border-input bg-white px-3 text-sm focus-visible:border-gold focus-visible:ring-4 focus-visible:ring-gold/20"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label className="text-sm font-semibold text-charcoal">Type</Label>
              <div className="flex gap-2">
                {TYPE_FILTERS.filter((f) => f.value !== "all").map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setForm({ ...form, type: option.value })}
                    aria-pressed={form.type === option.value}
                    className={cn(
                      "rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
                      form.type === option.value
                        ? "border-gold bg-gold text-charcoal"
                        : "border-border bg-white text-muted-foreground hover:border-gold hover:text-charcoal"
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-border pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setAddOpen(false)}
                disabled={isSubmitting}
                className="h-10 rounded-lg border border-border bg-white px-4 text-sm font-semibold text-charcoal transition-colors hover:border-gold hover:bg-gold/5"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="h-10 rounded-lg bg-gold px-6 text-sm font-semibold text-charcoal shadow-sm transition-all hover:bg-gold/90 active:scale-[0.99] disabled:opacity-50"
              >
                Add client
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

    </div>
  );
}
