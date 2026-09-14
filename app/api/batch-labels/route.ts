import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import QRCode from "qrcode";
import { auth } from "@/auth";
import { db } from "@/lib/db";

interface BatchLabelRow extends RowDataPacket {
  id: string;
  batch_number: string;
  fabric_type: string;
  quantity: string;
  unit: string;
}

/**
 * POST /api/batch-labels — generates printable QR label data for selected
 * fabric batches. Each label contains a QR code encoding the batch number,
 * plus the batch number, fabric type, and quantity in text.
 *
 * Body: { batchIds: string[] }
 * Returns: { labels: { batchNumber, fabricType, quantity, unit, qrDataUrl }[] }
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  let body: { batchIds?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { message: "Invalid request body." },
      { status: 400 }
    );
  }

  const batchIds = body.batchIds;
  if (!Array.isArray(batchIds) || batchIds.length === 0) {
    return NextResponse.json(
      { message: "batchIds array is required and must not be empty." },
      { status: 400 }
    );
  }

  try {
    const [rows] = await db.query<BatchLabelRow[]>(
      `SELECT id, batch_number, fabric_type, quantity, unit
       FROM fabric_batches
       WHERE id IN (${batchIds.map(() => "?").join(", ")})`,
      batchIds
    );

    const labels = await Promise.all(
      rows.map(async (row) => {
        const qrDataUrl = await QRCode.toDataURL(
          row.batch_number,
          {
            width: 256,
            margin: 1,
            color: { dark: "#1a1a1a", light: "#ffffff" },
          }
        );
        return {
          batchNumber: row.batch_number,
          fabricType: row.fabric_type,
          quantity: Number(row.quantity),
          unit: row.unit,
          qrDataUrl,
        };
      })
    );

    return NextResponse.json({ labels });
  } catch (error) {
    console.error("Failed to generate batch labels:", error);
    return NextResponse.json(
      { message: "Could not generate batch labels." },
      { status: 500 }
    );
  }
}