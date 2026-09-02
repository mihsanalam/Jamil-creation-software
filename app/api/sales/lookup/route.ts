import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";

import { auth } from "@/auth";
import { db } from "@/lib/db";

interface SaleRow extends RowDataPacket {
  id: string;
  invoice_number: string;
  total: string;
  created_at: Date;
  client_name: string;
  client_phone: string;
}

/**
 * GET /api/sales/lookup?number=0005 — find a sale by its invoice number for
 * the Return screen. Accepts the bare suffix ("0005", "5"), or the full
 * number ("INV-2026-0005"). Returns a lightweight summary; the screen loads
 * the full details from GET /api/sales/[id] afterwards.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const raw = (searchParams.get("number") ?? "").trim().toUpperCase();
  if (raw === "") {
    return NextResponse.json(
      { message: "Enter an invoice number, e.g. 0005." },
      { status: 400 }
    );
  }

  // The trailing digits are the meaningful part ("5", "0005", "INV-2026-5"
  // all resolve to the same suffix match against "-5").
  const digits = raw.match(/(\d+)$/)?.[1] ?? "";
  if (digits === "") {
    return NextResponse.json(
      { message: "That doesn't look like an invoice number — try e.g. 0005." },
      { status: 400 }
    );
  }

  try {
    const [rows] = await db.query<SaleRow[]>(
      `SELECT s.id, s.invoice_number, s.total, s.created_at,
              c.name AS client_name, c.phone AS client_phone
       FROM sales s
       JOIN clients c ON c.id = s.client_id
       WHERE s.invoice_number = ? OR s.invoice_number LIKE CONCAT('%-', ?)
       ORDER BY s.created_at DESC
       LIMIT 1`,
      [raw, digits]
    );
    const sale = rows[0];
    if (!sale) {
      return NextResponse.json(
        { message: `No invoice found for "${raw}".` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      id: sale.id,
      invoiceNumber: sale.invoice_number,
      total: Number(sale.total),
      createdAt: sale.created_at,
      clientName: sale.client_name,
      clientPhone: sale.client_phone,
    });
  } catch (error) {
    console.error("Failed to look up invoice:", error);
    return NextResponse.json(
      { message: "Could not search for the invoice. Please try again." },
      { status: 500 }
    );
  }
}
