/* eslint-disable @typescript-eslint/no-require-imports */
// Read-only check that the Tier 4 migration is applied: prints the new
// tables/columns and the polling-path indexes (item 25) so we can confirm
// the live database matches docs/jamil-creations-schema.sql.
//
// Usage: node scripts/verify-tier4.cjs
const mysql = require("mysql2/promise");
const fs = require("fs");
const path = require("path");

try {
  require("dotenv").config();
} catch {
  const raw = fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

async function main() {
  const c = await mysql.createConnection({
    host: process.env.DATABASE_HOST,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
  });

  const [tables] = await c.query(
    `SELECT table_name AS name
     FROM information_schema.tables
     WHERE table_schema = DATABASE()
     ORDER BY table_name`
  );
  const names = tables.map((t) => t.name).join(", ");
  console.log(`\nTables (${tables.length}):\n  ${names}`);

  const required = ["audit_logs", "login_attempts", "app_settings"];
  for (const table of required) {
    const found = tables.some((t) => t.name === table);
    console.log(`  ${found ? "OK  " : "MISS"} ${table}`);
  }

  const [columns] = await c.query(
    `SELECT column_name AS name
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = 'users'
       AND column_name = 'session_version'`
  );
  console.log(
    `\nusers.session_version: ${columns.length > 0 ? "OK" : "MISSING"}`
  );

  // Item 25 — the polling hot paths must be indexed as the data grows.
  const wanted = [
    ["work_orders", "status"],
    ["sales", "created_at"],
    ["clients", "phone"],
  ];
  console.log("\nPolling-path indexes:");
  for (const [table, column] of wanted) {
    const [rows] = await c.query(
      `SELECT index_name AS name
       FROM information_schema.statistics
       WHERE table_schema = DATABASE()
         AND table_name = ?
         AND column_name = ?
         AND seq_in_index = 1`,
      [table, column]
    );
    console.log(
      `  ${rows.length > 0 ? "OK  " : "MISS"} ${table}.${column} -> ${
        rows.map((r) => r.name).join(", ") || "(none)"
      }`
    );
  }

  await c.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});