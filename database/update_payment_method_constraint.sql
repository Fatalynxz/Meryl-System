-- First, update any existing invalid payment methods to 'cash'
UPDATE payment
SET payment_method = 'cash'
WHERE payment_method NOT IN ('cash', 'card', 'gcash', 'check');

-- Then drop the old constraint and add the new one
ALTER TABLE payment
DROP CONSTRAINT IF EXISTS payment_payment_method_check;

ALTER TABLE payment
ADD CONSTRAINT payment_payment_method_check
CHECK (payment_method IN ('cash', 'card', 'gcash', 'check'));

