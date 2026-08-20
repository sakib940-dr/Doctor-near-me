-- STEP 50: Premium membership progress, secure referrals, admin-configurable criteria
-- Preserves existing premium_memberships/ranking/referral foundations.

-- -----------------------------------------------------------------------------
-- 1) Admin-configurable premium policy. Defaults intentionally contain no
-- follower/referral/achievement threshold. Manual approval is the safe default.
-- -----------------------------------------------------------------------------
insert into public.site_settings(setting_key,setting_value,is_public,description)
values(
  'premium_membership_policy',
  '{
    "enabled": true,
    "min_followers": 0,
    "min_approved_referrals": 0,
    "require_profile_completion": false,
    "min_profile_completion_percent": 80,
    "require_verification": false,
    "min_achievement_count": 0,
    "manual_approval_required": true,
    "premium_duration_days": 0,
    "referral_claim_window_days": 7,
    "referral_requires_admin_approval": false
  }'::jsonb,
  false,
  'Premium eligibility, referral validation and membership duration policy.'
)
on conflict(setting_key) do nothing;

create or replace function public.get_premium_policy_internal()
returns jsonb
language sql
stable
security definer
set search_path=public
as $$
  select '{
    "enabled": true,
    "min_followers": 0,
    "min_approved_referrals": 0,
    "require_profile_completion": false,
    "min_profile_completion_percent": 80,
    "require_verification": false,
    "min_achievement_count": 0,
    "manual_approval_required": true,
    "premium_duration_days": 0,
    "referral_claim_window_days": 7,
    "referral_requires_admin_approval": false
  }'::jsonb || coalesce((select setting_value from public.site_settings where setting_key='premium_membership_policy'),'{}'::jsonb);
$$;

revoke all on function public.get_premium_policy_internal() from public,anon,authenticated;
grant execute on function public.get_premium_policy_internal() to service_role;

-- -----------------------------------------------------------------------------
-- 2) Reuse and harden existing referral_codes/referrals.
-- -----------------------------------------------------------------------------
alter table public.referrals
  add column if not exists status text not null default 'pending',
  add column if not exists validated_at timestamptz,
  add column if not exists invalid_reason text;

do $$ begin
  alter table public.referrals add constraint referrals_status_check
    check(status in ('pending','approved','rejected','invalid'));
exception when duplicate_object then null; end $$;

create index if not exists idx_referrals_status_referrer
  on public.referrals(referrer_id,status,created_at desc);

-- Existing referral rows predate validation. Keep them for audit, but do not let
-- malformed/self/duplicate rows become Premium credit accidentally.
update public.referrals r
set status='invalid',invalid_reason='No referred account'
where r.referred_user_id is null and r.status in ('pending','approved');
update public.referrals r
set status='invalid',invalid_reason='Self referral'
where r.referred_user_id is not null and r.referred_user_id=r.referrer_id and r.status in ('pending','approved');
update public.referrals r
set status='invalid',invalid_reason='Referral code/referrer mismatch'
where r.status in ('pending','approved') and not exists(
  select 1 from public.referral_codes c where c.user_id=r.referrer_id and upper(c.code)=upper(r.referral_code)
);
with ranked as (
  select id,row_number() over(partition by referred_user_id order by case when status='approved' then 0 else 1 end,created_at,id) rn
  from public.referrals
  where referred_user_id is not null and status in ('pending','approved')
)
update public.referrals r set status='invalid',invalid_reason='Duplicate referred account'
from ranked x where r.id=x.id and x.rn>1;

create unique index if not exists ux_referrals_active_referred_user
  on public.referrals(referred_user_id)
  where referred_user_id is not null and status in ('pending','approved');

create or replace function public.guard_referral_integrity()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if not exists(
    select 1 from public.referral_codes c
    where c.user_id=new.referrer_id and upper(c.code)=upper(new.referral_code)
  ) then
    raise exception 'Referral code does not belong to referrer';
  end if;
  if new.referred_user_id is not null and new.referred_user_id=new.referrer_id then
    raise exception 'Self referral is not allowed';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_referral_integrity on public.referrals;
create trigger trg_guard_referral_integrity
before insert or update of referrer_id,referred_user_id,referral_code on public.referrals
for each row execute function public.guard_referral_integrity();

-- Direct self-insert previously allowed arbitrary referral rows. Move all mutation
-- behind validated RPCs. Owners keep read access through existing select policy.
drop policy if exists "referrals_insert" on public.referrals;
drop policy if exists "referral_codes_own" on public.referral_codes;
drop policy if exists "referral_codes_select_own" on public.referral_codes;
create policy "referral_codes_select_own"
on public.referral_codes for select to authenticated
using(user_id=auth.uid() or public.is_admin_or_above());

revoke insert,update,delete on table public.referral_codes,public.referrals from public,anon,authenticated;
grant select on table public.referral_codes,public.referrals to authenticated;

create or replace function public.get_or_create_my_referral_code()
returns text
language plpgsql
security definer
set search_path=public
as $$
declare
  my_role text;
  result_code text;
  attempts integer:=0;
begin
  select role::text into my_role from public.profiles
  where id=auth.uid() and account_status='active';
  if my_role not in ('doctor','hospital','chamber') then
    raise exception 'Referral code is available to Doctor/Hospital accounts only';
  end if;

  select code into result_code from public.referral_codes where user_id=auth.uid();
  if result_code is not null then return result_code; end if;

  loop
    attempts:=attempts+1;
    result_code:=upper(substr(replace(gen_random_uuid()::text,'-',''),1,9));
    begin
      insert into public.referral_codes(user_id,code) values(auth.uid(),result_code);
      return result_code;
    exception when unique_violation then
      select code into result_code from public.referral_codes where user_id=auth.uid();
      if result_code is not null then return result_code; end if;
      if attempts>=8 then raise exception 'Could not allocate referral code'; end if;
    end;
  end loop;
