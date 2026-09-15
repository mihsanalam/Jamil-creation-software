/**
 * Sale money math — shared by the POS screen (which previews the totals while
 * the operator is scanning) and POST /api/sales (which stores them), so what
 * the cashier sees is exactly what gets written (Tier 4 — unit tested).
 */

/** One cart line, in the shape both callers already have. */
export interface SaleLine {
  quantity: number;
  unitPrice: number;
}

/** Payment status stored on the sale row and shown as a pill. */
export type PaymentStatus = "PAID" | "PARTIAL" | "DUE";

export interface SaleTotals {
  /** Sum of every line, rounded to 2 decimals. */
  subtotal: number;
  /** subtotal - discount, never below zero. */
  total: number;
}

/**
 * Rounds to 2 decimal places — the money precision used everywhere in the app.
 * Uses Math.round, matching the API's original behaviour (no banker's
 * rounding surprises on Taka amounts).
 */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** One line's total: quantity × unit price, rounded. */
export function lineTotal(quantity: number, unitPrice: number): number {
  return round2(quantity * unitPrice);
}

/**
 * Subtotal and total for a cart. A discount larger than the subtotal clamps
 * the total at 0 (never a negative sale).
 */
export function computeSaleTotals(
  lines: readonly SaleLine[],
  discount: number
): SaleTotals {
  const subtotal = round2(
    lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0)
  );
  const total = Math.max(round2(subtotal - discount), 0);
  return { subtotal, total };
}

/**
 * Payment status from what was actually paid:
 * - everything (or more) paid  -> PAID
 * - something paid but short    -> PARTIAL
 * - nothing paid                -> DUE
 * A fully-discounted sale (total 0, paid 0) counts as PAID.
 */
export function derivePaymentStatus(
  amountPaid: number,
  total: number
): PaymentStatus {
  if (amountPaid >= total) return "PAID";
  return amountPaid > 0 ? "PARTIAL" : "DUE";
}