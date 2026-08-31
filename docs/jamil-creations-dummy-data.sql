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
-- fb_001:  cotton for an embroidered kurti run — in production
-- fb_002:  georgette just recorded, no work order yet
-- fb_003:  plain white cotton — fully completed into JC-0001
-- fb_004:  Rajshahi silk completed into JC-0002 (silk panjabi)
-- fb_005:  Tangail jamdani — in production (jamdani saree)
-- fb_006:  georgette — in production (three-piece / salwar kameez)
-- fb_007:  checked cotton completed into JC-0003 (fatua)
-- fb_008:  muslin cotton — in production (printed kurti)
-- fb_009:  cotton completed into JC-0004 (lungi)
-- fb_010:  Dinajpur silk completed into JC-0005 (embroidered panjabi)
-- fb_011:  polycotton completed — waiting to be stocked (Eid panjabi)
-- ============================================

INSERT INTO fabric_batches (id, batch_number, fabric_type, quantity, unit, supplier, description, process_notes, status, recorded_by_id) VALUES
('fb_001', 'FB-2026-0001', 'Cotton',    80, 'meters', 'Dhaka Textile Mills',       'Off-white cotton, medium weight', 'For embroidered kurti order',          'IN_PRODUCTION', 'usr_collector1'),
('fb_002', 'FB-2026-0002', 'Georgette', 50, 'meters', 'Narayanganj Fabrics',       'Light pink georgette',            NULL,                                   'PENDING',       'usr_collector1'),
('fb_003', 'FB-2026-0003', 'Cotton',    30, 'meters', 'Dhaka Textile Mills',       'Plain white cotton',              'Simple plain garment run',             'READY',         'usr_collector1'),
('fb_004', 'FB-2026-0004', 'Silk',      45, 'meters', 'Rajshahi Silk House',       'Ivory silk, 100% pure',           'For silk panjabi order',               'READY',         'usr_collector1'),
('fb_005', 'FB-2026-0005', 'Jamdani',   60, 'meters', 'Tangail Handloom Weavers',  'Dhakai jamdani, handloom',        'For jamdani saree order',              'IN_PRODUCTION', 'usr_collector1'),
('fb_006', 'FB-2026-0006', 'Georgette', 75, 'meters', 'Narayanganj Fabrics',       'Maroon georgette',                'For three-piece (salwar kameez) order', 'IN_PRODUCTION', 'usr_collector1'),
('fb_007', 'FB-2026-0007', 'Cotton',    40, 'meters', 'Boro Bazar Wholesale',      'Checked cotton, traditional',     'For cotton fatua order',               'READY',         'usr_collector1'),
('fb_008', 'FB-2026-0008', 'Cotton',    60, 'meters', 'Mirpur Textiles',           'Fine muslin cotton for kurtis',   'For printed kurti order',              'IN_PRODUCTION', 'usr_collector1'),
('fb_009', 'FB-2026-0009', 'Cotton',    40, 'meters', 'Dhanmondi Fabrics',         'White cotton for lungi',          'For cotton lungi order',               'READY',         'usr_collector1'),
('fb_010', 'FB-2026-0010', 'Silk',      35, 'meters', 'Dinajpur Silk Mills',       'Green silk, floral pattern',      'For embroidered silk panjabi order',   'READY',         'usr_collector1'),
('fb_011', 'FB-2026-0011', 'Polycotton', 50, 'meters', 'Boro Bazar Wholesale',     'Chocolate brown polycotton',      'For eid polycotton panjabi order',     'READY',         'usr_collector1');

-- ============================================
-- WORK ORDERS
-- wo_001: embroidered kurti — in production (matches fb_001)
-- wo_002: white cotton panjabi — completed into JC-0001 (matches fb_003)
-- wo_003: jamdani saree — in production (matches fb_005)
-- wo_004: three-piece / salwar kameez — in production (matches fb_006)
-- wo_005: printed kurti — in production (matches fb_008)
-- wo_006: ivory silk panjabi — completed into JC-0002 (matches fb_004)
-- wo_007: checked cotton fatua — completed into JC-0003 (matches fb_007)
-- wo_008: white cotton lungi — completed into JC-0004 (matches fb_009)
-- wo_009: embroidered silk panjabi — completed into JC-0005 (matches fb_010)
-- wo_010: eid polycotton panjabi — completed, not stacked yet (matches fb_011)
-- ============================================

