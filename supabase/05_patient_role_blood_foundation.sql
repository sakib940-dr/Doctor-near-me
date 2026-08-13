-- ============================================================
-- STEP 5 — ROLE / PATIENT ACCOUNT FOUNDATION
-- Depends on 01–04 already being successfully applied.
-- Run ONLY this file now.
-- No cumulative migration.
-- ============================================================

-- ------------------------------------------------------------
-- PATIENT PROFILE EXTENSIONS
-- ------------------------------------------------------------
alter table public.profiles
  add column if not exists address_line text,
  add column if not exists emergency_contact_name text,
  add column if not exists emergency_contact_phone text,
  add column if not exists preferred_language text not null default 'bn',
  add column if not exists profile_completed boolean not null default false;

create index if not exists idx_profiles_district_upazila
  on public.profiles(district_id, upazila_id);

-- ------------------------------------------------------------
-- PATIENT / BLOOD DONOR FOUNDATION
-- Patient can voluntarily become a public blood donor.
-- Phone is public ONLY when volunteer + public_phone are both true.
-- ------------------------------------------------------------
create table if not exists public.blood_donor_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  blood_group text not null,
  is_volunteer boolean not null default false,
  phone_public boolean not null default false,
  last_donation_date date,
  available_for_requests boolean not null default true,
  district_id bigint references public.districts(id) on delete set null,
  upazila_id bigint references public.upazilas(id) on delete set null,
  latitude double precision,
  longitude double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_blood_donors_search
  on public.blood_donor_profiles(blood_group,district_id,upazila_id,is_volunteer,available_for_requests);

