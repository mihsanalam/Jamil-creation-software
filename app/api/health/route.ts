import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";

import { auth } from "@/auth";
import { db } from "@/lib/db";

/**
 * GET /api/health — is the app actually able to talk to its database?
 *
 * Why this exists (Tier 4, item 24): every screen polls its own API every few
 * seconds and the API handlers only `console.error` when something breaks, so
 * an operator staring at a stale phase board had no way to tell "nothing is
 * happening" apart from "the server is down". This endpoint is the one thing
 * the client can poll to answer that question, and `SystemStatus` in the
 * sidebar shows the result.
 *
 * Response: { status, database: { ok, latencyMs, error }, serverTime }
 * - 200 `status: "ok"`       — server up, database answered
 * - 503 `status: "degraded"` — server up, database unreachable (the dashboard
 *                              polling is definitely stale in this state)
 *
 * Requires a session (this is an internal tool — no need to publish DB
 * availability to the internet) but is intentionally cheap: one `SELECT 1`.
 */

interface PingRow extends RowDataPacket {
  ok: number;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  try {
    await db.query<PingRow[]>("SELECT 1 AS ok");
    return NextResponse.json({
      status: "ok",
      database: {
        ok: true,
        latencyMs: Date.now() - startedAt,
        error: null,
      },
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
    // Worth logging loudly: this is the state where every other screen goes
    // quiet, and the message here is what an operator will be asked about.
    console.error("Health check failed — database unreachable:", error);
    return NextResponse.json(
      {
        status: "degraded",
        database: {
          ok: false,
          latencyMs: Date.now() - startedAt,
          error:
            error instanceof Error ? error.message : "Database unreachable",
        },
        serverTime: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}
