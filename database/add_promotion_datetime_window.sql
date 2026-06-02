-- Preserve promotion start/end time for exact campaign status and reporting windows.

ALTER TABLE public.promotion
  ALTER COLUMN start_date TYPE TIMESTAMPTZ
  USING start_date::timestamptz;

ALTER TABLE public.promotion
  ALTER COLUMN end_date TYPE TIMESTAMPTZ
  USING (
    CASE
      WHEN end_date::text ~ '^\d{4}-\d{2}-\d{2}$'
        THEN (end_date::date + time '23:59:59')::timestamptz
      ELSE end_date::timestamptz
    END
  );