-- ------------------------------------------------------------
-- BLOOD REQUEST FOUNDATION
-- ------------------------------------------------------------
create table if not exists public.blood_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  patient_name text not null,
  blood_group text not null,
  units_needed integer not null default 1 check (units_needed between 1 and 20),
  hospital_name text,
  hospital_address text,
  district_id bigint references public.districts(id) on delete set null,
  upazila_id bigint references public.upazilas(id) on delete set null,
  needed_at timestamptz,
  reason text,
  contact_phone text,
  status text not null default 'open'
    check(status in ('open','partially_fulfilled','fulfilled','cancelled','expired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_blood_requests_search
  on public.blood_requests(status,blood_group,district_id,upazila_id,needed_at);

-- ------------------------------------------------------------
-- BLOOD REQUEST NOTIFICATIONS / RESPONSES
-- ------------------------------------------------------------
create table if not exists public.blood_request_responses (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.blood_requests(id) on delete cascade,
  donor_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'interested'
    check(status in ('interested','contacted','accepted','declined','completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(request_id,donor_id)
);

create index if not exists idx_blood_response_request
  on public.blood_request_responses(request_id,status);

-- ------------------------------------------------------------
-- ROLE DASHBOARD ROUTING RPC
-- Returns only the authenticated user's role/status.
-- Frontend should use this after login and redirect accordingly.
-- ------------------------------------------------------------
create or replace function public.get_my_account_context()
returns jsonb
language sql
stable
security invoker
set search_path=public
as $$
  select jsonb_build_object(
    'user_id',p.id,
    'role',p.role,
    'account_status',p.account_status,
    'full_name',p.full_name,
    'avatar_url',p.avatar_url,
    'profile_completed',p.profile_completed
  )
  from public.profiles p
  where p.id=auth.uid();
$$;

-- ------------------------------------------------------------
-- PATIENT SELF PROFILE RPC
-- Frontend can update patient-safe fields without exposing
-- admin-only role/status fields.
-- ------------------------------------------------------------
create or replace function public.update_my_patient_profile(
  p_full_name text default null,
  p_phone text default null,
  p_date_of_birth date default null,
  p_gender text default null,
  p_blood_group text default null,
  p_address_line text default null,
  p_district_id bigint default null,
  p_upazila_id bigint default null,
  p_emergency_contact_name text default null,
  p_emergency_contact_phone text default null
)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  update public.profiles
  set full_name=coalesce(p_full_name,full_name),
      phone=coalesce(p_phone,phone),
      date_of_birth=coalesce(p_date_of_birth,date_of_birth),
      gender=coalesce(p_gender,gender),
      blood_group=coalesce(p_blood_group,blood_group),
      address_line=coalesce(p_address_line,address_line),
      district_id=coalesce(p_district_id,district_id),
      upazila_id=coalesce(p_upazila_id,upazila_id),
      emergency_contact_name=coalesce(p_emergency_contact_name,emergency_contact_name),
      emergency_contact_phone=coalesce(p_emergency_contact_phone,emergency_contact_phone),
      profile_completed=true,
      updated_at=now()
  where id=auth.uid();

  return found;
end;
$$;

-- ------------------------------------------------------------
-- BLOOD DONOR SELF MANAGEMENT
-- ------------------------------------------------------------
create or replace function public.upsert_my_blood_donor_profile(
  p_blood_group text,
  p_is_volunteer boolean,
  p_phone_public boolean default false,
  p_last_donation_date date default null,
  p_available_for_requests boolean default true,
  p_district_id bigint default null,
  p_upazila_id bigint default null,
  p_latitude double precision default null,
  p_longitude double precision default null
)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists(
    select 1 from public.profiles
    where id=auth.uid() and role='patient' and account_status='active'
  ) then
    raise exception 'Only active patient accounts can register as voluntary donors';
  end if;

  insert into public.blood_donor_profiles(
    user_id,blood_group,is_volunteer,phone_public,last_donation_date,
    available_for_requests,district_id,upazila_id,latitude,longitude
  )
  values(
    auth.uid(),upper(trim(p_blood_group)),p_is_volunteer,
    case when p_is_volunteer then p_phone_public else false end,
    p_last_donation_date,p_available_for_requests,p_district_id,p_upazila_id,
    p_latitude,p_longitude
  )
  on conflict(user_id) do update set
    blood_group=excluded.blood_group,
    is_volunteer=excluded.is_volunteer,
    phone_public=excluded.phone_public,
    last_donation_date=excluded.last_donation_date,
    available_for_requests=excluded.available_for_requests,
    district_id=excluded.district_id,
    upazila_id=excluded.upazila_id,
    latitude=excluded.latitude,
    longitude=excluded.longitude,
    updated_at=now();

  return true;
end;
$$;

-- ------------------------------------------------------------
-- SAFE PUBLIC BLOOD DONOR SEARCH
-- Only volunteers with public phone consent are returned.
-- Exact donor coordinates are NOT returned.
-- ------------------------------------------------------------
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
language sql
stable
security invoker
set search_path=public
as $$
  select p.id,p.full_name,
         case when b.phone_public=true and p.public_phone=true then p.phone else null end,
         b.blood_group,b.district_id,b.upazila_id,b.last_donation_date
  from public.blood_donor_profiles b
  join public.profiles p on p.id=b.user_id
  where b.is_volunteer=true
    and b.available_for_requests=true
    and p.account_status='active'
    and upper(b.blood_group)=upper(trim(p_blood_group))
    and (p_district_id is null or b.district_id=p_district_id)
    and (p_upazila_id is null or b.upazila_id=p_upazila_id)
  order by
    case when p_upazila_id is not null and b.upazila_id=p_upazila_id then 0 else 1 end,
    b.last_donation_date nulls first,
    p.full_name
  limit greatest(1,least(p_limit,100))
  offset greatest(p_offset,0);
$$;

-- ------------------------------------------------------------
-- RLS — BLOOD DONOR DATA
-- ------------------------------------------------------------
alter table public.blood_donor_profiles enable row level security;
alter table public.blood_requests enable row level security;
alter table public.blood_request_responses enable row level security;

drop policy if exists "blood_donor_own_or_admin" on public.blood_donor_profiles;
create policy "blood_donor_own_or_admin"
on public.blood_donor_profiles
for all
using(user_id=auth.uid() or public.is_admin_or_above())
with check(user_id=auth.uid() or public.is_admin_or_above());

drop policy if exists "blood_requests_owner_or_admin" on public.blood_requests;
create policy "blood_requests_owner_or_admin"
on public.blood_requests
for select
using(requester_id=auth.uid() or public.is_admin_or_above());

drop policy if exists "blood_requests_insert_patient" on public.blood_requests;
create policy "blood_requests_insert_patient"
on public.blood_requests
for insert
with check(requester_id=auth.uid());

drop policy if exists "blood_requests_update_owner_or_admin" on public.blood_requests;
create policy "blood_requests_update_owner_or_admin"
on public.blood_requests
for update
using(requester_id=auth.uid() or public.is_admin_or_above())
with check(requester_id=auth.uid() or public.is_admin_or_above());

drop policy if exists "blood_responses_participant" on public.blood_request_responses;
create policy "blood_responses_participant"
on public.blood_request_responses
for select
using(
  donor_id=auth.uid()
  or exists(
    select 1 from public.blood_requests r
    where r.id=request_id and r.requester_id=auth.uid()
  )
  or public.is_admin_or_above()
);

drop policy if exists "blood_responses_donor_insert" on public.blood_request_responses;
create policy "blood_responses_donor_insert"
on public.blood_request_responses
for insert
with check(
  donor_id=auth.uid()
  and exists(
    select 1 from public.blood_donor_profiles b
    where b.user_id=auth.uid()
      and b.is_volunteer=true
      and b.available_for_requests=true
  )
);

drop policy if exists "blood_responses_participant_update" on public.blood_request_responses;
create policy "blood_responses_participant_update"
on public.blood_request_responses
for update
using(
  donor_id=auth.uid()
  or exists(
    select 1 from public.blood_requests r
    where r.id=request_id and r.requester_id=auth.uid()
  )
  or public.is_admin_or_above()
)
with check(
  donor_id=auth.uid()
  or exists(
    select 1 from public.blood_requests r
    where r.id=request_id and r.requester_id=auth.uid()
  )
  or public.is_admin_or_above()
);

-- ------------------------------------------------------------
-- TIMESTAMP TRIGGERS
-- ------------------------------------------------------------
drop trigger if exists trg_blood_donor_updated_at on public.blood_donor_profiles;
create trigger trg_blood_donor_updated_at
before update on public.blood_donor_profiles
for each row execute procedure public.set_updated_at();

drop trigger if exists trg_blood_requests_updated_at on public.blood_requests;
create trigger trg_blood_requests_updated_at
before update on public.blood_requests
for each row execute procedure public.set_updated_at();

drop trigger if exists trg_blood_responses_updated_at on public.blood_request_responses;
create trigger trg_blood_responses_updated_at
before update on public.blood_request_responses
for each row execute procedure public.set_updated_at();

-- ============================================================
-- END STEP 5
-- ============================================================
