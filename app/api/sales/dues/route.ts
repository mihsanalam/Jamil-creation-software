import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";

import { auth } from "@/auth";
import { db } from "@/lib/db";

// A client row from the aggregated dues listing (one row per client with a
// non-zero outstanding balance).
interface ClientDueRow extends RowDataPacket {
  id: string;
  name: string;
  phone: string;
  type: string;
  total_due: string;
  invoice_count: number;
}

// A client row just confirming the client exists (for ?clientId=).
interface ClientRow extends RowDataPacket {
  id: string;
  name: string;
  phone: string;
  type: string;
}

// One unpaid invoice row joined with its client (for ?clientId=).
interface InvoiceRow extends RowDataPacket {
  id: string;
  invoice_number: string;
  total: string;
  amount_paid: string;
  created_at: Date;
}

const DUE_STATUSES = "('DUE', 'PARTIAL')";

/**
 * GET /api/sales/dues — the data feed for the Due Collection POS screen.
 *
 * Without ?clientId=: one aggregated row per client that has an outstanding
 * balance (their totalDue summed across all DUE / PARTIAL invoices), used
 * for the "search client with outstanding due" picker. Clients with a zero
 * balance are excluded.
 *
 * With ?clientId=: that one client's individual unpaid invoices, used for
 * the per-client due summary card. Both paths only ever include sales whose
 * payment_status is DUE or PARTIAL.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("clientId")?.trim() || "";

  try {
    // Per-client breakdown of one client's unpaid invoices.
    if (clientId) {
      const [clientRows] = await db.query<ClientRow[]>(
        `SELECT id, name, phone, type FROM clients WHERE id = ? LIMIT 1`,
        [clientId]
      );
      const client = clientRows[0];
      if (!client) {
        return NextResponse.json(
          { message: "Client not found." },
          { status: 404 }
        );
      }

      const [invoiceRows] = await db.query<InvoiceRow[]>(
        `SELECT s.id, s.invoice_number, s.total, s.amount_paid, s.created_at
         FROM sales s
         WHERE s.client_id = ? AND s.payment_status IN ${DUE_STATUSES}
         ORDER BY s.created_at ASC`,
        [clientId]
      );

      return NextResponse.json({
        client: {
          id: client.id,
          name: client.name,
          phone: client.phone,
          type: client.type,
        },
        invoices: invoiceRows.map((row) => ({
          id: row.id,
          invoiceNumber: row.invoice_number,
          total: Number(row.total),
          amountPaid: Number(row.amount_paid),
          amountDue: Number(row.total) - Number(row.amount_paid),
          date: row.created_at,
        })),
      });
    }

    // Aggregated list of every client that still owes money.
    const [rows] = await db.query<ClientDueRow[]>(
      `SELECT c.id, c.name, c.phone, c.type,
              COALESCE(SUM(s.total - s.amount_paid), 0) AS total_due,
              COUNT(s.id) AS invoice_count
       FROM sales s
       JOIN clients c ON c.id = s.client_id
       WHERE s.payment_status IN ${DUE_STATUSES}
       GROUP BY c.id, c.name, c.phone, c.type
       HAVING SUM(s.total - s.amount_paid) > 0
       ORDER BY c.name ASC`
    );

    return NextResponse.json(
      rows.map((row) => ({
        id: row.id,
        name: row.name,
        phone: row.phone,
        type: row.type,
        totalDue: Number(row.total_due),
        invoiceCount: Number(row.invoice_count),
      }))
    );
  } catch (error) {
    console.error("Failed to load dues:", error);
    return NextResponse.json(
      { message: "Could not load dues. Please try again." },
      { status: 500 }
    );
  }
}
