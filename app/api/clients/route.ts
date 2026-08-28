import { NextResponse } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { randomUUID } from "crypto";

import { auth } from "@/auth";
import { db } from "@/lib/db";

// A client row with its aggregated purchase stats (from the LEFT JOIN).
interface ClientRow extends RowDataPacket {
  id: string;
  name: string;
  phone: string;
  address: string | null;
  type: string;
  created_at: Date;
  total_purchased: string;
  outstanding_due: string;
}

const CLIENT_TYPES = new Set(["WHOLESALE", "RETAIL"]);

/**
 * GET /api/clients — lists every client with two computed totals:
 * - totalPurchased: SUM(IF(payment_status = 'PAID', total, amount_paid)) —
 *   the full invoice value once a sale is paid, the amount actually
 *   collected so far otherwise
 * - outstandingDue: SUM(total - amount_paid) across all their sales
 * Optional query params:
 * - type: WHOLESALE | RETAIL, or "all" (default)
 * - search: case-insensitive partial match on name
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const typeParam = searchParams.get("type")?.trim();
  const search = searchParams.get("search")?.trim();

  if (typeParam && typeParam !== "all" && !CLIENT_TYPES.has(typeParam)) {
    return NextResponse.json(
      {
        message: `Invalid type "${typeParam}" — must be WHOLESALE, RETAIL, or "all"`,
      },
      { status: 400 }
    );
  }

  const where: string[] = [];
  const params: string[] = [];
  if (typeParam && typeParam !== "all") {
    where.push("c.type = ?");
    params.push(typeParam);
  }
  if (search) {
    where.push("c.name LIKE ?");
    params.push(`%${search}%`);
  }

  try {
    const [rows] = await db.query<ClientRow[]>(
      `SELECT c.id, c.name, c.phone, c.address, c.type, c.created_at,
              COALESCE(SUM(IF(s.payment_status = 'PAID', s.total, s.amount_paid)), 0) AS total_purchased,
              COALESCE(SUM(s.total - s.amount_paid), 0) AS outstanding_due
       FROM clients c
       LEFT JOIN sales s ON s.client_id = c.id
       ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
       GROUP BY c.id, c.name, c.phone, c.address, c.type, c.created_at
       ORDER BY c.created_at DESC`,
      params
    );

    return NextResponse.json(
      rows.map((row) => ({
        id: row.id,
        name: row.name,
        phone: row.phone,
        address: row.address,
        type: row.type,
        createdAt: row.created_at,
        totalPurchased: Number(row.total_purchased),
        outstandingDue: Number(row.outstanding_due),
      }))
    );
  } catch (error) {
    console.error("Failed to list clients:", error);
    return NextResponse.json(
      { message: "Could not load clients. Please try again." },
      { status: 500 }
    );
  }
}

/**
 * POST /api/clients — creates a new client.
 * Body: { name: string, phone: string, address?: string, type: "WHOLESALE" | "RETAIL" }
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const phone = typeof body?.phone === "string" ? body.phone.trim() : "";
  const address =
    typeof body?.address === "string" && body.address.trim() !== ""
      ? body.address.trim()
      : null;
  const type = typeof body?.type === "string" ? body.type.trim() : "";

  if (name === "" || phone === "") {
    return NextResponse.json(
      { message: "Name and phone are required." },
      { status: 400 }
    );
  }
  if (!CLIENT_TYPES.has(type)) {
    return NextResponse.json(
      { message: 'Type must be "WHOLESALE" or "RETAIL".' },
      { status: 400 }
    );
  }

  try {
    const id = randomUUID();
    await db.query<ResultSetHeader>(
      `INSERT INTO clients (id, name, phone, address, type)
       VALUES (?, ?, ?, ?, ?)`,
      [id, name, phone, address, type]
    );

    return NextResponse.json(
      {
        id,
        name,
        phone,
        address,
        type,
        createdAt: new Date(),
        totalPurchased: 0,
        outstandingDue: 0,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to create client:", error);
    return NextResponse.json(
      { message: "Could not create the client. Please try again." },
      { status: 500 }
    );
  }
}
