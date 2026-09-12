import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";

import { auth } from "@/auth";
import { db } from "@/lib/db";

// One aggregated phase-step row from the GROUP BY query.
interface PhaseRow extends RowDataPacket {
  name: string;
  template_count: string;
  first_step_order: string;
}

/**
 * GET /api/phases — lists every distinct production phase step that exists
 * across all phase templates (e.g. "Cutting", "Stitching", "Packing") with
 * how many templates use each one. Ordered by each phase's earliest step
 * position so the returned list reads like a natural production sequence.
 */
export async function GET() {
  // Middleware skips /api routes, so the session is verified here directly.
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const [rows] = await db.query<PhaseRow[]>(
      `SELECT name,
              COUNT(DISTINCT template_id) AS template_count,
              MIN(step_order) AS first_step_order
       FROM phase_template_steps
       GROUP BY name
       ORDER BY first_step_order, name`
    );

    return NextResponse.json({
      phases: rows.map((row) => ({
        name: row.name,
        templateCount: Number(row.template_count),
        firstStepOrder: Number(row.first_step_order),
      })),
    });
  } catch (error) {
    console.error("Failed to list phases:", error);
    return NextResponse.json(
      { message: "Could not load phases. Please try again." },
      { status: 500 }
    );
  }
}
