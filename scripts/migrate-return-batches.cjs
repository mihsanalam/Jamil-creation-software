/* eslint-disable @typescript-eslint/no-require-imports */
// One-off migration: return & exchange session tables (Feature 5, phase 2).
// Creates return_batches + return_exchanges and links return lines to a
// batch. Safe to re-run (idempotent).
//
// Run from the project root:
//   node scripts/migrate-return-batches.cjs
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

async function main() {
  loadEnv();
  const connection = await mysql.createConnection({
    host: process.env.DATABASE_HOST,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
    multipleStatements: true,
  });

  // 1. return_batches — one return/exchange event against an invoice.
  if (!(await tableExists(connection, "return_batches"))) {
    await connection.query(`
      CREATE TABLE return_batches (
        id VARCHAR(36) PRIMARY KEY,
        sale_id VARCHAR(36) NOT NULL,
        cashback DECIMAL(10,2) NOT NULL DEFAULT 0,
        notes TEXT,
        date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        recorded_by_id VARCHAR(36) NOT NULL,
        FOREIGN KEY (sale_id) REFERENCES sales(id),
        FOREIGN KEY (recorded_by_id) REFERENCES users(id)
      )
    `);
    console.log("Created table: return_batches");
  } else {
    console.log("Table return_batches already exists — skipping CREATE.");
  }

  // 2. return_exchanges — products handed to the customer in exchange.
  //    Their stock is decremented like a sale; the price may be the same,
  //    lower (cashback) or higher (customer pays the difference).
  if (!(await tableExists(connection, "return_exchanges"))) {
    await connection.query(`
      CREATE TABLE return_exchanges (
        id VARCHAR(36) PRIMARY KEY,
        return_batch_id VARCHAR(36) NOT NULL,
        finished_product_id VARCHAR(36) NOT NULL,
        quantity DECIMAL(10,2) NOT NULL,
        unit_price DECIMAL(10,2) NOT NULL,
        FOREIGN KEY (return_batch_id) REFERENCES return_batches(id) ON DELETE CASCADE,
        FOREIGN KEY (finished_product_id) REFERENCES finished_products(id)
      )
    `);
    console.log("Created table: return_exchanges");
  } else {
    console.log("Table return_exchanges already exists — skipping CREATE.");
  }

  // 3. returns.return_batch_id — links each return line to its session.
  //    Nullable: quick returns from the invoice screen have no batch.
  if (!(await columnExists(connection, "returns", "return_batch_id"))) {
    await connection.query(
      "ALTER TABLE returns ADD COLUMN return_batch_id VARCHAR(36) NULL"
    );
    console.log("Added column: returns.return_batch_id");
  } else {
    console.log("Column returns.return_batch_id already exists — skipping ALTER.");
  }

  if (!(await columnExists(connection, "returns", "return_batch_id"))) {
    // unreachable — kept for symmetry with the guard above
  }
  const [fks] = await connection.query(
    `SELECT CONSTRAINT_NAME FROM information_schema.table_constraints
     WHERE table_schema = DATABASE() AND table_name = 'returns'
       AND constraint_type = 'FOREIGN KEY'
       AND constraint_name = 'fk_returns_return_batch'`
  );
  if (fks.length === 0) {
    await connection.query(`
      ALTER TABLE returns
        ADD CONSTRAINT fk_returns_return_batch
        FOREIGN KEY (return_batch_id) REFERENCES return_batches(id)
    `);
    console.log("Added foreign key: fk_returns_return_batch");
  } else {
    console.log("Foreign key fk_returns_return_batch already exists — skipping.");
  }

  await connection.end();
  console.log("Migration complete.");
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
