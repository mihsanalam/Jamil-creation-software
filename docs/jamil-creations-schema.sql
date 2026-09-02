-- ============================================
-- Jamil Creations — MySQL Schema
-- Garment production tracking + POS system
-- Run this whole file in MySQL Workbench (SQL tab) to create everything.
-- ============================================

CREATE DATABASE IF NOT EXISTS jamilcreations;
USE jamilcreations;

-- ============================================
-- AUTH & USERS
-- ============================================

CREATE TABLE users (
  id             VARCHAR(36) PRIMARY KEY,
  name           VARCHAR(255) NOT NULL,
  email          VARCHAR(255) NOT NULL UNIQUE,
  password_hash  VARCHAR(255) NOT NULL,
  role           ENUM('OWNER','COLLECTOR','OPERATOR') NOT NULL,
  status         ENUM('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- FABRIC INTAKE (Screen 7, 8)
-- ============================================

CREATE TABLE fabric_batches (
  id              VARCHAR(36) PRIMARY KEY,
  batch_number    VARCHAR(50) NOT NULL UNIQUE,
  fabric_type     VARCHAR(255) NOT NULL,
  quantity        DECIMAL(10,2) NOT NULL,
  unit            VARCHAR(20) NOT NULL,
  supplier        VARCHAR(255) NOT NULL,
  date_received   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  description     TEXT,
  process_notes   TEXT,
  status          ENUM('PENDING','IN_PRODUCTION','READY','SOLD') NOT NULL DEFAULT 'PENDING',
  image_url       VARCHAR(500),           -- optional fabric photo under /uploads/fabric
  recorded_by_id  VARCHAR(36) NOT NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (recorded_by_id) REFERENCES users(id)
);

-- ============================================
-- PHASE TEMPLATES (Screen 4 — Owner)
-- ============================================

CREATE TABLE phase_templates (
  id          VARCHAR(36) PRIMARY KEY,
  name        VARCHAR(255) NOT NULL,   -- "Plain garment", "Embroidered garment"...
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE phase_template_steps (
  id           VARCHAR(36) PRIMARY KEY,
  template_id  VARCHAR(36) NOT NULL,
  name         VARCHAR(255) NOT NULL,  -- "Cutting", "Stitching"...
  step_order   INT NOT NULL,
  FOREIGN KEY (template_id) REFERENCES phase_templates(id) ON DELETE CASCADE
);

-- ============================================
-- WORK ORDERS & PRODUCTION PIPELINE (Screen 11, 12, 13)
-- ============================================

CREATE TABLE work_orders (
  id                  VARCHAR(36) PRIMARY KEY,
  fabric_batch_id     VARCHAR(36) NOT NULL UNIQUE,
  phase_template_id   VARCHAR(36) NOT NULL,
  product_type        VARCHAR(255) NOT NULL,
  quantity             DECIMAL(10,2) NOT NULL,
  status              ENUM('IN_PROGRESS','COMPLETED') NOT NULL DEFAULT 'IN_PROGRESS',
  created_by_id       VARCHAR(36) NOT NULL,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (fabric_batch_id) REFERENCES fabric_batches(id),
  FOREIGN KEY (phase_template_id) REFERENCES phase_templates(id),
  FOREIGN KEY (created_by_id) REFERENCES users(id)
);

CREATE TABLE work_order_phases (
  id             VARCHAR(36) PRIMARY KEY,
  work_order_id  VARCHAR(36) NOT NULL,
  name           VARCHAR(255) NOT NULL,
  step_order     INT NOT NULL,
  status         ENUM('PENDING','IN_PROGRESS','COMPLETED') NOT NULL DEFAULT 'PENDING',
  worker_name    VARCHAR(255),
  qty_in         DECIMAL(10,2),
  qty_out        DECIMAL(10,2),
  notes          TEXT,
  started_at     DATETIME,
  completed_at   DATETIME,
  FOREIGN KEY (work_order_id) REFERENCES work_orders(id) ON DELETE CASCADE
);

-- ============================================
-- FINISHED GOODS & WAREHOUSE (Screen 9, 10)
-- ============================================

CREATE TABLE finished_products (
  id                VARCHAR(36) PRIMARY KEY,
  work_order_id     VARCHAR(36) NOT NULL UNIQUE,
  barcode           VARCHAR(100) NOT NULL UNIQUE,
  quantity          DECIMAL(10,2) NOT NULL,
  -- How much of the lot is still sellable. Starts at `quantity` when the
  -- product enters stock; every sale_item decrements it. A lot is only
  -- status='SOLD' once this reaches 0, so partial sells are possible.
  quantity_remaining DECIMAL(10,2) NOT NULL DEFAULT 0,
  storage_location  VARCHAR(100) NOT NULL,   -- e.g. "Shelf A-3"
  status            ENUM('IN_STOCK','SOLD') NOT NULL DEFAULT 'IN_STOCK',
  date_added        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (work_order_id) REFERENCES work_orders(id)
);

-- ============================================
-- CLIENTS & POS (Screen 14, 15, 16, 17)
-- ============================================

CREATE TABLE clients (
  id          VARCHAR(36) PRIMARY KEY,
  name        VARCHAR(255) NOT NULL,
  phone       VARCHAR(50) NOT NULL,
  address     VARCHAR(255),
  type        ENUM('WHOLESALE','RETAIL') NOT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sales (
  id              VARCHAR(36) PRIMARY KEY,
  invoice_number  VARCHAR(50) NOT NULL UNIQUE,   -- e.g. "INV-2026-0512"
  client_id       VARCHAR(36) NOT NULL,
  subtotal        DECIMAL(10,2) NOT NULL,
  discount        DECIMAL(10,2) NOT NULL DEFAULT 0,
  total           DECIMAL(10,2) NOT NULL,
  amount_paid     DECIMAL(10,2) NOT NULL DEFAULT 0,
  payment_method  ENUM('CASH','BKASH','NAGAD','BANK_TRANSFER') NOT NULL,
  payment_status  ENUM('PAID','PARTIAL','DUE') NOT NULL DEFAULT 'PAID',
  created_by_id   VARCHAR(36) NOT NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id),
  FOREIGN KEY (created_by_id) REFERENCES users(id)
);

CREATE TABLE sale_items (
  id                   VARCHAR(36) PRIMARY KEY,
  sale_id              VARCHAR(36) NOT NULL,
  finished_product_id  VARCHAR(36) NOT NULL,
  quantity             DECIMAL(10,2) NOT NULL,
  unit_price           DECIMAL(10,2) NOT NULL,
  line_total           DECIMAL(10,2) NOT NULL,
  FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
  FOREIGN KEY (finished_product_id) REFERENCES finished_products(id)
);

-- Records a payment against a client's due balance —
-- can be tied to one specific invoice (sale_id set) or applied
-- generally to the client's overall outstanding balance (sale_id null)
CREATE TABLE payments (
  id              VARCHAR(36) PRIMARY KEY,
  client_id       VARCHAR(36) NOT NULL,
  sale_id         VARCHAR(36),
  amount          DECIMAL(10,2) NOT NULL,
  method          ENUM('CASH','BKASH','NAGAD','BANK_TRANSFER') NOT NULL,
  date            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  recorded_by_id  VARCHAR(36) NOT NULL,
  FOREIGN KEY (client_id) REFERENCES clients(id),
  FOREIGN KEY (sale_id) REFERENCES sales(id),
  FOREIGN KEY (recorded_by_id) REFERENCES users(id)
);

-- ============================================
-- RETURNS / EXCHANGES (Feature 5)
-- ============================================

-- Records a return against one sale_items line. The returned quantity goes
-- back onto the product's quantity_remaining (and its status flips from
-- 'SOLD' to 'IN_STOCK' if the lot was fully sold out), but the sale's total
-- and amount_paid are deliberately NOT adjusted — refunding money is a
-- business decision (store credit / cash / none for damaged goods) that the
-- Owner handles manually for now.
CREATE TABLE returns (
  id VARCHAR(36) PRIMARY KEY,
  sale_item_id VARCHAR(36) NOT NULL,
  quantity DECIMAL(10,2) NOT NULL,
  reason TEXT,
  date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  recorded_by_id VARCHAR(36) NOT NULL,
  return_batch_id VARCHAR(36) NULL,          -- set when part of a Return screen session
  FOREIGN KEY (sale_item_id) REFERENCES sale_items(id),
  FOREIGN KEY (recorded_by_id) REFERENCES users(id),
  FOREIGN KEY (return_batch_id) REFERENCES return_batches(id)
);

-- One return/exchange session recorded from the Operator's Return screen:
-- picks an invoice, logs which lines came back, optionally swaps in other
-- products, and records any cash handed back to the client. The invoice's
-- own totals are still never modified — the cashback lives here.
CREATE TABLE return_batches (
  id VARCHAR(36) PRIMARY KEY,
  sale_id VARCHAR(36) NOT NULL,
  cashback DECIMAL(10,2) NOT NULL DEFAULT 0, -- cash actually handed to the client
  due_credit DECIMAL(10,2) NOT NULL DEFAULT 0, -- part of the cashback applied to the invoice's due instead (no cash moves)
  notes TEXT,
  date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  recorded_by_id VARCHAR(36) NOT NULL,
  FOREIGN KEY (sale_id) REFERENCES sales(id),
  FOREIGN KEY (recorded_by_id) REFERENCES users(id)
);

-- Products handed to the client in exchange for the returned goods.
-- Same price, lower (cashback) or higher (customer pays the difference) —
-- the price difference shows up in the batch's cashback amount. Stock is
-- decremented from finished_products exactly like a sale.
CREATE TABLE return_exchanges (
  id VARCHAR(36) PRIMARY KEY,
  return_batch_id VARCHAR(36) NOT NULL,
  finished_product_id VARCHAR(36) NOT NULL,
  quantity DECIMAL(10,2) NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  FOREIGN KEY (return_batch_id) REFERENCES return_batches(id) ON DELETE CASCADE,
  FOREIGN KEY (finished_product_id) REFERENCES finished_products(id)
);
