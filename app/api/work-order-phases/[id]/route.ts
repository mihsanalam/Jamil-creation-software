import { NextResponse } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";

import { auth } from "@/auth";
import { db } from "@/lib/db";

// A phase row plus the work order it belongs to (for cascade decisions).
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

// A phase row for the next step in the same work order.
interface NextPhaseRow extends RowDataPacket {
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

const PHASE_STATUSES = new Set(["PENDING", "IN_PROGRESS", "COMPLETED"]);

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (
    typeof value === "string" &&
    value.trim() !== "" &&
    Number.isFinite(Number(value))
  ) {
    return Number(value);
  }
  return null;
}

interface PhaseDto {
  id: string;
  workOrderId: string;
  name: string;
  stepOrder: number;
  status: string;
  workerName: string | null;
  qtyIn: number | null;
  qtyOut: number | null;
  notes: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
}

function toPhaseDto(row: PhaseRow): PhaseDto {
  return {
    id: row.id,
    workOrderId: row.work_order_id,
    name: row.name,
    stepOrder: row.step_order,
    status: row.status,
    workerName: row.worker_name,
    qtyIn: row.qty_in === null ? null : Number(row.qty_in),
    qtyOut: row.qty_out === null ? null : Number(row.qty_out),
    notes: row.notes,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

/**
 * PATCH /api/work-order-phases/[id]
 *
 * Accepts any of: status, qtyIn, qtyOut, notes. Putting a phase into
 * COMPLETED triggers the production pipeline cascade (all inside one
 * transaction):
 *   - completed_at = now on this phase
 *   - the next phase in the same work order (next step_order) auto-starts:
 *     status = IN_PROGRESS, started_at = now
 *   - if this was the LAST phase, the parent work order becomes COMPLETED
 *     and the related fabric batch becomes READY
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  // Load the phase together with the cascade context we need.
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
    return NextResponse.json(
      { message: `No phase found with id "${id}"` },
      { status: 404 }
    );
  }
// Validate + collect the fields being patched.
  const sets: string[] = [];
  const values: (string | number | Date | null)[] = [];

  const hasStatus = body.status !== undefined;
  if (hasStatus) {
    const status =
      typeof body.status === "string" ? (body.status as string).trim() : "";
    if (!PHASE_STATUSES.has(status)) {
      return NextResponse.json(
        {
          message: `Invalid status "${String(body.status)}" — must be one of: ${[...PHASE_STATUSES].join(", ")}`,
        },
        { status: 400 }
      );
    }
    sets.push("status = ?");
    values.push(status);
  }

  const qtyIn = toNumber(body.qtyIn);
  if (body.qtyIn !== undefined && (body.qtyIn === null || qtyIn !== null)) {
    sets.push("qty_in = ?");
    values.push(qtyIn);
  } else if (body.qtyIn !== undefined) {
    return NextResponse.json(
      { message: "qtyIn must be a finite number or null" },
      { status: 400 }
    );
  }

  const qtyOut = toNumber(body.qtyOut);
  if (body.qtyOut !== undefined && (body.qtyOut === null || qtyOut !== null)) {
    sets.push("qty_out = ?");
    values.push(qtyOut);
  } else if (body.qtyOut !== undefined) {
    return NextResponse.json(
      { message: "qtyOut must be a finite number or null" },
      { status: 400 }
    );
  }

  if (body.notes !== undefined) {
    if (typeof body.notes !== "string" && body.notes !== null) {
      return NextResponse.json(
        { message: "notes must be a string or null" },
        { status: 400 }
      );
    }
    sets.push("notes = ?");
    values.push(body.notes);
  }

  if (sets.length === 0) {
    return NextResponse.json(
      {
        message:
          "No valid fields to update — provide at least one of status, qtyIn, qtyOut, notes.",
      },
      { status: 400 }
    );
  }

  // "Marking complete" = switching from something else INTO COMPLETED.
  const isMarkingComplete =
    hasStatus && phase.status !== "COMPLETED" && body.status === "COMPLETED";

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // Completed phases also stamp completed_at.
    if (isMarkingComplete) {
      sets.push("completed_at = ?");
      values.push(new Date());
    }

    await connection.query<ResultSetHeader>(
      `UPDATE work_order_phases
       SET ${sets.join(", ")}
       WHERE id = ?`,
      [...values, id]
    );

    let nextPhase: PhaseDto | null = null;

    if (isMarkingComplete) {
      const [nextRows] = await connection.query<NextPhaseRow[]>(
        `SELECT id, work_order_id, name, step_order, status, worker_name,
                qty_in, qty_out, notes, started_at, completed_at
         FROM work_order_phases
         WHERE work_order_id = ? AND step_order > ?
         ORDER BY step_order ASC
         LIMIT 1`,
        [phase.work_order_id, phase.step_order]
      );
      const next = nextRows[0];

      if (next) {
        // Start the next phase automatically.
        await connection.query<ResultSetHeader>(
          "UPDATE work_order_phases SET status = 'IN_PROGRESS', started_at = ?, completed_at = NULL WHERE id = ?",
          [new Date(), next.id]
        );
        nextPhase = {
          id: next.id,
          workOrderId: next.work_order_id,
          name: next.name,
          stepOrder: next.step_order,
          status: "IN_PROGRESS",
          workerName: next.worker_name,
          qtyIn: next.qty_in === null ? null : Number(next.qty_in),
          qtyOut: next.qty_out === null ? null : Number(next.qty_out),
          notes: next.notes,
          startedAt: new Date(),
          completedAt: null,
        };
      } else {
        // Last phase → finish the work order and make the batch READY.
        await connection.query<ResultSetHeader>(
          "UPDATE work_orders SET status = 'COMPLETED' WHERE id = ?",
          [phase.work_order_id]
        );
        await connection.query<ResultSetHeader>(
          "UPDATE fabric_batches SET status = 'READY' WHERE id = ?",
          [phase.fabric_batch_id]
        );
      }
    }

    await connection.commit();

    // Re-read the updated phase to return the persisted state.
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
      phase: updatedRows[0] ? toPhaseDto(updatedRows[0]) : null,
      nextPhase,
    });
  } catch (error) {
    await connection.rollback();
    console.error("Failed to update phase:", error);
    return NextResponse.json(
      { message: "Could not update the phase. Please try again." },
      { status: 500 }
    );
  } finally {
    connection.release();
  }
}