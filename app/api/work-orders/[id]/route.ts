import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";

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

/**
 * GET /api/work-orders/[id] — returns a single work order (joined with its
 * fabric batch and phase template) with its phases nested as a `phases`
 * array in step_order.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const [orders] = await db.query<WorkOrderRow[]>(
      `SELECT wo.id, wo.fabric_batch_id, wo.phase_template_id,
              wo.product_type, wo.quantity, wo.status, wo.created_at,
              fb.batch_number, fb.fabric_type, pt.name AS template_name
       FROM work_orders wo
       JOIN fabric_batches fb ON fb.id = wo.fabric_batch_id
       JOIN phase_templates pt ON pt.id = wo.phase_template_id
       WHERE wo.id = ?
       LIMIT 1`,
      [id]
    );

    const order = orders[0];
    if (!order) {
      return NextResponse.json(
        { message: `No work order found with id "${id}"` },
        { status: 404 }
      );
    }

    const [phaseRows] = await db.query<PhaseRow[]>(
      `SELECT id, name, step_order, status, worker_name,
              qty_in, qty_out, notes, started_at, completed_at
       FROM work_order_phases
       WHERE work_order_id = ?
       ORDER BY step_order`,
      [id]
    );

    return NextResponse.json({
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
      phases: phaseRows.map((phase) => ({
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
    });
  } catch (error) {
    console.error("Failed to load work order:", error);
    return NextResponse.json(
      { message: "Could not load the work order. Please try again." },
      { status: 500 }
    );
  }
}