end;
$$;

create or replace function public.claim_referral_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  target_profile public.profiles%rowtype;
  referrer public.profiles%rowtype;
  code_row public.referral_codes%rowtype;
  policy jsonb:=public.get_premium_policy_internal();
  claim_window integer:=greatest(0,least(coalesce((policy->>'referral_claim_window_days')::integer,7),365));
  requires_admin boolean:=coalesce((policy->>'referral_requires_admin_approval')::boolean,false);
  result_status text;
  existing public.referrals%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into target_profile from public.profiles where id=auth.uid() and account_status='active' for update;
  if not found then raise exception 'Active account required'; end if;
  if nullif(trim(coalesce(p_code,'')),'') is null then raise exception 'Referral code is required'; end if;

  select * into code_row from public.referral_codes where upper(code)=upper(trim(p_code)) for share;
  if not found then raise exception 'Invalid referral code'; end if;
  if code_row.user_id=auth.uid() then raise exception 'Self referral is not allowed'; end if;

  select * into referrer from public.profiles where id=code_row.user_id and account_status='active';
  if not found or referrer.role::text not in ('doctor','hospital','chamber') then
    raise exception 'Referral owner is not eligible';
  end if;

  if claim_window>0 and target_profile.created_at < now()-make_interval(days=>claim_window) then
    raise exception 'Referral claim window has expired';
  end if;

  select * into existing from public.referrals
  where referred_user_id=auth.uid() and status in ('pending','approved')
  order by created_at desc limit 1;
  if found then
    if existing.referrer_id=code_row.user_id then
      return jsonb_build_object('status',existing.status,'already_claimed',true);
    end if;
    raise exception 'This account already has a referral';
  end if;

  result_status:=case when requires_admin then 'pending' else 'approved' end;
  insert into public.referrals(referrer_id,referred_user_id,referral_code,source,status,validated_at)
  values(code_row.user_id,auth.uid(),code_row.code,'signup_link',result_status,
    case when result_status='approved' then now() else null end);

  return jsonb_build_object('status',result_status,'already_claimed',false);
end;
$$;

create or replace function public.admin_get_referral_queue(
  p_status text default 'pending', p_limit integer default 100
)
returns table(
  id uuid,referrer_id uuid,referrer_name text,referred_user_id uuid,referred_name text,
  referral_code text,status text,created_at timestamptz,validated_at timestamptz
)
language plpgsql
security definer
set search_path=public
as $$
begin
  if not public.is_admin_or_above() then raise exception 'Admin access required'; end if;
  if p_status not in ('pending','approved','rejected','invalid') then raise exception 'Invalid referral status'; end if;
  return query
  select r.id,r.referrer_id,coalesce(rp.full_name,rp.email,r.referrer_id::text),
    r.referred_user_id,coalesce(tp.full_name,tp.email,r.referred_user_id::text),
    r.referral_code,r.status,r.created_at,r.validated_at
  from public.referrals r
  left join public.profiles rp on rp.id=r.referrer_id
  left join public.profiles tp on tp.id=r.referred_user_id
  where r.status=p_status
  order by r.created_at desc
  limit greatest(1,least(coalesce(p_limit,100),200));
end;
$$;

create or replace function public.admin_set_referral_status(p_referral_id uuid,p_status text,p_reason text default null)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare r public.referrals%rowtype;
begin
  if not public.is_admin_or_above() then raise exception 'Admin access required'; end if;
  if p_status not in ('approved','rejected','invalid') then raise exception 'Invalid referral decision'; end if;
  select * into r from public.referrals where id=p_referral_id for update;
  if not found then raise exception 'Referral not found'; end if;
  if p_status='approved' then
    if r.referred_user_id is null or r.referred_user_id=r.referrer_id then raise exception 'Referral is not valid'; end if;
    if not exists(select 1 from public.referral_codes c where c.user_id=r.referrer_id and upper(c.code)=upper(r.referral_code)) then
      raise exception 'Referral code/referrer mismatch';
    end if;
    if not exists(select 1 from public.profiles rp where rp.id=r.referrer_id and rp.account_status='active' and rp.role::text in ('doctor','hospital','chamber')) then
      raise exception 'Referral owner is not eligible';
    end if;
    if not exists(select 1 from public.profiles tp where tp.id=r.referred_user_id and tp.account_status='active') then
      raise exception 'Referred account is not active';
    end if;
    if exists(select 1 from public.referrals x where x.referred_user_id=r.referred_user_id and x.status in ('pending','approved') and x.id<>r.id) then
      raise exception 'Referred account is already credited';
    end if;
  end if;
  update public.referrals set status=p_status,
    validated_at=case when p_status='approved' then now() else validated_at end,
    invalid_reason=case when p_status in ('rejected','invalid') then nullif(trim(coalesce(p_reason,'')),'') else null end
  where id=p_referral_id;
  insert into public.admin_audit_logs(actor_id,action,target_type,target_id,metadata)
  values(auth.uid(),'referral_status_changed','referral',p_referral_id::text,jsonb_build_object('status',p_status,'reason',p_reason));
  return true;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3) Optional, non-decorative Premium achievements. These are internal
