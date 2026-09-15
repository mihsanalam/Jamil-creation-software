import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { invalidateSessionVersionCache } from "@/lib/session-version";
import { MIN_PASSWORD_LENGTH } from "@/lib/password-policy";

interface PasswordRow extends RowDataPacket {
  password_hash: string;
}

/**
 * POST /api/account/password — "change my password" for the signed-in user.
 *
 * Body: { currentPassword: string, newPassword: string }
 *
 * Before Tier 4 only the Owner could set a password (Users screen) or it had
 * to be changed by hand in SQL. This lets every role change their own:
 *
 *   1. the current password is verified (so a walked-away laptop can't be used
 *      to lock the real owner out),
 *   2. the new password is bcrypt-hashed,
 *   3. `session_version` is bumped — every session that already existed is
 *      signed out on its next request (Tier 4 session invalidation),
 *   4. the change is written to the audit trail.
 *
 * The caller is expected to sign out afterwards (the client does), because
 * this very session is invalidated by step 3.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  const currentPassword =
    typeof body.currentPassword === "string" ? body.currentPassword : "";
  const newPassword =
    typeof body.newPassword === "string" ? body.newPassword : "";

  if (currentPassword === "" || newPassword === "") {
    return NextResponse.json(
      { message: "Your current password and the new password are required." },
      { status: 400 }
    );
  }
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      {
        message: `The new password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      },
      { status: 400 }
    );
  }
  if (newPassword === currentPassword) {
    return NextResponse.json(
      { message: "The new password must be different from the current one." },
      { status: 400 }
    );
  }

  try {
    const [rows] = await db.query<PasswordRow[]>(
      "SELECT password_hash FROM users WHERE id = ? LIMIT 1",
      [session.user.id]
    );
    const row = rows[0];
    if (!row) {
      return NextResponse.json(
        { message: "Your account could not be found." },
        { status: 404 }
      );
    }

    const currentMatches = await bcrypt.compare(
      currentPassword,
      row.password_hash
    );
    if (!currentMatches) {
      return NextResponse.json(
        { message: "Your current password is incorrect." },
        { status: 400 }
      );
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await db.query<ResultSetHeader>(
      `UPDATE users
       SET password_hash = ?, session_version = session_version + 1
       WHERE id = ?`,
      [passwordHash, session.user.id]
    );

    // The cached version would otherwise let this user's old sessions live on.
    invalidateSessionVersionCache(session.user.id);

    await logAudit({
      actorId: session.user.id,
      actorName: session.user.name ?? "unknown",
      action: "PASSWORD_CHANGE",
      entityType: "user",
      entityId: session.user.id,
      details: { self: true, sessionsInvalidated: true },
    });

    return NextResponse.json({
      message: "Password updated.",
      // The client signs out on this signal — every session, including this
      // one, was just invalidated.
      signOut: true,
    });
  } catch (error) {
    console.error("Failed to change password:", error);
    return NextResponse.json(
      { message: "Could not change your password. Please try again." },
      { status: 500 }
    );
  }
}