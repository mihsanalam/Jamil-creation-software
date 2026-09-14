import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";

import { auth } from "@/auth";
import { db } from "@/lib/db";

// A completed work order row.
interface CompletedOrderRow extends RowDataPacket {
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

// A completed phase row.
interface CompletedPhaseRow extends RowDataPacket {
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

/**
 * GET /api/work-orders/completed — lists COMPLETED work orders with their
 * completed phases, newest first. Used by the phase board's "Show completed"
 * toggle to review finished work and re-open phases.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const [orders] = await db.query<CompletedOrderRow[]>(
      `SELECT wo.id, wo.fabric_batch_id, wo.phase_template_id,
              wo.product_type, wo.quantity, wo.status, wo.created_at,
              fb.batch_number, fb.fabric_type, pt.name AS template_name
       FROM work_orders wo
       JOIN fabric_batches fb ON fb.id = wo.fabric_batch_id
       JOIN phase_templates pt ON pt.id = wo.phase_template_id
       WHERE wo.status = 'COMPLETED'
       ORDER BY wo.created_at DESC`
    );

    if (orders.length === 0) {
      return NextResponse.json([]);
    }

    const [phaseRows] = await db.query<CompletedPhaseRow[]>(
      `SELECT work_order_id, id, name, step_order, status, worker_name,
              qty_in, qty_out, notes, started_at, completed_at
       FROM work_order_phases
       WHERE work_order_id IN (${orders.map(() => "?").join(", ")})
       ORDER BY work_order_id, step_order`,
      orders.map((o) => o.id)
    );

    const phasesByOrder = new Map<string, CompletedPhaseRow[]>();
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
    console.error("Failed to list completed work orders:", error);
    return NextResponse.json(
      { message: "Could not load completed orders." },
      { status: 500 }
    );
  }
}