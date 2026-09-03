import { v2 as cloudinary } from "cloudinary";
import type { UploadApiResponse } from "cloudinary";

// Cloudinary hosts the fabric photos so they survive re-deploys (the app
// folder is rebuilt from GitHub on every push, so anything written to the
// local disk would be lost). Credentials come from environment variables:
// CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET.
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// URLs are only ever created by our own POST /api/uploads, so this pattern
// rejects anything a client might try to point the record at (arbitrary
// hosts, data: URIs, relative server paths, ...).
const CLOUDINARY_URL_PATTERN =
  /^https:\/\/res\.cloudinary\.com\/[A-Za-z0-9_-]+\/image\/upload\/[A-Za-z0-9._/-]+$/;

// Legacy paths from before the Cloudinary migration (files that were saved
// under public/uploads/fabric/ on the old server). They are kept valid so
// batches that already reference them keep passing validation.
const LEGACY_LOCAL_PATH_PATTERN = /^\/uploads\/fabric\/[A-Za-z0-9._-]+$/;

export function isValidFabricImageUrl(value: string): boolean {
  return (
    CLOUDINARY_URL_PATTERN.test(value) || LEGACY_LOCAL_PATH_PATTERN.test(value)
  );
}

/**
 * Uploads an image buffer to Cloudinary (folder: fabric) and resolves with
 * the API response — use result.secure_url as the permanent public URL.
 */
export function uploadBufferToCloudinary(
  buffer: Buffer
): Promise<UploadApiResponse> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: "fabric", resource_type: "image" },
      (error, result) => {
        if (error || !result) {
          reject(error ?? new Error("Cloudinary upload returned no result."));
        } else {
          resolve(result);
        }
      }
    );
    stream.end(buffer);
  });
}