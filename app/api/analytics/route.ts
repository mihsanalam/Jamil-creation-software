import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";

import { auth } from "@/auth";
import { db } from "@/lib/db";

interface ScalarRow extends RowDataPacket {
  value: string | number;
}

interface TrendRow extends RowDataPacket {
  day: Date;
  amount: string;
  due: string;
}

interface PhaseCountRow extends RowDataPacket {
  name: string;
  c: string;
}

interface TopClientRow extends RowDataPacket {
  name: string;
  total: string;
  due: string;
}

async function scalar(sql: string, params: unknown[] = []): Promise<number> {
  const [rows] = await db.query<ScalarRow[]>(sql, params);
  const row = rows[0];
  if (!row) return 0;
  return typeof row.value === "number" ? row.value : Number(row.value ?? 0);
}

function buildDateClause(start?: string | null, end?: string | null): string {
  const conditions: string[] = [];
  if (start) conditions.push(`DATE(s.created_at) >= '${start}'`);
  if (end) conditions.push(`DATE(s.created_at) <= '${end}'`);
  return conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/**
 * GET /api/analytics - cross-screen combined analytics for the Owner.
 * ?start=YYYY-MM-DD &end=YYYY-MM-DD (optional, defaults to current month).
 * Returns financials + production + trends + topClients + period comparison.
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
    const [totalSales, retailSales, wholesaleSales, outstandingDues, trendRows, topClientRows, batchesInProduction, totalStock, phaseRows] =
      await Promise.all([
        scalar(`SELECT COALESCE(SUM(total), 0) AS value FROM sales s ${whereSales}`),
        scalar(`SELECT COALESCE(SUM(s.total), 0) AS value FROM sales s JOIN clients c ON c.id = s.client_id ${whereSales} AND c.type = 'RETAIL'`),
        scalar(`SELECT COALESCE(SUM(s.total), 0) AS value FROM sales s JOIN clients c ON c.id = s.client_id ${whereSales} AND c.type = 'WHOLESALE'`),
        scalar(`SELECT COALESCE(SUM(total - amount_paid), 0) AS value FROM sales WHERE payment_status IN ('DUE', 'PARTIAL')`),
        db.query<TrendRow[]>(`SELECT DATE(s.created_at) AS day, COALESCE(SUM(s.total), 0) AS amount, COALESCE(SUM(CASE WHEN s.payment_status IN ('DUE', 'PARTIAL') THEN s.total - s.amount_paid ELSE 0 END), 0) AS due FROM sales s ${whereSales} GROUP BY DATE(s.created_at) ORDER BY day`),
        db.query<TopClientRow[]>(`SELECT c.name, COALESCE(SUM(s.total), 0) AS total, COALESCE(SUM(CASE WHEN s.payment_status IN ('DUE', 'PARTIAL') THEN s.total - s.amount_paid ELSE 0 END), 0) AS due FROM sales s JOIN clients c ON c.id = s.client_id ${whereSales} GROUP BY c.id, c.name ORDER BY total DESC LIMIT 5`),
        scalar(`SELECT COALESCE(COUNT(*), 0) AS value FROM work_orders WHERE status = 'IN_PROGRESS'`),
        scalar(`SELECT COALESCE(SUM(quantity_remaining), 0) AS value FROM finished_products WHERE status = 'IN_STOCK'`),
        db.query<PhaseCountRow[]>(`SELECT p.name, COUNT(*) AS c FROM work_order_phases p JOIN work_orders wo ON wo.id = p.work_order_id WHERE wo.status = 'IN_PROGRESS' AND p.status = 'IN_PROGRESS' GROUP BY p.name ORDER BY c DESC`),
      ]);

    const phaseBreakdown: Record<string, number> = {};
    for (const row of phaseRows[0]) {
      phaseBreakdown[row.name] = Number(row.c);
    }
    const startDate = new Date(start);
    const endDate = new Date(end);
    const diffDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const prevEnd = new Date(startDate);
    prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevStart.getDate() - diffDays);
    const prevStartStr = prevStart.toISOString().slice(0, 10);
    const prevEndStr = prevEnd.toISOString().slice(0, 10);
    const prevWhere = buildDateClause(prevStartStr, prevEndStr);

    const [prevTotalSales, prevRetailSales, prevWholesaleSales] = await Promise.all([
      scalar(`SELECT COALESCE(SUM(total), 0) AS value FROM sales s ${prevWhere}`),
      scalar(`SELECT COALESCE(SUM(s.total), 0) AS value FROM sales s JOIN clients c ON c.id = s.client_id ${prevWhere} AND c.type = 'RETAIL'`),
      scalar(`SELECT COALESCE(SUM(s.total), 0) AS value FROM sales s JOIN clients c ON c.id = s.client_id ${prevWhere} AND c.type = 'WHOLESALE'`),
    ]);

    return NextResponse.json({
      period: { start, end },
      financials: {
        totalSales: Number(totalSales),
        retailSales: Number(retailSales),
        wholesaleSales: Number(wholesaleSales),
        outstandingDues: Number(outstandingDues),
      },
      production: {
        batchesInProduction: Number(batchesInProduction),
        totalStock: Number(totalStock),
        phaseBreakdown,
      },
      trends: (trendRows[0] ?? []).map((row) => ({
        date: (row.day as Date).toISOString(),
        amount: Number(row.amount),
        due: Number(row.due),
      })),
      topClients: (topClientRows[0] ?? []).map((row) => ({
        name: row.name,
        total: Number(row.total),
        due: Number(row.due),
      })),
      comparison: {
        totalSalesChange: pctChange(totalSales, prevTotalSales),
        retailSalesChange: pctChange(retailSales, prevRetailSales),
        wholesaleSalesChange: pctChange(wholesaleSales, prevWholesaleSales),
        previousTotalSales: prevTotalSales,
        previousRetailSales: prevRetailSales,
        previousWholesaleSales: prevWholesaleSales,
        previousPeriod: { start: prevStartStr, end: prevEndStr },
      },
    });
  } catch (error) {
    console.error("Failed to load analytics:", error);
    return NextResponse.json({ message: "Could not load analytics. Please try again." }, { status: 500 });
  }
}