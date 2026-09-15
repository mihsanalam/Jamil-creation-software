/* eslint-disable @typescript-eslint/no-require-imports */
// One-off migration: Tier 4 (reliability, security & operations).
//   1. audit_logs           — who changed what, when
//   2. login_attempts       — failed-login tracking + temporary lockout
//   3. users.session_version— bumped on password changes so old JWT
//                             sessions are forced to log out
//   4. Indexes the dashboard/phase-board polling relies on as data
//      grows: work_orders.status, sales.created_at, clients.phone
//      (plus fabric_batches.status).
//
// Safe to re-run (idempotent). Run from the project root:
//   node scripts/migrate-tier4.cjs
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

async function tableExists(connection, tableName) {
  const [rows] = await connection.query(
    `SELECT TABLE_NAME FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = ?`,
    [tableName]
  );
  return rows.length > 0;
}

async function columnExists(connection, tableName, columnName) {
  const [rows] = await connection.query(
    `SELECT COLUMN_NAME FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ?
       AND column_name = ?`,
    [tableName, columnName]
  );
  return rows.length > 0;
}

// MySQL has no CREATE INDEX IF NOT EXISTS, so check information_schema first.
async function indexExists(connection, tableName, indexName) {
  const [rows] = await connection.query(
    `SELECT INDEX_NAME FROM information_schema.statistics
     WHERE table_schema = DATABASE() AND table_name = ?
       AND index_name = ?`,
    [tableName, indexName]
  );
  return rows.length > 0;
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

  // 1. audit_logs — one row per noteworthy mutation (phase changes, user
  //    edits, password changes, sales, payments, returns, ...).
  if (!(await tableExists(connection, "audit_logs"))) {
    await connection.query(`
      CREATE TABLE audit_logs (
        id          VARCHAR(36) PRIMARY KEY,
        actor_id    VARCHAR(36) NULL,
        actor_name  VARCHAR(255) NOT NULL,
        action      VARCHAR(50) NOT NULL,
        entity_type VARCHAR(50) NOT NULL,
        entity_id   VARCHAR(36) NULL,
        details     TEXT NULL,
        created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_audit_entity (entity_type, entity_id),
        INDEX idx_audit_created_at (created_at),
        FOREIGN KEY (actor_id) REFERENCES users(id)
      )
    `);
    console.log("Created table: audit_logs");
  } else {
    console.log("Table audit_logs already exists — skipping CREATE.");
  }

  // 2. login_attempts — brute-force protection state per email.
  if (!(await tableExists(connection, "login_attempts"))) {
    await connection.query(`
      CREATE TABLE login_attempts (
        email           VARCHAR(255) PRIMARY KEY,
        failed_attempts INT NOT NULL DEFAULT 0,
        locked_until    DATETIME NULL,
        last_attempt_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("Created table: login_attempts");
  } else {
    console.log("Table login_attempts already exists — skipping CREATE.");
  }

  // 3. users.session_version — bumped on every password change/reset so the
  //    jwt callback in auth.ts can reject sessions issued before the change.
  if (!(await columnExists(connection, "users", "session_version"))) {
    await connection.query(
      "ALTER TABLE users ADD COLUMN session_version INT NOT NULL DEFAULT 0"
    );
    console.log("Added column: users.session_version");
  } else {
    console.log("Column users.session_version already exists — skipping ALTER.");
  }

  // 4. Query-path indexes for the 5s-polling screens and big tables.
  const indexes = [
    ["work_orders", "idx_work_orders_status", "(status)"],
    ["sales", "idx_sales_created_at", "(created_at)"],
    ["clients", "idx_clients_phone", "(phone)"],
    ["fabric_batches", "idx_fabric_batches_status", "(status)"],
  ];
  for (const [table, name, columns] of indexes) {
    if (await indexExists(connection, table, name)) {
      console.log(`Index ${name} already exists — skipping.`);
      continue;
    }
    await connection.query(`CREATE INDEX ${name} ON ${table} ${columns}`);
    console.log(`Created index: ${name} on ${table}${columns}`);
  }

  await connection.end();
  console.log("Tier 4 migration complete.");
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
