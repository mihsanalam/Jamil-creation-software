-- ============================================
-- Jamil Creations — Tier 1 update
-- Run this WHOLE file once in MySQL Workbench on the EXISTING
-- `jamilcreations` database. Fresh installs get everything from
-- jamil-creations-schema.sql and can skip this file.
-- ============================================
USE jamilcreations;

-- App-wide Owner-adjustable settings (key/value). The dashboard's bottleneck
-- alert threshold lives here, editable via the Owner → Dashboard → Settings
-- dialog.
CREATE TABLE IF NOT EXISTS app_settings (
  setting_key     VARCHAR(100) PRIMARY KEY,
  setting_value   TEXT NOT NULL,
  updated_by_id   VARCHAR(36) NOT NULL,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (updated_by_id) REFERENCES users(id)
);

-- Seed the default bottleneck threshold (8) using any existing user as the
-- "updated by" row. INSERT IGNORE keeps this idempotent — running the file
-- again never overwrites a threshold the Owner has already customised, and
-- it does nothing at all if the users table is empty.
INSERT IGNORE INTO app_settings (setting_key, setting_value, updated_by_id)
SELECT 'bottleneck_threshold', '8', id FROM users LIMIT 1;