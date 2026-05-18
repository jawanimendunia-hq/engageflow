-- =============================================================
-- Migration 2026-05-14: Multi AI providers (Gemini + Cerebras + Groq)
-- Allow user setup beberapa provider untuk rotasi saat rate limit.
-- Jalankan di Supabase SQL Editor.
-- =============================================================

-- 1) Drop check constraint lama yang cuma allow 'gemini'
alter table public.ai_credentials
  drop constraint if exists ai_credentials_provider_check;

-- 2) Tambah check baru untuk 3 provider
alter table public.ai_credentials
  add constraint ai_credentials_provider_check
  check (provider in ('gemini', 'cerebras', 'groq'));

-- 3) Tambah kolom priority untuk urutan rotasi (lower = duluan)
--    Default 100 supaya credential lama (gemini) tetap di-prioritaskan
alter table public.ai_credentials
  add column if not exists priority int not null default 100;

-- 4) Tambah kolom enabled untuk toggle on/off tanpa hapus key
alter table public.ai_credentials
  add column if not exists enabled boolean not null default true;

-- 5) Set priority default: gemini=10, cerebras=20, groq=30
update public.ai_credentials set priority = 10 where provider = 'gemini' and priority = 100;
update public.ai_credentials set priority = 20 where provider = 'cerebras' and priority = 100;
update public.ai_credentials set priority = 30 where provider = 'groq' and priority = 100;

-- 6) Index untuk query rotation (user + enabled + priority)
create index if not exists idx_ai_creds_user_priority
  on public.ai_credentials(user_id, enabled, priority);
