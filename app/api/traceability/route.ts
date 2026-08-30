import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";

import { auth } from "@/auth";
import { db } from "@/lib/db";

// A finished product joined with its work order + fabric batch (from the search).
interface SearchRow extends RowDataPacket {
  id: string;
  barcode: string;
  quantity: string;
  quantity_remaining: string;
  batch_number: string;
  product_type: string;
}

/**
 * GET /api/traceability?query=X — partial, case-insensitive search across a
 * finished product's barcode, its fabric batch number, and its product type.
 * Returns lightweight matches for the page's search dropdown (not the full trace).
 */
export async function GET(request: Request) {
  const session = await auth();
  if (session?.user?.role !== "OWNER") {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query")?.trim();
  if (!query) {
    return NextResponse.json(
      { message: 'The "query" parameter is required.' },
      { status: 400 }
    );
  }

  try {
    // MySQL's default (case-insensitive) collation makes LIKE match without
    // regard to case. Escape the user's wildcards so "%" can't broaden the
    // search into matching every row.
    const escaped = query.replace(/\\/g, "\\\\").replace(/[%_]/g, "\\$&");
    const like = `%${escaped}%`;

    const [rows] = await db.query<SearchRow[]>(
      `SELECT fp.id, fp.barcode, fp.quantity, fp.quantity_remaining,
              fb.batch_number, wo.product_type
       FROM finished_products fp
       JOIN work_orders wo ON wo.id = fp.work_order_id
       JOIN fabric_batches fb ON fb.id = wo.fabric_batch_id
       WHERE fp.barcode LIKE ? ESCAPE '\\\\'
          OR fb.batch_number LIKE ? ESCAPE '\\\\'
          OR wo.product_type LIKE ? ESCAPE '\\\\'
       ORDER BY fp.date_added DESC
       LIMIT 20`,
      [like, like, like]
    );

    return NextResponse.json(
      rows.map((row) => ({
        id: row.id,
        barcode: row.barcode,
        batchNumber: row.batch_number,
        productType: row.product_type,
        quantity: Number(row.quantity),
        quantityRemaining: Number(row.quantity_remaining),
      }))
    );
  } catch (error) {
    console.error("Failed to search traceability:", error);
    return NextResponse.json(
      { message: "Could not search. Please try again." },
      { status: 500 }
    );
  }
}