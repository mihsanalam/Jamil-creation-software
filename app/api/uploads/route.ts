import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

import { auth } from "@/auth";

// Images are stored on the VPS disk under public/, which is fine at this
// scale. If the Owner ever wants them on separate cloud storage (S3,
// Cloudinary, ...) once the VPS disk fills up, this route is the single
// place to swap — the rest of the app only ever sees the returned path.
const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "fabric");

// Accepted image types. The extension is derived from the MIME type, never
// from the client-supplied filename, so nothing outside this list can land
// on disk (e.g. no .html/.php with an image name).
const ALLOWED_MIME_TYPES: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

// 5 MB — plenty for a fabric photo taken with a phone.
const MAX_FILE_BYTES = 5 * 1024 * 1024;

/**
 * POST /api/uploads — saves one image from a multipart form and returns its
 * public path. Request: multipart/form-data with a single "file" field.
 * Response: { path: "/uploads/fabric/<timestamp>-<random>.<ext>" }
 *
 * Files land in public/uploads/fabric/ with a unique timestamp+UUID name
 * (the original filename is never used), so two uploads can never collide
 * and nothing about the client's filesystem is trusted.
 */
export async function POST(request: Request) {
  // Middleware skips /api routes, so the session is verified here directly.
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { message: "Expected a multipart form upload." },
      { status: 400 }
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { message: 'Missing file — send the image in a "file" form field.' },
      { status: 400 }
    );
  }

  const extension = ALLOWED_MIME_TYPES[file.type];
  if (!extension) {
    return NextResponse.json(
      {
        message:
          "Unsupported image type — please upload a JPG, PNG, WebP or GIF.",
      },
      { status: 400 }
    );
  }

  if (file.size === 0) {
    return NextResponse.json(
      { message: "The selected file is empty." },
      { status: 400 }
    );
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { message: "Image is too large — the limit is 5 MB." },
      { status: 400 }
    );
  }

  try {
    await mkdir(UPLOAD_DIR, { recursive: true });

    const filename = `${Date.now()}-${randomUUID().slice(0, 8)}${extension}`;
    await writeFile(
      path.join(UPLOAD_DIR, filename),
      Buffer.from(await file.arrayBuffer())
    );

    const publicPath = `/uploads/fabric/${filename}`;
    return NextResponse.json({ path: publicPath }, { status: 201 });
  } catch (error) {
    console.error("Failed to save upload:", error);
    return NextResponse.json(
      { message: "Could not save the image. Please try again." },
      { status: 500 }
    );
  }
}
