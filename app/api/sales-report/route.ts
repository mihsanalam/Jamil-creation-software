import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";

import { auth } from "@/auth";
import { db } from "@/lib/db";

// A single-numeric-value row (COUNT / SUM result).
interface ScalarRow extends RowDataPacket {
  value: string | number;
}

// One day's sales total for the trend line.
interface TrendRow extends RowDataPacket {
  day: Date;
  amount: string;
}

// One sale joined with its client name.
interface SaleRow extends RowDataPacket {
  id: string;
  invoice_number: string;
  total: string;
  amount_paid: string;
  payment_status: string;
  created_at: Date;
  client_name: string;
  client_type: string;
}

// One client-with-due row (outstanding balance > 0).
interface ClientDueRow extends RowDataPacket {
  id: string;
  name: string;
  phone: string;
  type: string;
  total_due: string;
  last_payment_date: Date | null;
}

// Reads the first numeric cell of a one-row aggregate query.
async function scalar(sql: string, params: unknown[] = []): Promise<number> {
  const [rows] = await db.query<ScalarRow[]>(sql, params);
  const row = rows[0];
  if (!row) return 0;
  return typeof row.value === "number" ? row.value : Number(row.value ?? 0);
}

// Translates the ?range= query param into a WHERE clause (with params).
// totalOutstandingDues is intentionally range-independent -- a due doesn't
// stop being owed just because the reporting window changed.
function buildRangeClause(range: string): string {
  switch (range) {
    case "this_month":
      return (
        "DATE(s.created_at) >= DATE_FORMAT(CURDATE(),'%Y-%m-01') AND " +
        "DATE(s.created_at) < DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL 1 MONTH),'%Y-%m-01')"
      );
    case "last_month":
      return (
        "DATE(s.created_at) >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 MONTH),'%Y-%m-01') AND " +
        "DATE(s.created_at) < DATE_FORMAT(CURDATE(),'%Y-%m-01')"
      );
    case "all":
      return "";
    default:
      return (
        "DATE(s.created_at) >= DATE_FORMAT(CURDATE(),'%Y-%m-01') AND " +
        "DATE(s.created_at) < DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL 1 MONTH),'%Y-%m-01')"
      );
  }
}

/**
 * GET /api/sales-report - the data feed for the Owner "Sales and dues" page.
 *
 * ?range=this_month|last_month|all (default: this_month).
 *
 * Returns:
 *   - totalSales, retailSales, wholesaleSales (scoped to range)
 *   - totalOutstandingDues (ALL TIME, range-independent)
 *   - salesTrend (per-day totals in range, for the line chart)
 *   - allSales (each sale in range, joined with client name + type)
 *   - clientsWithDues (clients with outstanding balance > 0 + last payment date)
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const range = searchParams.get("range")?.trim() || "this_month";

  // 400 on an unsupported range - keeps the caller from silently getting
  // "this month" data by accident.
  if (!["this_month", "last_month", "all"].includes(range)) {
    return NextResponse.json(
      { message: "Invalid range. Use this_month, last_month, or all." },
      { status: 400 }
    );
  }

  const dateClause = buildRangeClause(range);
  // WHERE prefix varies: either empty (all), or "WHERE <dateClause>".
  const whereSales = dateClause ? `WHERE ${dateClause}` : "";

  try {
    // --- Range-scoped metrics (run in parallel) ---
    const [totalSales, retailSales, wholesaleSales, trendRows, saleRows] =
      await Promise.all([
        scalar(
          `SELECT COALESCE(SUM(total), 0) AS value FROM sales s ${whereSales}`
        ),
        scalar(
          `SELECT COALESCE(SUM(s.total), 0) AS value
           FROM sales s
           JOIN clients c ON c.id = s.client_id
           ${whereSales} AND c.type = 'RETAIL'`
        ),
        scalar(
          `SELECT COALESCE(SUM(s.total), 0) AS value
           FROM sales s
           JOIN clients c ON c.id = s.client_id
           ${whereSales} AND c.type = 'WHOLESALE'`
        ),
        db.query<TrendRow[]>(
          `SELECT DATE(s.created_at) AS day, COALESCE(SUM(s.total), 0) AS amount
           FROM sales s
           ${whereSales}
           GROUP BY DATE(s.created_at)
           ORDER BY day`
        ),
        db.query<SaleRow[]>(
          `SELECT s.id, s.invoice_number, s.total, s.amount_paid, s.payment_status,
                  s.created_at, c.name AS client_name, c.type AS client_type
           FROM sales s
           JOIN clients c ON c.id = s.client_id
           ${whereSales}
           ORDER BY s.created_at DESC`
        ),
      ]);

    // --- Range-INDEPENDENT outstanding dues (all clients, all time) ---
    const totalOutstandingDues = await scalar(
      `SELECT COALESCE(SUM(total - amount_paid), 0) AS value
       FROM sales
       WHERE payment_status IN ('DUE', 'PARTIAL')`
    );

    // --- Clients with dues + their most recent payment date ---
    // db.query returns [rows, fields]; take the rows array.
    const clientDueRows = (
      await db.query<ClientDueRow[]>(
        `SELECT c.id, c.name, c.phone, c.type,
                COALESCE(SUM(s.total - s.amount_paid), 0) AS total_due,
                (SELECT MAX(p.date)
                 FROM payments p
                 WHERE p.client_id = c.id) AS last_payment_date
         FROM sales s
         JOIN clients c ON c.id = s.client_id
         WHERE s.payment_status IN ('DUE', 'PARTIAL')
         GROUP BY c.id, c.name, c.phone, c.type
         HAVING SUM(s.total - s.amount_paid) > 0
         ORDER BY total_due DESC`
      )
    )[0] ?? [];

    return NextResponse.json({
      totalSales: Number(totalSales),
      retailSales: Number(retailSales),
      wholesaleSales: Number(wholesaleSales),
      totalOutstandingDues: Number(totalOutstandingDues),
      salesTrend: (trendRows[0] ?? []).map((row: TrendRow) => ({
        date: (row.day as Date).toISOString(),
        amount: Number(row.amount),
      })),
      allSales: (saleRows[0] ?? []).map((row: SaleRow) => ({
        id: row.id,
        invoiceNumber: row.invoice_number,
        date: row.created_at,
        client: row.client_name,
        type: row.client_type,
        amount: Number(row.total),
        paymentStatus: row.payment_status,
      })),
      clientsWithDues: clientDueRows.map((row: ClientDueRow) => ({
        id: row.id,
        name: row.name,
        phone: row.phone,
        type: row.type,
        totalDue: Number(row.total_due),
        lastPaymentDate: row.last_payment_date
          ? (row.last_payment_date as Date).toISOString()
          : null,
      })),
    });
  } catch (error) {
    console.error("Failed to load sales report:", error);
    return NextResponse.json(
      { message: "Could not load the sales report. Please try again." },
      { status: 500 }
    );
  }
}
