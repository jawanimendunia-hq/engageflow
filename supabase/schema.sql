-- =============================================================
-- EngageFlow Database Schema
-- Jalankan SQL ini di Supabase SQL Editor (sekali saja)
-- =============================================================

-- Pastikan ekstensi UUID tersedia
create extension if not exists "uuid-ossp";

-- ============= TABLES =============

-- profiles: data tambahan user, auto dibuat saat user signup
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamptz default now()
);

create table if not exists public.campaigns (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nama text not null,
  komentar_per_link int not null default 5,
  created_at timestamptz default now()
);

create table if not exists public.links (
  id uuid primary key default uuid_generate_v4(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  url text not null,
  kategori text not null,
  status text not null default 'pending'
    check (status in ('pending', 'proses', 'selesai')),
  created_at timestamptz default now()
);

create table if not exists public.accounts (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nama text not null,
  catatan text,
  warna text,
  cooldown_until timestamptz,
  created_at timestamptz default now()
);

create table if not exists public.comments (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  isi text not null,
  kategori text not null,
  tone text not null default 'santai'
    check (tone in ('pertanyaan', 'santai', 'testimoni', 'reaksi')),
  created_at timestamptz default now()
);

create table if not exists public.assignments (
  id uuid primary key default uuid_generate_v4(),
  link_id uuid not null references public.links(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  comment_id uuid not null references public.comments(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'selesai')),
  urutan int not null default 0,
  created_at timestamptz default now(),
  unique(link_id, account_id),
  unique(link_id, comment_id)
);

create table if not exists public.comment_usage (
  id uuid primary key default uuid_generate_v4(),
  comment_id uuid not null references public.comments(id) on delete cascade,
  jumlah_pakai int not null default 0,
  unique(comment_id)
);

-- Token Meta + Ad Account ID per user (multi ad account didukung)
create table if not exists public.meta_credentials (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text,
  access_token_encrypted text not null,
  ad_account_id text not null,
  expires_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, ad_account_id)
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

-- AI credentials (Gemini, dll)
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

-- ============= INDEXES =============
create index if not exists idx_links_campaign on public.links(campaign_id);
create index if not exists idx_links_kategori on public.links(kategori);
create index if not exists idx_comments_user_kat on public.comments(user_id, kategori);
create index if not exists idx_assignments_link on public.assignments(link_id);
create index if not exists idx_accounts_user on public.accounts(user_id);
create index if not exists idx_sku_user on public.sku_mappings(user_id);

-- ============= TRIGGER: profile auto-create =============
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============= ROW LEVEL SECURITY =============
alter table public.profiles    enable row level security;
alter table public.campaigns   enable row level security;
alter table public.links       enable row level security;
alter table public.accounts    enable row level security;
alter table public.comments    enable row level security;
alter table public.assignments enable row level security;
alter table public.comment_usage enable row level security;
alter table public.meta_credentials enable row level security;
alter table public.sku_mappings enable row level security;
alter table public.ai_credentials enable row level security;

-- profiles: user lihat profil sendiri
drop policy if exists "profiles self" on public.profiles;
create policy "profiles self" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- campaigns: hanya pemilik
drop policy if exists "campaigns owner" on public.campaigns;
create policy "campaigns owner" on public.campaigns
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- links: lewat campaign-nya
drop policy if exists "links via campaign" on public.links;
create policy "links via campaign" on public.links
  for all
  using (exists (
    select 1 from public.campaigns c
    where c.id = links.campaign_id and c.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.campaigns c
    where c.id = links.campaign_id and c.user_id = auth.uid()
  ));

-- accounts: hanya pemilik
drop policy if exists "accounts owner" on public.accounts;
create policy "accounts owner" on public.accounts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- comments: hanya pemilik
drop policy if exists "comments owner" on public.comments;
create policy "comments owner" on public.comments
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- assignments: lewat link → campaign
drop policy if exists "assignments via link" on public.assignments;
create policy "assignments via link" on public.assignments
  for all
  using (exists (
    select 1 from public.links l
    join public.campaigns c on c.id = l.campaign_id
    where l.id = assignments.link_id and c.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.links l
    join public.campaigns c on c.id = l.campaign_id
    where l.id = assignments.link_id and c.user_id = auth.uid()
  ));

-- comment_usage: lewat comment-nya
drop policy if exists "comment_usage owner" on public.comment_usage;
create policy "comment_usage owner" on public.comment_usage
  for all
  using (exists (
    select 1 from public.comments c
    where c.id = comment_usage.comment_id and c.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.comments c
    where c.id = comment_usage.comment_id and c.user_id = auth.uid()
  ));

-- meta_credentials: hanya pemilik
drop policy if exists "meta_credentials owner" on public.meta_credentials;
create policy "meta_credentials owner" on public.meta_credentials
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- sku_mappings: hanya pemilik
drop policy if exists "sku_mappings owner" on public.sku_mappings;
create policy "sku_mappings owner" on public.sku_mappings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ai_credentials: hanya pemilik
drop policy if exists "ai_credentials owner" on public.ai_credentials;
create policy "ai_credentials owner" on public.ai_credentials
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
