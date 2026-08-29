import { NextResponse } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { randomUUID } from "crypto";

import { auth } from "@/auth";
import { db } from "@/lib/db";

// A minimal client row used to confirm the client exists.
interface ClientRow extends RowDataPacket {
  id: string;
}

// One unpaid sale row, locked with FOR UPDATE while we adjust it.
interface UnpaidSaleRow extends RowDataPacket {
  id: string;
  invoice_number: string;
  total: string;
  amount_paid: string;
}

// One payment-history row joined with its sale (for the invoice number).
interface PaymentRow extends RowDataPacket {
  id: string;
  client_id: string;
  sale_id: string | null;
  amount: string;
  method: string;
  date: Date;
  sale_invoice_number: string | null;
}

const PAYMENT_METHODS = new Set(["CASH", "BKASH", "NAGAD", "BANK_TRANSFER"]);

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

/**
 * POST /api/payments — records a payment against a client's due balance.
 *
 * Body: { clientId, saleId?, amount, method, date? }
 *  - saleId: an optional specific invoice. Omit / pass null to apply the
 *    payment against the client's overall outstanding balance instead.
 *  - date:   optional ISO date ("2026-08-29" or full datetime); defaults to
 *            the current time. A bare "YYYY-MM-DD" is treated as local
 *            midnight so the payment lands on the chosen day.
 *
 * Runs in one transaction:
 *   a. Inserts a row into payments (recordedById from the session).
 *   b. With saleId — updates that sale's amount_paid += amount and
 *      recalculates its payment_status (PAID once amount_paid >= total,
 *      else PARTIAL). Refuses to overpay a single invoice.
 *   c. Without saleId — applies the payment across the client's oldest
 *      unpaid invoices first (by created_at), reducing each one's due until
 *      the payment amount is used up, updating amount_paid / payment_status
 *      along the way. Refuses an amount larger than the total outstanding.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);

  const clientId = typeof body?.clientId === "string" ? body.clientId.trim() : "";

  // saleId is optional — null when paying the overall balance.
  const saleIdRaw = body?.saleId;
  const saleId =
    saleIdRaw === undefined || saleIdRaw === null || saleIdRaw === ""
      ? null
      : typeof saleIdRaw === "string"
        ? saleIdRaw.trim()
        : "<invalid>";
  if (saleId === "<invalid>") {
    return NextResponse.json(
      { message: "saleId must be a string when provided." },
      { status: 400 }
    );
  }

  const amount =
    typeof body?.amount === "number" && body.amount > 0
      ? round2(body.amount)
      : NaN;
  const method = typeof body?.method === "string" ? body.method.trim() : "";

  // Optional date override; a bare "YYYY-MM-DD" becomes local midnight.
  const dateRaw = typeof body?.date === "string" ? body.date.trim() : "";
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateRaw);
  const paymentDate =
    dateMatch &&
    !Number.isNaN(
      new Date(
        Number(dateMatch[1]),
        Number(dateMatch[2]) - 1,
        Number(dateMatch[3])
      ).getTime()
    )
      ? new Date(
          Number(dateMatch[1]),
          Number(dateMatch[2]) - 1,
          Number(dateMatch[3])
        )
      : dateRaw !== "" && !Number.isNaN(new Date(dateRaw).getTime())
        ? new Date(dateRaw)
        : new Date();

  if (clientId === "") {
    return NextResponse.json(
      { message: "clientId is required." },
      { status: 400 }
    );
  }
  if (Number.isNaN(amount)) {
    return NextResponse.json(
      { message: "amount must be a number greater than 0." },
      { status: 400 }
    );
  }
  if (!PAYMENT_METHODS.has(method)) {
    return NextResponse.json(
      {
        message: `method must be one of: ${[...PAYMENT_METHODS].join(", ")}`,
      },
      { status: 400 }
    );
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // The client must exist.
    const [clientRows] = await connection.query<ClientRow[]>(
      `SELECT id FROM clients WHERE id = ? LIMIT 1`,
      [clientId]
    );
    if (!clientRows[0]) {
      await connection.rollback();
      return NextResponse.json(
        { message: "Client not found." },
        { status: 404 }
      );
    }

    const updatedSales: {
      id: string;
      invoiceNumber: string;
      total: number;
      amountPaid: number;
      paymentStatus: string;
    }[] = [];


    if (saleId) {
      // Pay a specific invoice only — lock it so concurrent payments can't
      // double-apply to the same remaining due.
      const [saleRows] = await connection.query<UnpaidSaleRow[]>(
        `SELECT id, invoice_number, total, amount_paid
         FROM sales WHERE id = ? LIMIT 1 FOR UPDATE`,
        [saleId]
      );
      const sale = saleRows[0];
      if (!sale) {
        await connection.rollback();
        return NextResponse.json(
          { message: "Sale not found." },
          { status: 404 }
        );
      }

      const remainingDue = Number(sale.total) - Number(sale.amount_paid);
      if (amount > round2(remainingDue)) {
        await connection.rollback();
        return NextResponse.json(
          {
            message: "Payment exceeds the outstanding balance of this invoice.",
          },
          { status: 400 }
        );
      }

      const newAmountPaid = round2(Number(sale.amount_paid) + amount);
      const newStatus =
        newAmountPaid >= Number(sale.total) ? "PAID" : "PARTIAL";

      await connection.query<ResultSetHeader>(
        `UPDATE sales SET amount_paid = ?, payment_status = ? WHERE id = ?`,
        [newAmountPaid, newStatus, saleId]
      );

      updatedSales.push({
        id: sale.id,
        invoiceNumber: sale.invoice_number,
        total: Number(sale.total),
        amountPaid: newAmountPaid,
        paymentStatus: newStatus,
      });
    } else {
      // Apply the payment to the client's oldest unpaid invoices first.
      // Lock the whole due set so a concurrent payment can't re-read the
      // same remaining balances.
      const [dueRows] = await connection.query<UnpaidSaleRow[]>(
        `SELECT id, invoice_number, total, amount_paid
         FROM sales
         WHERE client_id = ? AND payment_status IN ('DUE', 'PARTIAL')
         ORDER BY created_at ASC
         FOR UPDATE`,
        [clientId]
      );

      let remaining = amount;
      for (const sale of dueRows) {
        if (remaining <= 0.005) break; // stop once the payment is used up
        const due = round2(Number(sale.total) - Number(sale.amount_paid));
        const take = Math.min(remaining, due);
        const newAmountPaid = round2(Number(sale.amount_paid) + take);
        const newStatus =
          newAmountPaid >= Number(sale.total) ? "PAID" : "PARTIAL";

        await connection.query<ResultSetHeader>(
          `UPDATE sales SET amount_paid = ?, payment_status = ? WHERE id = ?`,
          [newAmountPaid, newStatus, sale.id]
        );
        remaining = round2(remaining - take);

        updatedSales.push({
          id: sale.id,
          invoiceNumber: sale.invoice_number,
          total: Number(sale.total),
          amountPaid: newAmountPaid,
          paymentStatus: newStatus,
        });
      }

      // If anything is left over there was nothing left to apply it to —
      // reject rather than create an unallocated payment.
      if (remaining > 0.005) {
        await connection.rollback();
        return NextResponse.json(
          {
            message: `Payment of ৳${amount.toLocaleString("en-US", {
              minimumFractionDigits: 2,
            })} exceeds the client's total outstanding balance.`,
          },
          { status: 400 }
        );
      }
    }

    // Insert the payment record (tied to the invoice when one was paid).
    const paymentId = randomUUID();
    await connection.query<ResultSetHeader>(
      `INSERT INTO payments (id, client_id, sale_id, amount, method, date, recorded_by_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        paymentId,
        clientId,
        saleId,
        amount,
        method,
        paymentDate,
        session.user.id,
      ]
    );

    await connection.commit();

    return NextResponse.json(
      {
        payment: {
          id: paymentId,
          clientId,
          saleId,
          amount,
          method,
          date: paymentDate,
        },
        sales: updatedSales,
      },
      { status: 201 }
    );
  } catch (error) {
    await connection.rollback().catch(() => {});
    console.error("Failed to record payment:", error);
    return NextResponse.json(
      { message: "Could not record the payment. Please try again." },
      { status: 500 }
    );
  } finally {
    connection.release();
  }
}

/**
 * GET /api/payments?clientId=X — one client's payment history, newest first.
 * Used by the "Payment history" list on the Due Collection screen.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("clientId")?.trim() || "";
  if (clientId === "") {
    return NextResponse.json(
      { message: "clientId is required." },
      { status: 400 }
    );
  }

  try {
    const [rows] = await db.query<PaymentRow[]>(
      `SELECT p.id, p.client_id, p.sale_id, p.amount, p.method, p.date,
              s.invoice_number AS sale_invoice_number
       FROM payments p
       LEFT JOIN sales s ON s.id = p.sale_id
       WHERE p.client_id = ?
       ORDER BY p.date DESC`,
      [clientId]
    );

    return NextResponse.json(
      rows.map((row) => ({
        id: row.id,
        clientId: row.client_id,
        saleId: row.sale_id,
        saleInvoiceNumber: row.sale_invoice_number,
        amount: Number(row.amount),
        method: row.method,
        date: row.date,
      }))
    );
  } catch (error) {
    console.error("Failed to load payments:", error);
    return NextResponse.json(
      { message: "Could not load the payment history. Please try again." },
      { status: 500 }
    );
  }
}

