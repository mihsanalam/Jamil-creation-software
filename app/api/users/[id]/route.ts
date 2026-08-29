import { NextResponse } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import type { UserRole } from "@/types/next-auth";

// A row from the users table. password_hash is deliberately NEVER selected.
interface UserRow extends RowDataPacket {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: "ACTIVE" | "INACTIVE";
  created_at: Date;
}

/**
 * PATCH /api/users/[id] — edits a subset of fields on one user.
 * Only `name` and `status` (ACTIVE | INACTIVE) are writable through this API.
 * By design, `role` and `email` are NOT editable here — role changes are rare
 * and risky enough to handle manually in Workbench if ever needed, and the MVP
 * intentionally keeps email changes out of scope. Unknown/protected fields in
 * the body are ignored.
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

  const name =
    typeof body.name === "string" && body.name.trim() !== ""
      ? body.name.trim()
      : null;
  const status =
    body.status === "ACTIVE" || body.status === "INACTIVE" ? body.status : null;

  // Reject a field that was sent but didn't validate, so a typo can't silently
  // become a no-op.
  if (body.name !== undefined && name === null) {
    return NextResponse.json(
      { message: '"name" must be a non-empty string.' },
      { status: 400 }
    );
  }
  if (body.status !== undefined && status === null) {
    return NextResponse.json(
      { message: '"status" must be "ACTIVE" or "INACTIVE".' },
      { status: 400 }
    );
  }
  if (name === null && status === null) {
    return NextResponse.json(
      {
        message:
          'Send at least one editable field: "name" (non-empty string), "status" (ACTIVE | INACTIVE).',
      },
      { status: 400 }
    );
  }

  try {
    const updates: string[] = [];
    const values: string[] = [];
    if (name !== null) {
      updates.push("name = ?");
      values.push(name);
    }
    if (status !== null) {
      updates.push("status = ?");
      values.push(status);
    }
    values.push(id);

    const [result] = await db.query<ResultSetHeader>(
      `UPDATE users SET ${updates.join(", ")} WHERE id = ?`,
      values
    );

    // Setting a field to its current value reports 0 affected rows, so only
    // a truly missing id is a 404.
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

    // Re-read so the response always mirrors the stored row (created_at etc.).
    const [rows] = await db.query<UserRow[]>(
      "SELECT id, name, email, role, status, created_at FROM users WHERE id = ?",
      [id]
    );
    const user = rows[0];
    if (!user) {
      return NextResponse.json(
        { message: `No user found with id "${id}"` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      createdAt: user.created_at,
    });
  } catch (error) {
    console.error("Failed to update user:", error);
    return NextResponse.json(
      { message: "Could not update the user. Please try again." },
      { status: 500 }
    );
  }
}