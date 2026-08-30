import { NextResponse } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { randomUUID } from "crypto";

import { auth } from "@/auth";
import { db } from "@/lib/db";

// A finished product joined with its work order + fabric batch.
interface FinishedProductRow extends RowDataPacket {
  id: string;
  work_order_id: string;
  barcode: string;
  quantity: string;
  quantity_remaining: string;
  storage_location: string;
  status: string;
  date_added: Date;
  batch_number: string;
  product_type: string;
}

// Shape of an existing barcode row, for generating the next number.
interface BarcodeRow extends RowDataPacket {
  barcode: string;
}

// The work order being turned into stock (for quantity + status checks).
interface WorkOrderRow extends RowDataPacket {
  id: string;
  quantity: string;
  status: string;
}

interface ExistingProductRow extends RowDataPacket {
  id: string;
}

const PRODUCT_STATUSES = new Set(["IN_STOCK", "SOLD"]);

function isDuplicateKeyError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "ER_DUP_ENTRY"
  );
}

/**
 * GET /api/finished-products — lists every finished product with its batch
 * number and product type, newest first. Optional query params:
 * - search: case-insensitive partial match against barcode, batch number,
 *   or product type
 * - status: IN_STOCK | SOLD, or "all" (default)
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const statusParam = searchParams.get("status")?.trim();
  const search = searchParams.get("search")?.trim();

  // Unknown status values are a client error — don't silently drop the filter.
  if (
    statusParam &&
    statusParam !== "all" &&
    !PRODUCT_STATUSES.has(statusParam)
  ) {
    return NextResponse.json(
      {
        message: `Invalid status "${statusParam}" — must be one of: ${[...PRODUCT_STATUSES].join(", ")}, or "all"`,
      },
      { status: 400 }
    );
  }

  const where: string[] = [];
  const params: string[] = [];

  if (statusParam && statusParam !== "all") {
    where.push("fp.status = ?");
    params.push(statusParam);
  }
  if (search) {
    where.push("(fp.barcode LIKE ? OR fb.batch_number LIKE ? OR wo.product_type LIKE ?)");
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  try {
    const [rows] = await db.query<FinishedProductRow[]>(
      `SELECT fp.id, fp.work_order_id, fp.barcode, fp.quantity,
              fp.quantity_remaining, fp.storage_location, fp.status,
              fp.date_added, fb.batch_number, wo.product_type
       FROM finished_products fp
       JOIN work_orders wo ON wo.id = fp.work_order_id
       JOIN fabric_batches fb ON fb.id = wo.fabric_batch_id
       ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY fp.date_added DESC`,
      params
    );

    return NextResponse.json(
      rows.map((row) => ({
        id: row.id,
        workOrderId: row.work_order_id,
        barcode: row.barcode,
        quantity: Number(row.quantity),
        quantityRemaining: Number(row.quantity_remaining),
        storageLocation: row.storage_location,
        status: row.status,
        dateAdded: row.date_added,
        batchNumber: row.batch_number,
        productType: row.product_type,
      }))
    );
  } catch (error) {
    console.error("Failed to list finished products:", error);
    return NextResponse.json(
      { message: "Could not load finished products. Please try again." },
      { status: 500 }
    );
  }
}
/**
 * POST /api/finished-products — adds a completed work order to stock.
 *
 * Body: { workOrderId: string, storageLocation: string }
 *
 * Steps (in one transaction, with barcode-race retry like the fabric-batch
 * generator):
 *   a. Generate a barcode "JC-XXXX" (zero-padded, one past the highest
 *      existing JC- number).
 *   b. Look up the work order — it must exist and be COMPLETED, and must not
 *      already have a finished product (work_order_id is UNIQUE there).
 *   c. Insert a row with the work order's quantity and status IN_STOCK.
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

  const workOrderId =
    typeof body.workOrderId === "string" ? body.workOrderId.trim() : "";
  const storageLocation =
    typeof body.storageLocation === "string" ? body.storageLocation.trim() : "";

  if (workOrderId === "") {
    return NextResponse.json(
      { message: "workOrderId is required." },
      { status: 400 }
    );
  }
  if (storageLocation === "") {
    return NextResponse.json(
      { message: "storageLocation is required." },
      { status: 400 }
    );
  }

  const connection = await db.getConnection();

  try {
    let id = "";
    let barcode = "";
    let quantity = 0;

    // Up to 3 attempts — the first normally succeeds; retries only happen in
    // the unlikely race where another request claimed our barcode number.
    for (let attempt = 0; ; attempt++) {
      try {
        await connection.beginTransaction();

        // Guard: this work order must not already be in stock.
        const [existing] = await connection.query<ExistingProductRow[]>(
          `SELECT id FROM finished_products
           WHERE work_order_id = ?
           LIMIT 1
           FOR UPDATE`,
          [workOrderId]
        );
        if (existing[0]) {
          await connection.rollback();
          return NextResponse.json(
            { message: "This work order is already in stock." },
            { status: 409 }
          );
        }

        // Look up the work order's quantity and confirm it's COMPLETED.
        const [orders] = await connection.query<WorkOrderRow[]>(
          `SELECT id, quantity, status FROM work_orders
           WHERE id = ?
           LIMIT 1`,
          [workOrderId]
        );
        const order = orders[0];
        if (!order) {
          await connection.rollback();
          return NextResponse.json(
            { message: "Work order not found." },
            { status: 404 }
          );
        }
        if (order.status !== "COMPLETED") {
          await connection.rollback();
          return NextResponse.json(
            { message: "Only completed work orders can be added to stock." },
            { status: 400 }
          );
        }

        // Generate the next sequential barcode atomically: lock matching
        // rows, read the highest suffix ("JC-XXXX"), and increment it
        // (zero-padded to 4 digits). barcode has a UNIQUE index, so even if
        // two requests pick the same number, the DB rejects the second.
        const [barcodeRows] = await connection.query<BarcodeRow[]>(
          `SELECT barcode FROM finished_products
           WHERE barcode LIKE 'JC-%'
           ORDER BY CAST(SUBSTRING_INDEX(barcode, '-', -1) AS UNSIGNED) DESC
           LIMIT 1
           FOR UPDATE`
        );
        const lastNumber = barcodeRows[0]
          ? parseInt(barcodeRows[0].barcode.slice("JC-".length), 10)
          : 0;
        barcode = `JC-${String(lastNumber + 1).padStart(4, "0")}`;

        id = randomUUID();
        quantity = Number(order.quantity);
        await connection.query<ResultSetHeader>(
          `INSERT INTO finished_products
             (id, work_order_id, barcode, quantity, quantity_remaining,
              storage_location, status)
           VALUES (?, ?, ?, ?, ?, ?, 'IN_STOCK')`,
          [id, workOrderId, barcode, order.quantity, order.quantity, storageLocation]
        );

        await connection.commit();
        break;
      } catch (error) {
        await connection.rollback();
        const isDuplicate = isDuplicateKeyError(error);
        // Only retry on duplicate errors — for a work order the guard above
        // catches the UNIQUE(work_order_id) case first, so a stray duplicate
        // almost certainly means a barcode race with another request.
        if (isDuplicate && attempt < 2) continue;
        throw error;
      }
    }

    return NextResponse.json(
      {
        id,
        workOrderId,
        barcode,
        quantity,
        quantityRemaining: quantity,
        storageLocation,
        status: "IN_STOCK",
        dateAdded: new Date(),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to create finished product:", error);
    return NextResponse.json(
      { message: "Could not add the finished product to stock. Please try again." },
      { status: 500 }
    );
  } finally {
    connection.release();
  }
}