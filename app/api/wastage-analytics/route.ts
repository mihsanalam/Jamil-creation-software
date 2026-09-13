import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";

import { auth } from "@/auth";
import { db } from "@/lib/db";

interface ReasonRow extends RowDataPacket {
  reason: string | null;
  c: string;
  qty: string;
}

interface ProductRow extends RowDataPacket {
  product_type: string;
  c: string;
  qty: string;
  revenue: string;
}

interface BatchRow extends RowDataPacket {
  batch_number: string;
  product_type: string;
  fabric_type: string;
  supplier: string;
  qty: string;
  revenue: string;
}

interface MonthRow extends RowDataPacket {
  month: Date;
  qty: string;
  cashback: string;
}

/**
 * GET /api/wastage-analytics — returns/defect intelligence (Owner only).
 * ?start=YYYY-MM-DD &end=YYYY-MM-DD (optional, defaults to last 6 months).
 *
 * Aggregates the `returns` table (each row = one returned line with a reason)
 * so the owner can spot quality problems tied to specific products, batches
 * or suppliers, plus a month-by-month returns trend.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "OWNER") {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const startParam = searchParams.get("start")?.trim();
  const endParam = searchParams.get("end")?.trim();

  const now = new Date();
  const defaultStart = new Date(now.getFullYear(), now.getMonth() - 5, 1)
    .toISOString()
    .slice(0, 10);
  const defaultEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    .toISOString()
    .slice(0, 10);

  const start = startParam || defaultStart;
  const end = endParam || defaultEnd;

  const dateWhere = `DATE(r.date) >= '${start}' AND DATE(r.date) <= '${end}'`;

  try {
    const [totals, reasons, products, batches, months] = await Promise.all([
      db.query<RowDataPacket[]>(
        `SELECT COUNT(*) AS returnLines, COALESCE(SUM(r.quantity), 0) AS totalQty
         FROM returns r WHERE ${dateWhere}`
      ),
      db.query<ReasonRow[]>(
        `SELECT r.reason, COUNT(*) AS c, COALESCE(SUM(r.quantity), 0) AS qty
         FROM returns r WHERE ${dateWhere}
         GROUP BY r.reason ORDER BY qty DESC`
      ),
      db.query<ProductRow[]>(
        `SELECT wo.product_type, COUNT(*) AS c, COALESCE(SUM(r.quantity), 0) AS qty,
                COALESCE(SUM(r.quantity * si.unit_price), 0) AS revenue
         FROM returns r
         JOIN sale_items si ON si.id = r.sale_item_id
         JOIN finished_products fp ON fp.id = si.finished_product_id
         JOIN work_orders wo ON wo.id = fp.work_order_id
         WHERE ${dateWhere}
         GROUP BY wo.product_type ORDER BY qty DESC LIMIT 10`
      ),
      db.query<BatchRow[]>(
        `SELECT fb.batch_number, wo.product_type, fb.fabric_type, fb.supplier,
                COALESCE(SUM(r.quantity), 0) AS qty,
                COALESCE(SUM(r.quantity * si.unit_price), 0) AS revenue
         FROM returns r
         JOIN sale_items si ON si.id = r.sale_item_id
         JOIN finished_products fp ON fp.id = si.finished_product_id
         JOIN work_orders wo ON wo.id = fp.work_order_id
         JOIN fabric_batches fb ON fb.id = wo.fabric_batch_id
         WHERE ${dateWhere}
         GROUP BY fb.id, fb.batch_number, wo.product_type, fb.fabric_type, fb.supplier
         ORDER BY qty DESC LIMIT 10`
      ),
      db.query<MonthRow[]>(
        `SELECT DATE_FORMAT(r.date, '%Y-%m-01') AS month,
                COALESCE(SUM(r.quantity), 0) AS qty,
                COALESCE(SUM(rb.cashback), 0) AS cashback
         FROM returns r
         LEFT JOIN return_batches rb ON rb.id = r.return_batch_id
         WHERE ${dateWhere}
         GROUP BY month ORDER BY month`
      ),
    ]);

    const totalsRow = totals[0][0];
    const totalQty = Number(totalsRow?.totalQty ?? 0);
    const returnLines = Number(totalsRow?.returnLines ?? 0);

    const monthTrend = months[0].map((row) => ({
      month: new Date(row.month).toISOString().slice(0, 10),
      returnedQty: Number(row.qty),
      cashback: Number(row.cashback),
    }));

    // Returned value as a share of invoiced revenue over the same window —
    // the closest thing to a "defect rate" the current schema supports.
    const [revenueRow] = await db.query<RowDataPacket[]>(
      `SELECT COALESCE(SUM(s.total), 0) AS revenue
       FROM sales s WHERE DATE(s.created_at) >= '${start}' AND DATE(s.created_at) <= '${end}'`
    );
    const revenue = Number(revenueRow[0]?.revenue ?? 0);

    return NextResponse.json({
      period: { start, end },
      summary: {
        returnLines,
        returnedQty: totalQty,
        returnedValue: monthTrend.reduce((sum, m) => sum + m.cashback, 0),
        returnedQtyPctOfRevenue: revenue > 0 ? Math.round((totalQty / revenue) * 100) : 0,
      },
      reasons: reasons[0].map((row) => ({
        reason: row.reason,
        count: Number(row.c),
        qty: Number(row.qty),
      })),
      products: products[0].map((row) => ({
        productType: row.product_type,
        returnCount: Number(row.c),
        returnedQty: Number(row.qty),
        returnedValue: Number(row.revenue),
      })),
      batches: batches[0].map((row) => ({
        batchNumber: row.batch_number,
        productType: row.product_type,
        fabricType: row.fabric_type,
        supplier: row.supplier,
        returnedQty: Number(row.qty),
        returnedValue: Number(row.revenue),
      })),
      monthTrend,
    });
  } catch (error) {
    console.error("Failed to load wastage analytics:", error);
    return NextResponse.json(
      { message: "Could not load wastage analytics. Please try again." },
      { status: 500 }
    );
  }
}
