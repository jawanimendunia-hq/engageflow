-- Simpan keyword pencarian Meta yang menghasilkan setiap link.
-- Data link lama tetap valid dengan array keyword kosong.

alter table public.links
  add column if not exists source_keywords text[] not null default '{}';

create index if not exists idx_links_source_keywords
  on public.links using gin(source_keywords);
