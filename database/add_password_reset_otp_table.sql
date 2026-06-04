-- App-owned password reset OTPs.
-- This avoids relying on Supabase Auth OTP templates for User Management
-- password resets. Run once in Supabase SQL Editor.

create table if not exists public.password_reset_otp (
  reset_id uuid primary key default gen_random_uuid(),
  email text not null,
  otp_hash text not null,
  expires_at timestamptz not null,
  failed_attempts integer not null default 0,
  used_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists idx_password_reset_otp_email_created
  on public.password_reset_otp (lower(email), created_at desc);

create index if not exists idx_password_reset_otp_expires
  on public.password_reset_otp (expires_at);

