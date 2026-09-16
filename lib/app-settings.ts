import type { RowDataPacket } from "mysql2/promise";

import { db } from "@/lib/db";

// A settings row — everything is stored as text and parsed on read.
interface SettingRow extends RowDataPacket {
  setting_value: string | null;
}

/**
 * Read one raw app_settings value (null when unset or the table is missing —
 * the dashboard already degrades gracefully for older databases, so every
 * caller here must default instead of throwing).
 */
export async function readSetting(key: string): Promise<string | null> {
  try {
    const [rows] = await db.query<SettingRow[]>(
      `SELECT setting_value FROM app_settings WHERE setting_key = ? LIMIT 1`,
      [key]
    );
    return rows[0]?.setting_value ?? null;
  } catch {
    return null;
  }
}

/**
 * Business policy "block_due_clients": when ON, the POS refuses to open a new
 * CREDIT sale (partially paid → DUE/PARTIAL) for a client that already has an
 * outstanding balance. Fully-paid sales are never blocked. Defaults to OFF
 * (warn only) until the Owner turns it on in the dashboard settings dialog.
 */
export async function isBlockDueClientsEnabled(): Promise<boolean> {
  const value = await readSetting("block_due_clients");
  return value === "1";
}
