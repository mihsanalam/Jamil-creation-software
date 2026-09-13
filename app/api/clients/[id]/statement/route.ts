import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";

import { auth } from "@/auth";
import { db } from "@/lib/db";

interface ClientRow extends RowDataPacket {
  id: string;
  name: string;
  phone: string;
  address: string | null;
  type: "WHOLESALE" | "RETAIL";
}

interface SaleRow extends RowDataPacket {
  id: string;
  invoice_number: string;
  total: string;
  amount_paid: string;
  payment_status: "PAID" | "PARTIAL" | "DUE";
  created_at: Date;
}

interface PaymentRow extends RowDataPacket {
  id: string;
  amount: string;
  method: "CASH" | "BKASH" | "NAGAD" | "BANK_TRANSFER";
  sale_id: string | null;
  date: Date;
}

interface ReturnRow extends RowDataPacket {
  id: string;
  cashback: string;
  due_credit: string;
  notes: string | null;
  date: Date;
  invoice_number: string;
}

/** One merged timeline entry in the client's statement. */
interface StatementEvent {
  id: string;
  /** INVOICE adds to the balance; PAYMENT and RETURN reduce it. */
  type: "INVOICE" | "PAYMENT" | "RETURN";
  date: string;
  /** Signed amount: positive = the client owes more, negative = owes less. */
  amount: number;
  /** Short human-readable line, e.g. "Invoice INV-2026-0512". */
  label: string;
  /** Extra detail: payment method, due-credit split, return notes. */
  note?: string;
  /** Balance after this event, oldest → newest. */
  balance: number;
}

interface StatementSummary {
  totalInvoiced: number;
  totalPaid: number;
  totalReturned: number;
  balance: number;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

/**
 * GET /api/clients/[id]/statement — the client's ledger (Owner only).
 *
 * Merges three event streams into one chronological timeline and replays a
 * running balance with the rule: sales − payments − returns = balance.
 *   - INVOICE  (+total): money the client owes for the sale
 *   - PAYMENT  (−amount): cash/bKash/... received by the operator
 *   - RETURN   (−(cashback + due_credit)): cash handed back on returns plus
 *     the part applied to the client's dues instead of cash
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "OWNER") {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const [clientRows] = await db.query<ClientRow[]>(
      `SELECT id, name, phone, address, type FROM clients WHERE id = ? LIMIT 1`,
      [id]
    );
    const client = clientRows[0];
    if (!client) {
      return NextResponse.json({ message: "Client not found." }, { status: 404 });
    }

    const [sales, payments, returns] = await Promise.all([
      db.query<SaleRow[]>(
        `SELECT id, invoice_number, total, amount_paid, payment_status, created_at
         FROM sales WHERE client_id = ?`,
        [id]
      ),
      db.query<PaymentRow[]>(
        `SELECT id, amount, method, sale_id, date FROM payments WHERE client_id = ?`,
        [id]
      ),
      db.query<ReturnRow[]>(
        `SELECT rb.id, rb.cashback, rb.due_credit, rb.notes, rb.date, s.invoice_number
         FROM return_batches rb
         JOIN sales s ON s.id = rb.sale_id
         WHERE s.client_id = ?`,
        [id]
      ),
    ]);

    type RawEvent = Omit<StatementEvent, "balance">;
    const raw: RawEvent[] = [];

    for (const sale of sales[0]) {
      raw.push({
        id: sale.id,
        type: "INVOICE",
        date: new Date(sale.created_at).toISOString(),
        amount: round2(Number(sale.total)),
        label: `Invoice ${sale.invoice_number}`,
        note: `Paid ৳${Number(sale.amount_paid).toLocaleString("en-US")} of ৳${Number(
          sale.total
        ).toLocaleString("en-US")} (${sale.payment_status})`,
      });
    }

    for (const payment of payments[0]) {
      raw.push({
        id: payment.id,
        type: "PAYMENT",
        date: new Date(payment.date).toISOString(),
        amount: -round2(Number(payment.amount)),
        label: `Payment received (${payment.method})`,
        note: payment.sale_id ? "Applied to a specific invoice" : "Applied to oldest dues",
      });
    }

    for (const ret of returns[0]) {
      const cashback = Number(ret.cashback) || 0;
      const dueCredit = Number(ret.due_credit) || 0;
      raw.push({
        id: ret.id,
        type: "RETURN",
        date: new Date(ret.date).toISOString(),
        amount: -round2(cashback + dueCredit),
        label: `Return on ${ret.invoice_number}`,
        note:
          cashback > 0 && dueCredit > 0
            ? `৳${cashback.toLocaleString("en-US")} cash + ৳${dueCredit.toLocaleString(
                "en-US"
              )} applied to dues`
            : dueCredit > 0
              ? `৳${dueCredit.toLocaleString("en-US")} applied to dues`
              : `৳${cashback.toLocaleString("en-US")} cash handed back`,
      });
    }

    // Chronological, then replay the running balance.
    raw.sort((a, b) => a.date.localeCompare(b.date));

    const summary: StatementSummary = {
      totalInvoiced: 0,
      totalPaid: 0,
      totalReturned: 0,
      balance: 0,
    };
    let running = 0;
    const events: StatementEvent[] = raw.map((event) => {
      running = round2(running + event.amount);
      if (event.type === "INVOICE") summary.totalInvoiced += event.amount;
      else if (event.type === "PAYMENT") summary.totalPaid += -event.amount;
      else summary.totalReturned += -event.amount;
      return { ...event, balance: running };
    });

    summary.totalInvoiced = round2(summary.totalInvoiced);
    summary.totalPaid = round2(summary.totalPaid);
    summary.totalReturned = round2(summary.totalReturned);
    summary.balance = running;

    // Newest first in the UI, so reverse after computing the running balance.
    events.reverse();

    return NextResponse.json({ client, summary, events });
  } catch (error) {
    console.error("Failed to build client statement:", error);
    return NextResponse.json(
      { message: "Could not load the client statement. Please try again." },
      { status: 500 }
    );
  }
}
