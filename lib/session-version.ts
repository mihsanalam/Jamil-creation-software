import type { RowDataPacket } from "mysql2/promise";

import { db } from "@/lib/db";

/**
 * Session invalidation support (Tier 4).
 *
 * JWT sessions can't be revoked on their own — the cookie stays valid until it
 * expires. `users.session_version` fixes that: every password change (by the
 * Owner or by the user themselves) increments it, and `auth.ts` compares the
 * version baked into the token against the database. A mismatch makes the jwt
 * callback return null, which clears the session cookie and signs that user
 * out everywhere.
 *
 * The lookup runs on every request that touches auth(), including the polling
 * APIs, so the result is cached briefly (SESSION_VERSION_CACHE_MS). The cache
 * only ever delays a forced logout by that short window.
 */

/** How long a version lookup is reused, in milliseconds. */
export const SESSION_VERSION_CACHE_MS = 10_000;

interface SessionRow extends RowDataPacket {
  session_version: number;
  status: string;
}

/** Cached { version, status } per user id. */
export interface SessionState {
  sessionVersion: number;
  /** users.status — anything other than ACTIVE ends the session. */
  status: string;
}

const cache = new Map<string, { state: SessionState; expiresAt: number }>();

/**
 * Returns the user's current session version and account status, or null when
 * the account no longer exists / can't be read.
 *
 * `fresh` bypasses the cache (used right after a password change so the new
 * version is picked up immediately).
 */
export async function readSessionState(
  userId: string,
  options: { fresh?: boolean } = {}
): Promise<SessionState | null> {
  const cached = cache.get(userId);
  if (!options.fresh && cached && cached.expiresAt > Date.now()) {
    return cached.state;
  }

  try {
    const [rows] = await db.query<SessionRow[]>(
      `SELECT session_version, status
       FROM users
       WHERE id = ?
       LIMIT 1`,
      [userId]
    );

    const row = rows[0];
    if (!row) return null;

    const state: SessionState = {
      sessionVersion: Number(row.session_version),
      status: row.status,
    };
    cache.set(userId, {
      state,
      expiresAt: Date.now() + SESSION_VERSION_CACHE_MS,
    });

    return state;
  } catch (error) {
    console.error("Failed to read session version:", error);
    // Fail open: an unreachable database must not log everyone out. -1 never
    // matches a token's version, so the caller must treat it as "unknown"
    // rather than "changed" (see auth.ts).
    return { sessionVersion: -1, status: "UNKNOWN" };
  }
}

/** Drops the cached state for one user (after a password change). */
export function invalidateSessionVersionCache(userId: string): void {
  cache.delete(userId);
}