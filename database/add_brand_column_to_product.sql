-- Add missing brand column for product records
ALTER TABLE product
ADD COLUMN IF NOT EXISTS brand VARCHAR(100);

-- Backfill existing rows so brand is always usable in UI/forms
UPDATE product
SET brand = 'Meryl'
WHERE brand IS NULL OR btrim(brand) = '';

-- Keep future inserts consistent
ALTER TABLE product
ALTER COLUMN brand SET DEFAULT 'Meryl';