INSERT INTO work_orders (id, fabric_batch_id, phase_template_id, product_type, quantity, status, created_by_id) VALUES
('wo_001', 'fb_001', 'pt_embroidered', 'Embroidered Kurti',           40, 'IN_PROGRESS', 'usr_operator1'),
('wo_002', 'fb_003', 'pt_plain',       'Cotton Panjabi',              20, 'COMPLETED',   'usr_operator2'),
('wo_003', 'fb_005', 'pt_embroidered', 'Jamdani Saree',               15, 'IN_PROGRESS', 'usr_operator1'),
('wo_004', 'fb_006', 'pt_printed',     'Three-piece (Salwar Kameez)', 25, 'IN_PROGRESS', 'usr_operator2'),
('wo_005', 'fb_008', 'pt_printed',     'Printed Kurti',               30, 'IN_PROGRESS', 'usr_operator1'),
('wo_006', 'fb_004', 'pt_plain',       'Silk Panjabi',                15, 'COMPLETED',   'usr_operator2'),
('wo_007', 'fb_007', 'pt_plain',       'Cotton Fatua',                20, 'COMPLETED',   'usr_operator1'),
('wo_008', 'fb_009', 'pt_plain',       'Cotton Lungi',                20, 'COMPLETED',   'usr_operator2'),
('wo_009', 'fb_010', 'pt_embroidered', 'Embroidered Silk Panjabi',    10, 'COMPLETED',   'usr_operator2'),
('wo_010', 'fb_011', 'pt_plain',       'Polycotton Panjabi (Eid)',    24, 'COMPLETED',   'usr_operator1');

-- ============================================
-- WORK ORDER PHASES
-- wo_001: Cutting done, Stitching in progress, rest pending
-- wo_002: all phases completed
-- wo_003: cutting + stitching done, embroidery in progress
-- wo_004: cutting/stitching/printing done, Finishing and QC in progress
-- wo_005: cutting just started, everything else pending
-- wo_006/wo_007/wo_008/wo_009/wo_010: all phases completed
-- ============================================

INSERT INTO work_order_phases (id, work_order_id, name, step_order, status, worker_name, qty_in, qty_out, started_at, completed_at) VALUES
('wop_001', 'wo_001', 'Cutting',          1, 'COMPLETED',   'Nusrat Jahan',  80, 78,   '2026-08-01 09:00:00', '2026-08-02 17:00:00'),
('wop_002', 'wo_001', 'Stitching',        2, 'IN_PROGRESS', 'Farhana Akter', 78, NULL, '2026-08-03 09:00:00', NULL),
('wop_003', 'wo_001', 'Embroidery',       3, 'PENDING',     NULL,            NULL, NULL, NULL, NULL),
('wop_004', 'wo_001', 'Finishing and QC', 4, 'PENDING',     NULL,            NULL, NULL, NULL, NULL),

('wop_005', 'wo_002', 'Cutting',          1, 'COMPLETED', 'Nusrat Jahan',  30, 29, '2026-07-20 09:00:00', '2026-07-21 17:00:00'),
('wop_006', 'wo_002', 'Stitching',        2, 'COMPLETED', 'Farhana Akter', 29, 28, '2026-07-22 09:00:00', '2026-07-24 17:00:00'),
('wop_007', 'wo_002', 'Finishing and QC', 3, 'COMPLETED', 'Karim Hossain', 28, 20, '2026-07-25 09:00:00', '2026-07-26 17:00:00'),

('wop_008', 'wo_003', 'Cutting',          1, 'COMPLETED',   'Nusrat Jahan',  60, 58,  '2026-08-05 09:00:00', '2026-08-06 17:00:00'),
('wop_009', 'wo_003', 'Stitching',        2, 'COMPLETED',   'Farhana Akter', 58, 55,  '2026-08-07 09:00:00', '2026-08-09 17:00:00'),
('wop_010', 'wo_003', 'Embroidery',       3, 'IN_PROGRESS', 'Rukhsana Begum',55, NULL,'2026-08-10 09:00:00', NULL),
('wop_011', 'wo_003', 'Finishing and QC', 4, 'PENDING',     NULL,            NULL, NULL, NULL, NULL),

