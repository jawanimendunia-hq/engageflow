-- =============================================================
-- Migration 2026-08-19: Free-tier AI rotation + provider cooldown
-- Jalankan di Supabase SQL Editor setelah migration sebelumnya.
-- Idempotent dan aman dijalankan ulang.
-- =============================================================

alter table public.ai_credentials
  add column if not exists cooldown_until timestamptz,
  add column if not exists last_error text,
  add column if not exists consecutive_errors int not null default 0;

alter table public.ai_credentials
  alter column model set default 'gemini-2.5-flash-lite';

-- Ganti model yang sudah deprecated/shutdown dengan model free yang aktif.
update public.ai_credentials
set model = 'gpt-oss-120b', updated_at = now()
where provider = 'cerebras'
  and model in ('llama-3.3-70b', 'llama3.1-8b', 'qwen-3-32b');

update public.ai_credentials
set model = 'qwen/qwen3.6-27b', updated_at = now()
where provider = 'groq'
  and model in ('llama-3.3-70b-versatile', 'llama-3.1-8b-instant');

-- Flash-Lite lebih sesuai untuk volume komentar free-tier.
update public.ai_credentials
set model = 'gemini-2.5-flash-lite', updated_at = now()
where provider = 'gemini' and model = 'gemini-2.5-flash';

-- Ubah hanya priority default lama; priority custom user tetap dipertahankan.
update public.ai_credentials set priority = 30
where provider = 'gemini' and priority = 10;
update public.ai_credentials set priority = 10
where provider = 'cerebras' and priority = 20;
update public.ai_credentials set priority = 20
where provider = 'groq' and priority = 30;

create index if not exists idx_ai_creds_available
  on public.ai_credentials(user_id, enabled, cooldown_until, priority);
