import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";

import { auth } from "@/auth";
import { db } from "@/lib/db";

// The finished product joined with its work order and fabric batch.
interface ProductRow extends RowDataPacket {
  id: string;
  work_order_id: string;
  barcode: string;
  quantity: string;
  storage_location: string;
  status: string;
  date_added: Date;
  product_type: string;
  batch_number: string;
  fabric_type: string;
  batch_quantity: string;
  unit: string;
  supplier: string;
  date_received: Date;
}

// One production phase row from work_order_phases.
interface PhaseRow extends RowDataPacket {
  name: string;
  step_order: number;
  worker_name: string | null;
  status: string;
  completed_at: Date | null;
}

// The sale attached to a product (via sale_items), joined with its client.
interface SaleRow extends RowDataPacket {
  invoice_number: string;
  client_name: string;
  total: string;
  payment_status: string;
  created_at: Date;
}

/**
 * GET /api/traceability/[finishedProductId] — the FULL trace for one product:
 * fabric batch source, every production phase (in order), its current storage
 * spot, and — once it has been sold — the sale + client it went to.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ finishedProductId: string }> }
) {
  const session = await auth();
  if (session?.user?.role !== "OWNER") {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const { finishedProductId } = await params;

  try {
    const [products] = await db.query<ProductRow[]>(
      `SELECT fp.id, fp.work_order_id, fp.barcode, fp.quantity,
              fp.storage_location, fp.status, fp.date_added,
              wo.product_type,
              fb.batch_number, fb.fabric_type, fb.quantity AS batch_quantity,
              fb.unit, fb.supplier, fb.date_received
       FROM finished_products fp
       JOIN work_orders wo ON wo.id = fp.work_order_id
       JOIN fabric_batches fb ON fb.id = wo.fabric_batch_id
       WHERE fp.id = ?
       LIMIT 1`,
      [finishedProductId]
    );
    const product = products[0];
    if (!product) {
      return NextResponse.json(
        { message: "Finished product not found." },
        { status: 404 }
      );
    }

    const [phases] = await db.query<PhaseRow[]>(
      `SELECT name, step_order, worker_name, status, completed_at
       FROM work_order_phases
       WHERE work_order_id = ?
       ORDER BY step_order`,
      [product.work_order_id]
    );

    // Sale info exists only once the product has left stock; otherwise we hand
    // the page a null so it renders "Not yet sold" instead of erroring.
    let sale = null;
    if (product.status === "SOLD") {
      const [sales] = await db.query<SaleRow[]>(
        `SELECT s.invoice_number, s.total, s.payment_status, s.created_at,
                c.name AS client_name
         FROM sale_items si
         JOIN sales s ON s.id = si.sale_id
         JOIN clients c ON c.id = s.client_id
         WHERE si.finished_product_id = ?
         LIMIT 1`,
        [finishedProductId]
      );
      const saleRow = sales[0];
      if (saleRow) {
        sale = {
          invoiceNumber: saleRow.invoice_number,
          clientName: saleRow.client_name,
          date: saleRow.created_at,
          amount: Number(saleRow.total),
          paymentStatus: saleRow.payment_status,
        };
      }
    }

    return NextResponse.json({
      product: {
        id: product.id,
        barcode: product.barcode,
        quantity: Number(product.quantity),
        status: product.status,
      },
      productType: product.product_type,
      batch: {
        batchNumber: product.batch_number,
        fabricType: product.fabric_type,
        quantity: Number(product.batch_quantity),
        unit: product.unit,
        supplier: product.supplier,
        dateReceived: product.date_received,
      },
      phases: phases.map((phase) => ({
        name: phase.name,
        stepOrder: phase.step_order,
        workerName: phase.worker_name,
        status: phase.status,
        completedAt: phase.completed_at,
      })),
      storage: {
        location: product.storage_location,
        dateAdded: product.date_added,
      },
      sale,
    });
  } catch (error) {
    console.error("Failed to load traceability:", error);
    return NextResponse.json(
      { message: "Could not load the product trace. Please try again." },
      { status: 500 }
    );
  }
}