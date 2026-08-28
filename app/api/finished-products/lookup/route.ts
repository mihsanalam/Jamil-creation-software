import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";

import { auth } from "@/auth";
import { db } from "@/lib/db";

// One finished product joined with its work order + fabric batch.
interface LookupRow extends RowDataPacket {
  id: string;
  work_order_id: string;
  barcode: string;
  quantity: string;
  storage_location: string;
  status: string;
  date_added: Date;
  batch_number: string;
  product_type: string;
}

/**
 * GET /api/finished-products/lookup?barcode=JC-0001 — returns ONE product by
 * its exact barcode, but only while it is still IN_STOCK. Returns 404 when
 * the barcode is unknown or the product has already been sold, so the POS
 * scanner can reject double-selling straight away.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const barcode = searchParams.get("barcode")?.trim();
  if (!barcode) {
    return NextResponse.json(
      { message: "barcode query parameter is required." },
      { status: 400 }
    );
  }

  try {
    const [rows] = await db.query<LookupRow[]>(
      `SELECT fp.id, fp.work_order_id, fp.barcode, fp.quantity,
              fp.storage_location, fp.status, fp.date_added,
              fb.batch_number, wo.product_type
       FROM finished_products fp
       JOIN work_orders wo ON wo.id = fp.work_order_id
       JOIN fabric_batches fb ON fb.id = wo.fabric_batch_id
       WHERE fp.barcode = ?
       LIMIT 1`,
      [barcode]
    );

    const row = rows[0];
    if (!row || row.status !== "IN_STOCK") {
      return NextResponse.json(
        { message: `No in-stock product found for barcode "${barcode}".` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      id: row.id,
      workOrderId: row.work_order_id,
      barcode: row.barcode,
      quantity: Number(row.quantity),
      storageLocation: row.storage_location,
      status: row.status,
      dateAdded: row.date_added,
      batchNumber: row.batch_number,
      productType: row.product_type,
    });
  } catch (error) {
    console.error("Failed to look up finished product:", error);
    return NextResponse.json(
      { message: "Could not look up the barcode. Please try again." },
      { status: 500 }
    );
  }
}
