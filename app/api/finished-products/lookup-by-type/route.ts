import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";

import { auth } from "@/auth";
import { db } from "@/lib/db";

// One finished product joined with its work order + fabric batch.
interface LookupRow extends RowDataPacket {
  id: string;
  work_order_id: string;
  barcode: string;
  quantity_remaining: string;
  storage_location: string;
  status: string;
  date_added: Date;
  batch_number: string;
  product_type: string;
}

/**
 * GET /api/finished-products/lookup-by-type?type=Lungi — returns ALL in-stock
 * products whose product_type contains the given term (case-insensitive). Used
 * by the POS when an operator does not have a printed barcode and wants to sell
 * by product type instead.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type")?.trim();
  if (!type) {
    return NextResponse.json(
      { message: "type query parameter is required." },
      { status: 400 }
    );
  }

  try {
    const [rows] = await db.query<LookupRow[]>(
      `SELECT fp.id, fp.work_order_id, fp.barcode, fp.quantity_remaining,
              fp.storage_location, fp.status, fp.date_added,
              fb.batch_number, wo.product_type
       FROM finished_products fp
       JOIN work_orders wo ON wo.id = fp.work_order_id
       JOIN fabric_batches fb ON fb.id = wo.fabric_batch_id
       WHERE fp.status = 'IN_STOCK'
         AND fp.quantity_remaining > 0
         AND LOWER(wo.product_type) LIKE LOWER(?)
       ORDER BY wo.product_type, fp.barcode`,
      [`%${type}%`]
    );

    return NextResponse.json(
      rows.map((row) => ({
        id: row.id,
        workOrderId: row.work_order_id,
        barcode: row.barcode,
        quantity: Number(row.quantity_remaining),
        quantityRemaining: Number(row.quantity_remaining),
        storageLocation: row.storage_location,
        status: row.status,
        dateAdded: row.date_added,
        batchNumber: row.batch_number,
        productType: row.product_type,
      }))
    );
  } catch (error) {
    console.error("Failed to look up products by type:", error);
    return NextResponse.json(
      { message: "Could not look up products. Please try again." },
      { status: 500 }
    );
  }
}