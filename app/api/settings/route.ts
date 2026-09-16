import { NextResponse } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";

import { auth } from "@/auth";
import { db } from "@/lib/db";

// Keys used by the Owner settings dialog.
const SETTING_KEY_THRESHOLD = "bottleneck_threshold";
const SETTING_KEY_BLOCK_DUE = "block_due_clients";
const DEFAULT_THRESHOLD = 8;
const MIN_THRESHOLD = 1;
const MAX_THRESHOLD = 100;

// A settings row — everything is stored as text and parsed on read.
interface SettingRow extends RowDataPacket {
  setting_key: string;
  setting_value: string | null;
}

/**
 * GET /api/settings — the Owner-configurable business settings.
 * Returns every setting with a sensible default when the app hasn't been
 * customised yet (or the settings table doesn't exist):
 *   - bottleneckThreshold: pipeline bottleneck alert threshold (1–100)
 *   - blockDueClients: when true, the POS refuses new CREDIT sales to
 *     clients that already have outstanding dues (feature #27)
 */
export async function GET() {
  // Middleware skips /api routes, so the session is verified here directly.
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const [rows] = await db.query<SettingRow[]>(
      `SELECT setting_key, setting_value FROM app_settings
       WHERE setting_key IN (?, ?)`,
      [SETTING_KEY_THRESHOLD, SETTING_KEY_BLOCK_DUE]
    );
    const values = new Map(
      rows.map((row) => [row.setting_key, row.setting_value])
    );

    const threshold = Number(values.get(SETTING_KEY_THRESHOLD) ?? "");
    return NextResponse.json({
      bottleneckThreshold:
        Number.isInteger(threshold) &&
        threshold >= MIN_THRESHOLD &&
        threshold <= MAX_THRESHOLD
          ? threshold
          : DEFAULT_THRESHOLD,
      blockDueClients: values.get(SETTING_KEY_BLOCK_DUE) === "1",
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
 * Body: { bottleneckThreshold?: number, blockDueClients?: boolean }
 * At least one setting must be present; the two save independently so the
 * dialog can send both and other callers can send just one.
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

  // Each present field is validated; absent fields are left untouched.
  const saves: { key: string; value: string }[] = [];

  if (body.bottleneckThreshold !== undefined) {
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
    saves.push({ key: SETTING_KEY_THRESHOLD, value: String(threshold) });
  }

  if (body.blockDueClients !== undefined) {
    if (typeof body.blockDueClients !== "boolean") {
      return NextResponse.json(
        { message: "Invalid blockDueClients — must be true or false." },
        { status: 400 }
      );
    }
    saves.push({
      key: SETTING_KEY_BLOCK_DUE,
      value: body.blockDueClients ? "1" : "0",
    });
  }

  if (saves.length === 0) {
    return NextResponse.json(
      {
        message:
          "Nothing to save — send bottleneckThreshold and/or blockDueClients.",
      },
      { status: 400 }
    );
  }

  try {
    for (const save of saves) {
      // Upsert: insert the row the first time, update it afterwards.
      await db.query<ResultSetHeader>(
        `INSERT INTO app_settings (setting_key, setting_value, updated_by_id, updated_at)
         VALUES (?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value),
                                updated_by_id = VALUES(updated_by_id),
                                updated_at = NOW()`,
        [save.key, save.value, session.user.id]
      );
    }

    const savedThreshold = saves.find((s) => s.key === SETTING_KEY_THRESHOLD);
    const savedBlockDue = saves.find((s) => s.key === SETTING_KEY_BLOCK_DUE);
    return NextResponse.json({
      ...(savedThreshold
        ? { bottleneckThreshold: Number(savedThreshold.value) }
        : {}),
      ...(savedBlockDue
        ? { blockDueClients: savedBlockDue.value === "1" }
        : {}),
    });
  } catch (error) {
    console.error("Failed to save settings:", error);
    return NextResponse.json(
      { message: "Could not save settings. Please try again." },
      { status: 500 }
    );
  }
}