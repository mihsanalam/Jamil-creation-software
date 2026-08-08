-- ============================================
-- Jamil Creations — Dummy Data
-- Run AFTER jamil-creations-schema.sql
-- Paste into a new Workbench query tab and run the whole script
-- (lightning bolt icon, or Ctrl+Shift+Enter)
-- ============================================

USE jamilcreations;

-- ============================================
-- USERS
-- Note: password_hash below is a placeholder. Real passwords get
-- hashed by your app (via bcrypt, through Auth.js) — never store
-- plain text passwords. This is only here so the table isn't empty.
-- ============================================

INSERT INTO users (id, name, email, password_hash, role, status) VALUES
('usr_owner1',      'Jamil Uddin',     'owner@jamilcreations.com',      'CHANGE_ME_HASHED', 'OWNER',     'ACTIVE'),
('usr_collector1',  'Karim Hossain',   'collector@jamilcreations.com', 'CHANGE_ME_HASHED', 'COLLECTOR', 'ACTIVE'),
('usr_operator1',   'Rashida Begum',   'operator1@jamilcreations.com', 'CHANGE_ME_HASHED', 'OPERATOR',  'ACTIVE'),
('usr_operator2',   'Tanveer Ahmed',   'operator2@jamilcreations.com', 'CHANGE_ME_HASHED', 'OPERATOR',  'ACTIVE');

-- ============================================
-- PHASE TEMPLATES + STEPS
-- ============================================

INSERT INTO phase_templates (id, name) VALUES
('pt_plain',       'Plain garment'),
('pt_embroidered', 'Embroidered garment'),
('pt_printed',     'Printed garment');

INSERT INTO phase_template_steps (id, template_id, name, step_order) VALUES
('pts_plain_1', 'pt_plain', 'Cutting', 1),
('pts_plain_2', 'pt_plain', 'Stitching', 2),
('pts_plain_3', 'pt_plain', 'Finishing and QC', 3),

('pts_emb_1', 'pt_embroidered', 'Cutting', 1),
('pts_emb_2', 'pt_embroidered', 'Stitching', 2),
('pts_emb_3', 'pt_embroidered', 'Embroidery', 3),
('pts_emb_4', 'pt_embroidered', 'Finishing and QC', 4),

('pts_print_1', 'pt_printed', 'Cutting', 1),
('pts_print_2', 'pt_printed', 'Stitching', 2),
('pts_print_3', 'pt_printed', 'Printing', 3),
('pts_print_4', 'pt_printed', 'Finishing and QC', 4);

-- ============================================
-- FABRIC BATCHES
-- fb_001: currently in production (embroidered)
-- fb_002: just recorded, no work order yet
-- fb_003: fully completed, used to show a finished product example
-- ============================================

INSERT INTO fabric_batches (id, batch_number, fabric_type, quantity, unit, supplier, description, process_notes, status, recorded_by_id) VALUES
('fb_001', 'FB-2026-0001', 'Cotton',    80, 'meters', 'Dhaka Textile Mills',     'Off-white cotton, medium weight', 'For embroidered kurti order',      'IN_PRODUCTION', 'usr_collector1'),
('fb_002', 'FB-2026-0002', 'Georgette', 50, 'meters', 'Narayanganj Fabrics',     'Light pink georgette',            NULL,                                'PENDING',        'usr_collector1'),
('fb_003', 'FB-2026-0003', 'Cotton',    30, 'meters', 'Dhaka Textile Mills',     'Plain white cotton',              'Simple plain garment run',          'READY',          'usr_collector1');

-- ============================================
-- WORK ORDERS
-- wo_001: in progress (matches fb_001, embroidered template)
-- wo_002: completed (matches fb_003, plain template)
-- ============================================

INSERT INTO work_orders (id, fabric_batch_id, phase_template_id, product_type, quantity, status, created_by_id) VALUES
('wo_001', 'fb_001', 'pt_embroidered', 'Embroidered garment', 40, 'IN_PROGRESS', 'usr_operator1'),
('wo_002', 'fb_003', 'pt_plain',       'Plain garment',       20, 'COMPLETED',   'usr_operator2');

-- ============================================
-- WORK ORDER PHASES
-- wo_001: Cutting done, Stitching in progress, rest pending
-- wo_002: all phases completed
-- ============================================

INSERT INTO work_order_phases (id, work_order_id, name, step_order, status, worker_name, qty_in, qty_out, started_at, completed_at) VALUES
('wop_001', 'wo_001', 'Cutting',          1, 'COMPLETED',   'Nusrat Jahan',  80, 78,   '2026-08-01 09:00:00', '2026-08-02 17:00:00'),
('wop_002', 'wo_001', 'Stitching',        2, 'IN_PROGRESS', 'Farhana Akter', 78, NULL, '2026-08-03 09:00:00', NULL),
('wop_003', 'wo_001', 'Embroidery',       3, 'PENDING',     NULL,            NULL, NULL, NULL, NULL),
('wop_004', 'wo_001', 'Finishing and QC', 4, 'PENDING',     NULL,            NULL, NULL, NULL, NULL),

('wop_005', 'wo_002', 'Cutting',          1, 'COMPLETED', 'Nusrat Jahan',  30, 29, '2026-07-20 09:00:00', '2026-07-21 17:00:00'),
('wop_006', 'wo_002', 'Stitching',        2, 'COMPLETED', 'Farhana Akter', 29, 28, '2026-07-22 09:00:00', '2026-07-24 17:00:00'),
('wop_007', 'wo_002', 'Finishing and QC', 3, 'COMPLETED', 'Karim Hossain', 28, 20, '2026-07-25 09:00:00', '2026-07-26 17:00:00');

-- ============================================
-- FINISHED PRODUCTS
-- Only wo_002 is complete, so only one finished product exists so far
-- ============================================

INSERT INTO finished_products (id, work_order_id, barcode, quantity, storage_location, status, date_added) VALUES
('fp_001', 'wo_002', 'JC-0001', 20, 'Shelf A-3', 'IN_STOCK', '2026-07-26 18:00:00');

-- ============================================
-- CLIENTS
-- ============================================

INSERT INTO clients (id, name, phone, address, type) VALUES
('cl_001', 'Rahman Textiles', '01711111111', 'Islampur Road, Dhaka', 'WHOLESALE'),
('cl_002', 'Farhana Akter',   '01822222222', 'Mirpur, Dhaka',        'RETAIL');

-- ============================================
-- SALES + SALE ITEMS
-- One wholesale sale, partially paid (to show the "due" flow)
-- ============================================

INSERT INTO sales (id, invoice_number, client_id, subtotal, discount, total, amount_paid, payment_method, payment_status, created_by_id) VALUES
('sale_001', 'INV-2026-0001', 'cl_001', 5000, 0, 5000, 3000, 'BANK_TRANSFER', 'PARTIAL', 'usr_operator2');

INSERT INTO sale_items (id, sale_id, finished_product_id, quantity, unit_price, line_total) VALUES
('si_001', 'sale_001', 'fp_001', 10, 500, 5000);

-- ============================================
-- PAYMENTS
-- The partial payment recorded against the sale above
-- ============================================

INSERT INTO payments (id, client_id, sale_id, amount, method, recorded_by_id) VALUES
('pay_001', 'cl_001', 'sale_001', 3000, 'BANK_TRANSFER', 'usr_operator2');
