"use client";

import { useState } from "react";
import useSWR from "swr";
import { History } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// One audit row from GET /api/audit-logs.
interface AuditEntry {
  id: string;
  actorId: string | null;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
}

// SWR fetcher — throws on non-2xx so isLoading/error behave predictably.
async function fetcher(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.message ?? "Failed to load the audit log");
  }
  return response.json() as Promise<AuditEntry[]>;
}

// The entity types the API writes today — used for the filter dropdown.
const ENTITY_FILTERS = [
  { value: "all", label: "Everything" },
  { value: "work_order_phase", label: "Phases" },
  { value: "user", label: "Users" },
  { value: "fabric_batch", label: "Batches" },
  { value: "sale", label: "Sales" },
  { value: "payment", label: "Payments" },
  { value: "return", label: "Returns" },
  { value: "return_batch", label: "Return sessions" },
  { value: "client", label: "Clients" },
] as const;

function formatWhen(value: string) {
  return new Date(value).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Danger-colored pill for destructive/undo actions, gold for money events.
function ActionBadge({ action }: { action: string }) {
  const destructive =
    action === "PHASE_UNDO" ||
    action === "PASSWORD_RESET" ||
    action === "USER_UPDATE";
  const money =
    action === "SALE_CREATE" ||
    action === "PAYMENT_RECORD" ||
    action === "RETURN_RECORD" ||
    action === "RETURN_BATCH_RECORD";
  return (
    <Badge
      variant="outline"
      className={cn(
        "font-mono text-[11px]",
        destructive
          ? "border-rust/40 bg-rust/10 text-rust"
          : money
            ? "border-gold bg-gold/15 text-charcoal"
            : "border-charcoal/20 bg-charcoal/5 text-charcoal"
      )}
    >
      {action}
    </Badge>
  );
}

export function AuditLogClient() {
  const [entityType, setEntityType] = useState<string>("all");
  const [action, setAction] = useState("");

  const params = new URLSearchParams({ limit: "150" });
  if (entityType !== "all") params.set("entityType", entityType);
  if (action.trim() !== "") params.set("action", action.trim().toUpperCase());

  // Poll lightly — the audit log is for review, not live ops.
  const { data, error, isLoading } = useSWR<AuditEntry[]>(
    `/api/audit-logs?${params.toString()}`,
    fetcher,
    { refreshInterval: 10_000, keepPreviousData: true }
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 font-serif text-2xl font-bold tracking-tight text-charcoal">
            <History className="size-6 text-gold" aria-hidden />
            Audit Log
          </h1>
          <p className="mt-1 text-sm text-charcoal/60">
            Who changed what, when — phase updates, user edits, money and
            destructive actions.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={entityType}
            onValueChange={(value) => setEntityType(value ?? "all")}
          >
            <SelectTrigger className="w-44 bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ENTITY_FILTERS.map((filter) => (
                <SelectItem key={filter.value} value={filter.value}>
                  {filter.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={action}
            onChange={(event) => setAction(event.target.value)}
            placeholder="Filter by action…"
            className="w-44 bg-white"
          />
          <Button
            variant="outline"
            onClick={() => {
              setEntityType("all");
              setAction("");
            }}
          >
            Reset
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-charcoal/15 bg-white shadow-sm">
        {isLoading ? (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <Skeleton key={index} className="h-9 w-full" />
            ))}
          </div>
        ) : error ? (
          <p role="alert" className="p-6 text-sm text-rust">
            {(error as Error).message}
          </p>
        ) : !data || data.length === 0 ? (
          <p className="p-6 text-sm text-charcoal/60">
            Nothing recorded yet — actions will appear here as they happen.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-charcoal/10 bg-charcoal/5 text-xs uppercase tracking-wider text-charcoal/60">
                  <th className="px-4 py-3 font-semibold">When</th>
                  <th className="px-4 py-3 font-semibold">Who</th>
                  <th className="px-4 py-3 font-semibold">Action</th>
                  <th className="px-4 py-3 font-semibold">Entity</th>
                  <th className="px-4 py-3 font-semibold">Details</th>
                </tr>
              </thead>
              <tbody>
                {data.map((entry) => (
                  <tr
                    key={entry.id}
                    className="border-b border-charcoal/5 last:border-0 hover:bg-cream/60"
                  >
                    <td className="whitespace-nowrap px-4 py-2.5 text-charcoal/70">
                      {formatWhen(entry.createdAt)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 font-medium text-charcoal">
                      {entry.actorName}
                    </td>
                    <td className="px-4 py-2.5">
                      <ActionBadge action={entry.action} />
                    </td>
                    <td className="px-4 py-2.5 text-charcoal/70">
                      {entry.entityType}
                      {entry.entityId ? (
                        <span className="ml-1 font-mono text-[11px] text-charcoal/40">
                          {entry.entityId.slice(0, 8)}…
                        </span>
                      ) : null}
                    </td>
                    <td className="max-w-md truncate px-4 py-2.5 font-mono text-[11px] text-charcoal/60">
                      {entry.details ? JSON.stringify(entry.details) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-charcoal/50">
        Showing the {data?.length ?? 0} most recent entries · refreshes every
        10 seconds
      </p>
    </div>
  );
}
