-- Seed: Expanded product catalog with consistent numeric EU size variants.
-- Safe to re-run: product insert skips existing (brand + product_name + size),
-- inventory upserts by product_id.

BEGIN;

INSERT INTO category (category_name)
VALUES
  ('Running Shoes'),
  ('Casual Shoes')
ON CONFLICT (category_name) DO NOTHING;

WITH catalog (brand, product_name, srp, eu_size) AS (
  VALUES
    ('Venus', 'Venus Comfort Step', 1250.00, 'EU 36-40'),
    ('Venus', 'Venus Trendy Walk', 1450.00, 'EU 36-40'),
    ('Venus', 'Venus Soft Slip', 1100.00, 'EU 35-39'),
    ('Venus', 'Venus Light Runner', 1600.00, 'EU 36-41'),
    ('Venus', 'Venus Elegant Flat', 1200.00, 'EU 35-39'),
    ('Venus', 'Venus Street Runner', 1700.00, 'EU 40-45'),
    ('Venus', 'Venus Active Flex', 1850.00, 'EU 40-44'),
    ('Venus', 'Venus Urban Walk', 1500.00, 'EU 39-44'),
    ('Venus', 'Venus Mesh Sport', 1900.00, 'EU 40-45'),
    ('Venus', 'Venus Daily Comfort', 1350.00, 'EU 39-44'),

    ('MStyle', 'MStyle Classic Run', 1200.00, 'EU 36-40'),
    ('MStyle', 'MStyle Soft Step', 1150.00, 'EU 35-39'),
    ('MStyle', 'MStyle Trend Fit', 1400.00, 'EU 36-40'),
    ('MStyle', 'MStyle Street Pro', 1600.00, 'EU 40-45'),
    ('MStyle', 'MStyle Active Run', 1750.00, 'EU 40-44'),
    ('MStyle', 'MStyle Urban Flex', 1500.00, 'EU 39-44'),
    ('MStyle', 'MStyle Mesh Sport', 1850.00, 'EU 40-45'),
    ('MStyle', 'MStyle Canvas Basic', 1200.00, 'EU 36-44'),
    ('MStyle', 'MStyle Runner Lite', 1650.00, 'EU 37-45'),
    ('MStyle', 'MStyle School Black', 1100.00, 'EU 35-44'),

    ('Flamingos', 'Flamingos Trend Walk', 1450.00, 'EU 36-40'),
    ('Flamingos', 'Flamingos Soft Glide', 1200.00, 'EU 35-39'),
    ('Flamingos', 'Flamingos Chic Step', 1350.00, 'EU 36-40'),
    ('Flamingos', 'Flamingos Street Run', 1700.00, 'EU 40-45'),
    ('Flamingos', 'Flamingos Sport Flex', 1850.00, 'EU 40-44'),
    ('Flamingos', 'Flamingos Mesh Active', 1900.00, 'EU 40-45'),
    ('Flamingos', 'Flamingos Canvas Low', 1200.00, 'EU 36-44'),
    ('Flamingos', 'Flamingos Runner Air', 1650.00, 'EU 37-45'),
    ('Flamingos', 'Flamingos Light Walk', 1500.00, 'EU 36-44'),
    ('Flamingos', 'Flamingos School Basic', 1100.00, 'EU 35-44'),

    ('Rocco', 'Rocco Elegant Step', 1300.00, 'EU 36-40'),
    ('Rocco', 'Rocco Soft Walk', 1150.00, 'EU 35-39'),
    ('Rocco', 'Rocco Trend Runner', 1450.00, 'EU 36-40'),
    ('Rocco', 'Rocco Street Runner', 1700.00, 'EU 40-45'),
    ('Rocco', 'Rocco Power Flex', 1900.00, 'EU 40-44'),
    ('Rocco', 'Rocco Sport Mesh', 1850.00, 'EU 40-45'),
    ('Rocco', 'Rocco Canvas Classic', 1200.00, 'EU 36-44'),
    ('Rocco', 'Rocco Flex Runner', 1650.00, 'EU 37-45'),
    ('Rocco', 'Rocco Ultra Walk', 1500.00, 'EU 36-44'),
    ('Rocco', 'Rocco School Black', 1100.00, 'EU 35-44'),

    ('C-Speed', 'C-Speed Lite Step', 1250.00, 'EU 36-40'),
    ('C-Speed', 'C-Speed Trend Walk', 1450.00, 'EU 36-40'),
    ('C-Speed', 'C-Speed Soft Run', 1100.00, 'EU 35-39'),
    ('C-Speed', 'C-Speed Runner Pro', 1800.00, 'EU 40-45'),
    ('C-Speed', 'C-Speed Active Flex', 1900.00, 'EU 40-44'),
    ('C-Speed', 'C-Speed Mesh Sport', 1850.00, 'EU 40-45'),
    ('C-Speed', 'C-Speed Canvas Lite', 1200.00, 'EU 36-44'),
    ('C-Speed', 'C-Speed Air Runner', 1650.00, 'EU 37-45'),
    ('C-Speed', 'C-Speed Flex Street', 1700.00, 'EU 38-45'),
    ('C-Speed', 'C-Speed School Black', 1100.00, 'EU 35-44'),

    ('Ultra Lite', 'Ultra Lite Soft Step', 1300.00, 'EU 36-40'),
    ('Ultra Lite', 'Ultra Lite Breeze Walk', 1450.00, 'EU 36-40'),
    ('Ultra Lite', 'Ultra Lite Comfort Run', 1100.00, 'EU 35-39'),
    ('Ultra Lite', 'Ultra Lite Air Run', 1800.00, 'EU 40-45'),
    ('Ultra Lite', 'Ultra Lite Flex Pro', 1900.00, 'EU 40-44'),
    ('Ultra Lite', 'Ultra Lite Sport Mesh', 1850.00, 'EU 40-45'),
    ('Ultra Lite', 'Ultra Lite Canvas', 1200.00, 'EU 36-44'),
    ('Ultra Lite', 'Ultra Lite Runner', 1650.00, 'EU 37-45'),
    ('Ultra Lite', 'Ultra Lite Ultra Walk', 1500.00, 'EU 36-44'),
    ('Ultra Lite', 'Ultra Lite School Black', 1100.00, 'EU 35-44'),

    ('LA Bucks', 'LA Bucks Comfort Step', 1250.00, 'EU 36-40'),
    ('LA Bucks', 'LA Bucks Trend Walk', 1400.00, 'EU 36-40'),
    ('LA Bucks', 'LA Bucks Street Runner', 1700.00, 'EU 40-45'),
    ('LA Bucks', 'LA Bucks Power Flex', 1850.00, 'EU 40-44'),
    ('LA Bucks', 'LA Bucks Urban Walk', 1500.00, 'EU 39-44'),
    ('LA Bucks', 'LA Bucks Sport Mesh', 1900.00, 'EU 40-45'),
    ('LA Bucks', 'LA Bucks Canvas Classic', 1200.00, 'EU 36-44'),
    ('LA Bucks', 'LA Bucks Runner Lite', 1650.00, 'EU 37-45'),
    ('LA Bucks', 'LA Bucks Flex Street', 1700.00, 'EU 38-45'),
    ('LA Bucks', 'LA Bucks School Black', 1100.00, 'EU 35-44'),

    ('Shoelyns', 'Shoelyns Elegant Step', 1300.00, 'EU 36-40'),
    ('Shoelyns', 'Shoelyns Soft Walk', 1150.00, 'EU 35-39'),
    ('Shoelyns', 'Shoelyns Trend Runner', 1450.00, 'EU 36-40'),
    ('Shoelyns', 'Shoelyns Street Runner', 1700.00, 'EU 40-45'),
    ('Shoelyns', 'Shoelyns Active Flex', 1850.00, 'EU 40-44'),
    ('Shoelyns', 'Shoelyns Mesh Sport', 1900.00, 'EU 40-45'),
    ('Shoelyns', 'Shoelyns Canvas', 1200.00, 'EU 36-44'),
    ('Shoelyns', 'Shoelyns Runner Lite', 1650.00, 'EU 37-45'),
    ('Shoelyns', 'Shoelyns Ultra Walk', 1500.00, 'EU 36-44'),
    ('Shoelyns', 'Shoelyns School Black', 1100.00, 'EU 35-44'),

    ('Shoefit', 'Shoefit Comfort Step', 1250.00, 'EU 36-40'),
    ('Shoefit', 'Shoefit Trend Walk', 1400.00, 'EU 36-40'),
    ('Shoefit', 'Shoefit Soft Slip', 1100.00, 'EU 35-39'),
    ('Shoefit', 'Shoefit Street Runner', 1700.00, 'EU 40-45'),
    ('Shoefit', 'Shoefit Active Flex', 1850.00, 'EU 40-44'),
    ('Shoefit', 'Shoefit Sport Mesh', 1900.00, 'EU 40-45'),
    ('Shoefit', 'Shoefit Canvas Basic', 1200.00, 'EU 36-44'),
    ('Shoefit', 'Shoefit Runner Lite', 1650.00, 'EU 37-45'),
    ('Shoefit', 'Shoefit Flex Street', 1700.00, 'EU 38-45'),
    ('Shoefit', 'Shoefit School Black', 1100.00, 'EU 35-44'),

    ('Alex', 'Alex Comfort Step', 1250.00, 'EU 36-40'),
    ('Alex', 'Alex Trend Walk', 1450.00, 'EU 36-40'),
    ('Alex', 'Alex Street Runner', 1700.00, 'EU 40-45'),
    ('Alex', 'Alex Active Flex', 1850.00, 'EU 40-44'),
    ('Alex', 'Alex Urban Walk', 1500.00, 'EU 39-44'),
    ('Alex', 'Alex Mesh Sport', 1900.00, 'EU 40-45'),
    ('Alex', 'Alex Canvas Classic', 1200.00, 'EU 36-44'),
    ('Alex', 'Alex Runner Lite', 1650.00, 'EU 37-45'),
    ('Alex', 'Alex Flex Street', 1700.00, 'EU 38-45'),
    ('Alex', 'Alex School Black', 1100.00, 'EU 35-44'),

    ('Nike', 'Nike Air Force 1', 5500.00, 'EU 36-45'),
    ('Nike', 'Nike Air Max', 6200.00, 'EU 36-45'),
    ('Nike', 'Nike Revolution 6', 3200.00, 'EU 36-45'),
    ('Nike', 'Nike Downshifter 12', 3000.00, 'EU 36-45'),
    ('Nike', 'Nike Court Vision', 4500.00, 'EU 36-45'),
    ('Nike', 'Nike Zoom Fly', 6800.00, 'EU 36-45'),
    ('Nike', 'Nike Flex Experience', 3100.00, 'EU 36-45'),
    ('Nike', 'Nike Star Runner', 3400.00, 'EU 36-45'),
    ('Nike', 'Nike Tanjun', 3000.00, 'EU 36-45'),
    ('Nike', 'Nike WearAllDay', 3200.00, 'EU 36-45'),

    ('Adidas', 'Adidas Ultraboost', 6500.00, 'EU 36-45'),
    ('Adidas', 'Adidas Duramo SL', 3200.00, 'EU 36-45'),
    ('Adidas', 'Adidas Runfalcon', 3000.00, 'EU 36-45'),
    ('Adidas', 'Adidas Grand Court', 2800.00, 'EU 36-45'),
    ('Adidas', 'Adidas Advantage', 2600.00, 'EU 36-45'),
    ('Adidas', 'Adidas Galaxy 6', 2900.00, 'EU 36-45'),
    ('Adidas', 'Adidas Lite Racer', 3100.00, 'EU 36-45'),
    ('Adidas', 'Adidas Hoops 3.0', 3200.00, 'EU 36-45'),
    ('Adidas', 'Adidas Courtpoint', 2700.00, 'EU 36-45'),
    ('Adidas', 'Adidas Racer TR21', 3300.00, 'EU 36-45')
),
prepared AS (
  SELECT
    c.brand,
    c.product_name,
    c.srp,
    c.eu_size,
    CASE
      WHEN LOWER(c.product_name) ~ '(run|runner|sport|flex|mesh|air|zoom|revolution|downshifter|star)'
        THEN 'Running Shoes'
      ELSE 'Casual Shoes'
    END AS category_name,
    ROUND((c.srp * 0.65)::numeric, 2) AS cost_price
  FROM catalog c
),
expanded_sizes AS (
  SELECT
    p.brand,
    p.product_name,
    p.srp,
    p.category_name,
    p.cost_price,
    gs.size_num::text AS eu_size
  FROM prepared p
  CROSS JOIN LATERAL (
    SELECT
      COALESCE((regexp_match(p.eu_size, 'EU\s+(\d+)-(\d+)'))[1]::int, 36) AS size_from,
      COALESCE((regexp_match(p.eu_size, 'EU\s+(\d+)-(\d+)'))[2]::int, 40) AS size_to
  ) bounds
  CROSS JOIN LATERAL generate_series(bounds.size_from, bounds.size_to) AS gs(size_num)
),
inserted_products AS (
  INSERT INTO product (
    product_name,
    brand,
    category_id,
    size,
    color,
    cost_price,
    reorder_level,
    status
  )
  SELECT
    p.product_name,
    p.brand,
    cat.category_id,
    p.eu_size,
    'Default',
    p.cost_price,
    5,
    'active'
  FROM expanded_sizes p
  JOIN category cat ON cat.category_name = p.category_name
  WHERE NOT EXISTS (
    SELECT 1
    FROM product existing
    WHERE LOWER(existing.brand) = LOWER(p.brand)
      AND LOWER(existing.product_name) = LOWER(p.product_name)
      AND COALESCE(existing.size, '') = p.eu_size
  )
  RETURNING product_id
),
all_target_products AS (
  SELECT
    pr.product_id,
    src.srp
  FROM expanded_sizes src
  JOIN product pr
    ON LOWER(pr.brand) = LOWER(src.brand)
   AND LOWER(pr.product_name) = LOWER(src.product_name)
   AND COALESCE(pr.size, '') = src.eu_size
)
INSERT INTO inventory (
  product_id,
  stock_quantity,
  reorder_level,
  srp,
  inventory_status,
  last_updated
)
SELECT
  t.product_id,
  20,
  5,
  t.srp,
  'active',
  NOW()
FROM all_target_products t
ON CONFLICT (product_id)
DO UPDATE
SET
  srp = EXCLUDED.srp,
  reorder_level = EXCLUDED.reorder_level,
  inventory_status = EXCLUDED.inventory_status,
  last_updated = NOW();

COMMIT;
