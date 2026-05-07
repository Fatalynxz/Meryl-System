-- Add gender column to product table
ALTER TABLE product
ADD COLUMN IF NOT EXISTS gender VARCHAR(50);

-- Update existing records to have a default gender (optional)
UPDATE product SET gender = 'N/A' WHERE gender IS NULL;
