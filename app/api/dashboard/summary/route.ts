import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";

import { auth } from "@/auth";
import { db } from "@/lib/db";

// A single-numeric-value row (COUNT / SUM result).
interface ScalarRow extends RowDataPacket {
  value: string | number;
}

// One phase-name/count row in the production pipeline breakdown.
interface PhaseCountRow extends RowDataPacket {
  name: string;
  c: string;
}

// One recent-sale row joined with its client.
interface RecentSaleRow extends RowDataPacket {
  invoice_number: string;
  total: string;
  payment_status: string;
  created_at: Date;
  client_name: string;
}

// One client-with-dues row (highest outstanding balances first).
interface ClientDueRow extends RowDataPacket {
  name: string;
  owed: string;
}

// Reads the first numeric cell of a one-row aggregate query.
async function scalar(sql: string): Promise<number> {
  const [rows] = await db.query<ScalarRow[]>(sql);
  const row = rows[0];
  if (!row) return 0;
  return typeof row.value === "number" ? row.value : Number(row.value ?? 0);
}

// NOTE (placeholder): the pipeline bottleneck threshold. A phase is only
// flagged as a bottleneck once more than this many batches sit in it. Tune
// here later once real staffing numbers are known.
const BOTTLENECK_THRESHOLD = 8;

/**
 * GET /api/dashboard/summary — the Owner dashboard's single-shot data feed.
 * Returns every stat the dashboard renders in one JSON object so the page
 * only needs a single SWR subscription (polled every 10s on the client).
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const [
      batchesInProduction,
      totalStock,
      salesToday,
      outstandingDues,
      phaseRows,
      recentSales,
      clientsWithDues,
    ] = await Promise.all([
      // Batches currently moving through production.
      scalar(
        `SELECT COUNT(*) AS value FROM work_orders WHERE status = 'IN_PROGRESS'`
      ),
      // Finished goods sitting in the warehouse.
      scalar(
        `SELECT COALESCE(SUM(quantity), 0) AS value
         FROM finished_products WHERE status = 'IN_STOCK'`
      ),
      // Sales recorded today (by local calendar date).
      scalar(
        `SELECT COALESCE(SUM(total), 0) AS value
         FROM sales WHERE DATE(created_at) = CURDATE()`
      ),
      // Money still owed across all DUE / PARTIAL invoices.
      scalar(
        `SELECT COALESCE(SUM(total - amount_paid), 0) AS value
         FROM sales WHERE payment_status IN ('DUE', 'PARTIAL')`
      ),
      // Phases currently in progress, grouped by name — feeds the pipeline
      // preview columns (e.g. { Cutting: 3, Stitching: 5 }).
      db.query<PhaseCountRow[]>(
        `SELECT name, COUNT(*) AS c
         FROM work_order_phases WHERE status = 'IN_PROGRESS'
         GROUP BY name`
      ),
      // Five newest sales, joined with the client who made them.
      db.query<RecentSaleRow[]>(
        `SELECT s.invoice_number, s.total, s.payment_status, s.created_at,
                c.name AS client_name
         FROM sales s
         JOIN clients c ON c.id = s.client_id
         ORDER BY s.created_at DESC
         LIMIT 5`
      ),
      // Up to five clients with the largest outstanding balances.
      db.query<ClientDueRow[]>(
        `SELECT c.name, COALESCE(SUM(s.total - s.amount_paid), 0) AS owed
         FROM sales s
         JOIN clients c ON c.id = s.client_id
         WHERE s.payment_status IN ('DUE', 'PARTIAL')
         GROUP BY c.id, c.name
         HAVING SUM(s.total - s.amount_paid) > 0
         ORDER BY owed DESC
         LIMIT 5`
      ),
    ]);

    // phaseBreakdown as an object keyed by phase name.
    const phaseBreakdown: Record<string, number> = {};
    for (const row of phaseRows[0]) {
      phaseBreakdown[row.name] = Number(row.c);
    }

    // The phase with the most in-progress batches, if it exceeds the
    // threshold (placeholder — see BOTTLENECK_THRESHOLD).
    let bottleneck: { name: string; count: number } | null = null;
    for (const [name, count] of Object.entries(phaseBreakdown)) {
      if (count > BOTTLENECK_THRESHOLD && (!bottleneck || count > bottleneck.count)) {
        bottleneck = { name, count };
      }
    }

    return NextResponse.json({
      batchesInProduction,
      totalStock,
      salesToday,
      outstandingDues,
      phaseBreakdown,
      bottleneck,
      recentSales: recentSales[0].map((row) => ({
        invoiceNumber: row.invoice_number,
        clientName: row.client_name,
        amount: Number(row.total),
        paymentStatus: row.payment_status,
        date: row.created_at,
      })),
      clientsWithDues: clientsWithDues[0].map((row) => ({
        name: row.name,
        amountOwed: Number(row.owed),
      })),
    });
  } catch (error) {
    console.error("Failed to load dashboard summary:", error);
    return NextResponse.json(
      { message: "Could not load the dashboard summary. Please try again." },
      { status: 500 }
    );
  }
}
