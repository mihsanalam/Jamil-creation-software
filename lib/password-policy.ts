/**
 * Password rules (Tier 4) — kept in their own database-free module so the
 * API route and the client dialog quote the exact same number.
 */

/** Minimum length for a password a user sets for themselves. */
export const MIN_PASSWORD_LENGTH = 8;
