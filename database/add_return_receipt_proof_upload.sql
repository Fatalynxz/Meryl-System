-- Add receipt proof upload support for item replacements.
-- Run once in Supabase SQL Editor before requiring receipt photos in Return Management.

begin;

alter table public.returns
  add column if not exists receipt_proof_name text,
  add column if not exists receipt_proof_path text,
  add column if not exists receipt_proof_url text,
  add column if not exists receipt_verified_at timestamp with time zone;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'return-receipts',
  'return-receipts',
  true,
  6291456,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "return_receipts_select" on storage.objects;
drop policy if exists "return_receipts_insert" on storage.objects;
drop policy if exists "return_receipts_update" on storage.objects;

create policy "return_receipts_select"
on storage.objects
for select
using (bucket_id = 'return-receipts');

create policy "return_receipts_insert"
on storage.objects
for insert
with check (bucket_id = 'return-receipts');

create policy "return_receipts_update"
on storage.objects
for update
using (bucket_id = 'return-receipts')
with check (bucket_id = 'return-receipts');

commit;
