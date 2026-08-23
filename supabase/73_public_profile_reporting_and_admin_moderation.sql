-- ============================================================
-- STEP 73 — PUBLIC PROFILE REPORTING + ADMIN MODERATION
-- Run after Step 72. Additive and safe to re-run.
-- ============================================================

begin;

create table if not exists public.profile_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('doctor','provider')),
  target_id uuid not null,
  reason text not null check (reason in (
    'fake_doctor','fake_bmdc_information','wrong_degree',
    'fake_hospital_chamber','wrong_phone_number',
    'inappropriate_content','other'
  )),
  other_details text,
  status text not null default 'pending'
    check (status in ('pending','reviewed','dismissed','actioned')),
  admin_note text,
  actioned_by uuid references public.profiles(id) on delete set null,
  actioned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profile_reports_other_details_check check (
    reason <> 'other' or length(trim(coalesce(other_details,''))) between 3 and 1000
  ),
  constraint profile_reports_one_per_reporter_target unique
    (reporter_id,target_type,target_id)
);

create index if not exists idx_profile_reports_admin_queue
  on public.profile_reports(status,target_type,target_id,created_at desc);
create index if not exists idx_profile_reports_target
  on public.profile_reports(target_type,target_id,created_at desc);

drop trigger if exists trg_profile_reports_updated_at on public.profile_reports;
create trigger trg_profile_reports_updated_at
before update on public.profile_reports
for each row execute function public.set_updated_at();

alter table public.profile_reports enable row level security;
revoke all on table public.profile_reports from public,anon,authenticated;
grant select,insert,update,delete on table public.profile_reports to service_role;

