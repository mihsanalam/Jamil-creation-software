import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { isBlockDueClientsEnabled } from "@/lib/app-settings";

interface ClientRow extends RowDataPacket {
  id: string;
  name: string;
  phone: string;
  type: string;
}

interface TotalsRow extends RowDataPacket {
  outstanding_due: string;
  unpaid_invoice_count: number;
}

interface SaleRow extends RowDataPacket {
  id: string;
  invoice_number: string;
  total: string;
  amount_paid: string;
  payment_status: string;
  created_at: Date;
}

/**
 * GET /api/clients/[id]/purchase-summary — inline client snapshot for the POS.
 *
 * When an operator picks a client in New Sale this endpoint answers two
 * questions at a glance:
 *   1. Can I upsell? — the client's last 3 purchases (any status), so the
 *      operator sees what they bought before and can pitch matching stock.
 *   2. Should I be careful? — the total outstanding dues across all their
 *      unpaid invoices, so a DUE client is obvious before more credit goes
 *      out the door.
 *
 * Also returns the Owner's block_due_clients policy so the POS can enforce it
 * without a second fetch.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // Middleware skips /api routes, so the session is verified here directly.
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const [clientRows] = await db.query<ClientRow[]>(
      `SELECT id, name, phone, type FROM clients WHERE id = ? LIMIT 1`,
      [id]
    );
    const client = clientRows[0];
    if (!client) {
      return NextResponse.json({ message: "Client not found." }, { status: 404 });
    }

    const [totalsRows, purchaseRows, blockDueClients] = await Promise.all([
      // Same rule as GET /api/clients: a sale's due is whatever part of the
      // invoice hasn't been paid yet (DUE and PARTIAL both count).
      db.query<TotalsRow[]>(
        `SELECT COALESCE(SUM(s.total - s.amount_paid), 0) AS outstanding_due,
                COUNT(s.id) AS unpaid_invoice_count
         FROM sales s
         WHERE s.client_id = ?
           AND s.payment_status IN ('DUE', 'PARTIAL')
           AND s.total > s.amount_paid`,
        [id]
      ),
      // Last 3 purchases of any status — this is the upsell view, not the
      // dues view, so PAID invoices belong here too.
      db.query<SaleRow[]>(
        `SELECT id, invoice_number, total, amount_paid, payment_status, created_at
         FROM sales
         WHERE client_id = ?
         ORDER BY created_at DESC
         LIMIT 3`,
        [id]
      ),
      isBlockDueClientsEnabled(),
    ]);

    return NextResponse.json({
      client: {
        id: client.id,
        name: client.name,
        phone: client.phone,
        type: client.type,
      },
      outstandingDue: Number(totalsRows[0][0]?.outstanding_due ?? 0),
      unpaidInvoiceCount: Number(totalsRows[0][0]?.unpaid_invoice_count ?? 0),
      lastPurchases: purchaseRows[0].map((row) => ({
        id: row.id,
        invoiceNumber: row.invoice_number,
        total: Number(row.total),
        amountPaid: Number(row.amount_paid),
        paymentStatus: row.payment_status,
        date: row.created_at,
      })),
      blockDueClients,
    });
  } catch (error) {
    console.error("Failed to load client purchase summary:", error);
    return NextResponse.json(
      { message: "Could not load the client's purchase history. Please try again." },
      { status: 500 }
    );
  }
}
