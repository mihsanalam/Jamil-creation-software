/**
 * Login lockout policy (Tier 4) — the rules, kept pure and database-free so
 * they can be unit tested and so client code (the login page) can quote the
 * numbers without pulling mysql2 into the browser bundle.
 *
 * The DB side lives in `lib/login-throttle.ts`; `auth.ts` uses both.
 */

/** Failed attempts allowed before the account is temporarily locked. */
export const MAX_FAILED_ATTEMPTS = 5;

/** How long a lockout lasts, in minutes. */
export const LOCKOUT_MINUTES = 15;

/** State of one email's failed-login counter, as read from login_attempts. */
export interface AttemptState {
  failedAttempts: number;
  lockedUntil: Date | null;
}

/** Lock state evaluated against "now". */
export interface LockState {
  locked: boolean;
  /** Whole minutes left on the lockout (0 when not locked). */
  minutesLeft: number;
  /** Failed attempts counted in the current window. */
  failedAttempts: number;
  /** Tries left before the next lockout (0 while locked). */
  attemptsLeft: number;
}

/**
 * Milliseconds a lockout still has to run, or 0 when it has expired / there
 * is no lockout. `lockedUntil` is a Date or null — never a string — so callers
 * must parse MySQL's DATETIME first (mysql2 already returns Dates).
 */
export function lockRemainingMs(
  lockedUntil: Date | null,
  now: Date = new Date()
): number {
  if (!(lockedUntil instanceof Date)) return 0;
  const delta = lockedUntil.getTime() - now.getTime();
  return delta > 0 ? delta : 0;
}

/** True while the email is locked out. */
export function isLocked(
  lockedUntil: Date | null,
  now: Date = new Date()
): boolean {
  return lockRemainingMs(lockedUntil, now) > 0;
}

/** Whole minutes left on a lockout, rounded up (1 minute, not 0, when seconds remain). */
export function lockMinutesLeft(
  lockedUntil: Date | null,
  now: Date = new Date()
): number {
  const ms = lockRemainingMs(lockedUntil, now);
  return ms > 0 ? Math.ceil(ms / 60000) : 0;
}

/**
 * Evaluates a stored counter into a display-friendly lock state.
 *
 * An expired lockout counts as "no lockout and no attempts" — the next failed
 * try starts a fresh window of MAX_FAILED_ATTEMPTS (the row is reset on the
 * next failure).
 */
export function evaluateLock(
  state: AttemptState | null | undefined,
  now: Date = new Date()
): LockState {
  const stored = state?.failedAttempts ?? 0;
  const lockedUntil = state?.lockedUntil ?? null;

  if (isLocked(lockedUntil, now)) {
    return {
      locked: true,
      minutesLeft: lockMinutesLeft(lockedUntil, now),
      failedAttempts: stored,
      attemptsLeft: 0,
    };
  }

  // A set-but-expired lockout means the previous window is over. The counter
  // is reset lazily here (the row itself is rewritten on the next failure by
  // afterFailedAttempt), so the user is told they have a full set of tries
  // again — which is exactly what the next failure will do.
  const failedAttempts = lockedUntil !== null ? 0 : stored;
  const attemptsLeft = Math.max(MAX_FAILED_ATTEMPTS - failedAttempts, 0);
  return { locked: false, minutesLeft: 0, failedAttempts, attemptsLeft };
}

/**
 * The counter state after one more failed attempt: increments the count, and
 * locks the email for LOCKOUT_MINUTES once the limit is reached. An already
 * expired lockout restarts the count at 1.
 */
export function afterFailedAttempt(
  state: AttemptState | null | undefined,
  now: Date = new Date()
): AttemptState {
  const lockedUntil = state?.lockedUntil ?? null;
  // A stale (expired) lockout means the earlier window is over: counting
  // resumes from zero so the user gets a full set of tries again.
  const windowExpired = lockedUntil !== null && lockRemainingMs(lockedUntil, now) === 0;
  const base = windowExpired ? 0 : state?.failedAttempts ?? 0;

  const failedAttempts = base + 1;
  const reachedLimit = failedAttempts >= MAX_FAILED_ATTEMPTS;

  return {
    failedAttempts,
    lockedUntil: reachedLimit
      ? new Date(now.getTime() + LOCKOUT_MINUTES * 60000)
      : null,
  };
}

/** Cleared counter, written after a successful sign-in. */
export function clearedAttempts(): AttemptState {
  return { failedAttempts: 0, lockedUntil: null };
}