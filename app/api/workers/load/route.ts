import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";

import { auth } from "@/auth";
import { db } from "@/lib/db";

// Aggregated worker load row.
interface WorkerLoadRow extends RowDataPacket {
  worker_name: string;
  in_progress_count: number;
}

/**
 * GET /api/workers/load — returns each worker's current in-progress phase
 * count, sorted by load descending. Used by the "Worker workload" report.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const [rows] = await db.query<WorkerLoadRow[]>(
      `SELECT worker_name, COUNT(*) AS in_progress_count
       FROM work_order_phases
       WHERE status = 'IN_PROGRESS'
         AND worker_name IS NOT NULL
         AND worker_name != ''
       GROUP BY worker_name
       ORDER BY in_progress_count DESC`
    );

    return NextResponse.json(
      rows.map((row) => ({
        workerName: row.worker_name,
        inProgressCount: Number(row.in_progress_count),
      }))
    );
  } catch (error) {
    console.error("Failed to load worker workload:", error);
    return NextResponse.json(
      { message: "Could not load worker workload." },
      { status: 500 }
    );
  }
}