-- eligibility records, not public badges.
-- -----------------------------------------------------------------------------
create table if not exists public.premium_achievement_rules(
  id bigint generated by default as identity primary key,
  code text not null unique,
  title_bn text not null,
  title_en text,
  description_bn text,
  counts_toward_premium boolean not null default true,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.premium_achievement_awards(
  id uuid primary key default gen_random_uuid(),
  rule_id bigint not null references public.premium_achievement_rules(id) on delete restrict,
  doctor_id uuid references public.doctors(id) on delete cascade,
  provider_id uuid references public.providers(id) on delete cascade,
  awarded_by uuid references public.profiles(id) on delete set null,
  note text,
  awarded_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint premium_achievement_awards_one_target check(
    ((doctor_id is not null)::integer + (provider_id is not null)::integer)=1
  )
);

create unique index if not exists ux_premium_achievement_doctor_active
  on public.premium_achievement_awards(rule_id,doctor_id)
  where doctor_id is not null and revoked_at is null;
create unique index if not exists ux_premium_achievement_provider_active
  on public.premium_achievement_awards(rule_id,provider_id)
  where provider_id is not null and revoked_at is null;
create index if not exists idx_premium_achievement_awards_target
  on public.premium_achievement_awards(doctor_id,provider_id,awarded_at desc);

drop trigger if exists trg_premium_achievement_rules_updated on public.premium_achievement_rules;
create trigger trg_premium_achievement_rules_updated
before update on public.premium_achievement_rules
for each row execute function public.set_updated_at();

alter table public.premium_achievement_rules enable row level security;
alter table public.premium_achievement_awards enable row level security;
revoke all on table public.premium_achievement_rules,public.premium_achievement_awards from public,anon,authenticated;

create or replace function public.admin_list_premium_achievement_rules()
returns setof public.premium_achievement_rules
language plpgsql
security definer
set search_path=public
as $$
begin
  if not public.is_admin_or_above() then raise exception 'Admin access required'; end if;
  return query select * from public.premium_achievement_rules order by sort_order,title_bn,id;
end;
$$;

create or replace function public.admin_save_premium_achievement_rule(
  p_id bigint default null,p_code text default null,p_title_bn text default null,p_title_en text default null,
  p_description_bn text default null,p_counts boolean default true,p_active boolean default true,p_sort_order integer default 0
)
returns bigint
language plpgsql
security definer
set search_path=public
as $$
declare result_id bigint;
begin
  if not public.is_admin_or_above() then raise exception 'Admin access required'; end if;
  if length(trim(coalesce(p_code,'')))<2 or trim(p_code)!~'^[a-z0-9_]+$' then raise exception 'Use a lowercase code'; end if;
  if length(trim(coalesce(p_title_bn,'')))<2 then raise exception 'Title is required'; end if;
  if p_id is null then
    insert into public.premium_achievement_rules(code,title_bn,title_en,description_bn,counts_toward_premium,is_active,sort_order,created_by)
    values(trim(p_code),trim(p_title_bn),nullif(trim(coalesce(p_title_en,'')),''),nullif(trim(coalesce(p_description_bn,'')),''),coalesce(p_counts,true),coalesce(p_active,true),greatest(0,coalesce(p_sort_order,0)),auth.uid())
    returning id into result_id;
  else
    update public.premium_achievement_rules set code=trim(p_code),title_bn=trim(p_title_bn),title_en=nullif(trim(coalesce(p_title_en,'')),''),
      description_bn=nullif(trim(coalesce(p_description_bn,'')),''),counts_toward_premium=coalesce(p_counts,true),is_active=coalesce(p_active,true),sort_order=greatest(0,coalesce(p_sort_order,0))
    where id=p_id returning id into result_id;
    if result_id is null then raise exception 'Achievement rule not found'; end if;
  end if;
  insert into public.admin_audit_logs(actor_id,action,target_type,target_id,metadata)
  values(auth.uid(),'premium_achievement_rule_saved','premium_achievement_rule',result_id::text,jsonb_build_object('code',p_code));
  return result_id;
end;
$$;

create or replace function public.admin_set_premium_achievement_award(
  p_rule_id bigint,p_doctor_id uuid default null,p_provider_id uuid default null,p_award boolean default true,p_note text default null
)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
begin
  if not public.is_admin_or_above() then raise exception 'Admin access required'; end if;
  if ((p_doctor_id is not null)::integer+(p_provider_id is not null)::integer)<>1 then raise exception 'Choose one target'; end if;
  if not exists(select 1 from public.premium_achievement_rules where id=p_rule_id and is_active) then raise exception 'Active rule not found'; end if;
  if p_award then
    if p_doctor_id is not null then
      if not exists(select 1 from public.premium_achievement_awards where rule_id=p_rule_id and doctor_id=p_doctor_id and revoked_at is null) then
        insert into public.premium_achievement_awards(rule_id,doctor_id,awarded_by,note)
        values(p_rule_id,p_doctor_id,auth.uid(),nullif(trim(coalesce(p_note,'')),''));
      end if;
    else
      if not exists(select 1 from public.premium_achievement_awards where rule_id=p_rule_id and provider_id=p_provider_id and revoked_at is null) then
        insert into public.premium_achievement_awards(rule_id,provider_id,awarded_by,note)
        values(p_rule_id,p_provider_id,auth.uid(),nullif(trim(coalesce(p_note,'')),''));
      end if;
    end if;
  else
    update public.premium_achievement_awards set revoked_at=now()
    where rule_id=p_rule_id and revoked_at is null
      and doctor_id is not distinct from p_doctor_id and provider_id is not distinct from p_provider_id;
  end if;
  insert into public.admin_audit_logs(actor_id,action,target_type,target_id,metadata)
  values(auth.uid(),case when p_award then 'premium_achievement_awarded' else 'premium_achievement_revoked' end,
    case when p_doctor_id is not null then 'doctor' else 'provider' end,coalesce(p_doctor_id,p_provider_id)::text,jsonb_build_object('rule_id',p_rule_id));
  return true;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4) Centralized profile completion and Premium progress.