-- One authenticated active account can submit exactly one report for a profile.
create or replace function public.submit_profile_report(
  p_target_type text,
  p_target_id uuid,
  p_reason text,
  p_other_details text default null
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_user uuid := auth.uid();
  v_report_id uuid;
  v_owner uuid;
  v_account_status text;
begin
  if v_user is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;

  select p.account_status::text into v_account_status
  from public.profiles p where p.id=v_user;
  if v_account_status is null then raise exception 'PROFILE_NOT_FOUND'; end if;
  if v_account_status <> 'active' then raise exception 'ACTIVE_ACCOUNT_REQUIRED'; end if;

  if p_target_type not in ('doctor','provider') then
    raise exception 'INVALID_REPORT_TARGET';
  end if;
  if p_target_id is null then raise exception 'INVALID_REPORT_TARGET'; end if;
  if p_reason not in (
    'fake_doctor','fake_bmdc_information','wrong_degree',
    'fake_hospital_chamber','wrong_phone_number',
    'inappropriate_content','other'
  ) then raise exception 'INVALID_REPORT_REASON'; end if;
  if p_reason='other' and length(trim(coalesce(p_other_details,'')))<3 then
    raise exception 'OTHER_DETAILS_REQUIRED';
  end if;
  if length(trim(coalesce(p_other_details,'')))>1000 then
    raise exception 'REPORT_DETAILS_TOO_LONG';
  end if;

  if p_target_type='doctor' then
    select d.id into v_owner from public.doctors d where d.id=p_target_id;
  else
    select pr.owner_user_id into v_owner from public.providers pr where pr.id=p_target_id;
    if not found then raise exception 'REPORT_TARGET_NOT_FOUND'; end if;
  end if;
  if p_target_type='doctor' and v_owner is null then raise exception 'REPORT_TARGET_NOT_FOUND'; end if;
  if v_owner=v_user then raise exception 'CANNOT_REPORT_OWN_PROFILE'; end if;

  insert into public.profile_reports(reporter_id,target_type,target_id,reason,other_details)
  values(v_user,p_target_type,p_target_id,p_reason,
    nullif(trim(coalesce(p_other_details,'')),''))
  returning id into v_report_id;

  return v_report_id;
exception
  when unique_violation then raise exception 'ALREADY_REPORTED';
end;
$$;

create or replace function public.get_my_profile_report(
  p_target_type text,
  p_target_id uuid
)
returns table(reason text,status text,created_at timestamptz)
language plpgsql
stable
security definer
set search_path=public
as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  return query
  select r.reason,r.status,r.created_at
  from public.profile_reports r
  where r.reporter_id=v_user
    and r.target_type=p_target_type
    and r.target_id=p_target_id
  limit 1;
end;
$$;

create or replace function public.get_admin_profile_report_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
begin
  if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if not public.is_admin_or_above() then raise exception 'ADMIN_ACCESS_REQUIRED'; end if;

  return jsonb_build_object(
    'pending_reports',(select count(*) from public.profile_reports where status='pending'),
    'flagged_profiles',(select count(*) from (
      select target_type,target_id from public.profile_reports
      where status='pending' group by target_type,target_id
    ) q),
    'high_priority_profiles',(select count(*) from (
      select target_type,target_id from public.profile_reports
      where status='pending' group by target_type,target_id having count(*)>=3
    ) q)
  );
end;
$$;

create or replace function public.get_admin_profile_report_queue(
  p_open_only boolean default true,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table(
  target_type text,
  target_id uuid,
  target_name text,
  provider_type text,
  public_slug text,
  target_status text,
  pending_report_count bigint,
  total_report_count bigint,
  last_reported_at timestamptz,
  reason_counts jsonb,
  recent_reports jsonb,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path=public
as $$
begin
  if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if not public.is_admin_or_above() then raise exception 'ADMIN_ACCESS_REQUIRED'; end if;

  return query
  with targets as (
    select r.target_type,r.target_id,
      count(*) filter(where r.status='pending')::bigint pending_count,
      count(*)::bigint all_count,
      max(r.created_at) filter(where r.status='pending') pending_last,
      max(r.created_at) all_last
    from public.profile_reports r
    group by r.target_type,r.target_id
  ), enriched as (
    select t.*,
      case when t.target_type='doctor' then coalesce(dp.full_name,'নাম দেওয়া হয়নি') else pr.name_bn end entity_name,
      case when t.target_type='provider' then pr.provider_type else null end entity_provider_type,
      case when t.target_type='doctor' then d.profile_slug else pr.slug end entity_slug,
      case when t.target_type='doctor' then d.verification_status::text else pr.status::text end entity_status
    from targets t
    left join public.doctors d on t.target_type='doctor' and d.id=t.target_id
    left join public.profiles dp on d.id=dp.id
    left join public.providers pr on t.target_type='provider' and pr.id=t.target_id
    where (not p_open_only or t.pending_count>0)
  )
  select e.target_type,e.target_id,e.entity_name,e.entity_provider_type,
    e.entity_slug,e.entity_status,e.pending_count,e.all_count,
    coalesce(e.pending_last,e.all_last),
    coalesce((select jsonb_object_agg(x.reason,x.reason_count) from (
      select r.reason,count(*)::bigint reason_count
      from public.profile_reports r
      where r.target_type=e.target_type and r.target_id=e.target_id
        and (not p_open_only or r.status='pending')
      group by r.reason
    ) x),'{}'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object(
      'id',x.id,'reason',x.reason,'details',x.other_details,
      'status',x.status,'created_at',x.created_at,'admin_note',x.admin_note
    ) order by x.created_at desc) from (
      select r.id,r.reason,r.other_details,r.status,r.created_at,r.admin_note
      from public.profile_reports r
      where r.target_type=e.target_type and r.target_id=e.target_id
      order by r.created_at desc limit 10
    ) x),'[]'::jsonb),
    count(*) over()::bigint
  from enriched e
  order by e.pending_count desc,coalesce(e.pending_last,e.all_last) desc,e.target_id
  limit greatest(1,least(coalesce(p_limit,50),100))
  offset greatest(coalesce(p_offset,0),0);
end;
$$;

create or replace function public.admin_moderate_profile_reports(
  p_target_type text,
  p_target_id uuid,
  p_action text,
  p_admin_note text
)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare
  v_actor uuid := auth.uid();
  v_owner uuid;
  v_target_name text;
  v_changed integer;
begin
  if v_actor is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if not public.is_admin_or_above() then raise exception 'ADMIN_ACCESS_REQUIRED'; end if;
  if p_target_type not in ('doctor','provider') then raise exception 'INVALID_REPORT_TARGET'; end if;
  if p_action not in ('reviewed','dismissed','suspend_listing') then raise exception 'INVALID_MODERATION_ACTION'; end if;
  if length(trim(coalesce(p_admin_note,'')))<3 then raise exception 'ADMIN_NOTE_REQUIRED'; end if;
  if length(trim(p_admin_note))>1000 then raise exception 'ADMIN_NOTE_TOO_LONG'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_target_type||':'||p_target_id::text,0));

  if p_target_type='doctor' then
    select d.id,p.full_name into v_owner,v_target_name
    from public.doctors d join public.profiles p on p.id=d.id
    where d.id=p_target_id for update of d;
  else
    select pr.owner_user_id,pr.name_bn into v_owner,v_target_name
    from public.providers pr where pr.id=p_target_id for update;
  end if;
  if not found then raise exception 'REPORT_TARGET_NOT_FOUND'; end if;

  select count(*)::integer into v_changed
  from public.profile_reports
  where target_type=p_target_type and target_id=p_target_id and status='pending';
  if v_changed=0 then raise exception 'NO_OPEN_REPORTS'; end if;

  if p_action='reviewed' then
    update public.profile_reports
    set status='reviewed',admin_note=trim(p_admin_note),actioned_by=v_actor,actioned_at=now()
    where target_type=p_target_type and target_id=p_target_id and status='pending';
  elsif p_action='dismissed' then
    update public.profile_reports
    set status='dismissed',admin_note=trim(p_admin_note),actioned_by=v_actor,actioned_at=now()
    where target_type=p_target_type and target_id=p_target_id and status in ('pending','reviewed');
  else
    update public.profile_reports
    set status='actioned',admin_note=trim(p_admin_note),actioned_by=v_actor,actioned_at=now()
    where target_type=p_target_type and target_id=p_target_id and status in ('pending','reviewed');

    if p_target_type='doctor' then
      update public.doctors set verification_status='rejected',bmdc_verified=false,
        accepting_appointments=false,verification_note='Profile report moderation: '||trim(p_admin_note),
        verified_by=v_actor,verified_at=now(),updated_at=now()
      where id=p_target_id;
    else
      update public.providers set status='suspended',verified=false,
        verification_note='Profile report moderation: '||trim(p_admin_note),
        verified_by=v_actor,verified_at=now(),updated_at=now()
      where id=p_target_id;
    end if;

    if v_owner is not null then
      insert into public.notifications(recipient_id,sender_id,type,title_bn,body_bn,data)
      values(v_owner,v_actor,'profile_report_action','আপনার public profile সাময়িকভাবে বন্ধ করা হয়েছে',
        'ব্যবহারকারীর report পর্যালোচনার পর Admin আপনার listing বন্ধ করেছেন। Dashboard থেকে verification/support দেখুন।',
        jsonb_build_object('target_type',p_target_type,'target_id',p_target_id,'action','suspend_listing'));
    end if;
  end if;

  insert into public.admin_audit_logs(actor_id,action,target_user_id,target_type,target_id,metadata)
  values(v_actor,'profile_reports_'||p_action,v_owner,p_target_type,p_target_id::text,
    jsonb_build_object('target_name',v_target_name,'moderation_action',p_action,'admin_note',trim(p_admin_note)));

  return true;
