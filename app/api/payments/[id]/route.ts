import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";

import { auth } from "@/auth";
import { db } from "@/lib/db";

// One payment row joined with everything the money receipt prints (#28).
interface PaymentReceiptRow extends RowDataPacket {
  id: string;
  client_id: string;
  sale_id: string | null;
  amount: string;
  method: string;
  date: Date;
  client_name: string;
  client_phone: string;
  client_type: string;
  sale_invoice_number: string | null;
  recorded_by_name: string | null;
}

interface BalanceRow extends RowDataPacket {
  balance_due: string;
}

/**
 * GET /api/payments/[id] — the data for the printable money receipt.
 * Returns the payment with its client, the invoice it was applied to (when
 * one was picked) and the client's CURRENT outstanding balance so the
 * receipt can show "balance due" after this payment.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const [rows] = await db.query<PaymentReceiptRow[]>(
      `SELECT p.id, p.client_id, p.sale_id, p.amount, p.method, p.date,
              c.name AS client_name, c.phone AS client_phone,
              c.type AS client_type,
              s.invoice_number AS sale_invoice_number,
              u.name AS recorded_by_name
       FROM payments p
       JOIN clients c ON c.id = p.client_id
       LEFT JOIN sales s ON s.id = p.sale_id
       LEFT JOIN users u ON u.id = p.recorded_by_id
       WHERE p.id = ?
       LIMIT 1`,
      [id]
    );
    const payment = rows[0];
    if (!payment) {
      return NextResponse.json(
        { message: "Payment not found." },
        { status: 404 }
      );
    }

    // Current outstanding balance across all of the client's sales.
    const [balanceRows] = await db.query<BalanceRow[]>(
      `SELECT COALESCE(SUM(total - amount_paid), 0) AS balance_due
       FROM sales WHERE client_id = ?`,
      [payment.client_id]
    );

    return NextResponse.json({
      id: payment.id,
      amount: Number(payment.amount),
      method: payment.method,
      date: payment.date,
      client: {
        id: payment.client_id,
        name: payment.client_name,
        phone: payment.client_phone,
        type: payment.client_type,
      },
      appliedToInvoice: payment.sale_invoice_number,
      receivedByName: payment.recorded_by_name,
      balanceDue: Math.max(Number(balanceRows[0]?.balance_due ?? 0), 0),
    });
  } catch (error) {
    console.error("Failed to load payment receipt:", error);
    return NextResponse.json(
      { message: "Could not load the money receipt. Please try again." },
      { status: 500 }
    );
  }
}
