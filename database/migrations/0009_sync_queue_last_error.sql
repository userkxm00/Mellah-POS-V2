-- Migration 0009: Add last_error column to sync_queue for proper retry tracking
-- Fixes: syncEngine was updating non-existent retry_count/last_error causing silent SQL errors

ALTER TABLE sync_queue ADD COLUMN last_error TEXT;
