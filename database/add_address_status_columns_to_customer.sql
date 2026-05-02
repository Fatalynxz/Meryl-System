-- Add missing address and status columns for customer records
ALTER TABLE customer
ADD COLUMN IF NOT EXISTS address VARCHAR(255);

ALTER TABLE customer
ADD COLUMN IF NOT EXISTS status VARCHAR(20);

-- Backfill existing rows with a safe default status
UPDATE customer
SET status = 'active'
WHERE status IS NULL OR btrim(status) = '';

-- Enforce valid status values and set a default for new rows
ALTER TABLE customer
DROP CONSTRAINT IF EXISTS customer_status_check;

ALTER TABLE customer
ADD CONSTRAINT customer_status_check
CHECK (status IN ('active', 'inactive'));

ALTER TABLE customer
ALTER COLUMN status SET DEFAULT 'active';
