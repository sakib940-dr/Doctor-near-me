-- ============================================================
-- STEP 43 — VISITOR CARD CONTEXT + PATIENT BLOOD MODULE ACCESS
-- Depends on migrations 01–42.
-- Reuses all existing Doctor/Provider/Blood tables; creates no duplicate entity tables.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Public Doctor card context (batch-safe)
-- Provides one approved/public chamber/hospital context per Doctor for compact cards.
-- ------------------------------------------------------------
create or replace function public.get_public_doctor_card_context(p_doctor_ids uuid[])
returns table(
  doctor_id uuid,
  provider_id uuid,
  provider_name text,
  provider_type text,
  provider_address text,
  provider_latitude double precision,
  provider_longitude double precision
)
language sql
stable
security definer
set search_path=public
as $$
  select d.id,
         chamber.id,
         chamber.name_bn,
         chamber.provider_type,
         chamber.address,
         chamber.latitude,
         chamber.longitude
  from public.doctors d
  join public.profiles prof on prof.id=d.id
  left join lateral (
    select pr.id,pr.name_bn,pr.provider_type,pr.address,pr.latitude,pr.longitude
    from public.doctor_provider_links l
    join public.providers pr on pr.id=l.provider_id
    where l.doctor_id=d.id
      and l.status='approved'
      and pr.status='approved'
      and pr.verified=true
    order by
      case when prof.upazila_id is not null and pr.upazila_id=prof.upazila_id then 0 else 1 end,
      case when prof.district_id is not null and pr.district_id=prof.district_id then 0 else 1 end,
      case when pr.provider_type='chamber' then 0 else 1 end,
      pr.name_bn,
      pr.id
    limit 1
  ) chamber on true
  where d.id=any(coalesce(p_doctor_ids,'{}'::uuid[]))
    and prof.account_status='active'
    and public.is_doctor_publicly_listable(d.id)
  order by prof.full_name,d.id;
$$;

revoke all on function public.get_public_doctor_card_context(uuid[]) from public;
grant execute on function public.get_public_doctor_card_context(uuid[]) to anon,authenticated,service_role;

