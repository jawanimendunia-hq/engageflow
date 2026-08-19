-- =============================================================
-- Migration 2026-08-19: OpenRouter Free sebagai fallback terakhir
-- Jalankan setelah migration_2026_08_19_free_ai_rotation.sql.
-- Idempotent dan aman dijalankan ulang.
-- =============================================================

alter table public.ai_credentials
  drop constraint if exists ai_credentials_provider_check;

alter table public.ai_credentials
  add constraint ai_credentials_provider_check
  check (provider in ('gemini', 'cerebras', 'groq', 'openrouter'));