end;
$$;

revoke all on function public.submit_profile_report(text,uuid,text,text) from public,anon;
revoke all on function public.get_my_profile_report(text,uuid) from public,anon;
revoke all on function public.get_admin_profile_report_summary() from public,anon;
revoke all on function public.get_admin_profile_report_queue(boolean,integer,integer) from public,anon;
revoke all on function public.admin_moderate_profile_reports(text,uuid,text,text) from public,anon;

grant execute on function public.submit_profile_report(text,uuid,text,text) to authenticated,service_role;
grant execute on function public.get_my_profile_report(text,uuid) to authenticated,service_role;
grant execute on function public.get_admin_profile_report_summary() to authenticated,service_role;
grant execute on function public.get_admin_profile_report_queue(boolean,integer,integer) to authenticated,service_role;
grant execute on function public.admin_moderate_profile_reports(text,uuid,text,text) to authenticated,service_role;

do $$
begin
  if not exists(select 1 from pg_constraint where conname='profile_reports_one_per_reporter_target') then
    raise exception 'STEP 73 failed: unique reporter/target constraint missing';
  end if;
  if not exists(select 1 from pg_proc where proname='submit_profile_report') then
    raise exception 'STEP 73 failed: submit RPC missing';
  end if;
  raise notice 'STEP 73 PUBLIC PROFILE REPORTING AND ADMIN MODERATION PASSED';
end $$;

commit;
