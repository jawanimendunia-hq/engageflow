-- =============================================================
-- Migration 2026-05-07: Meta Ads integration + SKU dictionary
-- Jalankan sekali di Supabase SQL Editor
-- =============================================================

-- Token Meta + Ad Account ID per user
create table if not exists public.meta_credentials (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade unique,
  access_token_encrypted text not null,
  ad_account_id text not null,
  expires_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Kamus SKU → kategori
create table if not exists public.sku_mappings (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kode text not null,
  kategori text not null,
  created_at timestamptz default now(),
  unique(user_id, kode)
);

create index if not exists idx_sku_user on public.sku_mappings(user_id);

-- ============= ROW LEVEL SECURITY =============
alter table public.meta_credentials enable row level security;
alter table public.sku_mappings enable row level security;

drop policy if exists "meta_credentials owner" on public.meta_credentials;
create policy "meta_credentials owner" on public.meta_credentials
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "sku_mappings owner" on public.sku_mappings;
create policy "sku_mappings owner" on public.sku_mappings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
