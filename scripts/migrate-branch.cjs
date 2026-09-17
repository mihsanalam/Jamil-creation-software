/* eslint-disable @typescript-eslint/no-require-imports */
// One-off migration: add `branch` to finished_products so every stock lot
// records which shop/branch it sits in (#30 — multi-shop readiness). Existing
// rows fall back to the single default branch "Main Store". Safe to re-run
// (idempotent).
//
// Run from the project root:
//   node scripts/migrate-branch.cjs
//
// It reads DATABASE_* from .env via dotenv. If dotenv isn't installed,
// the script falls back to reading the .env file directly.
const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");

function loadEnv() {
  try {
    require("dotenv").config();
  } catch {
    const raw = fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
    }
  }
}

async function main() {
  loadEnv();
  const connection = await mysql.createConnection({
    host: process.env.DATABASE_HOST,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
    multipleStatements: true,
  });

  // Add the column only if it doesn't already exist. Every existing lot
  // lands in the default branch so nothing breaks after the upgrade.
  const [columns] = await connection.query(
    `SELECT COLUMN_NAME FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'finished_products'
       AND column_name = 'branch'`
  );
  if (columns.length === 0) {
    await connection.query(
      "ALTER TABLE finished_products ADD COLUMN branch VARCHAR(100) NOT NULL DEFAULT 'Main Store' AFTER storage_location"
    );
    console.log("Added column: finished_products.branch");
  } else {
    console.log("Column branch already exists — skipping ALTER.");
  }

  // Index for the branch filter on the stock listing (cheap, and needed the
  // moment a second branch opens).
  const [indexes] = await connection.query(
    `SELECT INDEX_NAME FROM information_schema.statistics
     WHERE table_schema = DATABASE() AND table_name = 'finished_products'
       AND index_name = 'idx_finished_products_branch'`
  );
  if (indexes.length === 0) {
    await connection.query(
      "CREATE INDEX idx_finished_products_branch ON finished_products (branch)"
    );
    console.log("Added index: idx_finished_products_branch");
  } else {
    console.log("Index idx_finished_products_branch already exists — skipping.");
  }

  const [rows] = await connection.query(
    "SELECT id, barcode, branch, storage_location, status FROM finished_products"
  );
  console.table(rows);

  await connection.end();
  console.log("Migration complete.");
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});