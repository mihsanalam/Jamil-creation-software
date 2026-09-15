/**
 * Sequential document numbers — the trickiest logic in the app, extracted into
 * pure functions so it can be unit tested without a database (Tier 4).
 *
 * Fabric batches and sales invoices share one shape:
 *
 *     <PREFIX>-<year>-<4-digit sequence>      FB-2026-0001   INV-2026-0007
 *
 * The APIs generate the next number inside a transaction: they lock the rows
 * for the current year, read the highest existing sequence, and increment it.
 * Both call these helpers so the API and the tests can never drift apart.
 */

/** Zero-padding width of the sequence part ("0001"). */
export const SEQUENCE_PADDING = 4;

/** Prefix for fabric batch numbers for a given year, e.g. "FB-2026-". */
export function batchNumberPrefix(year: number): string {
  return `FB-${year}-`;
}

/** Prefix for sales invoice numbers for a given year, e.g. "INV-2026-". */
export function invoiceNumberPrefix(year: number): string {
  return `INV-${year}-`;
}

/**
 * Reads the numeric sequence out of an existing document number.
 *
 * Returns 0 when there is nothing usable to increment — a missing value, an
 * empty string, a number from a different year (the prefix carries the year),
 * or a suffix that does not start with a digit. 0 means "start at 0001".
 *
 * The suffix is read with a leading-digit match rather than a strict
 * `/^\d+$/` so a legacy row with trailing junk (e.g. "FB-2026-0007-x") still
 * yields 7 instead of resetting the counter to 1, which would collide with
 * numbers that already exist.
 */
export function sequenceFromNumber(
  value: string | null | undefined,
  prefix: string
): number {
  if (typeof value !== "string" || !value.startsWith(prefix)) return 0;

  const match = value.slice(prefix.length).match(/^\d+/);
  if (!match) return 0;

  const parsed = Number.parseInt(match[0], 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

/** Formats a sequence value, zero-padded to 4 digits: 7 -> "0007". */
export function formatSequence(sequence: number): string {
  const safe = Number.isFinite(sequence) && sequence > 0 ? Math.floor(sequence) : 0;
  return String(safe).padStart(SEQUENCE_PADDING, "0");
}

/**
 * Next number in a series: one past `lastNumber`, or the first number when
 * nothing exists for the year yet.
 *
 *   nextNumber("FB-2026-", null)          -> "FB-2026-0001"
 *   nextNumber("FB-2026-", "FB-2026-0009")-> "FB-2026-0010"
 */
export function nextNumber(
  prefix: string,
  lastNumber: string | null | undefined
): string {
  return `${prefix}${formatSequence(sequenceFromNumber(lastNumber, prefix) + 1)}`;
}