import { NextResponse } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { randomUUID } from "crypto";

import { auth } from "@/auth";
import { db } from "@/lib/db";

// A work order joined with its fabric batch and phase template.
interface WorkOrderRow extends RowDataPacket {
  id: string;
  fabric_batch_id: string;
  phase_template_id: string;
  product_type: string;
  quantity: string;
  status: string;
  created_at: Date;
  batch_number: string;
  fabric_type: string;
  template_name: string;
}

// A single phase row from work_order_phases.
interface PhaseRow extends RowDataPacket {
  work_order_id: string;
  id: string;
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

// A fabric batch, used by POST to copy its quantity and guard its status.
interface BatchRow extends RowDataPacket {
  id: string;
  quantity: string;
  status: string;
}

// A phase template (name only, for product_type).
interface TemplateRow extends RowDataPacket {
  name: string;
}

// One step in a phase template, read in step_order.
interface TemplateStepRow extends RowDataPacket {
  id: string;
  name: string;
  step_order: number;
}

function isDuplicateKeyError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "ER_DUP_ENTRY"
  );
}

/**
 * Lists every work order newest-first, joined with its fabric batch and
 * phase template, with the order's phases nested as a `phases` array
 * (in step_order). Optional query param `status` filters to a single
 * work order status (e.g. IN_PROGRESS for the phase board).
 */
export async function GET(request: Request) {
  // Middleware skips /api routes, so the session is verified here directly.
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const statusParam = searchParams.get("status")?.trim();

  const where: string[] = [];
  const params: string[] = [];
  if (statusParam) {
    where.push("wo.status = ?");
    params.push(statusParam);
  }

  try {
    const [orders] = await db.query<WorkOrderRow[]>(
      `SELECT wo.id, wo.fabric_batch_id, wo.phase_template_id,
              wo.product_type, wo.quantity, wo.status, wo.created_at,
              fb.batch_number, fb.fabric_type, pt.name AS template_name
       FROM work_orders wo
       JOIN fabric_batches fb ON fb.id = wo.fabric_batch_id
       JOIN phase_templates pt ON pt.id = wo.phase_template_id
       ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY wo.created_at DESC`,
      params
    );

    const [phaseRows] = await db.query<PhaseRow[]>(
      `SELECT work_order_id, id, name, step_order, status, worker_name,
              qty_in, qty_out, notes, started_at, completed_at
       FROM work_order_phases
       ORDER BY work_order_id, step_order`
    );

    // Group the flat phase rows by their work order.
    const phasesByOrder = new Map<string, PhaseRow[]>();
    for (const row of phaseRows) {
      const list = phasesByOrder.get(row.work_order_id) ?? [];
      list.push(row);
      phasesByOrder.set(row.work_order_id, list);
    }

    return NextResponse.json(
      orders.map((order) => ({
        id: order.id,
        fabricBatchId: order.fabric_batch_id,
        phaseTemplateId: order.phase_template_id,
        productType: order.product_type,
        quantity: Number(order.quantity),
        status: order.status,
        createdAt: order.created_at,
        batchNumber: order.batch_number,
        fabricType: order.fabric_type,
        templateName: order.template_name,
        phases: (phasesByOrder.get(order.id) ?? []).map((phase) => ({
          id: phase.id,
          name: phase.name,
          stepOrder: phase.step_order,
          status: phase.status,
          workerName: phase.worker_name,
          qtyIn: phase.qty_in === null ? null : Number(phase.qty_in),
          qtyOut: phase.qty_out === null ? null : Number(phase.qty_out),
          notes: phase.notes,
          startedAt: phase.started_at,
          completedAt: phase.completed_at,
        })),
      }))
    );
  } catch (error) {
    console.error("Failed to list work orders:", error);
    return NextResponse.json(
      { message: "Could not load work orders. Please try again." },
      { status: 500 }
    );
  }
}

interface WorkerAssignment {
  name?: unknown;
  workerName?: unknown;
}

