/* eslint-disable @typescript-eslint/no-require-imports */
// One-off migration: add `image_url` to fabric_batches so every batch can
// carry an optional fabric photo (path under /uploads/fabric). Safe to
// re-run (idempotent).
//
// Run from the project root:
//   node scripts/migrate-fabric-image.cjs
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
  });

  // Add the column only if it doesn't already exist.
  const [columns] = await connection.query(
    `SELECT COLUMN_NAME FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'fabric_batches'
       AND column_name = 'image_url'`
  );
  if (columns.length === 0) {
    await connection.query(
      "ALTER TABLE fabric_batches ADD COLUMN image_url VARCHAR(500) NULL"
    );
    console.log("Added column: fabric_batches.image_url");
  } else {
    console.log("Column image_url already exists — skipping ALTER.");
  }

  const [rows] = await connection.query(
    "SELECT id, batch_number, image_url FROM fabric_batches"
  );
  console.table(rows);

  await connection.end();
  console.log("Migration complete.");
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});