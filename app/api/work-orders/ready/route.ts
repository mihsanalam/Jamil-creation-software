import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";

import { auth } from "@/auth";
import { db } from "@/lib/db";

// A completed work order joined with its fabric batch — eligible for stock.
interface ReadyOrderRow extends RowDataPacket {
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

/**
 * GET /api/work-orders/ready — lists completed work orders that have NOT yet
 * been turned into a finished product (i.e. are eligible to become stock).
 *
 * A work order is "ready" when its status is COMPLETED and there is no
 * matching row in finished_products. Each order is joined with its fabric
 * batch (for batch_number / fabric_type) and its phases are nested as a
 * `phases` array so the collector can show the completed checklist.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const [orders] = await db.query<ReadyOrderRow[]>(
      `SELECT wo.id, wo.fabric_batch_id, wo.phase_template_id,
              wo.product_type, wo.quantity, wo.status, wo.created_at,
              fb.batch_number, fb.fabric_type, pt.name AS template_name
       FROM work_orders wo
       JOIN fabric_batches fb ON fb.id = wo.fabric_batch_id
       JOIN phase_templates pt ON pt.id = wo.phase_template_id
       LEFT JOIN finished_products fp ON fp.work_order_id = wo.id
       WHERE wo.status = 'COMPLETED'
         AND fp.id IS NULL
       ORDER BY wo.created_at DESC`
    );

    if (orders.length === 0) {
      return NextResponse.json([]);
    }

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
    console.error("Failed to list ready work orders:", error);
    return NextResponse.json(
      { message: "Could not load ready batches. Please try again." },
      { status: 500 }
    );
  }
}