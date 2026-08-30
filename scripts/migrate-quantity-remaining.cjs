/* eslint-disable @typescript-eslint/no-require-imports */
// One-off migration: add `quantity_remaining` to finished_products and
// backfill it from existing sale_items. Safe to re-run (idempotent).
//
// Run from the project root:
//   node scripts/migrate-quantity-remaining.cjs
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

  // Add the column only if it doesn't already exist.
  const [columns] = await connection.query(
    `SELECT COLUMN_NAME FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'finished_products'
       AND column_name = 'quantity_remaining'`
  );
  if (columns.length === 0) {
    await connection.query(
      "ALTER TABLE finished_products ADD COLUMN quantity_remaining DECIMAL(10,2) NOT NULL DEFAULT 0"
    );
    console.log("Added column: finished_products.quantity_remaining");
  } else {
    console.log("Column quantity_remaining already exists — skipping ALTER.");
  }

  // Backfill: remaining = original quantity - everything already sold.
  // Clamp at 0 (a lot can't hold negative stock) — rows that were
  // over-sold in legacy data just become fully sold.
  await connection.query(
    `UPDATE finished_products fp
     SET quantity_remaining = GREATEST(0, fp.quantity - COALESCE(
       (SELECT SUM(si.quantity) FROM sale_items si
        WHERE si.finished_product_id = fp.id), 0))`
  );
  console.log("Backfilled quantity_remaining from sale_items.");

  // A lot is only SOLD once nothing is left.
  await connection.query(
    "UPDATE finished_products SET status = 'SOLD' WHERE quantity_remaining <= 0"
  );
  console.log("Flaged fully-decremented lots as SOLD.");

  const [rows] = await connection.query(
    "SELECT id, barcode, quantity, quantity_remaining, status FROM finished_products"
  );
  console.table(rows);

  await connection.end();
  console.log("Migration complete.");
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});