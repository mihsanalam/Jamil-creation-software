import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { invalidateSessionVersionCache } from "@/lib/session-version";

/**
 * PATCH /api/users/[id]/reset-password — sets a new password for one user.
 * Body: { password: string }
 *
 * Owner-only by design: there is no self-service "forgot password" email flow
 * (that needs email sending infrastructure), so the Owner resets the password
 * here and hands the new one to the person directly. Users who know their own
 * password change it themselves at /api/account/password (Tier 4).
 *
 * The password change also bumps `users.session_version` (Tier 4): every JWT
 * session the user already had is invalidated on its next request, so a
 * compromised or shared device is signed out immediately.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (session?.user?.role !== "OWNER") {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  const password = typeof body.password === "string" ? body.password : "";
  if (password === "") {
    return NextResponse.json(
      { message: "A new password is required." },
      { status: 400 }
    );
  }

  try {
    // Hash before it touches the database, matching how users are created.
    const passwordHash = await bcrypt.hash(password, 10);
    // session_version + 1 invalidates every session issued before now.
    const [result] = await db.query<ResultSetHeader>(
      `UPDATE users
       SET password_hash = ?, session_version = session_version + 1
       WHERE id = ?`,
      [passwordHash, id]
    );

    if (result.affectedRows === 0) {
      const [found] = await db.query<RowDataPacket[]>(
        "SELECT id FROM users WHERE id = ?",
        [id]
      );
      if (found.length === 0) {
        return NextResponse.json(
          { message: `No user found with id "${id}"` },
          { status: 404 }
        );
      }
    }

    // Any cached version for this user is stale from this moment on.
    invalidateSessionVersionCache(id);

    // Audit trail: an Owner reset someone else's password.
    await logAudit({
      actorId: session.user.id,
      actorName: session.user.name ?? "unknown",
      action: "PASSWORD_RESET",
      entityType: "user",
      entityId: id,
      details: { byOwner: true, sessionsInvalidated: true },
    });

    return NextResponse.json({ message: "Password updated." });
  } catch (error) {
    console.error("Failed to reset password:", error);
    return NextResponse.json(
      { message: "Could not reset the password. Please try again." },
      { status: 500 }
    );
  }
}
