-- Update payment table to support gcash payment method
-- Drop the old constraint and add a new one that includes 'gcash'
ALTER TABLE payment
DROP CONSTRAINT IF EXISTS payment_payment_method_check;

ALTER TABLE payment
ADD CONSTRAINT payment_payment_method_check
CHECK (payment_method IN ('cash', 'card', 'gcash', 'check'));
