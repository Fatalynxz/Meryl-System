-- Add image_url column to product table for visual thumbnail displays
ALTER TABLE product ADD COLUMN IF NOT EXISTS image_url TEXT;
