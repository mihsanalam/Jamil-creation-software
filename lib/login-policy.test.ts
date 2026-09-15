import { describe, expect, it } from "vitest";

import {
  LOCKOUT_MINUTES,
  MAX_FAILED_ATTEMPTS,
  afterFailedAttempt,
  clearedAttempts,
  evaluateLock,
  isLocked,
  lockMinutesLeft,
  lockRemainingMs,
} from "./login-policy";

/**
 * Lockout policy for repeated failed sign-ins (Tier 4, item 20). These are the
 * rules `auth.ts` enforces on every sign-in; getting them wrong either locks
 * out real users or lets a brute-force run through, so the boundaries matter.
 */
const NOW = new Date("2026-09-15T10:00:00.000Z");

function minutesFromNow(minutes: number): Date {
  return new Date(NOW.getTime() + minutes * 60000);
}

describe("constants", () => {
  it("allows a few typos before locking", () => {
    expect(MAX_FAILED_ATTEMPTS).toBeGreaterThanOrEqual(3);
    expect(LOCKOUT_MINUTES).toBeGreaterThan(0);
  });
});

describe("lockRemainingMs / isLocked / lockMinutesLeft", () => {
  it("has no lockout when lockedUntil is null", () => {
    expect(lockRemainingMs(null, NOW)).toBe(0);
    expect(isLocked(null, NOW)).toBe(false);
    expect(lockMinutesLeft(null, NOW)).toBe(0);
  });

  it("reports the time left on a live lockout", () => {
    const until = minutesFromNow(5);
    expect(lockRemainingMs(until, NOW)).toBe(5 * 60000);
    expect(isLocked(until, NOW)).toBe(true);
    expect(lockMinutesLeft(until, NOW)).toBe(5);
  });

  it("treats an already-expired lockout as unlocked", () => {
    const until = new Date(NOW.getTime() - 60000);
    expect(lockRemainingMs(until, NOW)).toBe(0);
    expect(isLocked(until, NOW)).toBe(false);
  });

  it("rounds a partial minute up so the message never says '0 minutes'", () => {
    const until = new Date(NOW.getTime() + 1000); // 1 second left
    expect(lockMinutesLeft(until, NOW)).toBe(1);
  });
});

describe("evaluateLock", () => {
  it("is unlocked with a full set of tries when there is no history", () => {
    expect(evaluateLock(null, NOW)).toMatchObject({
      locked: false,
      minutesLeft: 0,
      failedAttempts: 0,
      attemptsLeft: MAX_FAILED_ATTEMPTS,
    });
  });

  it("counts down the remaining tries", () => {
    const state = evaluateLock(
      { failedAttempts: 3, lockedUntil: null },
      NOW
    );
    expect(state.locked).toBe(false);
    expect(state.failedAttempts).toBe(3);
    expect(state.attemptsLeft).toBe(MAX_FAILED_ATTEMPTS - 3);
  });

  it("never reports negative tries left", () => {
    expect(
      evaluateLock({ failedAttempts: 99, lockedUntil: null }, NOW).attemptsLeft
    ).toBe(0);
  });

  it("reports a live lockout with no tries left", () => {
    const state = evaluateLock(
      { failedAttempts: MAX_FAILED_ATTEMPTS, lockedUntil: minutesFromNow(10) },
      NOW
    );
    expect(state.locked).toBe(true);
    expect(state.minutesLeft).toBe(10);
    expect(state.attemptsLeft).toBe(0);
  });

  it("treats an expired lockout as a fresh window", () => {
    // The counter is reset lazily: once the lockout has run out the user gets
    // the full MAX_FAILED_ATTEMPTS again, matching afterFailedAttempt().
    const state = evaluateLock(
      { failedAttempts: MAX_FAILED_ATTEMPTS, lockedUntil: minutesFromNow(-1) },
      NOW
    );
    expect(state.locked).toBe(false);
    expect(state.failedAttempts).toBe(0);
    expect(state.attemptsLeft).toBe(MAX_FAILED_ATTEMPTS);
  });
});

describe("afterFailedAttempt", () => {
  it("counts the first failure without locking", () => {
    expect(afterFailedAttempt(null, NOW)).toEqual({
      failedAttempts: 1,
      lockedUntil: null,
    });
  });

  it("adds up consecutive failures", () => {
    const state = afterFailedAttempt({ failedAttempts: 3, lockedUntil: null }, NOW);
    expect(state.failedAttempts).toBe(4);
    expect(state.lockedUntil).toBeNull();
  });

  it("locks on the limit-reaching failure, for LOCKOUT_MINUTES", () => {
    const state = afterFailedAttempt(
      { failedAttempts: MAX_FAILED_ATTEMPTS - 1, lockedUntil: null },
      NOW
    );
    expect(state.failedAttempts).toBe(MAX_FAILED_ATTEMPTS);
    expect(state.lockedUntil).toEqual(minutesFromNow(LOCKOUT_MINUTES));
    expect(isLocked(state.lockedUntil, NOW)).toBe(true);
  });

  it("restarts at 1 after an expired lockout", () => {
    const state = afterFailedAttempt(
      { failedAttempts: MAX_FAILED_ATTEMPTS, lockedUntil: minutesFromNow(-1) },
      NOW
    );
    expect(state.failedAttempts).toBe(1);
    expect(state.lockedUntil).toBeNull();
  });

  it("re-locks immediately if failures continue during a lockout", () => {
    // Shouldn't normally happen (a locked email is rejected before the
    // password is compared), but the counter must stay locked, not unlock.
    const state = afterFailedAttempt(
      { failedAttempts: MAX_FAILED_ATTEMPTS, lockedUntil: minutesFromNow(5) },
      NOW
    );
    expect(state.lockedUntil).toEqual(minutesFromNow(LOCKOUT_MINUTES));
    expect(isLocked(state.lockedUntil, NOW)).toBe(true);
  });
});

describe("clearedAttempts", () => {
  it("is the state written after a successful sign-in", () => {
    expect(clearedAttempts()).toEqual({ failedAttempts: 0, lockedUntil: null });
  });
});