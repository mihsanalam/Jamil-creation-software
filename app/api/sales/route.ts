import { NextResponse } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { randomUUID } from "crypto";

import { auth } from "@/auth";
import { db } from "@/lib/db";

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

function round2(value: number) {
  return Math.round(value * 100) / 100;
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
 *   f. Mark every sold finished product as 'SOLD' (MVP assumption: the full
 *      quantity goes in one sale — partial stock splitting is a future
 *      enhancement).
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

  const subtotal = round2(
    items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
  );
  const total = Math.max(round2(subtotal - discount), 0);
  const paymentStatus =
    amountPaid >= total ? "PAID" : amountPaid > 0 ? "PARTIAL" : "DUE";

  const connection = await db.getConnection();
  let saleId = "";
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
        // status flip below are atomic against other concurrent sales.
        for (const item of items) {
          const [productRows] = await connection.query<ProductRow[]>(
            `SELECT id, status, quantity FROM finished_products
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
          if (item.quantity > Number(product.quantity)) {
            await connection.rollback();
            return NextResponse.json(
              {
                message: `Item quantity exceeds the ${Number(
                  product.quantity
                )} pcs available in stock.`,
              },
              { status: 400 }
            );
          }
        }

        // Generate the next invoice number for this year, atomically.
        const prefix = `INV-${new Date().getFullYear()}-`;
        const [invoiceRows] = await connection.query<InvoiceRow[]>(
          `SELECT invoice_number FROM sales
           WHERE invoice_number LIKE ?
           ORDER BY CAST(SUBSTRING_INDEX(invoice_number, '-', -1) AS UNSIGNED) DESC
           LIMIT 1
           FOR UPDATE`,
          [`${prefix}%`]
        );
        const lastNumber = invoiceRows[0]
          ? parseInt(invoiceRows[0].invoice_number.slice(prefix.length), 10)
          : 0;
        const invoiceNumber = `${prefix}${String(lastNumber + 1).padStart(4, "0")}`;

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

        // One sale_items row per item, then flip the product to SOLD.
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
              round2(item.quantity * item.unitPrice),
            ]
          );
          await connection.query<ResultSetHeader>(
            `UPDATE finished_products SET status = 'SOLD' WHERE id = ?`,
            [item.finishedProductId]
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
