-- =============================================================
-- Migration 2026-05-06: Tambah kolom 'warna' di accounts
-- Jalankan sekali di Supabase SQL Editor (idempotent, aman dijalankan ulang)
-- =============================================================

alter table public.accounts add column if not exists warna text;

-- (opsional, kalau ingin batasi nilai warna — bisa dihapus kalau tidak perlu)
-- do $$ begin
--   if not exists (
--     select 1 from pg_constraint where conname = 'accounts_warna_check'
--   ) then
--     alter table public.accounts add constraint accounts_warna_check
--       check (warna in ('red','blue','green','yellow','purple','orange','pink','turquoise'));
--   end if;
-- end $$;
