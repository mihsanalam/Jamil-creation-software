import { NextResponse } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";

interface PhaseRow extends RowDataPacket {
  id: string;
  work_order_id: string;
  name: string;
  step_order: number;
  status: string;
  worker_name: string | null;
  qty_in: string | null;
  qty_out: string | null;
  notes: string | null;
  started_at: Date | null;
  completed_at: Date | null;
  product_type: string | null;
  quantity: string | null;
  batch_number: string | null;
  fabric_batch_id: string | null;
}

interface PrevPhaseRow extends RowDataPacket {
  id: string;
  work_order_id: string;
  name: string;
  step_order: number;
  status: string;
  worker_name: string | null;
  qty_in: string | null;
  qty_out: string | null;
  notes: string | null;
  started_at: Date | null;
  completed_at: Date | null;
}

/**
 * POST /api/work-order-phases/[id]/undo — re-opens a completed phase.
 * Sets it back to IN_PROGRESS, un-completes following phases, and marks
 * the previous phase IN_PROGRESS again.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const [rows] = await db.query<PhaseRow[]>(
    `SELECT p.id, p.work_order_id, p.name, p.step_order, p.status,
            p.worker_name, p.qty_in, p.qty_out, p.notes,
            p.started_at, p.completed_at,
            wo.product_type, wo.quantity, wo.fabric_batch_id
     FROM work_order_phases p
     JOIN work_orders wo ON wo.id = p.work_order_id
     WHERE p.id = ?`,
    [id]
  );

  const phase = rows[0];
  if (!phase) {
    return NextResponse.json({ message: "Phase not found." }, { status: 404 });
  }
  if (phase.status !== "COMPLETED") {
    return NextResponse.json(
      { message: "Only a completed phase can be re-opened." },
      { status: 400 }
    );
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // Re-open this phase.
    await connection.query<ResultSetHeader>(
      `UPDATE work_order_phases SET status = 'IN_PROGRESS', completed_at = NULL WHERE id = ?`,
      [id]
    );

    // Un-complete any phases after this one.
    const [afterRows] = await connection.query<PrevPhaseRow[]>(
      `SELECT id FROM work_order_phases WHERE work_order_id = ? AND step_order > ? ORDER BY step_order ASC`,
      [phase.work_order_id, phase.step_order]
    );
    for (const after of afterRows) {
      await connection.query<ResultSetHeader>(
        `UPDATE work_order_phases SET status = 'PENDING', started_at = NULL, completed_at = NULL WHERE id = ?`,
        [after.id]
      );
    }

    // Mark previous phase IN_PROGRESS again.
    const [prevRows] = await connection.query<PrevPhaseRow[]>(
      `SELECT id FROM work_order_phases WHERE work_order_id = ? AND step_order < ? ORDER BY step_order DESC LIMIT 1`,
      [phase.work_order_id, phase.step_order]
    );
    if (prevRows[0]) {
      await connection.query<ResultSetHeader>(
        `UPDATE work_order_phases SET status = 'IN_PROGRESS', started_at = ?, completed_at = NULL WHERE id = ?`,
        [new Date(), prevRows[0].id]
      );
    }

    // If no phase is IN_PROGRESS now, reverse the work order + batch status.
    const [inProgressAfter] = await connection.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS cnt FROM work_order_phases WHERE work_order_id = ? AND status = 'IN_PROGRESS'`,
      [phase.work_order_id]
    );
    if (Number(inProgressAfter[0].cnt) === 0) {
      await connection.query<ResultSetHeader>(
        `UPDATE work_orders SET status = 'IN_PROGRESS' WHERE id = ?`,
        [phase.work_order_id]
      );
      if (phase.fabric_batch_id) {
        await connection.query<ResultSetHeader>(
          `UPDATE fabric_batches SET status = 'IN_PRODUCTION' WHERE id = ?`,
          [phase.fabric_batch_id]
        );
      }
    }

    await connection.commit();

    // Audit trail: record the undo (a destructive re-open).
    await logAudit({
      actorId: session.user.id,
      actorName: session.user.name ?? "unknown",
      action: "PHASE_UNDO",
      entityType: "work_order_phase",
      entityId: id,
      details: {
        workOrderId: phase.work_order_id,
        phaseName: phase.name,
        stepOrder: phase.step_order,
        reopenedPhases: afterRows.length,
      },
    });

    const [updatedRows] = await db.query<PhaseRow[]>(
      `SELECT p.id, p.work_order_id, p.name, p.step_order, p.status,
              p.worker_name, p.qty_in, p.qty_out, p.notes,
              p.started_at, p.completed_at,
              wo.product_type, wo.quantity, wo.fabric_batch_id
       FROM work_order_phases p
       JOIN work_orders wo ON wo.id = p.work_order_id
       WHERE p.id = ?`,
      [id]
    );

    return NextResponse.json({
      phase: updatedRows[0]
        ? {
            id: updatedRows[0].id,
            workOrderId: updatedRows[0].work_order_id,
            name: updatedRows[0].name,
            stepOrder: updatedRows[0].step_order,
            status: updatedRows[0].status,
            workerName: updatedRows[0].worker_name,
            qtyIn: updatedRows[0].qty_in === null ? null : Number(updatedRows[0].qty_in),
            qtyOut: updatedRows[0].qty_out === null ? null : Number(updatedRows[0].qty_out),
            notes: updatedRows[0].notes,
            startedAt: updatedRows[0].started_at,
            completedAt: updatedRows[0].completed_at,
          }
        : null,
    });
  } catch (error) {
    await connection.rollback();
    console.error("Failed to undo phase completion:", error);
    return NextResponse.json(
      { message: "Could not re-open the phase." },
      { status: 500 }
    );
  } finally {
    connection.release();
  }
}
