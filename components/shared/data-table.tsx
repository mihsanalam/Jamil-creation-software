"use client";

import { useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useLanguage } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export type SortDirection = "asc" | "desc";

export interface DataTableColumn<T> {
  /** Stable key — also used as the sort key. */
  key: string;
  /** Already-translated column header text. */
  header: string;
  /** Hide the header text visually (use for action-button columns). */
  hideHeader?: boolean;
  /** Right-align the header and all cells of this column. */
  align?: "right";
  /** Extra classes on the header cell. */
  headerClassName?: string;
  /** Extra classes on every body cell of this column. */
  cellClassName?: string;
  /** Custom cell content; defaults to the raw row value. */
  renderCell?: (row: T) => ReactNode;
  /** Column can be sorted. */
  sortable?: boolean;
  /** Value used for client-side sorting; defaults to row[key]. */
  getSortValue?: (row: T) => string | number | null;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  /** Builds the DOM key — must be unique per row. */
  rowKey: (row: T) => string;
  /**
   * Sorting mode. When provided, sorting is server-driven: the component
   * renders the active arrow from `sortBy`/`sortDir` and reports header
   * clicks through this callback. Without it, clicking a sortable header
   * sorts the current `rows` client-side and keeps its own state.
   */
  onSortChange?: (key: string, dir: SortDirection) => void;
  /** Active sort column (used together with onSortChange). */
  sortBy?: string;
  /** Active sort direction (used together with onSortChange). */
  sortDir?: SortDirection;
  /** Initial client-side sort column when onSortChange is absent. */
  defaultSortBy?: string;
  /** Initial client-side sort direction when onSortChange is absent. */
  defaultSortDir?: SortDirection;
}

// Compare two raw sort values — numbers numerically, everything else as text.
function compareSortValues(
  a: string | number | null | undefined,
  b: string | number | null | undefined
): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  const left = a === null || a === undefined ? "" : String(a);
  const right = b === null || b === undefined ? "" : String(b);
  return left.localeCompare(right);
}

// Client-side sort — a copy of rows sorted by the active column's sort value.
function sortRows<T>(
  rows: T[],
  columns: DataTableColumn<T>[],
  sortBy: string | undefined,
  sortDir: SortDirection | undefined
): T[] {
  if (!sortBy) return rows;
  const column = columns.find((entry) => entry.key === sortBy);
  if (!column) return rows;

  return [...rows].sort((a, b) => {
    const left = column.getSortValue
      ? column.getSortValue(a)
      : (a[column.key as keyof T] as string | number | null);
    const right = column.getSortValue
      ? column.getSortValue(b)
      : (b[column.key as keyof T] as string | number | null);
    const result = compareSortValues(left, right);
    return sortDir === "desc" ? -result : result;
  });
}

/**
 * Shared data table — the standard list layout used by every screen:
 * sortable headers, per-column cell rendering (status pills, action
 * buttons, formatted money…), loading/empty states handled by the caller.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onSortChange,
  sortBy,
  sortDir,
  defaultSortBy,
  defaultSortDir,
}: DataTableProps<T>) {
  const { t } = useLanguage();

  // Client-side sort state; only used when onSortChange is absent.
  const [localSortBy, setLocalSortBy] = useState(defaultSortBy);
  const [localSortDir, setLocalSortDir] = useState<SortDirection>(
    defaultSortDir ?? "asc"
  );

  const activeSortBy = onSortChange ? sortBy : localSortBy;
  const activeSortDir = onSortChange ? sortDir : localSortDir;

  const visibleRows = onSortChange
    ? rows
    : sortRows(rows, columns, activeSortBy, activeSortDir);

  function handleHeaderClick(column: DataTableColumn<T>) {
    // First click on a new column sorts ascending; clicking again flips.
    const nextDir: SortDirection =
      activeSortBy === column.key && activeSortDir === "asc" ? "desc" : "asc";
    if (onSortChange) {
      onSortChange(column.key, nextDir);
    } else {
      setLocalSortBy(column.key);
      setLocalSortDir(nextDir);
    }
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50 hover:bg-muted/50">
            {columns.map((column, index) => (
              <TableHead
                key={column.key}
                aria-sort={
                  activeSortBy === column.key
                    ? activeSortDir === "asc" ? "ascending" : "descending"
                    : undefined
                }
                className={cn(
                  "h-11 text-xs font-semibold uppercase tracking-wider text-charcoal",
                  index === 0 && "pl-6",
                  column.align === "right" && "pr-6 text-right",
                  column.headerClassName
                )}
              >
                {column.sortable ? (
                  <button
                    type="button"
                    onClick={() => handleHeaderClick(column)}
                    aria-label={
                      activeSortBy === column.key
                        ? `${column.header} ${t(
                            activeSortDir === "asc"
                              ? "sorted ascending"
                              : "sorted descending"
                          )}`
                        : `${t("Sort by")} ${column.header}`
                    }
                    className="inline-flex h-auto w-full items-center justify-between gap-1.5 text-charcoal transition-colors hover:text-gold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-gold/20"
                  >
                    <span className={cn(column.hideHeader && "sr-only")}>
                      {column.header}
                    </span>
                    {activeSortBy === column.key ? (
                      activeSortDir === "asc" ? (
                        <ArrowUp className="size-3.5 shrink-0" aria-hidden />
                      ) : (
                        <ArrowDown className="size-3.5 shrink-0" aria-hidden />
                      )
                    ) : (
                      <ArrowUpDown
                        className="size-3.5 shrink-0 text-muted-foreground/60"
                        aria-hidden
                      />
                    )}
                  </button>
                ) : (
                  <span className={cn(column.hideHeader && "sr-only")}>
                    {column.header}
                  </span>
                )}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {visibleRows.map((row) => (
            <TableRow key={rowKey(row)} className="hover:bg-gold/6">
              {columns.map((column, index) => (
                <TableCell
                  key={column.key}
                  className={cn(
                    "py-3.5",
                    index === 0 && "pl-6",
                    index === columns.length - 1 && "pr-6",
                    column.align === "right" && "text-right",
                    column.cellClassName
                  )}
                >
                  {column.renderCell
                    ? column.renderCell(row)
                    : (row[column.key as keyof T] as string | null) ?? "—"}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}