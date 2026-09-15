import { randomUUID } from "crypto";

import { db } from "@/lib/db";

/**
 * One noteworthy mutation to record in the audit_logs table (Tier 4).
 * Who changed what, when — phase status changes, user edits, password
 * changes, sales, payments, returns and destructive actions.
 */
export interface AuditEvent {
  /** Database id of the signed-in user (null only for system actions). */
  actorId: string | null;
  /** Name snapshot — kept even if the user row is ever deleted. */
  actorName: string;
  /** Short verb, e.g. "PHASE_COMPLETE", "USER_UPDATE", "PASSWORD_RESET". */
  action: string;
  /** What kind of thing changed, e.g. "work_order_phase", "user", "sale". */
  entityType: string;
  /** Id of the affected row, when it has one. */
  entityId?: string | null;
  /** JSON-serialisable snapshot of what changed (old/new values etc.). */
  details?: Record<string, unknown> | null;
}

/**
 * Writes one audit_logs row. Deliberately never throws — logging must not
 * break the main flow it is observing. If the insert fails (e.g. the table
 * is missing on an un-migrated database) the error is logged to the server
 * console and the original action continues unaffected.
 */
export async function logAudit(event: AuditEvent): Promise<void> {
  try {
    await db.query(
      `INSERT INTO audit_logs
         (id, actor_id, actor_name, action, entity_type, entity_id, details)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(),
        event.actorId,
        event.actorName,
        event.action,
        event.entityType,
        event.entityId ?? null,
        event.details ? JSON.stringify(event.details) : null,
      ]
    );
  } catch (error) {
    console.error("Failed to write audit log:", error);
  }
}
