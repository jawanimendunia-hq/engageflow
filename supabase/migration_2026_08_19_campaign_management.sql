-- Catatan campaign dan waktu perubahan terakhir.
-- Jalankan sekali di Supabase SQL Editor.

alter table public.campaigns
  add column if not exists catatan text,
  add column if not exists updated_at timestamptz default now();

update public.campaigns
set updated_at = coalesce(updated_at, created_at, now())
where updated_at is null;

alter table public.campaigns
  alter column updated_at set default now(),
  alter column updated_at set not null;

create or replace function public.touch_campaign_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists campaigns_touch_updated_at on public.campaigns;
create trigger campaigns_touch_updated_at
  before update on public.campaigns
  for each row execute function public.touch_campaign_updated_at();

-- Menjaga status link dan assignment tetap sinkron saat pekerjaan dilakukan manual.
create or replace function public.set_link_manual_completion(
  p_link_id uuid,
  p_completed boolean
)
returns void
language plpgsql
set search_path = public
as $$
begin
  update public.assignments
  set status = case when p_completed then 'selesai' else 'pending' end
  where link_id = p_link_id;

  update public.links
  set status = case when p_completed then 'selesai' else 'pending' end
  where id = p_link_id;

  if not found then
    raise exception 'Link tidak ditemukan atau tidak dapat diakses';
  end if;
end;
$$;

create or replace function public.set_campaign_manual_completion(
  p_campaign_id uuid
)
returns void
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.campaigns where id = p_campaign_id
  ) then
    raise exception 'Campaign tidak ditemukan atau tidak dapat diakses';
  end if;

  update public.assignments a
  set status = 'selesai'
  from public.links l
  where a.link_id = l.id
    and l.campaign_id = p_campaign_id;

  update public.links
  set status = 'selesai'
  where campaign_id = p_campaign_id;
end;
$$;

revoke all on function public.set_link_manual_completion(uuid, boolean) from public;
revoke all on function public.set_campaign_manual_completion(uuid) from public;
grant execute on function public.set_link_manual_completion(uuid, boolean) to authenticated;
grant execute on function public.set_campaign_manual_completion(uuid) to authenticated;
