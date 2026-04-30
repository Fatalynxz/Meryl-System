-- Meryl Shoes Enterprise System
-- Seed data aligned with meryl_system_schema.sql

begin;

TRUNCATE TABLE
    notification,
    prediction_history,
    payment,
    sales_summary,
    inventory_log,
    inventory,
    return_details,
    returns,
    prediction,
    sales_analytics,
    sales_details,
    sales_transaction,
    promo_product,
    promotion,
    product,
    customers,
    users,
    role,
    category
RESTART IDENTITY CASCADE;

INSERT INTO role (role_name)
VALUES
    ('Administrator'),
    ('Sales Staff'),
    ('Inventory Staff');

INSERT INTO category (category_name)
VALUES
    ('Running Shoes'),
    ('Basketball Shoes'),
    ('Casual Shoes'),
    ('Sandals'),
    ('Kid'),
    ('Men'),
    ('Women');

INSERT INTO users (name, username, password, role_id, status)
VALUES
    ('System Administrator', 'admin', 'admin123', 1, 'Active'),
    ('Sales Staff Account', 'sales', 'sales123', 2, 'Active'),
    ('Inventory Staff Account', 'inventory', 'inv123', 3, 'Active');

INSERT INTO customers (name, email, contact_number, date_registered)
VALUES
    ('Maria Santos', 'maria@gmail.com', '09123456789', '2026-04-01'),
    ('Carl Dela Cruz', 'carl@gmail.com', '09123456780', '2026-04-02'),
    ('Shierwen Sombilon', 'shierwen@gmail.com', '09123456781', '2026-04-03');

INSERT INTO product (product_name, category_id, brand, size, color, cost_price, reorder_level, status)
VALUES
    ('Air Max 90', 1, 'Nike', '8', 'Black', 2500.00, 5, 'Available'),
    ('Air Max 90', 1, 'Nike', '9', 'Black', 2500.00, 5, 'Available'),
    ('Air Max 90', 1, 'Nike', '10', 'White', 2500.00, 5, 'Available'),
    ('Chuck Taylor', 3, 'Converse', '8', 'Cream', 1800.00, 6, 'Available'),
    ('Court Vision', 2, 'Nike', '9', 'Red', 2200.00, 4, 'Available'),
    ('Easy Slide', 4, 'Meryl', '7', 'Beige', 900.00, 8, 'Available');

INSERT INTO inventory (product_id, stock_quantity, reorder_level, reference_id, last_updated)
VALUES
    (1, 12, 5, null, now()),
    (2, 10, 5, null, now()),
    (3, 8, 5, null, now()),
    (4, 14, 6, null, now()),
    (5, 6, 4, null, now()),
    (6, 20, 8, null, now());

INSERT INTO promotion (promo_name, discount_type, discount_value, start_date, end_date, status)
VALUES
    ('Back to School Sale', 'Percentage', 15.00, current_date - interval '5 days', current_date + interval '10 days', 'Active'),
    ('Weekend Casual Deal', 'Fixed Amount', 200.00, current_date - interval '2 days', current_date + interval '5 days', 'Active');

INSERT INTO promo_product (promo_id, product_id)
VALUES
    (1, 1), (1, 2), (1, 3),
    (2, 4);

INSERT INTO sales_transaction (customer_id, transaction_date, total_amount, payment_method, user_id)
VALUES
    (1, now() - interval '10 days', 5000.00, 'Cash', 2),
    (2, now() - interval '6 days', 3600.00, 'GCash', 2),
    (3, now() - interval '2 days', 2200.00, 'Cash', 2);

INSERT INTO payment (sales_id, payment_method, amount_paid, change_amount, payment_status)
VALUES
    (1, 'Cash', 5000.00, 0.00, 'Paid'),
    (2, 'GCash', 3600.00, 0.00, 'Paid'),
    (3, 'Cash', 2500.00, 300.00, 'Paid');

INSERT INTO sales_details (sales_id, product_id, quantity, price, discount_applied, subtotal)
VALUES
    (1, 1, 1, 2500.00, 0.00, 2500.00),
    (1, 2, 1, 2500.00, 0.00, 2500.00),
    (2, 4, 2, 1800.00, 0.00, 3600.00),
    (3, 5, 1, 2200.00, 0.00, 2200.00);

INSERT INTO inventory_log (product_id, quantity_change, transaction_type, reference_id, date_updated)
VALUES
    (1, -1, 'Sale', 1, now() - interval '10 days'),
    (2, -1, 'Sale', 1, now() - interval '10 days'),
    (4, -2, 'Sale', 2, now() - interval '6 days'),
    (5, -1, 'Sale', 3, now() - interval '2 days'),
    (6, 5, 'Restock', 9001, now() - interval '1 day');

INSERT INTO sales_analytics (product_id, total_sales, total_quantity_sold, average_sales, ranking, trend_type, time_period)
VALUES
    (4, 3600.00, 2, 1800.00, 1, 'Rising', 'Monthly'),
    (1, 2500.00, 1, 2500.00, 2, 'Steady', 'Monthly'),
    (2, 2500.00, 1, 2500.00, 3, 'Steady', 'Monthly'),
    (5, 2200.00, 1, 2200.00, 4, 'Steady', 'Weekly');

INSERT INTO sales_summary (total_revenue, total_transaction, total_item_sold, summary_date)
VALUES
    (10800.00, 3, 5, current_date);

INSERT INTO prediction (product_id, predicted_demand, prediction_period, prediction_date)
VALUES
    (1, 6, 'Monthly', current_date),
    (4, 8, 'Monthly', current_date),
    (5, 4, 'Weekly', current_date);

INSERT INTO prediction_history (prediction_id, actual_sales, prediction_accuracy)
VALUES
    (1, 5.00, 83.33),
    (2, 7.00, 87.50),
    (3, 3.00, 75.00);

INSERT INTO notification (customer_id, promo_id, email, email_status, date_sent)
VALUES
    (1, 1, 'maria@gmail.com', 'Sent', now() - interval '2 days'),
    (2, 1, 'carl@gmail.com', 'Pending', null),
    (3, 2, 'shierwen@gmail.com', 'Sent', now() - interval '1 day');

INSERT INTO returns (sales_id, user_id, return_date, total_refund)
VALUES
    (2, 2, now() - interval '1 day', 1800.00);

INSERT INTO return_details (return_id, product_id, quantity_returned, reason, refund_amount)
VALUES
    (1, 4, 1, 'Damaged item', 1800.00);

commit;
