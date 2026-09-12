import { NextResponse } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";

import { auth } from "@/auth";
import { db } from "@/lib/db";

// Key used for the production-pipeline bottleneck alert threshold.
const SETTING_KEY = "bottleneck_threshold";
const DEFAULT_THRESHOLD = 8;
const MIN_THRESHOLD = 1;
const MAX_THRESHOLD = 100;

// A settings row — everything is stored as text and parsed on read.
interface SettingRow extends RowDataPacket {
  setting_value: string | null;
}

/**
 * GET /api/settings — the Owner-configurable business settings.
 * Returns the bottleneck threshold with a sensible default when the app
 * hasn't been customised yet (or the settings table doesn't exist).
 */
export async function GET() {
  // Middleware skips /api routes, so the session is verified here directly.
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const [rows] = await db.query<SettingRow[]>(
      `SELECT setting_value FROM app_settings WHERE setting_key = ? LIMIT 1`,
      [SETTING_KEY]
    );

    const threshold = Number(rows[0]?.setting_value ?? "");
    return NextResponse.json({
      bottleneckThreshold:
        Number.isInteger(threshold) &&
        threshold >= MIN_THRESHOLD &&
        threshold <= MAX_THRESHOLD
          ? threshold
          : DEFAULT_THRESHOLD,
    });
  } catch (error) {
    console.error("Failed to read settings:", error);
    return NextResponse.json(
      { message: "Could not load settings. Please try again." },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/settings — saves Owner settings (OWNER role only).
 * Body: { bottleneckThreshold: number } — a whole number within 1–100.
 */
export async function PUT(request: Request) {
  // Only the Owner may change business-wide settings.
  const session = await auth();
  if (session?.user?.role !== "OWNER") {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  const threshold = Number(body.bottleneckThreshold);
  if (
    !Number.isInteger(threshold) ||
    threshold < MIN_THRESHOLD ||
    threshold > MAX_THRESHOLD
  ) {
    return NextResponse.json(
      {
        message: `Invalid bottleneckThreshold — must be a whole number between ${MIN_THRESHOLD} and ${MAX_THRESHOLD}.`,
      },
      { status: 400 }
    );
  }

  try {
    // Upsert: insert the row the first time, update it afterwards.
    await db.query<ResultSetHeader>(
      `INSERT INTO app_settings (setting_key, setting_value, updated_by_id, updated_at)
       VALUES (?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value),
                              updated_by_id = VALUES(updated_by_id),
                              updated_at = NOW()`,
      [SETTING_KEY, String(threshold), session.user.id]
    );

    return NextResponse.json({ bottleneckThreshold: threshold });
  } catch (error) {
    console.error("Failed to save settings:", error);
    return NextResponse.json(
      { message: "Could not save settings. Please try again." },
      { status: 500 }
    );
  }
}