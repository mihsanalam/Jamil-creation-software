import { NextResponse } from "next/server";

import { auth } from "@/auth";
import {
  uploadBufferToCloudinary,
  type ProductImageFolder,
} from "@/lib/cloudinary";

// Accepted image types. The extension is derived from the MIME type, never
// from the client-supplied filename, so nothing outside this list can be
// uploaded (e.g. no .html/.php with an image name).
const ALLOWED_MIME_TYPES: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

// Cloudinary folders this endpoint may write to. Fabric intake uses "fabric"
// (the default); finished-goods intake uses "finished" for garment photos.
const ALLOWED_FOLDERS: ReadonlySet<string> = new Set(["fabric", "finished"]);

// 5 MB — plenty for a fabric photo taken with a phone.
const MAX_FILE_BYTES = 5 * 1024 * 1024;

/**
 * POST /api/uploads — saves one image from a multipart form and returns its
 * public URL. Request: multipart/form-data with a single "file" field, plus
 * an optional "folder" field or ?folder= query ("fabric" default, "finished"
 * for garment photos taken at finished-goods intake).
 * Response: { path: "https://res.cloudinary.com/<cloud>/image/upload/v.../<folder>/<...>.<ext>" }
 *
 * Files are uploaded to Cloudinary under the requested folder with a unique
 * timestamp+UUID public ID (the original filename is never used), so two
 * uploads can never collide and nothing about the client's filesystem is
 * trusted. Hosted URLs survive re-deploys, unlike files on the app's disk.
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

  // Target Cloudinary folder: ?folder=finished or a "folder" form field for
  // garment photos, defaulting to "fabric" so existing callers are unaffected.
  // Anything outside the allow-list is rejected before it reaches Cloudinary.
  const folderField = formData.get("folder");
  const folderRaw =
    typeof folderField === "string" && folderField.trim() !== ""
      ? folderField.trim()
      : new URL(request.url).searchParams.get("folder")?.trim() || "fabric";
  if (!ALLOWED_FOLDERS.has(folderRaw)) {
    return NextResponse.json(
      {
        message: `Invalid folder "${folderRaw}" — must be one of: fabric, finished.`,
      },
      { status: 400 }
    );
  }
  const folder = folderRaw as ProductImageFolder;

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
    const result = await uploadBufferToCloudinary(
      Buffer.from(await file.arrayBuffer()),
      folder
    );

    // secure_url is the HTTPS URL permanently hosted by Cloudinary — the
    // response key stays "path" so existing clients are unaffected.
    return NextResponse.json({ path: result.secure_url }, { status: 201 });
  } catch (error) {
    console.error("Failed to upload image to Cloudinary:", error);
    return NextResponse.json(
      { message: "Could not save the image. Please try again." },
      { status: 500 }
    );
  }
}
