-- ==============================================================================
-- MIGRATION: ADD UNIQUE CONSTRAINT ON USER EMAIL AND USERNAME
-- Ensures that duplicate email registrations are blocked at the database level.
-- Null/empty emails are allowed, but any provided email must be unique (case-insensitive).
-- ==============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_unique_username_lower
ON "user" (LOWER(TRIM(username)));

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_unique_email_lower
ON "user" (LOWER(TRIM(email)))
WHERE email IS NOT NULL AND TRIM(email) <> '';