-- -----------------------------------------------------------------------------
create or replace function public.premium_profile_completion_percent(
  p_doctor_id uuid default null,p_provider_id uuid default null
)
returns integer
language plpgsql
stable
security definer
set search_path=public
as $$
declare done integer:=0; total integer:=0; d public.doctors%rowtype; pr public.profiles%rowtype; p public.providers%rowtype;
begin
  if ((p_doctor_id is not null)::integer+(p_provider_id is not null)::integer)<>1 then return 0; end if;
  if p_doctor_id is not null then
    select * into d from public.doctors where id=p_doctor_id;
    select * into pr from public.profiles where id=p_doctor_id;
    if not found then return 0; end if;
    total:=10;
    done:=done+(nullif(trim(coalesce(pr.full_name,'')),'') is not null)::integer;
    done:=done+(nullif(trim(coalesce(pr.avatar_url,'')),'') is not null)::integer;
    done:=done+(nullif(trim(coalesce(d.degree,'')),'') is not null)::integer;
    done:=done+(nullif(trim(coalesce(d.bmdc_registration_no,'')),'') is not null)::integer;
    done:=done+(nullif(trim(coalesce(d.medical_college,'')),'') is not null)::integer;
    done:=done+(nullif(trim(coalesce(d.present_job,'')),'') is not null)::integer;
    done:=done+(nullif(trim(coalesce(d.bio_bn,d.bio,'')),'') is not null)::integer;
    done:=done+(exists(select 1 from public.doctor_specialties ds where ds.doctor_id=p_doctor_id))::integer;
    done:=done+(exists(select 1 from public.doctor_provider_links l where l.doctor_id=p_doctor_id and l.status='approved'))::integer;
    done:=done+((pr.email is not null or pr.phone is not null))::integer;
  else
    select * into p from public.providers where id=p_provider_id;
    if not found then return 0; end if;
    total:=10;
    done:=done+(nullif(trim(coalesce(p.name_bn,'')),'') is not null)::integer;
    done:=done+(nullif(trim(coalesce(p.logo_url,'')),'') is not null)::integer;
    done:=done+(nullif(trim(coalesce(p.phone,p.whatsapp,'')),'') is not null)::integer;
    done:=done+(nullif(trim(coalesce(p.address,'')),'') is not null)::integer;
    done:=done+(p.district_id is not null)::integer;
    done:=done+(p.upazila_id is not null)::integer;
    done:=done+((p.latitude is not null and p.longitude is not null))::integer;
    done:=done+(nullif(trim(coalesce(p.about_bn,p.short_description,'')),'') is not null)::integer;
    done:=done+(exists(select 1 from public.provider_opening_hours h where h.provider_id=p_provider_id))::integer;
    done:=done+(exists(select 1 from public.provider_services s where s.provider_id=p_provider_id and s.is_active))::integer;
  end if;
  return round(done*100.0/greatest(total,1))::integer;
end;
$$;

