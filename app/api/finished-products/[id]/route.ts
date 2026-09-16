import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { isValidFinishedProductImageUrl } from "@/lib/cloudinary";
import { logAudit } from "@/lib/audit";

interface ProductRow extends RowDataPacket {
  id: string;
  barcode: string;
  image_url: string | null;
}

// The URL must have been previously returned by POST /api/uploads
// (folder "finished") — anything else is rejected so a client can't point
// the record at an arbitrary URL or file on the server.

/**
 * PATCH /api/finished-products/[id] — update a finished product's garment photo.
 *
 * Body: { imageUrl: string | null }
 *  - imageUrl: the Cloudinary URL returned by POST /api/uploads (folder
 *    "finished") to set/change, or null to remove the photo entirely.
 *
 * Only the photo is editable this way — barcode, quantity and status stay
 * under the control of the intake / sales flows. Collector + owner can
 * manage; operator is view-only.
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
  if (session.user.role !== "COLLECTOR" && session.user.role !== "OWNER") {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  // Must be present (null clears the photo); a string must be a URL
  // previously returned by POST /api/uploads, so a client can't point the
  // record at an arbitrary URL or file on the server.
  const imageUrlRaw = body.imageUrl;
  const imageUrlValid =
    imageUrlRaw === null ||
    (typeof imageUrlRaw === "string" &&
      isValidFinishedProductImageUrl(imageUrlRaw));
  if (!imageUrlValid) {
    return NextResponse.json(
      {
        message:
          'imageUrl must be a garment photo URL returned by POST /api/uploads (folder "finished"), or null to remove the photo.',
      },
      { status: 400 }
    );
  }

  const imageUrl = imageUrlRaw as string | null;

  try {
    const connection = await db.getConnection();
    try {
      const [existing] = await connection.query<ProductRow[]>(
        `SELECT id, barcode, image_url FROM finished_products
         WHERE id = ? LIMIT 1`,
        [id]
      );
      if (!existing[0]) {
        return NextResponse.json(
          { message: "Finished product not found." },
          { status: 404 }
        );
      }

      await connection.query(
        `UPDATE finished_products SET image_url = ? WHERE id = ?`,
        [imageUrl, id]
      );

      // Audit trail: the garment photo changed.
      await logAudit({
        actorId: session.user.id,
        actorName: session.user.name ?? "unknown",
        action: "PRODUCT_PHOTO_UPDATE",
        entityType: "finished_product",
        entityId: id,
        details: { barcode: existing[0].barcode, imageUrl },
      });

      return NextResponse.json({
        id,
        barcode: existing[0].barcode,
        imageUrl,
      });
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error("Failed to update finished product image:", error);
    return NextResponse.json(
      { message: "Could not update the product photo. Please try again." },
      { status: 500 }
    );
  }
}
