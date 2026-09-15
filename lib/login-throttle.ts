import type { RowDataPacket } from "mysql2/promise";

import { db } from "@/lib/db";
import {
  afterFailedAttempt,
  clearedAttempts,
  evaluateLock,
  type AttemptState,
  type LockState,
} from "@/lib/login-policy";

/**
 * Database side of the brute-force protection (Tier 4).
 *
 * `login_attempts` holds one row per email that has failed at least once:
 * a consecutive-failure counter plus an optional `locked_until` window.
 * The decision logic itself lives in `lib/login-policy.ts`.
 *
 * Every helper here swallows nothing: callers (auth.ts) run inside the
 * Authorize callback, and a database hiccup there must not crash sign-in, so
 * `getLockState` catches and reports "not locked" — failing open for
 * availability — while a failure to *record* an attempt is logged.
 */

interface LoginAttemptRow extends RowDataPacket {
  failed_attempts: number;
  locked_until: Date | null;
}

/** Reads the current lock state for an email. Never throws. */
export async function getLockState(
  email: string,
  now: Date = new Date()
): Promise<LockState> {
  try {
    const [rows] = await db.query<LoginAttemptRow[]>(
      `SELECT failed_attempts, locked_until
       FROM login_attempts
       WHERE email = ?
       LIMIT 1`,
      [email]
    );

    const row = rows[0];
    const state: AttemptState | null = row
      ? {
          failedAttempts: Number(row.failed_attempts),
          lockedUntil: row.locked_until instanceof Date ? row.locked_until : null,
        }
      : null;

    return evaluateLock(state, now);
  } catch (error) {
    // Fail open: a database problem must not lock everyone out of the app.
    console.error("Failed to read login attempts:", error);
    return evaluateLock(null, now);
  }
}

/**
 * Counts one failed sign-in and locks the email when the limit is reached.
 * Returns the resulting state (locked or attempts left) for the caller to
 * decide what to tell the user. Never throws.
 */
export async function recordFailedAttempt(
  email: string,
  now: Date = new Date()
): Promise<LockState> {
  try {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      // Lock the row (if any) so two concurrent attempts can't both read the
      // same counter and write back the same value.
      const [rows] = await connection.query<LoginAttemptRow[]>(
        `SELECT failed_attempts, locked_until
         FROM login_attempts
         WHERE email = ?
         LIMIT 1
         FOR UPDATE`,
        [email]
      );

      const row = rows[0];
      const current: AttemptState | null = row
        ? {
            failedAttempts: Number(row.failed_attempts),
            lockedUntil:
              row.locked_until instanceof Date ? row.locked_until : null,
          }
        : null;

      const next = afterFailedAttempt(current, now);

      await connection.query(
        `INSERT INTO login_attempts
           (email, failed_attempts, locked_until, last_attempt_at)
         VALUES (?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE
           failed_attempts = ?,
           locked_until = ?,
           last_attempt_at = NOW()`,
        [
          email,
          next.failedAttempts,
          next.lockedUntil,
          next.failedAttempts,
          next.lockedUntil,
        ]
      );

      await connection.commit();
      return evaluateLock(next, now);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error("Failed to record login attempt:", error);
    return evaluateLock(null, now);
  }
}

/**
 * Clears the counter after a successful sign-in, so a user who mistyped their
 * password a few times isn't left one mistake away from a lockout.
 */
export async function clearFailedAttempts(email: string): Promise<void> {
  try {
    const cleared = clearedAttempts();
    await db.query(
      `INSERT INTO login_attempts
         (email, failed_attempts, locked_until, last_attempt_at)
       VALUES (?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
         failed_attempts = ?,
         locked_until = ?,
         last_attempt_at = NOW()`,
      [
        email,
        cleared.failedAttempts,
        cleared.lockedUntil,
        cleared.failedAttempts,
        cleared.lockedUntil,
      ]
    );
  } catch (error) {
    console.error("Failed to clear login attempts:", error);
  }
}