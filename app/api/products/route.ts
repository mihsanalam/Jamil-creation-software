import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";

import { auth } from "@/auth";
import { db } from "@/lib/db";

// One product-type row from the aggregate query.
interface ProductTypeRow extends RowDataPacket {
  product_type: string;
  lot_count: string;
  produced: string;
  remaining: string;
  sold: string;
}

/**
 * GET /api/products — an aggregated product catalogue: every distinct product
 * type currently produced (from finished goods → work orders) with totals:
 * - lotCount:  how many finished lots of this type exist
 * - produced:  total pieces manufactured
 * - remaining: pieces still sellable today (from quantity_remaining)
 * - sold:      pieces already sold
 */
export async function GET() {
  // Middleware skips /api routes, so the session is verified here directly.
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const [rows] = await db.query<ProductTypeRow[]>(
      `SELECT wo.product_type,
              COUNT(fp.id) AS lot_count,
              COALESCE(SUM(fp.quantity), 0) AS produced,
              COALESCE(SUM(fp.quantity_remaining), 0) AS remaining,
              COALESCE(SUM(fp.quantity - fp.quantity_remaining), 0) AS sold
       FROM finished_products fp
       JOIN work_orders wo ON wo.id = fp.work_order_id
       GROUP BY wo.product_type
       ORDER BY produced DESC`
    );

    return NextResponse.json({
      products: rows.map((row) => ({
        productType: row.product_type,
        lotCount: Number(row.lot_count),
        produced: Number(row.produced),
        remaining: Number(row.remaining),
        sold: Number(row.sold),
      })),
    });
  } catch (error) {
    console.error("Failed to list products:", error);
    return NextResponse.json(
      { message: "Could not load products. Please try again." },
      { status: 500 }
    );
  }
}
