/* eslint-disable @typescript-eslint/no-require-imports */
// Prints the current state of the jamilcreations DB so we can see what
// already exists before seeding more phase-board / warehouse rows.
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
  const q = async (sql, label) => {
    const [r] = await c.query(sql);
    console.log(`\n=== ${label} (${r.length}) ===`);
    console.log(JSON.stringify(r, null, 1));
  };
  await q("SELECT id, name FROM users", "users");
  await q("SELECT id, name FROM phase_templates", "phase_templates");
  await q(
    "SELECT id, template_id, name, step_order FROM phase_template_steps",
    "phase_template_steps"
  );
  await q(
    "SELECT id, batch_number, fabric_type, quantity, status FROM fabric_batches",
    "fabric_batches"
  );
  await q(
    "SELECT id, fabric_batch_id, product_type, quantity, status FROM work_orders",
    "work_orders"
  );
  await q(
    "SELECT work_order_id, name, status, step_order FROM work_order_phases ORDER BY work_order_id, step_order",
    "work_order_phases"
  );
  await q(
    "SELECT id, work_order_id, barcode, quantity, quantity_remaining, status FROM finished_products",
    "finished_products"
  );
  await c.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});