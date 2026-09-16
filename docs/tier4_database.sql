-- ============================================================================
-- HOSTINGER UPLOAD — Tier 4 live-database update (one-time, plain SQL)
--
-- UPLOAD THIS FILE to Hostinger: phpMyAdmin -> select your database ->
-- Import -> choose tier4_database.sql -> Go.
-- Run it ONCE on the live/production database.
--
-- WHY NO "USE ..." LINE: phpMyAdmin runs the import inside the database you
-- selected — Hostinger also blocks USE statements on shared hosting. Pick the
-- correct database BEFORE importing (this file can never switch you to the
-- wrong DB on its own).
-- Nothing here is destructive: it only ADDS Tier 4 tables/columns/indexes,
-- never modifies or deletes existing data.
-- Re-runnable by design: every statement is guarded (CREATE TABLE IF NOT
-- EXISTS, plus information_schema checks for the column/index adds), so
-- importing it twice changes nothing the second time.
--
--   19. audit_logs             (audit trail — who changed what, when)
--   20. login_attempts         (failed-login counter + temporary lockout)
--   21. users.session_version  (bumped on password change -> old JWT
--                               sessions are forced to log out)
--   25. polling-path indexes   (work_orders.status, sales.created_at,
--                               clients.phone, fabric_batches.status)
--
-- Fresh installs don't need this file — docs/jamil-creations-schema.sql
-- already contains everything below.
-- ============================================================================

-- ── 19. Audit log: one row per noteworthy mutation (phase changes, user
-- edits, password changes, sales, payments, returns, destructive actions).
-- actor_id is NULL only for system actions; actor_name is a snapshot that
-- survives even if the user row is later deleted.
CREATE TABLE IF NOT EXISTS audit_logs (
  id          VARCHAR(36) NOT NULL PRIMARY KEY,
  actor_id    VARCHAR(36) NULL,
  actor_name  VARCHAR(255) NOT NULL,
  action      VARCHAR(50) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id   VARCHAR(36) NULL,
  details     TEXT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_entity (entity_type, entity_id),
  INDEX idx_audit_created_at (created_at),
  CONSTRAINT fk_audit_actor FOREIGN KEY (actor_id) REFERENCES users(id)
);

-- ── 20. Brute-force protection: one row per email that has failed at least
-- once. failed_attempts counts consecutive failures; locked_until holds the
-- temporary lockout window (NULL = not locked).
CREATE TABLE IF NOT EXISTS login_attempts (
  email           VARCHAR(255) NOT NULL PRIMARY KEY,
  failed_attempts INT NOT NULL DEFAULT 0,
  locked_until    DATETIME NULL,
  last_attempt_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ── 21. Session invalidation: bumped on every password change/reset.
-- auth.ts compares the JWT's baked-in value against this column on every
-- request; a mismatch signs the stale session out.
-- (MySQL's ALTER TABLE has no IF NOT EXISTS for columns, so we emulate it
--  with a guarded dynamic statement — re-importing is a safe no-op.)
SET @tier4_has_session_version := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'users'
    AND column_name = 'session_version'
);
SET @tier4_add_session_version := IF(
  @tier4_has_session_version = 0,
  'ALTER TABLE users ADD COLUMN session_version INT NOT NULL DEFAULT 0',
  'SELECT 1'
);
PREPARE tier4_add_session_version FROM @tier4_add_session_version;
EXECUTE tier4_add_session_version;
DEALLOCATE PREPARE tier4_add_session_version;

-- ── 25. Polling-path indexes: the phase board and dashboards poll these
-- columns constantly — index them before the tables grow.
-- (MySQL has no CREATE INDEX IF NOT EXISTS, so each index below is guarded
--  by an information_schema check — re-importing is a safe no-op.)
SET @tier4_has_idx_work_orders_status := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'work_orders'
    AND index_name = 'idx_work_orders_status'
);
SET @tier4_add_idx_work_orders_status := IF(
  @tier4_has_idx_work_orders_status = 0,
  'CREATE INDEX idx_work_orders_status ON work_orders (status)',
  'SELECT 1'
);
PREPARE tier4_add_idx_work_orders_status FROM @tier4_add_idx_work_orders_status;
EXECUTE tier4_add_idx_work_orders_status;
DEALLOCATE PREPARE tier4_add_idx_work_orders_status;

SET @tier4_has_idx_sales_created_at := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'sales'
    AND index_name = 'idx_sales_created_at'
);
SET @tier4_add_idx_sales_created_at := IF(
  @tier4_has_idx_sales_created_at = 0,
  'CREATE INDEX idx_sales_created_at ON sales (created_at)',
  'SELECT 1'
);
PREPARE tier4_add_idx_sales_created_at FROM @tier4_add_idx_sales_created_at;
EXECUTE tier4_add_idx_sales_created_at;
DEALLOCATE PREPARE tier4_add_idx_sales_created_at;

SET @tier4_has_idx_clients_phone := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'clients'
    AND index_name = 'idx_clients_phone'
);
SET @tier4_add_idx_clients_phone := IF(
  @tier4_has_idx_clients_phone = 0,
  'CREATE INDEX idx_clients_phone ON clients (phone)',
  'SELECT 1'
);
PREPARE tier4_add_idx_clients_phone FROM @tier4_add_idx_clients_phone;
EXECUTE tier4_add_idx_clients_phone;
DEALLOCATE PREPARE tier4_add_idx_clients_phone;

SET @tier4_has_idx_fabric_batches_status := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'fabric_batches'
    AND index_name = 'idx_fabric_batches_status'
);
SET @tier4_add_idx_fabric_batches_status := IF(
  @tier4_has_idx_fabric_batches_status = 0,
  'CREATE INDEX idx_fabric_batches_status ON fabric_batches (status)',
  'SELECT 1'
);
PREPARE tier4_add_idx_fabric_batches_status FROM @tier4_add_idx_fabric_batches_status;
EXECUTE tier4_add_idx_fabric_batches_status;
DEALLOCATE PREPARE tier4_add_idx_fabric_batches_status;

-- ── 29. Finished-product photo: optional garment photo taken at
-- finished-goods intake so the POS can show the garment and clients can be
-- shown what they're buying (fabric photos already exist on fabric_batches).
-- (MySQL's ALTER TABLE has no IF NOT EXISTS for columns, so we emulate it
--  with a guarded dynamic statement — re-importing is a safe no-op.)
SET @tier4_has_fp_image_url := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'finished_products'
    AND column_name = 'image_url'
);
SET @tier4_add_fp_image_url := IF(
  @tier4_has_fp_image_url = 0,
  'ALTER TABLE finished_products ADD COLUMN image_url VARCHAR(500) NULL',
  'SELECT 1'
);
PREPARE tier4_add_fp_image_url FROM @tier4_add_fp_image_url;
EXECUTE tier4_add_fp_image_url;
DEALLOCATE PREPARE tier4_add_fp_image_url;

