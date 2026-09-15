import { describe, expect, it } from "vitest";

import {
  computeSaleTotals,
  derivePaymentStatus,
  lineTotal,
  round2,
} from "./sales-totals";

/**
 * Sales totals decide what the customer is charged and what the shop is owed,
 * so they are the second thing worth pinning down with tests. The service
 * bill already relied on these numbers agreeing between the POS preview
 * (new-sale-client.tsx) and the stored sale (POST /api/sales).
 */
describe("round2", () => {
  it("rounds to two decimals", () => {
    expect(round2(12.345)).toBe(12.35);
    expect(round2(12.344)).toBe(12.34);
  });

  it("cleans up floating point noise", () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(1.1 * 3)).toBe(3.3);
  });

  it("leaves whole numbers alone", () => {
    expect(round2(250)).toBe(250);
    expect(round2(0)).toBe(0);
  });
});

describe("lineTotal", () => {
  it("multiplies quantity by unit price", () => {
    expect(lineTotal(3, 120)).toBe(360);
  });

  it("rounds the line, not just the final total", () => {
    // 3 × 33.333 = 99.999 -> 100.00
    expect(lineTotal(3, 33.333)).toBe(100);
  });

  it("handles fractional quantities (e.g. a part lot)", () => {
    expect(lineTotal(0.5, 200)).toBe(100);
  });
});

describe("computeSaleTotals", () => {
  it("sums the lines", () => {
    const totals = computeSaleTotals(
      [
        { quantity: 2, unitPrice: 120.5 },
        { quantity: 1, unitPrice: 59 },
      ],
      0
    );
    expect(totals.subtotal).toBe(300);
    expect(totals.total).toBe(300);
  });

  it("returns zero for an empty cart", () => {
    expect(computeSaleTotals([], 0)).toEqual({ subtotal: 0, total: 0 });
  });

  it("subtracts the discount from the subtotal", () => {
    const totals = computeSaleTotals([{ quantity: 2, unitPrice: 500 }], 150);
    expect(totals.subtotal).toBe(1000);
    expect(totals.total).toBe(850);
  });

  it("never returns a negative total (discount larger than the cart)", () => {
    const totals = computeSaleTotals([{ quantity: 1, unitPrice: 100 }], 500);
    expect(totals.subtotal).toBe(100);
    expect(totals.total).toBe(0);
  });

  it("a full discount makes the sale free, not negative", () => {
    const totals = computeSaleTotals([{ quantity: 3, unitPrice: 99.99 }], 299.97);
    expect(totals.total).toBe(0);
  });

  it("rounds the subtotal and the total to paisa", () => {
    // 3 × 0.1 = 0.30000000000000004 without rounding
    const totals = computeSaleTotals([{ quantity: 3, unitPrice: 0.1 }], 0.05);
    expect(totals.subtotal).toBe(0.3);
    expect(totals.total).toBe(0.25);
  });
});

describe("derivePaymentStatus", () => {
  it("is PAID when the total is covered", () => {
    expect(derivePaymentStatus(500, 500)).toBe("PAID");
  });

  it("is PAID when the customer pays more than the total", () => {
    expect(derivePaymentStatus(600, 500)).toBe("PAID");
  });

  it("is PARTIAL when something was paid but less than the total", () => {
    expect(derivePaymentStatus(200, 500)).toBe("PARTIAL");
  });

  it("is DUE when nothing was paid", () => {
    expect(derivePaymentStatus(0, 500)).toBe("DUE");
  });

  it("treats a fully-discounted sale as PAID", () => {
    // total 0 and paid 0 — there is nothing left to collect.
    expect(derivePaymentStatus(0, 0)).toBe("PAID");
  });
});