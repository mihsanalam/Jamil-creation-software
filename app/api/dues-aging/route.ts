import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";

import { auth } from "@/auth";
import { db } from "@/lib/db";

interface AgingRow extends RowDataPacket {
  id: string;
  name: string;
  phone: string;
  type: string;
  total_due: string;
  invoice_count: number;
  oldest_sale_date: Date;
  oldest_invoice_number: string;
}

/** One aging bucket: outstanding money in it and how many clients owe it. */
interface AgingBucket {
  total: number;
  clients: number;
}

interface AgingClient {
  id: string;
  name: string;
  phone: string;
  type: "RETAIL" | "WHOLESALE";
  totalDue: number;
  invoiceCount: number;
  bucket: "0-15" | "16-30" | "31-60" | "60+";
  oldestInvoice: {
    invoiceNumber: string;
    date: string;
    days: number;
  };
}

function bucketFor(days: number): AgingClient["bucket"] {
  if (days <= 15) return "0-15";
  if (days <= 30) return "16-30";
  if (days <= 60) return "31-60";
  return "60+";
}

/**
 * GET /api/dues-aging — dues aging report for the Owner.
 *
 * Groups every unpaid/partially-paid invoice by client, classifies each client
 * by the age of their OLDEST unpaid invoice (0-15 / 16-30 / 31-60 / 60+ days)
 * and returns bucket totals plus a per-client breakdown so the owner knows
 * which collections to chase first.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "OWNER") {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const [rows] = await db.query<AgingRow[]>(
      `SELECT c.id, c.name, c.phone, c.type,
              SUM(s.total - s.amount_paid) AS total_due,
              COUNT(s.id) AS invoice_count,
              MIN(s.created_at) AS oldest_sale_date,
              (
                SELECT s2.invoice_number FROM sales s2
                WHERE s2.client_id = c.id
                  AND s2.payment_status IN ('DUE', 'PARTIAL')
                  AND s2.total > s2.amount_paid
                ORDER BY s2.created_at ASC
                LIMIT 1
              ) AS oldest_invoice_number
       FROM sales s
       JOIN clients c ON c.id = s.client_id
       WHERE s.payment_status IN ('DUE', 'PARTIAL')
         AND s.total > s.amount_paid
       GROUP BY c.id, c.name, c.phone, c.type
       HAVING SUM(s.total - s.amount_paid) > 0
       ORDER BY oldest_sale_date ASC`
    );

    const buckets: Record<AgingClient["bucket"], AgingBucket> = {
      "0-15": { total: 0, clients: 0 },
      "16-30": { total: 0, clients: 0 },
      "31-60": { total: 0, clients: 0 },
      "60+": { total: 0, clients: 0 },
    };

    const now = Date.now();
    let totalDue = 0;

    const clients: AgingClient[] = rows.map((row) => {
      const totalDueForClient = Number(row.total_due) || 0;
      const ageMs = now - new Date(row.oldest_sale_date).getTime();
      const days = Math.max(0, Math.floor(ageMs / 86_400_000));
      const bucket = bucketFor(days);
      const client: AgingClient = {
        id: row.id,
        name: row.name,
        phone: row.phone,
        type: row.type === "WHOLESALE" ? "WHOLESALE" : "RETAIL",
        totalDue: totalDueForClient,
        invoiceCount: row.invoice_count,
        bucket,
        oldestInvoice: {
          invoiceNumber: row.oldest_invoice_number ?? "",
          date: new Date(row.oldest_sale_date).toISOString().slice(0, 10),
          days,
        },
      };
      buckets[bucket].total += totalDueForClient;
      buckets[bucket].clients += 1;
      totalDue += totalDueForClient;
      return client;
    });

    // Worst (oldest) first — that's the collection priority order.
    const bucketOrder: AgingClient["bucket"][] = ["60+", "31-60", "16-30", "0-15"];
    clients.sort(
      (a, b) =>
        bucketOrder.indexOf(a.bucket) - bucketOrder.indexOf(b.bucket) ||
        b.oldestInvoice.days - a.oldestInvoice.days
    );

    return NextResponse.json({ totalDue, buckets, clients });
  } catch (error) {
    console.error("Failed to build dues aging report:", error);
    return NextResponse.json(
      { message: "Could not load the dues aging report. Please try again." },
      { status: 500 }
    );
  }
}
