-- =============================================================
-- Hapus otomatis assignment komentar AI setelah campaign selesai.
--
-- Komentar AI tetap disimpan selama campaign aktif agar Mode Eksekusi
-- dan export tetap bekerja. Setelah SEMUA link campaign berstatus selesai,
-- assignment inline (comment_id is null) dihapus untuk menghemat database.
-- Assignment dari bank komentar tetap disimpan karena hanya berupa referensi.
-- =============================================================

create or replace function public.set_link_manual_completion(
  p_link_id uuid,
  p_completed boolean
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_campaign_id uuid;
begin
  select campaign_id into v_campaign_id
  from public.links
  where id = p_link_id;

  if v_campaign_id is null then
    raise exception 'Link tidak ditemukan atau tidak dapat diakses';
  end if;

  update public.assignments
  set status = case when p_completed then 'selesai' else 'pending' end
  where link_id = p_link_id;

  update public.links
  set status = case when p_completed then 'selesai' else 'pending' end
  where id = p_link_id;

  if p_completed and not exists (
    select 1
    from public.links
    where campaign_id = v_campaign_id
      and status <> 'selesai'
  ) then
    delete from public.assignments a
    using public.links l
    where a.link_id = l.id
      and l.campaign_id = v_campaign_id
      and a.comment_id is null;
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

  delete from public.assignments a
  using public.links l
  where a.link_id = l.id
    and l.campaign_id = p_campaign_id
    and a.comment_id is null;
end;
$$;

create or replace function public.complete_assignment_and_cleanup(
  p_assignment_id uuid
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_link_id uuid;
  v_campaign_id uuid;
begin
  select a.link_id, l.campaign_id
  into v_link_id, v_campaign_id
  from public.assignments a
  join public.links l on l.id = a.link_id
  where a.id = p_assignment_id;

  if v_link_id is null or v_campaign_id is null then
    raise exception 'Assignment tidak ditemukan atau tidak dapat diakses';
  end if;

  update public.assignments
  set status = 'selesai'
  where id = p_assignment_id;

  update public.links
  set status = case
    when exists (
      select 1
      from public.assignments
      where link_id = v_link_id
        and status = 'pending'
    ) then 'proses'
    else 'selesai'
  end
  where id = v_link_id;

  if not exists (
    select 1
    from public.links
    where campaign_id = v_campaign_id
      and status <> 'selesai'
  ) then
    delete from public.assignments a
    using public.links l
    where a.link_id = l.id
      and l.campaign_id = v_campaign_id
      and a.comment_id is null;
  end if;
end;
$$;

revoke all on function public.set_link_manual_completion(uuid, boolean) from public;
revoke all on function public.set_campaign_manual_completion(uuid) from public;
revoke all on function public.complete_assignment_and_cleanup(uuid) from public;
grant execute on function public.set_link_manual_completion(uuid, boolean) to authenticated;
grant execute on function public.set_campaign_manual_completion(uuid) to authenticated;
grant execute on function public.complete_assignment_and_cleanup(uuid) to authenticated;

-- Bersihkan data AI lama dari campaign yang sudah sepenuhnya selesai.
delete from public.assignments a
using public.links l
where a.link_id = l.id
  and a.comment_id is null
  and not exists (
    select 1
    from public.links unfinished
    where unfinished.campaign_id = l.campaign_id
      and unfinished.status <> 'selesai'
  );