create or replace function public.build_premium_progress(
  p_doctor_id uuid default null,p_provider_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  policy jsonb:=public.get_premium_policy_internal();
  owner_id uuid;
  followers integer:=0; refs integer:=0; achievements integer:=0; completion integer:=0;
  verified_ok boolean:=false;
  min_followers integer:=0; min_refs integer:=0; min_achievements integer:=0; min_completion integer:=80;
  require_profile boolean:=false; require_verification boolean:=false;
  followers_ok boolean; refs_ok boolean; achievement_ok boolean; profile_ok boolean; verification_ok boolean; requirements_ok boolean;
  membership public.premium_memberships%rowtype;
  effective_status text:='inactive'; active_now boolean:=false;
  achievement_json jsonb:='[]'::jsonb;
begin
  if ((p_doctor_id is not null)::integer+(p_provider_id is not null)::integer)<>1 then raise exception 'Choose one Premium target'; end if;
  if p_doctor_id is not null then
    select id into owner_id from public.profiles where id=p_doctor_id and account_status='active';
    if owner_id is null or not exists(select 1 from public.doctors where id=p_doctor_id) then raise exception 'Doctor not found'; end if;
    select count(*)::integer into followers from public.patient_follows where doctor_id=p_doctor_id;
    select verification_status='approved' into verified_ok from public.doctors where id=p_doctor_id;
    select count(*)::integer into achievements from public.premium_achievement_awards a join public.premium_achievement_rules r on r.id=a.rule_id
      where a.doctor_id=p_doctor_id and a.revoked_at is null and r.is_active and r.counts_toward_premium;
    select coalesce(jsonb_agg(jsonb_build_object('rule_id',r.id,'code',r.code,'title_bn',r.title_bn,'title_en',r.title_en) order by r.sort_order,r.id),'[]'::jsonb)
      into achievement_json from public.premium_achievement_awards a join public.premium_achievement_rules r on r.id=a.rule_id
      where a.doctor_id=p_doctor_id and a.revoked_at is null and r.is_active and r.counts_toward_premium;
  else
    select owner_user_id into owner_id from public.providers where id=p_provider_id;
    if owner_id is null or not exists(select 1 from public.profiles where id=owner_id and account_status='active') then raise exception 'Provider not found'; end if;
    select count(*)::integer into followers from public.patient_follows where provider_id=p_provider_id;
    select (verified=true and status='approved') into verified_ok from public.providers where id=p_provider_id;
    select count(*)::integer into achievements from public.premium_achievement_awards a join public.premium_achievement_rules r on r.id=a.rule_id
      where a.provider_id=p_provider_id and a.revoked_at is null and r.is_active and r.counts_toward_premium;
    select coalesce(jsonb_agg(jsonb_build_object('rule_id',r.id,'code',r.code,'title_bn',r.title_bn,'title_en',r.title_en) order by r.sort_order,r.id),'[]'::jsonb)
      into achievement_json from public.premium_achievement_awards a join public.premium_achievement_rules r on r.id=a.rule_id
      where a.provider_id=p_provider_id and a.revoked_at is null and r.is_active and r.counts_toward_premium;
  end if;

  select count(*)::integer into refs
  from public.referrals r
  join public.profiles referred on referred.id=r.referred_user_id and referred.account_status='active'
  where r.referrer_id=owner_id and r.status='approved';
  completion:=public.premium_profile_completion_percent(p_doctor_id,p_provider_id);

  min_followers:=greatest(0,least(coalesce((policy->>'min_followers')::integer,0),1000000));
  min_refs:=greatest(0,least(coalesce((policy->>'min_approved_referrals')::integer,0),100000));
  min_achievements:=greatest(0,least(coalesce((policy->>'min_achievement_count')::integer,0),1000));
  min_completion:=greatest(0,least(coalesce((policy->>'min_profile_completion_percent')::integer,80),100));
  require_profile:=coalesce((policy->>'require_profile_completion')::boolean,false);
  require_verification:=coalesce((policy->>'require_verification')::boolean,false);

  followers_ok:=followers>=min_followers;
  refs_ok:=refs>=min_refs;
  achievement_ok:=achievements>=min_achievements;
  profile_ok:=(not require_profile) or completion>=min_completion;
  verification_ok:=(not require_verification) or verified_ok;
  requirements_ok:=followers_ok and refs_ok and achievement_ok and profile_ok and verification_ok;

  select * into membership from public.premium_memberships m
  where m.doctor_id is not distinct from p_doctor_id and m.provider_id is not distinct from p_provider_id
    and m.status in ('active','pending','expired','cancelled')
  order by case when m.status='active' and (m.starts_at is null or m.starts_at<=now()) and (m.expires_at is null or m.expires_at>now()) then 0
                when m.status='pending' then 1 else 2 end,
           m.created_at desc limit 1;
  if found then
    if membership.status='active' and (membership.starts_at is null or membership.starts_at<=now()) and (membership.expires_at is null or membership.expires_at>now()) then
      effective_status:='active'; active_now:=true;
    elsif membership.status='pending' then effective_status:='pending';
    elsif membership.status='expired' or (membership.status='active' and membership.expires_at is not null and membership.expires_at<=now()) then effective_status:='expired';
    else effective_status:='inactive'; end if;
  end if;

  return jsonb_build_object(
    'target_type',case when p_doctor_id is not null then 'doctor' else 'provider' end,
    'target_id',coalesce(p_doctor_id,p_provider_id),
    'policy_enabled',coalesce((policy->>'enabled')::boolean,true),
    'manual_approval_required',coalesce((policy->>'manual_approval_required')::boolean,true),
    'premium_duration_days',greatest(0,coalesce((policy->>'premium_duration_days')::integer,0)),
    'followers',followers,'approved_referrals',refs,'achievement_count',achievements,'profile_completion_percent',completion,'verified',verified_ok,
    'requirements_complete',requirements_ok,'is_premium',active_now,'membership_status',effective_status,
    'membership_id',membership.id,'starts_at',membership.starts_at,'expires_at',membership.expires_at,
    'achievements',achievement_json,
    'criteria',jsonb_build_array(
      jsonb_build_object('key','followers','label_bn','রোগী অনুসারী','label_en','Patient followers','enabled',min_followers>0,'current',followers,'required',min_followers,'complete',followers_ok),
      jsonb_build_object('key','referrals','label_bn','অনুমোদিত রেফারেল','label_en','Approved referrals','enabled',min_refs>0,'current',refs,'required',min_refs,'complete',refs_ok),
      jsonb_build_object('key','profile','label_bn','প্রোফাইল সম্পূর্ণতা','label_en','Profile completion','enabled',require_profile,'current',completion,'required',min_completion,'unit','%','complete',profile_ok),
      jsonb_build_object('key','verification','label_bn','ভেরিফিকেশন','label_en','Verification','enabled',require_verification,'current',case when verified_ok then 1 else 0 end,'required',1,'complete',verification_ok),
      jsonb_build_object('key','achievements','label_bn','যোগ্য অর্জন','label_en','Eligible achievements','enabled',min_achievements>0,'current',achievements,'required',min_achievements,'complete',achievement_ok)
    )
  );
end;
$$;

revoke all on function public.premium_profile_completion_percent(uuid,uuid) from public,anon,authenticated;
revoke all on function public.build_premium_progress(uuid,uuid) from public,anon,authenticated;
grant execute on function public.premium_profile_completion_percent(uuid,uuid),public.build_premium_progress(uuid,uuid) to service_role;

create or replace function public.get_my_premium_progress(p_provider_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare my_role text; target_provider uuid;
begin
  select role::text into my_role from public.profiles where id=auth.uid() and account_status='active';
  if my_role='doctor' then return public.build_premium_progress(auth.uid(),null); end if;
  if my_role not in ('hospital','chamber') then raise exception 'Premium progress is available to Doctor/Hospital accounts'; end if;
  if p_provider_id is null then
    select id into target_provider from public.providers where owner_user_id=auth.uid() order by created_at limit 1;
  else target_provider:=p_provider_id; end if;
  if target_provider is null or not exists(select 1 from public.providers where id=target_provider and owner_user_id=auth.uid()) then raise exception 'Provider access denied'; end if;
  return public.build_premium_progress(null,target_provider);
end;
$$;

with ranked as (
  select id,row_number() over(partition by doctor_id order by created_at desc,id desc) rn
  from public.premium_memberships where doctor_id is not null and status='pending'
)
update public.premium_memberships m set status='cancelled',updated_at=now()
from ranked r where m.id=r.id and r.rn>1;
with ranked as (
  select id,row_number() over(partition by provider_id order by created_at desc,id desc) rn
  from public.premium_memberships where provider_id is not null and status='pending'
)
update public.premium_memberships m set status='cancelled',updated_at=now()
from ranked r where m.id=r.id and r.rn>1;

create unique index if not exists ux_pending_premium_doctor
  on public.premium_memberships(doctor_id) where doctor_id is not null and status='pending';
create unique index if not exists ux_pending_premium_provider
  on public.premium_memberships(provider_id) where provider_id is not null and status='pending';

create or replace function public.request_my_premium_membership(p_provider_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare progress jsonb; policy jsonb:=public.get_premium_policy_internal(); my_role text; target_provider uuid; result_id uuid; duration_days integer; manual boolean; new_status text; expiry timestamptz;
begin
  select role::text into my_role from public.profiles where id=auth.uid() and account_status='active';
  if my_role='doctor' then
    perform 1 from public.doctors where id=auth.uid() for update;
    if not found then raise exception 'Doctor not found'; end if;
    progress:=public.build_premium_progress(auth.uid(),null);
  elsif my_role in ('hospital','chamber') then
    if p_provider_id is null then select id into target_provider from public.providers where owner_user_id=auth.uid() order by created_at limit 1; else target_provider:=p_provider_id; end if;
    if target_provider is null or not exists(select 1 from public.providers where id=target_provider and owner_user_id=auth.uid()) then raise exception 'Provider access denied'; end if;
    perform 1 from public.providers where id=target_provider for update;
    progress:=public.build_premium_progress(null,target_provider);
  else raise exception 'Premium membership is available to Doctor/Hospital accounts'; end if;

  if not coalesce((progress->>'policy_enabled')::boolean,true) then raise exception 'Premium applications are currently paused'; end if;
  if coalesce((progress->>'is_premium')::boolean,false) then return progress; end if;
  if progress->>'membership_status'='pending' then return progress; end if;
  if not coalesce((progress->>'requirements_complete')::boolean,false) then raise exception 'Premium requirements are not complete yet'; end if;

  if my_role='doctor' then
    update public.premium_memberships set status='expired',updated_at=now()
    where doctor_id=auth.uid() and status='active' and expires_at is not null and expires_at<=now();
  else
    update public.premium_memberships set status='expired',updated_at=now()
    where provider_id=target_provider and status='active' and expires_at is not null and expires_at<=now();
  end if;

  manual:=coalesce((policy->>'manual_approval_required')::boolean,true);
  duration_days:=greatest(0,least(coalesce((policy->>'premium_duration_days')::integer,0),3650));
  new_status:=case when manual then 'pending' else 'active' end;
  expiry:=case when not manual and duration_days>0 then now()+make_interval(days=>duration_days) else null end;

  if my_role='doctor' then
    insert into public.premium_memberships(doctor_id,plan_code,status,starts_at,expires_at,created_by,note)
    values(auth.uid(),'premium',new_status,case when new_status='active' then now() else null end,expiry,auth.uid(),'Self-service Premium request')
    returning id into result_id;
  else
    insert into public.premium_memberships(provider_id,plan_code,status,starts_at,expires_at,created_by,note)
    values(target_provider,'premium',new_status,case when new_status='active' then now() else null end,expiry,auth.uid(),'Self-service Premium request')
    returning id into result_id;
  end if;

  insert into public.admin_audit_logs(actor_id,action,target_type,target_id,metadata)
  values(auth.uid(),'premium_membership_requested',case when my_role='doctor' then 'doctor' else 'provider' end,
    case when my_role='doctor' then auth.uid()::text else target_provider::text end,jsonb_build_object('membership_id',result_id,'status',new_status));

  if manual then
    insert into public.notifications(recipient_id,type,title_bn,body_bn,data)
    select a.id,'premium_request','নতুন Premium আবেদন','একটি Premium Membership আবেদন review প্রয়োজন।',jsonb_build_object('membership_id',result_id)
    from public.profiles a where a.role::text in ('admin','super_admin') and a.account_status='active';
  end if;

  return public.build_premium_progress(case when my_role='doctor' then auth.uid() else null end,case when my_role='doctor' then null else target_provider end);
end;
$$;

-- -----------------------------------------------------------------------------
-- 5) Admin policy, progress, membership decision and achievement management.
-- -----------------------------------------------------------------------------
create or replace function public.get_admin_premium_policy()
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
begin
  if not public.is_admin_or_above() then raise exception 'Admin access required'; end if;
  return public.get_premium_policy_internal();
end;
$$;

create or replace function public.save_admin_premium_policy(
  p_enabled boolean,p_min_followers integer,p_min_approved_referrals integer,
  p_require_profile_completion boolean,p_min_profile_completion_percent integer,
  p_require_verification boolean,p_min_achievement_count integer,
  p_manual_approval_required boolean,p_premium_duration_days integer,
  p_referral_claim_window_days integer,p_referral_requires_admin_approval boolean
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare value jsonb;
begin
  if not public.is_admin_or_above() then raise exception 'Admin access required'; end if;
  if coalesce(p_min_followers,0)<0 or coalesce(p_min_followers,0)>1000000 then raise exception 'Follower requirement is out of range'; end if;
  if coalesce(p_min_approved_referrals,0)<0 or coalesce(p_min_approved_referrals,0)>100000 then raise exception 'Referral requirement is out of range'; end if;
  if coalesce(p_min_profile_completion_percent,0)<0 or coalesce(p_min_profile_completion_percent,0)>100 then raise exception 'Profile completion must be 0-100'; end if;
  if coalesce(p_min_achievement_count,0)<0 or coalesce(p_min_achievement_count,0)>1000 then raise exception 'Achievement requirement is out of range'; end if;
  if coalesce(p_premium_duration_days,0)<0 or coalesce(p_premium_duration_days,0)>3650 then raise exception 'Premium duration is out of range'; end if;
  if coalesce(p_referral_claim_window_days,0)<0 or coalesce(p_referral_claim_window_days,0)>365 then raise exception 'Referral window is out of range'; end if;
  value:=jsonb_build_object(
    'enabled',coalesce(p_enabled,true),'min_followers',coalesce(p_min_followers,0),'min_approved_referrals',coalesce(p_min_approved_referrals,0),
    'require_profile_completion',coalesce(p_require_profile_completion,false),'min_profile_completion_percent',coalesce(p_min_profile_completion_percent,80),
    'require_verification',coalesce(p_require_verification,false),'min_achievement_count',coalesce(p_min_achievement_count,0),
    'manual_approval_required',coalesce(p_manual_approval_required,true),'premium_duration_days',coalesce(p_premium_duration_days,0),
    'referral_claim_window_days',coalesce(p_referral_claim_window_days,7),'referral_requires_admin_approval',coalesce(p_referral_requires_admin_approval,false));
  insert into public.site_settings(setting_key,setting_value,is_public,description,updated_by,updated_at)
  values('premium_membership_policy',value,false,'Premium eligibility, referral validation and membership duration policy.',auth.uid(),now())
  on conflict(setting_key) do update set setting_value=excluded.setting_value,is_public=false,description=excluded.description,updated_by=auth.uid(),updated_at=now();
  insert into public.admin_audit_logs(actor_id,action,target_type,target_id,metadata)
  values(auth.uid(),'premium_policy_saved','site_setting','premium_membership_policy',value);
  return value;
end;
$$;

create or replace function public.admin_get_premium_targets(p_query text default null,p_limit integer default 80)
returns table(
  target_type text,target_id uuid,name text,owner_user_id uuid,verification_label text,
  follower_count integer,approved_referral_count integer,achievement_count integer,profile_completion_percent integer,
  requirements_complete boolean,membership_status text,is_premium boolean,membership_id uuid,expires_at timestamptz
)
language plpgsql
security definer
set search_path=public
as $$
begin
  if not public.is_admin_or_above() then raise exception 'Admin access required'; end if;
  return query
  with targets as (
    select 'doctor'::text t,d.id tid,coalesce(pr.full_name,pr.email,d.id::text) n,d.id owner,
      d.verification_status::text verification
    from public.doctors d join public.profiles pr on pr.id=d.id
    where pr.account_status='active' and (nullif(trim(coalesce(p_query,'')),'') is null or coalesce(pr.full_name,'') ilike '%'||trim(p_query)||'%' or coalesce(pr.email,'') ilike '%'||trim(p_query)||'%')
    union all
    select 'provider',p.id,p.name_bn,p.owner_user_id,case when p.verified and p.status='approved' then 'approved' else p.status::text end
    from public.providers p left join public.profiles o on o.id=p.owner_user_id
    where p.owner_user_id is not null and coalesce(o.account_status,'active'::public.account_status)='active'::public.account_status
      and (nullif(trim(coalesce(p_query,'')),'') is null or p.name_bn ilike '%'||trim(p_query)||'%' or coalesce(p.name_en,'') ilike '%'||trim(p_query)||'%')
  ), limited as (
    select * from targets order by n limit greatest(1,least(coalesce(p_limit,80),150))
  )
  select l.t,l.tid,l.n,l.owner,l.verification,
    coalesce((x.j->>'followers')::integer,0),coalesce((x.j->>'approved_referrals')::integer,0),coalesce((x.j->>'achievement_count')::integer,0),
    coalesce((x.j->>'profile_completion_percent')::integer,0),coalesce((x.j->>'requirements_complete')::boolean,false),
    coalesce(x.j->>'membership_status','inactive'),coalesce((x.j->>'is_premium')::boolean,false),
    nullif(x.j->>'membership_id','')::uuid,nullif(x.j->>'expires_at','')::timestamptz
  from limited l cross join lateral (select public.build_premium_progress(case when l.t='doctor' then l.tid else null end,case when l.t='provider' then l.tid else null end) j) x;
end;
$$;

create or replace function public.admin_decide_premium_membership(
  p_target_type text,p_target_id uuid,p_action text,p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare policy jsonb:=public.get_premium_policy_internal(); duration_days integer; expiry timestamptz; new_id uuid; doc_id uuid; prov_id uuid; progress jsonb;
begin
  if not public.is_admin_or_above() then raise exception 'Admin access required'; end if;
  if p_target_type='doctor' then
    doc_id:=p_target_id;
    perform 1 from public.doctors d join public.profiles pr on pr.id=d.id where d.id=doc_id and pr.account_status='active' for update of d;
    if not found then raise exception 'Active Doctor not found'; end if;
  elsif p_target_type='provider' then
    prov_id:=p_target_id;
    perform 1 from public.providers p join public.profiles pr on pr.id=p.owner_user_id where p.id=prov_id and pr.account_status='active' for update of p;
    if not found then raise exception 'Active Provider not found'; end if;
  else raise exception 'Invalid target type'; end if;
  if p_action not in ('approve','revoke','expire','pending') then raise exception 'Invalid Premium action'; end if;

  progress:=public.build_premium_progress(doc_id,prov_id);
  duration_days:=greatest(0,least(coalesce((policy->>'premium_duration_days')::integer,0),3650));
  expiry:=case when duration_days>0 then now()+make_interval(days=>duration_days) else null end;

  if p_action='approve' then
    update public.premium_memberships set status='cancelled',updated_at=now()
    where doctor_id is not distinct from doc_id and provider_id is not distinct from prov_id and status in ('active','pending');
    insert into public.premium_memberships(doctor_id,provider_id,plan_code,status,starts_at,expires_at,created_by,note)
    values(doc_id,prov_id,'premium','active',now(),expiry,auth.uid(),nullif(trim(coalesce(p_note,'')),'')) returning id into new_id;
  elsif p_action='pending' then
    update public.premium_memberships set status='cancelled',updated_at=now()
    where doctor_id is not distinct from doc_id and provider_id is not distinct from prov_id and status='pending';
    insert into public.premium_memberships(doctor_id,provider_id,plan_code,status,starts_at,expires_at,created_by,note)
    values(doc_id,prov_id,'premium','pending',null,null,auth.uid(),nullif(trim(coalesce(p_note,'')),'')) returning id into new_id;
  elsif p_action='expire' then
    update public.premium_memberships set status='expired',expires_at=coalesce(expires_at,now()),updated_at=now(),note=coalesce(nullif(trim(coalesce(p_note,'')),''),note)
    where doctor_id is not distinct from doc_id and provider_id is not distinct from prov_id and status='active';
  else
    update public.premium_memberships set status='cancelled',updated_at=now(),note=coalesce(nullif(trim(coalesce(p_note,'')),''),note)
    where doctor_id is not distinct from doc_id and provider_id is not distinct from prov_id and status in ('active','pending');
  end if;

  insert into public.admin_audit_logs(actor_id,action,target_type,target_id,metadata)
  values(auth.uid(),'premium_membership_'||p_action,p_target_type,p_target_id::text,jsonb_build_object('membership_id',new_id,'note',p_note,'requirements_complete',progress->'requirements_complete'));
  return public.build_premium_progress(doc_id,prov_id);
end;
$$;

-- -----------------------------------------------------------------------------
-- 6) Privileges. Public ranking continues to read Premium only through existing
-- publication-safe helpers; owners cannot directly mutate Premium status.
-- -----------------------------------------------------------------------------
revoke all on function public.get_or_create_my_referral_code() from public,anon;
grant execute on function public.get_or_create_my_referral_code() to authenticated,service_role;
revoke all on function public.claim_referral_code(text) from public,anon;
grant execute on function public.claim_referral_code(text) to authenticated,service_role;
revoke all on function public.admin_get_referral_queue(text,integer) from public,anon;
grant execute on function public.admin_get_referral_queue(text,integer) to authenticated,service_role;
revoke all on function public.admin_set_referral_status(uuid,text,text) from public,anon;
grant execute on function public.admin_set_referral_status(uuid,text,text) to authenticated,service_role;
revoke all on function public.admin_list_premium_achievement_rules() from public,anon;
grant execute on function public.admin_list_premium_achievement_rules() to authenticated,service_role;
revoke all on function public.admin_save_premium_achievement_rule(bigint,text,text,text,text,boolean,boolean,integer) from public,anon;
grant execute on function public.admin_save_premium_achievement_rule(bigint,text,text,text,text,boolean,boolean,integer) to authenticated,service_role;
revoke all on function public.admin_set_premium_achievement_award(bigint,uuid,uuid,boolean,text) from public,anon;
grant execute on function public.admin_set_premium_achievement_award(bigint,uuid,uuid,boolean,text) to authenticated,service_role;
revoke all on function public.get_my_premium_progress(uuid) from public,anon;
grant execute on function public.get_my_premium_progress(uuid) to authenticated,service_role;
revoke all on function public.request_my_premium_membership(uuid) from public,anon;
grant execute on function public.request_my_premium_membership(uuid) to authenticated,service_role;
revoke all on function public.get_admin_premium_policy() from public,anon;
grant execute on function public.get_admin_premium_policy() to authenticated,service_role;
revoke all on function public.save_admin_premium_policy(boolean,integer,integer,boolean,integer,boolean,integer,boolean,integer,integer,boolean) from public,anon;
grant execute on function public.save_admin_premium_policy(boolean,integer,integer,boolean,integer,boolean,integer,boolean,integer,integer,boolean) to authenticated,service_role;
revoke all on function public.admin_get_premium_targets(text,integer) from public,anon;
grant execute on function public.admin_get_premium_targets(text,integer) to authenticated,service_role;
revoke all on function public.admin_decide_premium_membership(text,uuid,text,text) from public,anon;
grant execute on function public.admin_decide_premium_membership(text,uuid,text,text) to authenticated,service_role;

-- Assertions: direct Premium/referral/achievement mutation remains unavailable.
do $assert$
begin
  if has_table_privilege('authenticated','public.premium_memberships','UPDATE') then raise exception 'STEP50: Premium direct update grant remains'; end if;
  if has_table_privilege('authenticated','public.referrals','INSERT') then raise exception 'STEP50: Referral direct insert grant remains'; end if;
  if has_table_privilege('authenticated','public.premium_achievement_awards','INSERT') then raise exception 'STEP50: Achievement direct insert grant remains'; end if;
end;
$assert$;

select 'STEP 50 PREMIUM MEMBERSHIP SYSTEM PASSED' as result;