('wop_012', 'wo_004', 'Cutting',          1, 'COMPLETED',   'Karim Hossain', 75, 73,  '2026-08-06 09:00:00', '2026-08-07 17:00:00'),
('wop_013', 'wo_004', 'Stitching',        2, 'COMPLETED',   'Farhana Akter', 73, 70,  '2026-08-08 09:00:00', '2026-08-10 17:00:00'),
('wop_014', 'wo_004', 'Printing',         3, 'COMPLETED',   'Sajal Das',     70, 68,  '2026-08-11 09:00:00', '2026-08-12 17:00:00'),
('wop_015', 'wo_004', 'Finishing and QC', 4, 'IN_PROGRESS', 'Rashida Begum', 68, NULL, '2026-08-13 09:00:00', NULL),

('wop_016', 'wo_005', 'Cutting',          1, 'IN_PROGRESS', 'Nusrat Jahan',  60, NULL, '2026-08-12 09:00:00', NULL),
('wop_017', 'wo_005', 'Stitching',        2, 'PENDING',     NULL,            NULL, NULL, NULL, NULL),
('wop_018', 'wo_005', 'Printing',         3, 'PENDING',     NULL,            NULL, NULL, NULL, NULL),
('wop_019', 'wo_005', 'Finishing and QC', 4, 'PENDING',     NULL,            NULL, NULL, NULL, NULL),

('wop_020', 'wo_006', 'Cutting',          1, 'COMPLETED', 'Karim Hossain', 40, 39, '2026-07-28 09:00:00', '2026-07-29 17:00:00'),
('wop_021', 'wo_006', 'Stitching',        2, 'COMPLETED', 'Farhana Akter', 39, 38, '2026-07-30 09:00:00', '2026-08-01 17:00:00'),
('wop_022', 'wo_006', 'Finishing and QC', 3, 'COMPLETED', 'Rashida Begum', 38, 15, '2026-08-02 09:00:00', '2026-08-03 17:00:00'),

('wop_023', 'wo_007', 'Cutting',          1, 'COMPLETED', 'Nusrat Jahan',  40, 38, '2026-08-05 09:00:00', '2026-08-06 17:00:00'),
('wop_024', 'wo_007', 'Stitching',        2, 'COMPLETED', 'Farhana Akter', 38, 35, '2026-08-07 09:00:00', '2026-08-08 17:00:00'),
('wop_025', 'wo_007', 'Finishing and QC', 3, 'COMPLETED', 'Karim Hossain', 35, 20, '2026-08-09 09:00:00', '2026-08-09 17:00:00'),

('wop_026', 'wo_008', 'Cutting',          1, 'COMPLETED', 'Nusrat Jahan',  40, 39, '2026-08-09 09:00:00', '2026-08-10 17:00:00'),
('wop_027', 'wo_008', 'Stitching',        2, 'COMPLETED', 'Farhana Akter', 39, 37, '2026-08-11 09:00:00', '2026-08-12 17:00:00'),
('wop_028', 'wo_008', 'Finishing and QC', 3, 'COMPLETED', 'Karim Hossain', 37, 20, '2026-08-13 09:00:00', '2026-08-13 17:00:00'),

('wop_029', 'wo_009', 'Cutting',          1, 'COMPLETED', 'Nusrat Jahan',  35, 34, '2026-07-29 09:00:00', '2026-07-30 17:00:00'),
('wop_030', 'wo_009', 'Stitching',        2, 'COMPLETED', 'Farhana Akter', 34, 32, '2026-07-31 09:00:00', '2026-08-02 17:00:00'),
('wop_031', 'wo_009', 'Embroidery',       3, 'COMPLETED', 'Rukhsana Begum',32, 31, '2026-08-03 09:00:00', '2026-08-04 17:00:00'),
('wop_032', 'wo_009', 'Finishing and QC', 4, 'COMPLETED', 'Karim Hossain', 31, 10, '2026-08-05 09:00:00', '2026-08-05 17:00:00'),

('wop_033', 'wo_010', 'Cutting',          1, 'COMPLETED', 'Karim Hossain', 50, 48, '2026-08-15 09:00:00', '2026-08-16 17:00:00'),
('wop_034', 'wo_010', 'Stitching',        2, 'COMPLETED', 'Farhana Akter', 48, 46, '2026-08-17 09:00:00', '2026-08-19 17:00:00'),
('wop_035', 'wo_010', 'Finishing and QC', 3, 'COMPLETED', 'Rashida Begum', 46, 24, '2026-08-20 09:00:00', '2026-08-21 17:00:00');

