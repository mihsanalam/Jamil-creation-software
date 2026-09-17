-- ============================================================================
-- HOSTINGER UPLOAD — Multi-shop branch update (one-time, plain SQL)
--
-- UPLOAD THIS FILE to Hostinger: phpMyAdmin -> select your database ->
-- Import -> choose branch-database.sql -> Go.
-- Run it ONCE on the live/production database.
--
-- WHY NO "USE ..." LINE: phpMyAdmin runs the import inside the database you
-- selected — Hostinger also blocks USE statements on shared hosting. Pick the
-- correct database BEFORE importing (this file can never switch you to the
-- wrong DB on its own).
-- Nothing here is destructive: it only ADDS a column and an index, never
-- modifies or deletes existing data. Every existing finished_products row
-- automatically lands in the default branch "Main Store", so nothing breaks
-- after the upgrade.
-- Re-runnable by design: MySQL has no ALTER TABLE ... IF NOT EXISTS for
-- columns and no CREATE INDEX IF NOT EXISTS, so both statements are guarded
-- by information_schema checks — importing twice changes nothing the second
-- time (same pattern as docs/tier4_database.sql).
--
--   30. finished_products.branch  (which shop/branch holds each stock lot)
--       + idx_finished_products_branch (branch filter on the stock listing)
--
-- Fresh installs don't need this file — docs/jamil-creations-schema.sql
-- already contains everything below.
-- ============================================================================

-- ── 30. Branch on finished products (#30 multi-shop readiness). Free text
-- with a sensible default, exactly like storage_location — single-branch
-- installs never touch it, and the data is already there when a second
-- branch opens.
SET @branch_has_branch := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'finished_products'
    AND column_name = 'branch'
);
SET @branch_add_branch := IF(
  @branch_has_branch = 0,
  'ALTER TABLE finished_products ADD COLUMN branch VARCHAR(100) NOT NULL DEFAULT ''Main Store'' AFTER storage_location',
  'SELECT 1'
);
PREPARE branch_add_branch FROM @branch_add_branch;
EXECUTE branch_add_branch;
DEALLOCATE PREPARE branch_add_branch;

-- Index for the branch filter on the stock listing (cheap now, and needed
-- the moment a second branch opens).
SET @branch_has_idx := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'finished_products'
    AND index_name = 'idx_finished_products_branch'
);
SET @branch_add_idx := IF(
  @branch_has_idx = 0,
  'CREATE INDEX idx_finished_products_branch ON finished_products (branch)',
  'SELECT 1'
);
PREPARE branch_add_idx FROM @branch_add_idx;
EXECUTE branch_add_idx;
DEALLOCATE PREPARE branch_add_idx;

-- ── Sanity check: every lot should now carry a branch (default "Main Store").
SELECT id, barcode, branch, storage_location, status
FROM finished_products
ORDER BY date_added DESC;
