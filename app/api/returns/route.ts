import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";

import { auth } from "@/auth";
import { db } from "@/lib/db";

// The sale_items row being returned, joined with its product.
interface SaleItemRow extends RowDataPacket {
  id: string;
  quantity: string;
  finished_product_id: string;
}

// Sum of everything already returned for this sale item.
interface ReturnedRow extends RowDataPacket {
  total_returned: string;
}

/**
 * POST /api/returns — records a return against one sale_items line.
 *
 * Body: { saleItemId: string, quantity: number, reason?: string }
 *
 * In one transaction:
 *   a. Lock the sale_item row and compute how much of it is still
 *      returnable (originally sold minus already returned).
 *   b. Insert the returns row.
 *   c. Add the returned quantity back onto the product's
 *      quantity_remaining, and flip its status from 'SOLD' back to
 *      'IN_STOCK' if the lot had been fully sold out.
 *
 * Scope note: the sale's total and amount_paid are deliberately NOT
 * touched — refunding money is a business decision the Owner makes
 * manually. This endpoint only logs the return and restores the stock.
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

  const saleItemId =
    typeof body.saleItemId === "string" ? body.saleItemId.trim() : "";
  const quantity =
    typeof body.quantity === "number" && Number.isFinite(body.quantity)
      ? body.quantity
      : NaN;
  const reason =
    typeof body.reason === "string" && body.reason.trim() !== ""
      ? body.reason.trim()
      : null;

  if (saleItemId === "") {
    return NextResponse.json(
      { message: "saleItemId is required." },
      { status: 400 }
    );
  }
  if (Number.isNaN(quantity) || quantity <= 0) {
    return NextResponse.json(
      { message: "quantity must be a number greater than 0." },
      { status: 400 }
    );
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // Lock the sale item so two concurrent returns of the same line
    // serialize here instead of both passing the remaining-quantity check.
    const [itemRows] = await connection.query<SaleItemRow[]>(
      `SELECT id, quantity, finished_product_id FROM sale_items
       WHERE id = ?
       LIMIT 1
       FOR UPDATE`,
      [saleItemId]
    );
    const saleItem = itemRows[0];
    if (!saleItem) {
      await connection.rollback();
      return NextResponse.json(
        { message: "Sale item not found." },
        { status: 404 }
      );
    }

    const [returnedRows] = await connection.query<ReturnedRow[]>(
      `SELECT COALESCE(SUM(quantity), 0) AS total_returned
       FROM returns
       WHERE sale_item_id = ?`,
      [saleItemId]
    );
    const sold = Number(saleItem.quantity);
    const alreadyReturned = Number(returnedRows[0]?.total_returned ?? 0);
    const returnable = sold - alreadyReturned;
    if (quantity > returnable) {
      await connection.rollback();
      return NextResponse.json(
        {
          message:
            returnable <= 0
              ? "Everything on this line has already been returned."
              : `Only ${returnable} of the ${sold} sold can still be returned.`,
        },
        { status: 400 }
      );
    }

    const id = randomUUID();
    await connection.query<ResultSetHeader>(
      `INSERT INTO returns (id, sale_item_id, quantity, reason, recorded_by_id)
       VALUES (?, ?, ?, ?, ?)`,
      [id, saleItemId, quantity, reason, session.user.id]
    );

    // Put the stock back. Quantity is always > 0 here, so a lot that had
    // been fully sold out (status 'SOLD') becomes sellable again.
    await connection.query<ResultSetHeader>(
      `UPDATE finished_products
       SET quantity_remaining = quantity_remaining + ?,
           status = IF(status = 'SOLD', 'IN_STOCK', status)
       WHERE id = ?`,
      [quantity, saleItem.finished_product_id]
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    console.error("Failed to record return:", error);
    return NextResponse.json(
      { message: "Could not record the return. Please try again." },
      { status: 500 }
    );
  } finally {
    connection.release();
  }

  return NextResponse.json(
    { message: "Return recorded. Stock has been restored." },
    { status: 201 }
  );
}
