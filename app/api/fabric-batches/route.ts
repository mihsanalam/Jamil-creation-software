import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { randomUUID } from "crypto";

import { auth } from "@/auth";
import { db } from "@/lib/db";

// Shape of an existing row we care about when generating the next number
interface BatchNumberRow extends RowDataPacket {
  batch_number: string;
}

const ALLOWED_UNITS = new Set(["meters", "kg"]);
const BATCH_STATUSES = new Set(["PENDING", "IN_PRODUCTION", "READY", "SOLD"]);

/**
 * Lists fabric batches newest-first for the collector's Batch List screen.
 * Optional query params:
 * - status: one of PENDING | IN_PRODUCTION | READY | SOLD, or "all"
 * - search: case-insensitive partial match against batch number or supplier
 */
export async function GET(request: Request) {
  // Middleware skips /api routes, so the session is verified here directly.
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
    !BATCH_STATUSES.has(statusParam)
  ) {
    return NextResponse.json(
      {
        message: `Invalid status "${statusParam}" — must be one of: ${[...BATCH_STATUSES].join(", ")}, or "all"`,
      },
      { status: 400 }
    );
  }

  interface BatchListRow extends RowDataPacket {
    id: string;
    batch_number: string;
    fabric_type: string;
    quantity: string;
    unit: string;
    supplier: string;
    date_received: Date;
    description: string | null;
    process_notes: string | null;
    image_url: string | null;
    status: string;
    created_at: Date;
    recordedByName: string;
    // The current production phase from the operator's work_order_phases
    // (populated only while the batch is IN_PRODUCTION).
    current_phase: string | null;
  }

  const where: string[] = [];
  const params: string[] = [];

  if (statusParam && statusParam !== "all") {
    where.push("fb.status = ?");
    params.push(statusParam);
  }
  if (search) {
    where.push("(fb.batch_number LIKE ? OR fb.supplier LIKE ?)");
    params.push(`%${search}%`, `%${search}%`);
  }

  try {
    // current_phase: pull the operator's currently-active production step
    // (work_order_phases status = IN_PROGRESS) for this batch's work order,
    // so the collector can see which process the load is in, not just that
    // the batch is broadly "in production".
    const [rows] = await db.query<BatchListRow[]>(
      `SELECT fb.id, fb.batch_number, fb.fabric_type, fb.quantity, fb.unit,
              fb.supplier, fb.date_received, fb.description, fb.process_notes,
              fb.image_url, fb.status, fb.created_at, u.name AS recordedByName,
              (SELECT p.name
               FROM work_order_phases p
               JOIN work_orders wo ON wo.id = p.work_order_id
               WHERE wo.fabric_batch_id = fb.id
                 AND p.status = 'IN_PROGRESS'
               ORDER BY p.step_order
               LIMIT 1) AS current_phase
       FROM fabric_batches fb
       JOIN users u ON u.id = fb.recorded_by_id
       ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY fb.created_at DESC`,
      params
    );

    // Map snake_case DB columns to the same camelCase shape the POST
    // handler returns, so the frontend works with one naming convention.
    return NextResponse.json(
      rows.map((row) => ({
        id: row.id,
        batchNumber: row.batch_number,
        fabricType: row.fabric_type,
        quantity: Number(row.quantity),
        unit: row.unit,
        supplier: row.supplier,
        dateReceived: row.date_received,
        description: row.description,
        processNotes: row.process_notes,
        imageUrl: row.image_url,
        status: row.status,
        currentPhase: row.current_phase,
        createdAt: row.created_at,
        recordedByName: row.recordedByName,
      }))
    );
  } catch (error) {
    console.error("Failed to list fabric batches:", error);
    return NextResponse.json(
      { message: "Could not load fabric batches. Please try again." },
      { status: 500 }
    );
  }
}

/**
 * Creates a fabric batch from the collector intake form.
 * Generates a sequential "FB-YYYY-XXXX" batch number and stores the row
 * with the recording user's id and a PENDING production status.
 */
