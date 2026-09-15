import { describe, expect, it } from "vitest";

import {
  SEQUENCE_PADDING,
  batchNumberPrefix,
  formatSequence,
  invoiceNumberPrefix,
  nextNumber,
  sequenceFromNumber,
} from "./numbering";

/**
 * The batch/invoice number generator is the trickiest logic in the app — two
 * concurrent requests can pick the same number, a year rolls over, and a
 * misparsed suffix would collide with rows that already exist. These tests pin
 * the pure part (parsing + formatting); the DB lock/retry around it lives in
 * app/api/fabric-batches/route.ts and app/api/sales/route.ts.
 */
describe("prefixes", () => {
  it("builds the fabric batch prefix for a year", () => {
    expect(batchNumberPrefix(2026)).toBe("FB-2026-");
  });

  it("builds the sales invoice prefix for a year", () => {
    expect(invoiceNumberPrefix(2026)).toBe("INV-2026-");
  });
});

describe("sequenceFromNumber", () => {
  const prefix = "FB-2026-";

  it("reads the sequence out of an existing number", () => {
    expect(sequenceFromNumber("FB-2026-0007", prefix)).toBe(7);
  });

  it("reads multi-digit sequences", () => {
    expect(sequenceFromNumber("FB-2026-1234", prefix)).toBe(1234);
  });

  it("returns 0 when there is nothing to increment", () => {
    expect(sequenceFromNumber(null, prefix)).toBe(0);
    expect(sequenceFromNumber(undefined, prefix)).toBe(0);
    expect(sequenceFromNumber("", prefix)).toBe(0);
  });

  it("returns 0 for a number from another year", () => {
    // The prefix carries the year, so last year's numbers must NOT be counted
    // — otherwise the counter would carry over and the year would start at,
    // say, FB-2026-0128 instead of FB-2026-0001.
    expect(sequenceFromNumber("FB-2025-0128", prefix)).toBe(0);
    expect(sequenceFromNumber("INV-2026-0128", prefix)).toBe(0);
  });

  it("returns 0 when the suffix does not start with a digit", () => {
    expect(sequenceFromNumber("FB-2026-", prefix)).toBe(0);
    expect(sequenceFromNumber("FB-2026-abc", prefix)).toBe(0);
  });

  it("still reads a suffix with trailing junk instead of resetting to 1", () => {
    // A legacy row like "FB-2026-0007-x" must yield 7: returning 0 here would
    // hand out FB-2026-0001 again and hit the UNIQUE index.
    expect(sequenceFromNumber("FB-2026-0007-x", prefix)).toBe(7);
  });

  it("ignores leading zeros", () => {
    expect(sequenceFromNumber("FB-2026-0001", prefix)).toBe(1);
    expect(sequenceFromNumber("FB-2026-00000042", prefix)).toBe(42);
  });
});

describe("formatSequence", () => {
  it("zero-pads to four digits", () => {
    expect(SEQUENCE_PADDING).toBe(4);
    expect(formatSequence(1)).toBe("0001");
    expect(formatSequence(7)).toBe("0007");
    expect(formatSequence(999)).toBe("0999");
  });

  it("keeps numbers longer than the padding", () => {
    expect(formatSequence(10000)).toBe("10000");
  });

  it("treats 0 / negative / non-finite values as 0000", () => {
    expect(formatSequence(0)).toBe("0000");
    expect(formatSequence(-5)).toBe("0000");
    expect(formatSequence(Number.NaN)).toBe("0000");
  });

  it("floors fractions (a sequence is always a whole number)", () => {
    expect(formatSequence(12.9)).toBe("0012");
  });
});

describe("nextNumber", () => {
  const prefix = "FB-2026-";

  it("starts at 0001 when the year has no batches yet", () => {
    expect(nextNumber(prefix, null)).toBe("FB-2026-0001");
    expect(nextNumber(prefix, undefined)).toBe("FB-2026-0001");
  });

  it("increments the highest existing number by one", () => {
    expect(nextNumber(prefix, "FB-2026-0009")).toBe("FB-2026-0010");
    expect(nextNumber(prefix, "FB-2026-0001")).toBe("FB-2026-0002");
  });

  it("does not carry over from another year", () => {
    expect(nextNumber("FB-2027-", "FB-2026-0042")).toBe("FB-2027-0001");
  });

  it("rolls past 9999 without truncating", () => {
    expect(nextNumber(prefix, "FB-2026-9999")).toBe("FB-2026-10000");
  });

  it("works the same for invoice numbers", () => {
    expect(nextNumber("INV-2026-", "INV-2026-0007")).toBe("INV-2026-0008");
  });
});
