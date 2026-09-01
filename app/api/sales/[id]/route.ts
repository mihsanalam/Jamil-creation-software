import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";

import { auth } from "@/auth";
import { db } from "@/lib/db";

// The sale row joined with its client.
interface SaleRow extends RowDataPacket {
  id: string;
  invoice_number: string;
  subtotal: string;
  discount: string;
  total: string;
  amount_paid: string;
  payment_method: string;
  payment_status: string;
  created_at: Date;
  client_name: string;
  client_phone: string;
  client_address: string | null;
  client_type: string;
}

// One sale_items row joined with its finished product.
interface ItemRow extends RowDataPacket {
  id: string;
  quantity: string;
  unit_price: string;
  line_total: string;
  barcode: string;
  product_type: string;
  batch_number: string;
  returned_quantity: string;
}

/**
 * GET /api/sales/[id] — one sale with its client and item lines, for the
 * printable invoice screen.
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
    const [sales] = await db.query<SaleRow[]>(
      `SELECT s.id, s.invoice_number, s.subtotal, s.discount, s.total,
              s.amount_paid, s.payment_method, s.payment_status, s.created_at,
              c.name AS client_name, c.phone AS client_phone,
              c.address AS client_address, c.type AS client_type
       FROM sales s
       JOIN clients c ON c.id = s.client_id
       WHERE s.id = ?
       LIMIT 1`,
      [id]
    );
    const sale = sales[0];
    if (!sale) {
      return NextResponse.json(
        { message: "Sale not found." },
        { status: 404 }
      );
    }

    const [items] = await db.query<ItemRow[]>(
      `SELECT si.id, si.quantity, si.unit_price, si.line_total,
              fp.barcode, wo.product_type, fb.batch_number,
              (SELECT COALESCE(SUM(r.quantity), 0)
               FROM returns r WHERE r.sale_item_id = si.id) AS returned_quantity
       FROM sale_items si
       JOIN finished_products fp ON fp.id = si.finished_product_id
       JOIN work_orders wo ON wo.id = fp.work_order_id
       JOIN fabric_batches fb ON fb.id = wo.fabric_batch_id
       WHERE si.sale_id = ?
       ORDER BY si.line_total DESC`,
      [id]
    );

    return NextResponse.json({
      id: sale.id,
      invoiceNumber: sale.invoice_number,
      subtotal: Number(sale.subtotal),
      discount: Number(sale.discount),
      total: Number(sale.total),
      amountPaid: Number(sale.amount_paid),
      paymentMethod: sale.payment_method,
      paymentStatus: sale.payment_status,
      createdAt: sale.created_at,
      client: {
        name: sale.client_name,
        phone: sale.client_phone,
        address: sale.client_address,
        type: sale.client_type,
      },
      items: items.map((item) => ({
        id: item.id,
        barcode: item.barcode,
        productType: item.product_type,
        batchNumber: item.batch_number,
        quantity: Number(item.quantity),
        returnedQuantity: Number(item.returned_quantity),
        unitPrice: Number(item.unit_price),
        lineTotal: Number(item.line_total),
      })),
    });
  } catch (error) {
    console.error("Failed to load sale:", error);
    return NextResponse.json(
      { message: "Could not load the invoice. Please try again." },
      { status: 500 }
    );
  }
}
