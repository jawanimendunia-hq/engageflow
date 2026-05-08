-- =============================================================
-- Migration 2026-05-08: Multi ad account per user
-- Jalankan di Supabase SQL Editor
-- =============================================================

-- Drop unique constraint user_id (sebelumnya satu user hanya boleh 1 credential)
alter table public.meta_credentials
  drop constraint if exists meta_credentials_user_id_key;

-- Tambah label untuk identifikasi (mis. "Akun Brand A")
alter table public.meta_credentials
  add column if not exists label text;

-- Pastikan unique per (user_id, ad_account_id) — tidak boleh dobel ad account sama
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'meta_credentials_user_acc_unique'
  ) then
    alter table public.meta_credentials
      add constraint meta_credentials_user_acc_unique unique (user_id, ad_account_id);
  end if;
end $$;

-- Index untuk lookup cepat per user
create index if not exists idx_meta_creds_user on public.meta_credentials(user_id);