-- ============================================
-- FINISHED PRODUCTS (warehouse)
-- JC-0001: white cotton panjabi — 20 made, 10 sold, 10 left (IN_STOCK)
-- JC-0002: ivory silk panjabi — 15 pcs, full lot in stock
-- JC-0003: checked cotton fatua — 20 pcs, full lot in stock
-- JC-0004: white cotton lungi — 20 pcs, full lot in stock
-- JC-0005: embroidered silk panjabi — 10 made, 4 sold across two sales,
--          6 left (IN_STOCK — a lot can live through several partial sells)
-- wo_010 (polycotton panjabi) is COMPLETED but deliberately has NO finished
-- product row yet, so it appears in the "ready to stock" intake screen.
-- ============================================

INSERT INTO finished_products (id, work_order_id, barcode, quantity, quantity_remaining, storage_location, status, date_added) VALUES
('fp_001', 'wo_002', 'JC-0001', 20, 10, 'Shelf A-3', 'IN_STOCK', '2026-07-26 18:00:00'),
('fp_002', 'wo_006', 'JC-0002', 15, 15, 'Shelf B-1', 'IN_STOCK', '2026-08-04 10:00:00'),
('fp_003', 'wo_007', 'JC-0003', 20, 20, 'Shelf B-2', 'IN_STOCK', '2026-08-10 11:00:00'),
('fp_004', 'wo_008', 'JC-0004', 20, 20, 'Shelf A-1', 'IN_STOCK', '2026-08-14 12:00:00'),
('fp_005', 'wo_009', 'JC-0005', 10, 6,  'Shelf B-3', 'IN_STOCK', '2026-08-06 09:00:00');

-- ============================================
-- CLIENTS
-- ============================================

INSERT INTO clients (id, name, phone, address, type) VALUES
('cl_001', 'Rahman Textiles', '01711111111', 'Islampur Road, Dhaka', 'WHOLESALE'),
('cl_002', 'Farhana Akter',   '01822222222', 'Mirpur, Dhaka',        'RETAIL');

-- ============================================
-- SALES + SALE ITEMS
-- sale_001: wholesale, partially paid (shows the "due" flow) — 10 pcs of
--           JC-0001, leaving 10 on the shelf
-- sale_002/003: two more sale_items pulling from JC-0005 — the same lot
--           being sold twice (partial sales), so quantity_remaining = 6
-- ============================================

INSERT INTO sales (id, invoice_number, client_id, subtotal, discount, total, amount_paid, payment_method, payment_status, created_by_id) VALUES
('sale_001', 'INV-2026-0001', 'cl_001', 5000, 0, 5000, 3000, 'BANK_TRANSFER', 'PARTIAL', 'usr_operator2'),
('sale_002', 'INV-2026-0002', 'cl_002', 2400, 0, 2400, 2400, 'CASH',          'PAID',    'usr_operator2'),
('sale_003', 'INV-2026-0003', 'cl_001', 2000, 0, 2000, 2000, 'CASH',          'PAID',    'usr_operator2');

INSERT INTO sale_items (id, sale_id, finished_product_id, quantity, unit_price, line_total) VALUES
('si_001', 'sale_001', 'fp_001', 10, 500,  5000),
('si_002', 'sale_002', 'fp_005', 2,  1200, 2400),
('si_003', 'sale_003', 'fp_005', 2,  1000, 2000);

-- ============================================
-- PAYMENTS
-- One payment row per amount actually received at buy time (matching the
-- sales above: 3000 partial on INV-0001, full payments on INV-0002/0003),
-- so the Due Collection payment history shows these initial payments too.
-- ============================================

INSERT INTO payments (id, client_id, sale_id, amount, method, recorded_by_id) VALUES
('pay_001', 'cl_001', 'sale_001', 3000, 'BANK_TRANSFER', 'usr_operator2'),
('pay_002', 'cl_002', 'sale_002', 2400, 'CASH',          'usr_operator2'),
('pay_003', 'cl_001', 'sale_003', 2000, 'CASH',          'usr_operator2');
