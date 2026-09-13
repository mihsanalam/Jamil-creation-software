import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";

import { auth } from "@/auth";
import { db } from "@/lib/db";

interface DiscountDayRow extends RowDataPacket {
  day: Date;
  discount: string;
  total: string;
}

interface MethodRow extends RowDataPacket {
  payment_method: "CASH" | "BKASH" | "NAGAD" | "BANK_TRANSFER";
  c: string;
  amount: string;
}

interface BestSellerRow extends RowDataPacket {
  product_type: string;
  pcs: string;
  revenue: string;
}

interface TopDiscountSaleRow extends RowDataPacket {
  id: string;
  invoice_number: string;
  discount: string;
  total: string;
  created_at: Date;
}

function buildDateClause(start?: string | null, end?: string | null): string {
  const conditions: string[] = [];
  if (start) conditions.push(`DATE(s.created_at) >= '${start}'`);
  if (end) conditions.push(`DATE(s.created_at) <= '${end}'`);
  return conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
}

/**
 * GET /api/sale-analytics — discount & payment-method intelligence (Owner only).
 * ?start=YYYY-MM-DD &end=YYYY-MM-DD (optional; defaults to current month).
 *
 *   - discounts: total value given away, average %, discount-heavy days and
 *     the most discounted invoices in the period
 *   - paymentMix: bKash vs cash vs Nagad vs bank transfer share
 *   - bestSellers: pcs sold + revenue grouped by product type
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
  const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const defaultEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

  const start = startParam || defaultStart;
  const end = endParam || defaultEnd;
  const whereSales = buildDateClause(start, end);

  try {
    const [totals, discountDays, paymentMix, bestSellers, topDiscounted] = await Promise.all([
      db.query<RowDataPacket[]>(
        `SELECT COALESCE(SUM(s.total), 0) AS totalSales,
                COALESCE(SUM(s.discount), 0) AS totalDiscount,
                COALESCE(SUM(s.subtotal), 0) AS totalSubtotal,
                COALESCE(SUM(s.discount > 0), 0) AS salesWithDiscount,
                COUNT(*) AS salesCount
         FROM sales s ${whereSales}`
      ),
      db.query<DiscountDayRow[]>(
        `SELECT DATE(s.created_at) AS day,
                COALESCE(SUM(s.discount), 0) AS discount,
                COALESCE(SUM(s.total), 0) AS total
         FROM sales s ${whereSales}
         GROUP BY DATE(s.created_at)
         HAVING discount > 0
         ORDER BY discount DESC
         LIMIT 10`
      ),
      db.query<MethodRow[]>(
        `SELECT s.payment_method, COUNT(*) AS c, COALESCE(SUM(s.total), 0) AS amount
         FROM sales s ${whereSales}
         GROUP BY s.payment_method
         ORDER BY amount DESC`
      ),
      db.query<BestSellerRow[]>(
        `SELECT wo.product_type,
                COALESCE(SUM(si.quantity), 0) AS pcs,
                COALESCE(SUM(si.line_total), 0) AS revenue
         FROM sale_items si
         JOIN sales s ON s.id = si.sale_id
         JOIN finished_products fp ON fp.id = si.finished_product_id
         JOIN work_orders wo ON wo.id = fp.work_order_id
         ${whereSales}
         GROUP BY wo.product_type
         ORDER BY revenue DESC
         LIMIT 10`
      ),
      db.query<TopDiscountSaleRow[]>(
        `SELECT s.id, s.invoice_number, s.discount, s.total, s.created_at
         FROM sales s ${whereSales}
         ORDER BY s.discount DESC
         LIMIT 5`
      ),
    ]);

    const totalsRow = totals[0][0];
    const totalSalesValue = Number(totalsRow?.totalSales ?? 0);
    const totalSubtotal = Number(totalsRow?.totalSubtotal ?? 0);
    const totalDiscount = Number(totalsRow?.totalDiscount ?? 0);
    const salesCount = Number(totalsRow?.salesCount ?? 0);
    const salesWithDiscount = Number(totalsRow?.salesWithDiscount ?? 0);

    const paymentMethodBreakdown = paymentMix[0].map((row) => ({
      method: row.payment_method,
      count: Number(row.c),
      amount: Number(row.amount),
      /** Share of the period's revenue, 0-100. */
      sharePct:
        totalSalesValue > 0
          ? Math.round((Number(row.amount) / totalSalesValue) * 100)
          : 0,
    }));

    return NextResponse.json({
      period: { start, end },
      discounts: {
        totalDiscount,
        totalSalesValue,
        /** Total discount as % of pre-discount subtotal. */
        avgDiscountPct:
          totalSubtotal > 0
            ? Math.round((totalDiscount / totalSubtotal) * 100)
            : 0,
        salesWithDiscount,
        salesCount,
        discountHeavyDays: discountDays[0].map((row) => ({
          day: new Date(row.day).toISOString().slice(0, 10),
          discount: Number(row.discount),
          total: Number(row.total),
        })),
        topDiscountedSales: topDiscounted[0].map((row) => ({
          id: row.id,
          invoiceNumber: row.invoice_number,
          discount: Number(row.discount),
          total: Number(row.total),
          date: new Date(row.created_at).toISOString(),
        })),
      },
      paymentMix: paymentMethodBreakdown,
      bestSellers: bestSellers[0].map((row) => ({
        productType: row.product_type,
        pcsSold: Number(row.pcs),
        revenue: Number(row.revenue),
      })),
    });
  } catch (error) {
    console.error("Failed to load sale analytics:", error);
    return NextResponse.json(
      { message: "Could not load sale analytics. Please try again." },
      { status: 500 }
    );
  }
}
