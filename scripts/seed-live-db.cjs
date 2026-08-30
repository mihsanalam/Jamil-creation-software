/* eslint-disable @typescript-eslint/no-require-imports */
// Seeds the LIVE jamilcreations database with traditional Bangladeshi
// products: ~7 finished products in the warehouse and ~7 in-progress
// work orders on the phase board. Safe to run more than once.
//
//   node scripts/seed-live-db.cjs
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

const { STOCK } = require("./seed-data-stock.cjs");
const { BOARD } = require("./seed-data-board.cjs");

const exists = async (c, table, col, id) => {
  const [r] = await c.query(`SELECT 1 FROM ${table} WHERE ${col} = ? LIMIT 1`, [id]);
  return r.length > 0;
};

async function main() {
  const c = await mysql.createConnection({
    host: process.env.DATABASE_HOST,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
  });

  const [[bc]] = await c.query(
    "SELECT COALESCE(MAX(CAST(SUBSTRING_INDEX(barcode, '-', -1) AS UNSIGNED)), 0) AS m FROM finished_products"
  );
  const [[bn]] = await c.query(
    "SELECT COALESCE(MAX(CAST(SUBSTRING_INDEX(batch_number, '-', -1) AS UNSIGNED)), 0) AS m FROM fabric_batches"
  );
  let nextBarcode = Number(bc.m) + 1;
  let nextBatchNum = Number(bn.m) + 1;

  // warehouse stock loop
  let s = 0;
  for (const item of STOCK) {
    s += 1;
    const fbId = `fb_seed${s}`;
    const woId = `wo_seed${s}`;
    const fpId = `fp_seed${s}`;
    if (await exists(c, "finished_products", "id", fpId)) continue;

    const batchNumber = `FB-2026-${String(nextBatchNum++).padStart(4, "0")}`;
    const barcode = `JC-${String(nextBarcode++).padStart(4, "0")}`;

    await c.query(
      `INSERT INTO fabric_batches
         (id, batch_number, fabric_type, quantity, unit, supplier,
          description, process_notes, status, recorded_by_id)
       VALUES (?, ?, ?, ?, 'meters', ?, ?, ?, 'READY', 'usr_collector1')`,
      [fbId, batchNumber, item.fb.name, item.fb.qty, item.fb.supplier,
       `For ${item.wo.product} order`, `Made from ${item.fb.name}`]
    );
    await c.query(
      `INSERT INTO work_orders
         (id, fabric_batch_id, phase_template_id, product_type, quantity, status, created_by_id)
       VALUES (?, ?, 'pt_plain', ?, ?, 'COMPLETED', 'usr_operator1')`,
      [woId, fbId, item.wo.product, item.wo.qty]
    );
    let step = 1;
    for (const [name, worker, qtyIn, qtyOut] of item.steps) {
      await c.query(
        `INSERT INTO work_order_phases
           (id, work_order_id, name, step_order, status, worker_name, qty_in, qty_out,
            started_at, completed_at)
         VALUES (?, ?, ?, ?, 'COMPLETED', ?, ?, ?, '2026-08-10 09:00:00', '2026-08-12 17:00:00')`,
        [`woph_seed_${s}_${step}`, woId, name, step, worker, qtyIn, qtyOut]
      );
      step += 1;
    }
    await c.query(
      `INSERT INTO finished_products
         (id, work_order_id, barcode, quantity, quantity_remaining, storage_location, status)
       VALUES (?, ?, ?, ?, ?, ?, 'IN_STOCK')`,
      [fpId, woId, barcode, item.fp.qty, item.fp.qty, item.fp.shelf]
    );
    console.log(`Warehouse + ${barcode} ${item.wo.product} (${item.fp.qty} pcs, ${item.fp.shelf})`);
  }

  // phase board loop
  let b = 0;
  for (const item of BOARD) {
    b += 1;
    const fbId = `fb_seedb${b}`;
    const woId = `wo_seedb${b}`;
    if (await exists(c, "work_orders", "id", woId)) continue;

    const batchNumber = `FB-2026-${String(nextBatchNum++).padStart(4, "0")}`;
    await c.query(
      `INSERT INTO fabric_batches
         (id, batch_number, fabric_type, quantity, unit, supplier,
          description, process_notes, status, recorded_by_id)
       VALUES (?, ?, ?, ?, 'meters', ?, ?, ?, 'IN_PRODUCTION', 'usr_collector1')`,
      [fbId, batchNumber, item.fb.name, item.fb.qty, item.fb.supplier,
       `For ${item.wo.product} order`, `Made from ${item.fb.name}`]
    );
    await c.query(
      `INSERT INTO work_orders
         (id, fabric_batch_id, phase_template_id, product_type, quantity, status, created_by_id)
       VALUES (?, ?, ?, ?, ?, 'IN_PROGRESS', 'usr_operator1')`,
      [woId, fbId, item.template, item.wo.product, item.wo.qty]
    );
    let step = 1;
    for (const [name, status, worker, startedAt, completedAt, qtyIn, qtyOut] of item.phases) {
      await c.query(
        `INSERT INTO work_order_phases
           (id, work_order_id, name, step_order, status, worker_name, qty_in, qty_out,
            started_at, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [`woph_seedb_${b}_${step}`, woId, name, step, status, worker,
         qtyIn, qtyOut, startedAt, completedAt]
      );
      step += 1;
    }
    console.log(`Board + ${item.wo.product} (${item.wo.qty} pcs, ${batchNumber})`);
  }

  const [[fpCount]] = await c.query("SELECT COUNT(*) AS c FROM finished_products");
  const [[woCount]] = await c.query(
    "SELECT COUNT(*) AS c FROM work_orders WHERE status = 'IN_PROGRESS'"
  );
  console.log(`\nNow: ${Number(fpCount.c)} finished products, ${Number(woCount.c)} in-progress work orders.`);
  await c.end();
}

main().catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
});