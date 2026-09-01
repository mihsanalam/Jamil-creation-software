/* eslint-disable @typescript-eslint/no-require-imports */
// One-off migration: create the `returns` table (Feature 5 — returns
// handling). Safe to re-run (idempotent).
//
// Run from the project root:
//   node scripts/migrate-returns.cjs
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

  const [tables] = await connection.query(
    `SELECT TABLE_NAME FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = 'returns'`
  );
  if (tables.length === 0) {
    await connection.query(`
      CREATE TABLE returns (
        id VARCHAR(36) PRIMARY KEY,
        sale_item_id VARCHAR(36) NOT NULL,
        quantity DECIMAL(10,2) NOT NULL,
        reason TEXT,
        date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        recorded_by_id VARCHAR(36) NOT NULL,
        FOREIGN KEY (sale_item_id) REFERENCES sale_items(id),
        FOREIGN KEY (recorded_by_id) REFERENCES users(id)
      )
    `);
    console.log("Created table: returns");
  } else {
    console.log("Table returns already exists — skipping CREATE.");
  }

  await connection.end();
  console.log("Migration complete.");
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