-- ------------------------------------------------------------
-- 2) Patient Blood Bank safe read model
-- Existing blood tables/functions from migrations 05 and 08 are reused.
-- ------------------------------------------------------------
create or replace function public.get_my_blood_donor_profile()
returns table(
  blood_group text,
  is_volunteer boolean,
  phone_public boolean,
  last_donation_date date,
  available_for_requests boolean,
  district_id bigint,
  upazila_id bigint,
  latitude double precision,
  longitude double precision,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path=public
as $$
  select b.blood_group,b.is_volunteer,b.phone_public,b.last_donation_date,
         b.available_for_requests,b.district_id,b.upazila_id,b.latitude,b.longitude,b.updated_at
  from public.blood_donor_profiles b
  join public.profiles p on p.id=b.user_id
  where b.user_id=auth.uid()
    and p.role='patient'
    and p.account_status='active';
$$;

create or replace function public.get_my_blood_requests()
returns table(
  request_id uuid,
  patient_name text,
  blood_group text,
  units_needed integer,
  hospital_name text,
  hospital_address text,
  district_id bigint,
  upazila_id bigint,
  needed_at timestamptz,
  reason text,
  contact_phone text,
  status text,
  response_count bigint,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path=public
as $$
  select r.id,r.patient_name,r.blood_group,r.units_needed,r.hospital_name,r.hospital_address,
         r.district_id,r.upazila_id,r.needed_at,r.reason,r.contact_phone,r.status,
         (select count(*) from public.blood_request_responses x where x.request_id=r.id),
         r.created_at,r.updated_at
  from public.blood_requests r
  join public.profiles p on p.id=r.requester_id
  where r.requester_id=auth.uid()
    and p.role='patient'
    and p.account_status='active'
  order by r.created_at desc,r.id;
$$;

-- Replace the legacy SECURITY INVOKER donor search. The old RLS policy intentionally
-- hides other patients' donor rows, so the public-safe search could return only self.
-- This DEFINER function exposes only consented, non-sensitive donor fields.
create or replace function public.search_blood_donors(
  p_blood_group text,
  p_district_id bigint default null,
  p_upazila_id bigint default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table(
  donor_id uuid,
  donor_name text,
  phone text,
  blood_group text,
  district_id bigint,
  upazila_id bigint,
  last_donation_date date
)
language plpgsql
stable
security definer
set search_path=public
as $$
begin
  if auth.uid() is null or not exists(
    select 1 from public.profiles p
    where p.id=auth.uid() and p.role='patient' and p.account_status='active'
  ) then
    raise exception 'Only active patient accounts can search the blood bank';
  end if;

  if nullif(trim(p_blood_group),'') is null
     or upper(trim(p_blood_group)) not in ('A+','A-','B+','B-','AB+','AB-','O+','O-') then
    raise exception 'Valid blood group is required';
  end if;

  return query
  select p.id,p.full_name,
         case when b.phone_public=true and p.public_phone=true then p.phone else null end,
         b.blood_group,b.district_id,b.upazila_id,b.last_donation_date
  from public.blood_donor_profiles b
  join public.profiles p on p.id=b.user_id
  where b.is_volunteer=true
    and b.available_for_requests=true
    and p.account_status='active'
    and p.role='patient'
    and upper(b.blood_group)=upper(trim(p_blood_group))
    and (p_district_id is null or b.district_id=p_district_id)
    and (p_upazila_id is null or b.upazila_id=p_upazila_id)
  order by
    case when p_upazila_id is not null and b.upazila_id=p_upazila_id then 0 else 1 end,
    case when p_district_id is not null and b.district_id=p_district_id then 0 else 1 end,
    b.last_donation_date nulls first,
    p.full_name,p.id
  limit greatest(1,least(coalesce(p_limit,20),100))
  offset greatest(coalesce(p_offset,0),0);
end;
$$;

revoke all on function public.get_my_blood_donor_profile() from public,anon;
grant execute on function public.get_my_blood_donor_profile() to authenticated,service_role;
revoke all on function public.get_my_blood_requests() from public,anon;
grant execute on function public.get_my_blood_requests() to authenticated,service_role;
revoke all on function public.search_blood_donors(text,bigint,bigint,integer,integer) from public,anon;
grant execute on function public.search_blood_donors(text,bigint,bigint,integer,integer) to authenticated,service_role;

-- Reassert existing patient blood mutation function grants explicitly.
revoke all on function public.upsert_my_blood_donor_profile(text,boolean,boolean,date,boolean,bigint,bigint,double precision,double precision) from public,anon;
grant execute on function public.upsert_my_blood_donor_profile(text,boolean,boolean,date,boolean,bigint,bigint,double precision,double precision) to authenticated,service_role;
revoke all on function public.create_blood_request_and_notify(text,text,integer,text,text,bigint,bigint,timestamptz,text,text) from public,anon;
grant execute on function public.create_blood_request_and_notify(text,text,integer,text,text,bigint,bigint,timestamptz,text,text) to authenticated,service_role;
revoke all on function public.get_my_blood_request_responses(uuid) from public,anon;
grant execute on function public.get_my_blood_request_responses(uuid) to authenticated,service_role;
revoke all on function public.cancel_my_blood_request(uuid) from public,anon;
grant execute on function public.cancel_my_blood_request(uuid) to authenticated,service_role;

-- Guardrail: this migration must not weaken table RLS.
DO $$
begin
  if not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='blood_donor_profiles' and c.relrowsecurity) then
    raise exception 'STEP 43 failed: blood_donor_profiles RLS must stay enabled';
  end if;
end $$;

-- ============================================================
-- END STEP 43
-- ============================================================