/**
 * Creates a work order from a PENDING fabric batch and a phase template,
 * snapping the template's steps into work_order_phases and marking the
 * batch as IN_PRODUCTION. All writes happen in one transaction.
 *
 * Body:
 * {
 *   fabricBatchId: string,
 *   phaseTemplateId: string,
 *   workerAssignments: Array<{ name: string, workerName: string }>  // one per step
 * }
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  const fabricBatchId =
    typeof body.fabricBatchId === "string" ? body.fabricBatchId.trim() : "";
  const phaseTemplateId =
    typeof body.phaseTemplateId === "string" ? body.phaseTemplateId.trim() : "";

  if (!fabricBatchId || !phaseTemplateId) {
    return NextResponse.json(
      {
        message:
          "Missing or invalid required field(s): fabricBatchId, phaseTemplateId",
      },
      { status: 400 }
    );
  }

  if (!Array.isArray(body.workerAssignments)) {
    return NextResponse.json(
      { message: "workerAssignments must be a non-empty array" },
      { status: 400 }
    );
  }
  const workerAssignments = body.workerAssignments as WorkerAssignment[];

  // Guard the fabric batch: it must exist and still be PENDING.
  const [batchRows] = await db.query<BatchRow[]>(
    "SELECT id, quantity, status FROM fabric_batches WHERE id = ?",
    [fabricBatchId]
  );
  const batch = batchRows[0];
  if (!batch) {
    return NextResponse.json(
      { message: `No fabric batch found with id "${fabricBatchId}"` },
      { status: 404 }
    );
  }
  if (batch.status !== "PENDING") {
    return NextResponse.json(
      {
        message:
          "This fabric batch is already in production or no longer available for a new work order.",
      },
      { status: 409 }
    );
  }

  // Guard the template: it must exist and have at least one step.
  const [templateRows] = await db.query<TemplateRow[]>(
    "SELECT name FROM phase_templates WHERE id = ?",
    [phaseTemplateId]
  );
  const template = templateRows[0];
  if (!template) {
    return NextResponse.json(
      { message: `No phase template found with id "${phaseTemplateId}"` },
      { status: 404 }
    );
  }

  const [stepRows] = await db.query<TemplateStepRow[]>(
    `SELECT id, name, step_order
     FROM phase_template_steps
     WHERE template_id = ?
     ORDER BY step_order`,
    [phaseTemplateId]
  );
  if (stepRows.length === 0) {
    return NextResponse.json(
      { message: "The selected phase template has no steps." },
      { status: 400 }
    );
  }

  if (stepRows.length !== workerAssignments.length) {
    return NextResponse.json(
      {
        message: `Expected ${stepRows.length} worker assignment(s) but received ${workerAssignments.length}.`,
      },
      { status: 400 }
    );
  }

  // The assignments arrive in step order, so index-match each to a step.
  const workerNames = workerAssignments.map((assignment) =>
    typeof assignment?.workerName === "string" ? assignment.workerName.trim() : ""
  );
  if (workerNames.some((name) => name === "")) {
    return NextResponse.json(
      { message: "Every phase needs a worker name." },
      { status: 400 }
    );
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const workOrderId = randomUUID();
    // product_type = template name; quantity = the batch's quantity.
    await connection.query<ResultSetHeader>(
      `INSERT INTO work_orders
         (id, fabric_batch_id, phase_template_id, product_type, quantity,
          status, created_by_id)
       VALUES (?, ?, ?, ?, ?, 'IN_PROGRESS', ?)`,
      [
        workOrderId,
        fabricBatchId,
        phaseTemplateId,
        template.name,
        batch.quantity,
        session.user.id,
      ]
    );

    // One phase per step: the first is IN_PROGRESS + started now, the rest PENDING.
    const phaseIds = stepRows.map(() => randomUUID());
    const placeholders = stepRows.map(() => "(?, ?, ?, ?, ?, ?, ?)").join(", ");
    const values = stepRows.flatMap((step, index) => {
      const isFirst = index === 0;
      return [
        phaseIds[index],
        workOrderId,
        step.name,
        step.step_order,
        isFirst ? "IN_PROGRESS" : "PENDING",
        workerNames[index],
        isFirst ? new Date() : null,
      ];
    });
    await connection.query<ResultSetHeader>(
      `INSERT INTO work_order_phases
         (id, work_order_id, name, step_order, status, worker_name, started_at)
       VALUES ${placeholders}`,
      values
    );

    // The batch is now in production.
    await connection.query<ResultSetHeader>(
      "UPDATE fabric_batches SET status = 'IN_PRODUCTION' WHERE id = ?",
      [fabricBatchId]
    );

    await connection.commit();

    return NextResponse.json(
      {
        id: workOrderId,
        fabricBatchId,
        phaseTemplateId,
        productType: template.name,
        quantity: Number(batch.quantity),
        status: "IN_PROGRESS",
        createdAt: new Date(),
        phases: stepRows.map((step, index) => ({
          id: phaseIds[index],
          name: step.name,
          stepOrder: step.step_order,
          status: index === 0 ? "IN_PROGRESS" : "PENDING",
          workerName: workerNames[index],
          qtyIn: null,
          qtyOut: null,
          notes: null,
          startedAt: index === 0 ? new Date() : null,
          completedAt: null,
        })),
      },
      { status: 201 }
    );
  } catch (error) {
    await connection.rollback();

    // work_orders.fabric_batch_id is UNIQUE, so if two requests race on the
    // same batch the second one surfaces as a duplicate key error.
    if (isDuplicateKeyError(error)) {
      return NextResponse.json(
        {
          message:
            "This fabric batch already has a work order. It may have been created by someone else.",
        },
        { status: 409 }
      );
    }

    console.error("Failed to create work order:", error);
    return NextResponse.json(
      { message: "Could not create the work order. Please try again." },
      { status: 500 }
    );
  } finally {
    connection.release();
  }
}
