-- =============================================================
-- Migration 2026-05-08: AI credentials (Gemini)
-- Jalankan di Supabase SQL Editor
-- =============================================================

create table if not exists public.ai_credentials (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('gemini')),
  api_key_encrypted text not null,
  model text default 'gemini-2.5-flash',
  last_used_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, provider)
);

create index if not exists idx_ai_creds_user on public.ai_credentials(user_id);

alter table public.ai_credentials enable row level security;

drop policy if exists "ai_credentials owner" on public.ai_credentials;
create policy "ai_credentials owner" on public.ai_credentials
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
