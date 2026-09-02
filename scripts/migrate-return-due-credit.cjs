/* eslint-disable @typescript-eslint/no-require-imports */
// One-off migration: add return_batches.due_credit — the part of a return's
// cashback that was applied to the client's outstanding due instead of being
// handed over in cash. Safe to re-run (idempotent).
//
// Run from the project root:
//   node scripts/migrate-return-due-credit.cjs
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
  });

  const [columns] = await connection.query(
    `SELECT COLUMN_NAME FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'return_batches'
       AND column_name = 'due_credit'`
  );
  if (columns.length === 0) {
    await connection.query(
      "ALTER TABLE return_batches ADD COLUMN due_credit DECIMAL(10,2) NOT NULL DEFAULT 0"
    );
    console.log("Added column: return_batches.due_credit");
  } else {
    console.log("Column due_credit already exists — skipping ALTER.");
  }

  await connection.end();
  console.log("Migration complete.");
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
