import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";

import { auth } from "@/auth";
import { db } from "@/lib/db";

interface SaleRow extends RowDataPacket {
  invoice_number: string;
  created_at: Date;
  client_name: string;
  client_type: string;
  total: string;
  amount_paid: string;
  payment_status: string;
}

interface DueRow extends RowDataPacket {
  name: string;
  phone: string;
  type: string;
  total_due: string;
  last_payment_date: Date | null;
}

function escapeCsv(value: string | number | null): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  // Escape quotes and wrap in quotes if it contains a comma, quote, or newline.
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function rowsToCsv(headers: string[], rows: (string | number | null)[][]): string {
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(row.map(escapeCsv).join(","));
  }
  return lines.join("\n");
}

/**
 * GET /api/export — CSV export of sales or dues data.
 *
 * Query params:
 *   - type: "sales" | "dues" (required)
 *   - start: ISO date (optional, defaults to 30 days ago)
 *   - end: ISO date (optional, defaults to today)
 *
 * Returns a text/csv response with appropriate Content-Disposition header.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "OWNER") {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type")?.trim();
  const startParam = searchParams.get("start")?.trim();
  const endParam = searchParams.get("end")?.trim();

  if (!type || !["sales", "dues"].includes(type)) {
    return NextResponse.json(
      { message: "Invalid type. Use 'sales' or 'dues'." },
      { status: 400 }
    );
  }

  // Default date range: last 30 days.
  const now = new Date();
  const defaultEnd = now.toISOString().slice(0, 10);
  const defaultStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const start = startParam || defaultStart;
  const end = endParam || defaultEnd;

  try {
    if (type === "sales") {
      const [rows] = await db.query<SaleRow[]>(
        `SELECT s.invoice_number, s.created_at, c.name AS client_name,
                c.type AS client_type, s.total, s.amount_paid, s.payment_status
         FROM sales s
         JOIN clients c ON c.id = s.client_id
         WHERE DATE(s.created_at) >= ? AND DATE(s.created_at) <= ?
         ORDER BY s.created_at DESC`,
        [start, end]
      );

      const headers = [
        "Invoice #",
        "Date",
        "Client",
        "Type",
        "Total",
        "Amount Paid",
        "Payment Status",
      ];
      const csvRows = rows.map((row) => [
        row.invoice_number,
        row.created_at.toISOString().slice(0, 10),
        row.client_name,
        row.client_type,
        row.total,
        row.amount_paid,
        row.payment_status,
      ]);
      const csv = rowsToCsv(headers, csvRows);

      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="sales_${start}_to_${end}.csv"`,
        },
      });
    } else {
      // type === "dues"
      const [rows] = await db.query<DueRow[]>(
        `SELECT c.name, c.phone, c.type,
                COALESCE(SUM(s.total - s.amount_paid), 0) AS total_due,
                (SELECT MAX(p.date) FROM payments p WHERE p.client_id = c.id) AS last_payment_date
         FROM sales s
         JOIN clients c ON c.id = s.client_id
         WHERE s.payment_status IN ('DUE', 'PARTIAL')
         GROUP BY c.id, c.name, c.phone, c.type
         HAVING SUM(s.total - s.amount_paid) > 0
         ORDER BY total_due DESC`
      );

      const headers = ["Client", "Phone", "Type", "Total Due", "Last Payment"];
      const csvRows = rows.map((row) => [
        row.name,
        row.phone,
        row.type,
        row.total_due,
        row.last_payment_date
          ? new Date(row.last_payment_date).toISOString().slice(0, 10)
          : "",
      ]);
      const csv = rowsToCsv(headers, csvRows);

      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="outstanding_dues_${start}_to_${end}.csv"`,
        },
      });
    }
  } catch (error) {
    console.error("Failed to export data:", error);
    return NextResponse.json(
      { message: "Could not export data. Please try again." },
      { status: 500 }
    );
  }
}
