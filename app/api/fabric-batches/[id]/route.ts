import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";

import { auth } from "@/auth";
import { db } from "@/lib/db";

interface BatchRow extends RowDataPacket {
  id: string;
  batch_number: string;
  image_url: string | null;
}

// Same shape the POST handler validates against — only paths previously
// returned by POST /api/uploads are accepted, so a client can't point the
// record at an arbitrary URL or file on the server.
const IMAGE_URL_PATTERN = /^\/uploads\/fabric\/[A-Za-z0-9._-]+$/;

/**
 * PATCH /api/fabric-batches/[id] — update a batch's fabric photo.
 *
 * Body: { imageUrl: string | null }
 *  - imageUrl: the public path returned by POST /api/uploads (set/change),
 *    or null to remove the photo entirely.
 *
 * Only the photo is editable this way — production fields like quantity and
 * status stay under the control of the intake / work-order flows.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // Middleware skips /api routes, so the session is verified here directly.
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

  // Must be present (null clears the photo); a string must be a valid
  // upload path previously returned by POST /api/uploads, so a client can't
  // point the record at an arbitrary URL or file on the server.
  const imageUrlRaw = body.imageUrl;
  const imageUrlValid =
    imageUrlRaw === null ||
    (typeof imageUrlRaw === "string" && IMAGE_URL_PATTERN.test(imageUrlRaw));
  if (!imageUrlValid) {
    return NextResponse.json(
      {
        message:
          "imageUrl must be a path under /uploads/fabric/, or null to remove the photo.",
      },
      { status: 400 }
    );
  }

  const imageUrl = imageUrlRaw as string | null;

  try {
    const connection = await db.getConnection();
    try {
      const [existing] = await connection.query<BatchRow[]>(
        `SELECT id, batch_number, image_url FROM fabric_batches
         WHERE id = ? LIMIT 1`,
        [id]
      );
      if (!existing[0]) {
        return NextResponse.json(
          { message: "Fabric batch not found." },
          { status: 404 }
        );
      }

      await connection.query(
        `UPDATE fabric_batches SET image_url = ? WHERE id = ?`,
        [imageUrl, id]
      );

      return NextResponse.json({
        id,
        batchNumber: existing[0].batch_number,
        imageUrl,
      });
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error("Failed to update fabric batch image:", error);
    return NextResponse.json(
      { message: "Could not update the batch photo. Please try again." },
      { status: 500 }
    );
  }
}