export async function POST(request: Request) {
  // Middleware skips /api routes, so the session is verified here directly.
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { message: "Invalid JSON body" },
      { status: 400 }
    );
  }

  // Required fields
  const fabricType = typeof body.fabricType === "string" ? body.fabricType.trim() : "";
  const supplier = typeof body.supplier === "string" ? body.supplier.trim() : "";
  const unit = typeof body.unit === "string" ? body.unit.trim() : "";
  const quantityRaw = body.quantity;

  const missingFields: string[] = [];
  if (!fabricType) missingFields.push("fabricType");
  if (!supplier) missingFields.push("supplier");
  if (!unit) missingFields.push("unit");
  if (
    quantityRaw === undefined ||
    quantityRaw === null ||
    quantityRaw === "" ||
    Number.isNaN(Number(quantityRaw)) ||
    Number(quantityRaw) <= 0
  ) {
    missingFields.push("quantity");
  }

  if (missingFields.length > 0) {
    return NextResponse.json(
      {
        message: `Missing or invalid required field(s): ${missingFields.join(", ")}`,
      },
      { status: 400 }
    );
  }

  if (!ALLOWED_UNITS.has(unit)) {
    return NextResponse.json(
      {
        message: `Invalid unit "${unit}" — must be one of: ${[...ALLOWED_UNITS].join(", ")}`,
      },
      { status: 400 }
    );
  }

  const quantity = Number(quantityRaw);
  const description =
    typeof body.description === "string" && body.description.trim() !== ""
      ? body.description.trim()
      : null;
  const processNotes =
    typeof body.processNotes === "string" && body.processNotes.trim() !== ""
      ? body.processNotes.trim()
      : null;
  // Optional fabric photo path, previously uploaded via POST /api/uploads.
  // Only paths inside /uploads/fabric/ are accepted so a client can't point
  // the record at an arbitrary URL or file on the server.
  const imageUrl =
    typeof body.imageUrl === "string" &&
    /^\/uploads\/fabric\/[A-Za-z0-9._-]+$/.test(body.imageUrl)
      ? body.imageUrl
      : null;
  // Fall back to today when the client omits the date ("YYYY-MM-DD" from the form).
  const dateReceived =
    typeof body.dateReceived === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.dateReceived)
      ? body.dateReceived
      : new Date().toISOString().slice(0, 10);

  // Generate the next sequential batch number atomically: lock matching rows,
  // read this year's highest suffix, and increment it (zero-padded to 4 digits).
  // batch_number has a UNIQUE index, so even if two requests somehow pick the
  // same number (e.g. first batch of a year), the DB rejects the second and we
  // simply retry with the next number.
  const year = new Date().getFullYear();
  const prefix = `FB-${year}-`;
  const connection = await db.getConnection();

  try {
    let id = "";
    let batchNumber = "";

    // Up to 3 attempts — normally the first succeeds; retries only happen in
    // the unlikely race where another request claimed our number meanwhile.
    for (let attempt = 0; ; attempt++) {
      try {
        await connection.beginTransaction();

        const [existing] = await connection.query<BatchNumberRow[]>(
          `SELECT batch_number FROM fabric_batches
           WHERE batch_number LIKE ?
           ORDER BY CAST(SUBSTRING_INDEX(batch_number, '-', -1) AS UNSIGNED) DESC
           LIMIT 1
           FOR UPDATE`,
          [`${prefix}%`]
        );

        const lastNumber = existing[0]
          ? parseInt(existing[0].batch_number.slice(prefix.length), 10)
          : 0;
        const nextNumber = String(lastNumber + 1).padStart(4, "0");
        batchNumber = `${prefix}${nextNumber}`;

        id = randomUUID();
        await connection.query(
          `INSERT INTO fabric_batches
             (id, batch_number, fabric_type, quantity, unit, supplier,
              date_received, description, process_notes, image_url,
              status, recorded_by_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)`,
          [
            id,
            batchNumber,
            fabricType,
            quantity,
            unit,
            supplier,
            dateReceived,
            description,
            processNotes,
            imageUrl,
            session.user.id,
          ]
        );

        await connection.commit();
        break;
      } catch (error) {
        await connection.rollback();
        const isDuplicate =
          typeof error === "object" && error !== null && "code" in error &&
          (error as { code?: string }).code === "ER_DUP_ENTRY";
        if (isDuplicate && attempt < 2) continue;
        throw error;
      }
    }

    return NextResponse.json(
      {
        id,
        batchNumber,
        fabricType,
        quantity,
        unit,
        supplier,
        dateReceived,
        description,
        processNotes,
        imageUrl,
        status: "PENDING",
        recordedById: session.user.id,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to create fabric batch:", error);
    return NextResponse.json(
      { message: "Could not save the fabric batch. Please try again." },
      { status: 500 }
    );
  } finally {
    connection.release();
  }
}


