import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";

import { auth } from "@/auth";
import { db } from "@/lib/db";

// One audit_logs row.
interface AuditRow extends RowDataPacket {
  id: string;
  actor_id: string | null;
  actor_name: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: string | null;
  created_at: Date;
}

/**
 * GET /api/audit-logs — the Owner's audit trail, newest first.
 * Optional query params:
 * - entityType: filter by entity_type (e.g. "work_order_phase")
 * - action:     filter by action (e.g. "PASSWORD_RESET")
 * - limit:      max rows to return (1–200, default 100)
 * - offset:     how many rows to skip (used with limit for paging)
 */
export async function GET(request: Request) {
  const session = await auth();
  if (session?.user?.role !== "OWNER") {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const entityType = searchParams.get("entityType")?.trim();
  const action = searchParams.get("action")?.trim();

  let limit = 100;
  let offset = 0;
  const limitRaw = searchParams.get("limit")?.trim();
  const offsetRaw = searchParams.get("offset")?.trim();
  if (limitRaw !== null && limitRaw !== undefined && limitRaw !== "") {
    limit = Number(limitRaw);
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
      return NextResponse.json(
        {
          message:
            'Invalid limit — must be a whole number between 1 and 200.',
        },
        { status: 400 }
      );
    }
  }
  if (offsetRaw !== null && offsetRaw !== undefined && offsetRaw !== "") {
    offset = Number(offsetRaw);
    if (!Number.isInteger(offset) || offset < 0) {
      return NextResponse.json(
        { message: "Invalid offset — must be a whole number >= 0." },
        { status: 400 }
      );
    }
  }

  const where: string[] = [];
  const params: string[] = [];
  if (entityType) {
    where.push("entity_type = ?");
    params.push(entityType);
  }
  if (action) {
    where.push("action = ?");
    params.push(action);
  }

  try {
    const [rows] = await db.query<AuditRow[]>(
      `SELECT id, actor_id, actor_name, action, entity_type, entity_id,
              details, created_at
       FROM audit_logs
       ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY created_at DESC, id DESC
       LIMIT ${limit} OFFSET ${offset}`,
      params
    );

    return NextResponse.json(
      rows.map((row) => ({
        id: row.id,
        actorId: row.actor_id,
        actorName: row.actor_name,
        action: row.action,
        entityType: row.entity_type,
        entityId: row.entity_id,
        details: row.details ? JSON.parse(row.details) : null,
        createdAt: row.created_at,
      }))
    );
  } catch (error) {
    console.error("Failed to list audit logs:", error);
    return NextResponse.json(
      { message: "Could not load the audit log. Please try again." },
      { status: 500 }
    );
  }
}
