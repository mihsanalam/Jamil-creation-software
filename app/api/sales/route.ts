import { NextResponse } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { randomUUID } from "crypto";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { isBlockDueClientsEnabled } from "@/lib/app-settings";
import { logAudit } from "@/lib/audit";
import { invoiceNumberPrefix, nextNumber } from "@/lib/numbering";
import {
  computeSaleTotals,
  derivePaymentStatus,
  lineTotal,
  round2,
} from "@/lib/sales-totals";

// One cart line as sent by the POS screen.
interface SaleItemInput {
  finishedProductId: string;
  quantity: number;
  unitPrice: number;
}

// Shape of the invoice-number row used by the incrementing generator.
interface InvoiceRow extends RowDataPacket {
  invoice_number: string;
}

interface ClientRow extends RowDataPacket {
  id: string;
}

interface ProductRow extends RowDataPacket {
  id: string;
  status: string;
  quantity: string;
  quantity_remaining: string;
}

const PAYMENT_METHODS = new Set(["CASH", "BKASH", "NAGAD", "BANK_TRANSFER"]);

function isDuplicateKeyError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "ER_DUP_ENTRY"
  );
}

/**
 * POST /api/sales — records a sale from the POS screen.
 *
 * Body: { clientId, items: [{ finishedProductId, quantity, unitPrice }],
 *         discount, paymentMethod, amountPaid }
 *
 * Steps (one transaction, with an invoice-number race retry):
 *   a. Generate invoice_number "INV-<year>-XXXX" (one past the highest
 *      existing number for that year).
 *   b. subtotal = sum(quantity * unitPrice), total = subtotal - discount.
 *   c. payment_status: 'PAID' if amountPaid >= total, 'PARTIAL' if
 *      amountPaid > 0 but less, 'DUE' if amountPaid = 0.
 *   d. Insert the sale.
 *   e. Insert one sale_items row per item.
 *   f. Subtract the sold quantity from each product's quantity_remaining;
 *      only flip the product to 'SOLD' once quantity_remaining reaches 0, so
 *      a partial lot can keep selling from its remaining stock.
 *   g. When the customer paid anything at the counter (amountPaid > 0),
 *      insert a matching payments row so this initial payment shows up in
 *      the client's payment history (Due Collection) with its amount,
 *      method and date — exactly like payments collected later.
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

  const clientId =
    typeof body.clientId === "string" ? body.clientId.trim() : "";
  const discount =
    typeof body.discount === "number" && body.discount >= 0
      ? round2(body.discount)
      : NaN;
  const paymentMethod =
    typeof body.paymentMethod === "string" ? body.paymentMethod.trim() : "";
  const amountPaid =
    typeof body.amountPaid === "number" && body.amountPaid >= 0
      ? round2(body.amountPaid)
      : NaN;

  // Validate the items array.
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json(
      { message: "At least one sale item is required." },
      { status: 400 }
    );
  }
  const items: SaleItemInput[] = [];
  for (const raw of body.items) {
    const item = raw as Record<string, unknown>;
    const finishedProductId =
      typeof item.finishedProductId === "string"
        ? item.finishedProductId.trim()
        : "";
    const quantity =
      typeof item.quantity === "number" && item.quantity > 0
        ? item.quantity
        : NaN;
    const unitPrice =
      typeof item.unitPrice === "number" && item.unitPrice >= 0
        ? round2(item.unitPrice)
        : NaN;
    if (
      !finishedProductId ||
      Number.isNaN(quantity) ||
      Number.isNaN(unitPrice)
    ) {
      return NextResponse.json(
        {
          message:
            "Every item needs a product, a quantity > 0, and a unit price.",
        },
        { status: 400 }
      );
    }
    items.push({ finishedProductId, quantity, unitPrice });
  }

  if (clientId === "") {
    return NextResponse.json(
      { message: "clientId is required." },
      { status: 400 }
    );
  }
  if (Number.isNaN(discount)) {
    return NextResponse.json(
      { message: "discount must be a number >= 0." },
      { status: 400 }
    );
  }
  if (!PAYMENT_METHODS.has(paymentMethod)) {
    return NextResponse.json(
      {
        message: `paymentMethod must be one of: ${[...PAYMENT_METHODS].join(", ")}`,
      },
      { status: 400 }
    );
  }
  if (Number.isNaN(amountPaid)) {
    return NextResponse.json(
      { message: "amountPaid must be a number >= 0." },
      { status: 400 }
    );
  }

  // Money math lives in lib/sales-totals.ts so the POS preview and this route
  // can never disagree (unit tested).
  const { subtotal, total } = computeSaleTotals(items, discount);
  const paymentStatus = derivePaymentStatus(amountPaid, total);

  // #27 Policy: when the Owner enables "block credit sales to clients with
  // dues", a new sale that wouldn't be fully paid (→ DUE/PARTIAL) is refused
  // to a client who already owes money. Fully-paid sales are never blocked.
  if (paymentStatus !== "PAID") {
    const [dueRows] = await db.query<RowDataPacket[]>(
      `SELECT COALESCE(SUM(total - amount_paid), 0) AS outstanding_due
       FROM sales WHERE client_id = ?`,
      [clientId]
    );
    const outstandingDue = Number(dueRows[0]?.outstanding_due ?? 0);
    if (outstandingDue > 0 && (await isBlockDueClientsEnabled())) {
      return NextResponse.json(
        {
          message:
            "This client has outstanding dues, and credit sales to due clients are blocked. Collect the dues (or take full payment) first.",
        },
        { status: 409 }
      );
    }
  }

  const connection = await db.getConnection();
  let saleId = "";
  let invoiceNumber = "";
  try {
    // Retry loop: a duplicate invoice number (two concurrent sales picking
    // the same XXXX) re-runs the whole transaction with the next number.
    for (let attempt = 0; attempt < 3; attempt++) {
      await connection.beginTransaction();
      try {
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

        // Lock every product first so the stock/status checks and the
        // quantity_remaining decrement below are atomic against other
        // concurrent sales.
        for (const item of items) {
          const [productRows] = await connection.query<ProductRow[]>(
            `SELECT id, status, quantity, quantity_remaining FROM finished_products
             WHERE id = ?
             LIMIT 1
             FOR UPDATE`,
            [item.finishedProductId]
          );
          const product = productRows[0];
          if (!product) {
            await connection.rollback();
            return NextResponse.json(
              { message: "One of the products could not be found." },
              { status: 404 }
            );
          }
          if (product.status !== "IN_STOCK") {
            await connection.rollback();
            return NextResponse.json(
              { message: "One of the products has already been sold." },
              { status: 409 }
            );
          }
          const available = Number(product.quantity_remaining);
          if (item.quantity > available) {
            await connection.rollback();
            return NextResponse.json(
              {
                message: `Item quantity exceeds the ${available} pcs left in stock.`,
              },
              { status: 400 }
            );
          }
        }

        // Generate the next invoice number for this year, atomically.
        const prefix = invoiceNumberPrefix(new Date().getFullYear());
        const [invoiceRows] = await connection.query<InvoiceRow[]>(
          `SELECT invoice_number FROM sales
           WHERE invoice_number LIKE ?
           ORDER BY CAST(SUBSTRING_INDEX(invoice_number, '-', -1) AS UNSIGNED) DESC
           LIMIT 1
           FOR UPDATE`,
          [`${prefix}%`]
        );
        const invoiceNumberGenerated = nextNumber(
          prefix,
          invoiceRows[0]?.invoice_number
        );
        invoiceNumber = invoiceNumberGenerated;

        // Insert the sale.
        saleId = randomUUID();
        await connection.query<ResultSetHeader>(
          `INSERT INTO sales
             (id, invoice_number, client_id, subtotal, discount, total,
              amount_paid, payment_method, payment_status, created_by_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            saleId,
            invoiceNumber,
            clientId,
            subtotal,
            discount,
            total,
            amountPaid,
            paymentMethod,
            paymentStatus,
            session.user.id,
          ]
        );

        // One sale_items row per item, then decrement the product's remaining
        // stock. The product (already SELECT ... FOR UPDATE above) stays
        // IN_STOCK while anything is left, and only flips to SOLD at 0.
        for (const item of items) {
          await connection.query<ResultSetHeader>(
            `INSERT INTO sale_items
               (id, sale_id, finished_product_id, quantity, unit_price, line_total)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
              randomUUID(),
              saleId,
              item.finishedProductId,
              item.quantity,
              item.unitPrice,
              lineTotal(item.quantity, item.unitPrice),
            ]
          );
          await connection.query<ResultSetHeader>(
            `UPDATE finished_products
             SET quantity_remaining = GREATEST(quantity_remaining - ?, 0),
                 status = IF(quantity_remaining - ? <= 0, 'SOLD', status)
             WHERE id = ?`,
            [item.quantity, item.quantity, item.finishedProductId]
          );
        }

        // Record the payment the customer gave at the counter (if any) in
        // the payments ledger, tied to this sale. The date column defaults
        // to NOW(), so the history shows when the money was actually taken.
        if (amountPaid > 0) {
          await connection.query<ResultSetHeader>(
            `INSERT INTO payments
               (id, client_id, sale_id, amount, method, recorded_by_id)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
              randomUUID(),
              clientId,
              saleId,
              amountPaid,
              paymentMethod,
              session.user.id,
            ]
          );
        }

        await connection.commit();
        break;
      } catch (error) {
        await connection.rollback();
        if (isDuplicateKeyError(error) && attempt < 2) continue;
        throw error;
      }
    }

    // Audit trail: record the completed sale.
    await logAudit({
      actorId: session.user.id,
      actorName: session.user.name ?? "unknown",
      action: "SALE_CREATE",
      entityType: "sale",
      entityId: saleId,
      details: {
        invoiceNumber,
        clientId,
        subtotal,
        discount,
        total,
        amountPaid,
        paymentMethod,
        paymentStatus,
        itemCount: items.length,
      },
    });

    return NextResponse.json(
      {
        id: saleId,
        subtotal,
        discount,
        total,
        amountPaid,
        paymentMethod,
        paymentStatus,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to record sale:", error);
    return NextResponse.json(
      { message: "Could not record the sale. Please try again." },
      { status: 500 }
    );
  } finally {
    connection.release();
  }
}
