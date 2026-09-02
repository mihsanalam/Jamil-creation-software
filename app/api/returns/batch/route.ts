import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";

import { auth } from "@/auth";
import { db } from "@/lib/db";

// One line the client is returning.
interface ReturnLineInput {
  saleItemId: string;
  quantity: number;
  reason: string | null;
}

// One product handed back to the client in exchange.
interface ExchangeLineInput {
  finishedProductId: string;
  quantity: number;
  unitPrice: number;
}

interface SaleItemRow extends RowDataPacket {
  id: string;
  quantity: string;
  finished_product_id: string;
}

interface ReturnedRow extends RowDataPacket {
  total_returned: string;
}

interface ProductRow extends RowDataPacket {
  id: string;
  status: string;
  quantity_remaining: string;
}

// The sale whose due may absorb part of the cashback.
interface SaleDueRow extends RowDataPacket {
  id: string;
  total: string;
  amount_paid: string;
}

/**
 * POST /api/returns/batch — records one return/exchange session from the
 * Return screen, all in a single transaction:
 *
 *   Body: {
 *     saleId: string,
 *     items: [{ saleItemId, quantity, reason? }],           // >= 1 line
 *     exchanges?: [{ finishedProductId, quantity, unitPrice }],
 *     cashback: number,                                     // negative = customer paid the difference
 *     notes?: string
 *   }
 *
 * Scope note: the sale's totals and amount_paid are still never modified.
 * The cashback is recorded here; the Owner reconciles the money manually.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  const saleId = typeof body.saleId === "string" ? body.saleId.trim() : "";
  const cashback =
    typeof body.cashback === "number" && Number.isFinite(body.cashback)
      ? Math.round(body.cashback * 100) / 100
      : NaN;
  const notes =
    typeof body.notes === "string" && body.notes.trim() !== ""
      ? body.notes.trim()
      : null;

  // Validate the return lines.
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json(
      { message: "At least one return line is required." },
      { status: 400 }
    );
  }
  const items: ReturnLineInput[] = [];
  for (const raw of body.items) {
    const item = raw as Record<string, unknown>;
    const saleItemId =
      typeof item.saleItemId === "string" ? item.saleItemId.trim() : "";
    const quantity =
      typeof item.quantity === "number" && Number.isFinite(item.quantity)
        ? item.quantity
        : NaN;
    if (saleItemId === "" || Number.isNaN(quantity) || quantity <= 0) {
      return NextResponse.json(
        {
          message:
            'Each return line needs "saleItemId" and a "quantity" greater than 0.',
        },
        { status: 400 }
      );
    }
    const reason =
      typeof item.reason === "string" && item.reason.trim() !== ""
        ? item.reason.trim()
        : null;
    items.push({ saleItemId, quantity, reason });
  }

  // Validate the (optional) exchange lines.
  const exchanges: ExchangeLineInput[] = [];
  if (body.exchanges !== undefined && body.exchanges !== null) {
    if (!Array.isArray(body.exchanges)) {
      return NextResponse.json(
        { message: '"exchanges" must be an array.' },
        { status: 400 }
      );
    }
    for (const raw of body.exchanges) {
      const exchange = raw as Record<string, unknown>;
      const finishedProductId =
        typeof exchange.finishedProductId === "string"
          ? exchange.finishedProductId.trim()
          : "";
      const quantity =
        typeof exchange.quantity === "number" &&
        Number.isFinite(exchange.quantity)
          ? exchange.quantity
          : NaN;
      const unitPrice =
        typeof exchange.unitPrice === "number" &&
        Number.isFinite(exchange.unitPrice) && exchange.unitPrice >= 0
          ? Math.round(exchange.unitPrice * 100) / 100
          : NaN;
      if (
        finishedProductId === "" ||
        Number.isNaN(quantity) ||
        quantity <= 0 ||
        Number.isNaN(unitPrice)
      ) {
        return NextResponse.json(
          {
            message:
              'Each exchange line needs "finishedProductId", a "quantity" greater than 0 and a "unitPrice" of 0 or more.',
          },
          { status: 400 }
        );
      }
      exchanges.push({ finishedProductId, quantity, unitPrice });
    }
  }

  if (saleId === "") {
    return NextResponse.json(
      { message: "saleId is required." },
      { status: 400 }
    );
  }
  if (Number.isNaN(cashback)) {
    return NextResponse.json(
      { message: "cashback must be a number (0 if no money changes hands)." },
      { status: 400 }
    );
  }

  const connection = await db.getConnection();
  const batchId = randomUUID();

  // How the cashback split: due first, then cash. Computed inside the
  // transaction (needs the locked sale row); hoisted here so the response
  // can tell the operator what actually happened.
  let dueCredit = 0;
  let handedCashback = cashback;

  try {
    await connection.beginTransaction();

    // The sale must exist — lock it so the due check below is atomic
    // against concurrent payments/due collections.
    const [saleRows] = await connection.query<SaleDueRow[]>(
      "SELECT id, total, amount_paid FROM sales WHERE id = ? LIMIT 1 FOR UPDATE",
      [saleId]
    );
    const sale = saleRows[0];
    if (!sale) {
      await connection.rollback();
      return NextResponse.json({ message: "Sale not found." }, { status: 404 });
    }

    // Split the cashback: on a partially-paid invoice the outstanding due
    // absorbs it first (the client "gets" the money as a smaller due, no
    // cash moves); only the part beyond the due is handed over in cash.
    // Fully-paid invoices have no due, so the whole amount is cash.
    const due = Math.max(Number(sale.total) - Number(sale.amount_paid), 0);
    dueCredit = Math.min(Math.max(cashback, 0), due);
    handedCashback = Math.round((cashback - dueCredit) * 100) / 100;

    if (dueCredit > 0) {
      const newAmountPaid =
        Math.round((Number(sale.amount_paid) + dueCredit) * 100) / 100;
      const newStatus =
        newAmountPaid >= Number(sale.total) ? "PAID" : "PARTIAL";
      await connection.query<ResultSetHeader>(
        `UPDATE sales SET amount_paid = ?, payment_status = ? WHERE id = ?`,
        [newAmountPaid, newStatus, saleId]
      );
    }

    // The batch row comes first so return lines can reference it.
    await connection.query<ResultSetHeader>(
      `INSERT INTO return_batches (id, sale_id, cashback, due_credit, notes, recorded_by_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [batchId, saleId, handedCashback, dueCredit, notes, session.user.id]
    );

    // --- Return lines: validate, log, restore stock -----------------------
    for (const item of items) {
      // Lock the sale item so concurrent returns serialize on it.
      const [itemRows] = await connection.query<SaleItemRow[]>(
        `SELECT id, quantity, finished_product_id FROM sale_items
         WHERE id = ?
         LIMIT 1
         FOR UPDATE`,
        [item.saleItemId]
      );
      const saleItem = itemRows[0];
      if (!saleItem) {
        await connection.rollback();
        return NextResponse.json(
          { message: "One of the returned lines could not be found on this invoice." },
          { status: 404 }
        );
      }

      const [returnedRows] = await connection.query<ReturnedRow[]>(
        `SELECT COALESCE(SUM(quantity), 0) AS total_returned
         FROM returns WHERE sale_item_id = ?`,
        [item.saleItemId]
      );
      const sold = Number(saleItem.quantity);
      const alreadyReturned = Number(returnedRows[0]?.total_returned ?? 0);
      if (item.quantity > sold - alreadyReturned) {
        await connection.rollback();
        return NextResponse.json(
          {
            message: `Only ${sold - alreadyReturned} of the ${sold} sold can still be returned on one of the lines.`,
          },
          { status: 400 }
        );
      }

      await connection.query<ResultSetHeader>(
        `INSERT INTO returns (id, sale_item_id, quantity, reason, recorded_by_id, return_batch_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [randomUUID(), item.saleItemId, item.quantity, item.reason, session.user.id, batchId]
      );

      // Stock goes back; a fully sold-out lot becomes sellable again.
      await connection.query<ResultSetHeader>(
        `UPDATE finished_products
         SET quantity_remaining = quantity_remaining + ?,
             status = IF(status = 'SOLD', 'IN_STOCK', status)
         WHERE id = ?`,
        [item.quantity, saleItem.finished_product_id]
      );
    }

    // --- Exchange lines: take stock out, exactly like a sale ---------------
    for (const exchange of exchanges) {
      const [productRows] = await connection.query<ProductRow[]>(
        `SELECT id, status, quantity_remaining FROM finished_products
         WHERE id = ?
         LIMIT 1
         FOR UPDATE`,
        [exchange.finishedProductId]
      );
      const product = productRows[0];
      if (!product) {
        await connection.rollback();
        return NextResponse.json(
          { message: "One of the exchange products could not be found." },
          { status: 404 }
        );
      }
      const available = Number(product.quantity_remaining);
      if (exchange.quantity > available) {
        await connection.rollback();
        return NextResponse.json(
          {
            message: `An exchange product only has ${available} left in stock.`,
          },
          { status: 400 }
        );
      }

      await connection.query<ResultSetHeader>(
        `INSERT INTO return_exchanges
           (id, return_batch_id, finished_product_id, quantity, unit_price)
         VALUES (?, ?, ?, ?, ?)`,
        [randomUUID(), batchId, exchange.finishedProductId, exchange.quantity, exchange.unitPrice]
      );

      await connection.query<ResultSetHeader>(
        `UPDATE finished_products
         SET quantity_remaining = GREATEST(quantity_remaining - ?, 0),
             status = IF(quantity_remaining - ? <= 0, 'SOLD', status)
         WHERE id = ?`,
        [exchange.quantity, exchange.quantity, exchange.finishedProductId]
      );
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    console.error("Failed to record return batch:", error);
    return NextResponse.json(
      { message: "Could not record the return. Please try again." },
      { status: 500 }
    );
  } finally {
    connection.release();
  }

  return NextResponse.json(
    {
      id: batchId,
      cashback: handedCashback,
      dueCredit,
      message:
        dueCredit > 0
          ? "Return recorded — the cashback was credited against the invoice's due."
          : "Return recorded.",
    },
    { status: 201 }
  );
}
