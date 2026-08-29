import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import type { UserRole } from "@/types/next-auth";

// A row from the users table. password_hash is deliberately NEVER selected —
// it exists in the table only for the credentials authorize() check in auth.ts.
interface UserRow extends RowDataPacket {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: "ACTIVE" | "INACTIVE";
  created_at: Date;
}

// Roles the Owner may list/create from the Users screen. OWNER is excluded — there
// is (typically) exactly one owner account and it shouldn't be edited casually here.
const MANAGEABLE_ROLES = new Set(["COLLECTOR", "OPERATOR"]);

const VALID_ROLE_FILTERS = new Set(["all", "COLLECTOR", "OPERATOR"]);

/**
 * GET /api/users — lists every non-OWNER user, newest first.
 * Optional query params:
 * - role: COLLECTOR | OPERATOR, or "all" (default)
 *
 * Only authenticated OWNERs may read this list.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (session?.user?.role !== "OWNER") {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const roleParam = searchParams.get("role")?.trim().toUpperCase() ?? "all";

  if (!VALID_ROLE_FILTERS.has(roleParam)) {
    return NextResponse.json(
      {
        message: `Invalid role "${roleParam}" — must be COLLECTOR, OPERATOR, or "all".`,
      },
      { status: 400 }
    );
  }

  try {
    // OWNER rows are always excluded from this list view.
    const where = ["role != 'OWNER'"];
    const params: string[] = [];
    if (roleParam !== "all") {
      where.push("role = ?");
      params.push(roleParam);
    }

    const [rows] = await db.query<UserRow[]>(
      `SELECT id, name, email, role, status, created_at
       FROM users
       WHERE ${where.join(" AND ")}
       ORDER BY created_at DESC, name`,
      params
    );

    return NextResponse.json(
      rows.map((row) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        role: row.role,
        status: row.status,
        createdAt: row.created_at,
      }))
    );
  } catch (error) {
    console.error("Failed to list users:", error);
    return NextResponse.json(
      { message: "Could not load users. Please try again." },
      { status: 500 }
    );
  }
}

/**
 * POST /api/users — creates a COLLECTOR or OPERATOR account.
 * Body: { name: string, email: string, password: string, role: "COLLECTOR" | "OPERATOR" }
 * The password is bcrypt-hashed before it touches the database. Duplicate emails
 * are rejected with 409.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (session?.user?.role !== "OWNER") {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const email =
    typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const role =
    typeof body?.role === "string" ? body.role.trim().toUpperCase() : "";

  if (name === "" || email === "" || password === "" || role === "") {
    return NextResponse.json(
      { message: "Name, email, password and role are required." },
      { status: 400 }
    );
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { message: "Please enter a valid email address." },
      { status: 400 }
    );
  }
  if (!MANAGEABLE_ROLES.has(role)) {
    return NextResponse.json(
      { message: 'Role must be "COLLECTOR" or "OPERATOR".' },
      { status: 400 }
    );
  }

  try {
    // Reject duplicates up front with a clear 409 (the INSERT below also guards
    // against the race where two requests arrive at once).
    const [existing] = await db.query<RowDataPacket[]>(
      "SELECT id FROM users WHERE email = ?",
      [email]
    );
    if (existing.length > 0) {
      return NextResponse.json(
        { message: "An account with that email already exists." },
        { status: 409 }
      );
    }

    const id = randomUUID();
    const passwordHash = await bcrypt.hash(password, 10);
    await db.query<ResultSetHeader>(
      `INSERT INTO users (id, name, email, password_hash, role, status)
       VALUES (?, ?, ?, ?, ?, 'ACTIVE')`,
      [id, name, email, passwordHash, role]
    );

    return NextResponse.json(
      {
        id,
        name,
        email,
        role,
        status: "ACTIVE",
        createdAt: new Date(),
      },
      { status: 201 }
    );
  } catch (error) {
    // A concurrent request may have created this email between the SELECT and
    // the INSERT — surface the same 409 instead of a generic 500.
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "ER_DUP_ENTRY"
    ) {
      return NextResponse.json(
        { message: "An account with that email already exists." },
        { status: 409 }
      );
    }
    console.error("Failed to create user:", error);
    return NextResponse.json(
      { message: "Could not create the user. Please try again." },
      { status: 500 }
    );
  }
}