-- ============================================================
-- STEP 10 — AMBULANCE DIRECTORY + VERIFICATION WORKFLOW
-- Run ONLY this file after Step 09 has completed successfully.
-- Previous migrations are stored separately.
-- ============================================================

-- PostgreSQL enum additions become usable after this migration commits.
-- Functions below compare roles through role::text. The registration RPC
-- performs any role change dynamically when it is called later.
alter type public.user_role add value if not exists 'verification_officer';
alter type public.user_role add value if not exists 'ambulance';

-- ------------------------------------------------------------
-- NARROW VERIFICATION-STAFF CAPABILITY
-- This role can use verification RPCs, but it does not inherit Admin CMS
-- or user-management access because public.is_admin_or_above() is unchanged.
-- ------------------------------------------------------------
create or replace function public.is_verification_staff()
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select exists(
    select 1
    from public.profiles p
    where p.id=auth.uid()
      and p.account_status='active'
      and p.role::text in ('verification_officer','admin','super_admin')
  );
$$;

-- ------------------------------------------------------------
-- AMBULANCE LISTING
-- Pending/rejected listings are never exposed through public search.
-- ------------------------------------------------------------
create table if not exists public.ambulance_services (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  operator_name text not null,
  driver_name text,
  phone text not null,
  secondary_phone text,
  vehicle_registration_no text not null,
  vehicle_type text not null
    check (vehicle_type in ('ac','non_ac','icu','freezer','basic','other')),
  capabilities text[] not null default '{}'::text[],
  service_area text,
  address text not null,
  district_id bigint references public.districts(id) on delete set null,
  upazila_id bigint references public.upazilas(id) on delete set null,
  latitude double precision,
  longitude double precision,
  price_note text,
  operates_24_hours boolean not null default false,
  status public.provider_status not null default 'pending',
  verified boolean not null default false,
  admin_note text,
  verified_by uuid references public.profiles(id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (latitude is null or latitude between -90 and 90),
  check (longitude is null or longitude between -180 and 180)
);

create unique index if not exists ux_ambulance_vehicle_registration
  on public.ambulance_services(lower(vehicle_registration_no));

create index if not exists idx_ambulance_public_directory
  on public.ambulance_services(status,verified,district_id,upazila_id,vehicle_type);

create index if not exists idx_ambulance_owner
  on public.ambulance_services(owner_user_id,created_at desc);

-- ------------------------------------------------------------
-- AVAILABILITY + PRIVATE LIVE LOCATION
-- Public callers receive availability/distance only through the search RPC;
-- exact live coordinates are limited to the owner and verification staff.
-- ------------------------------------------------------------
create table if not exists public.ambulance_availability (
  ambulance_id uuid primary key
    references public.ambulance_services(id) on delete cascade,
  is_available boolean not null default false,
  current_latitude double precision,
  current_longitude double precision,
  location_accuracy_meters numeric(10,2),
  last_seen_at timestamptz,
  updated_at timestamptz not null default now(),
  check (current_latitude is null or current_latitude between -90 and 90),
  check (current_longitude is null or current_longitude between -180 and 180),
  check (
    (current_latitude is null and current_longitude is null)
    or (current_latitude is not null and current_longitude is not null)
  )
);

create index if not exists idx_ambulance_available_seen
  on public.ambulance_availability(is_available,last_seen_at desc);

-- ------------------------------------------------------------
-- VERIFICATION DOCUMENTS
-- storage_path points to a private Supabase Storage object.
-- ------------------------------------------------------------
create table if not exists public.ambulance_verification_documents (
  id uuid primary key default gen_random_uuid(),
  ambulance_id uuid not null
    references public.ambulance_services(id) on delete cascade,
  document_type text not null
    check (document_type in (
      'vehicle_registration','driver_license','national_id',
      'organization_document','vehicle_photo','other'
    )),
  storage_path text not null,
  uploaded_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(ambulance_id,document_type,storage_path)
);

create index if not exists idx_ambulance_documents_listing
  on public.ambulance_verification_documents(ambulance_id,created_at desc);

-- ------------------------------------------------------------
-- OPTIONAL HOSPITAL LINK WITH TWO-SIDED APPROVAL
-- A listing owner can request a link. The hospital owner or Admin must
-- approve before it appears publicly.
-- ------------------------------------------------------------
create table if not exists public.ambulance_hospital_links (
  ambulance_id uuid not null
    references public.ambulance_services(id) on delete cascade,
  hospital_id uuid not null
    references public.providers(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending','approved','rejected','removed')),
  requested_by uuid references public.profiles(id) on delete set null,
  reviewed_by uuid references public.profiles(id) on delete set null,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(ambulance_id,hospital_id)
);

create index if not exists idx_ambulance_hospital_status
  on public.ambulance_hospital_links(hospital_id,status,created_at desc);

-- Security-definer ownership helpers keep RLS policies from depending on
-- direct SELECT permission for the sensitive ambulance/provider base tables.
create or replace function public.is_ambulance_owner(p_ambulance_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select exists(
    select 1 from public.ambulance_services a
    where a.id=p_ambulance_id and a.owner_user_id=auth.uid()
  );
$$;

create or replace function public.can_edit_ambulance_documents(p_ambulance_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select exists(
    select 1 from public.ambulance_services a
    where a.id=p_ambulance_id
      and a.owner_user_id=auth.uid()
      and a.status<>'approved'
  );
$$;

create or replace function public.is_provider_owner(p_provider_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select exists(
    select 1 from public.providers p
    where p.id=p_provider_id and p.owner_user_id=auth.uid()
  );
$$;

-- ------------------------------------------------------------
-- UPDATED_AT TRIGGERS
-- ------------------------------------------------------------
drop trigger if exists set_ambulance_services_updated_at on public.ambulance_services;
create trigger set_ambulance_services_updated_at
before update on public.ambulance_services
for each row execute function public.set_updated_at();

drop trigger if exists set_ambulance_availability_updated_at on public.ambulance_availability;
create trigger set_ambulance_availability_updated_at
before update on public.ambulance_availability
for each row execute function public.set_updated_at();

drop trigger if exists set_ambulance_hospital_links_updated_at on public.ambulance_hospital_links;
create trigger set_ambulance_hospital_links_updated_at
before update on public.ambulance_hospital_links
for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- ROW LEVEL SECURITY
-- Direct mutation is deliberately not granted for core listing/status data;
-- authenticated users update only through whitelisted RPCs below.
-- ------------------------------------------------------------
alter table public.ambulance_services enable row level security;
alter table public.ambulance_availability enable row level security;
alter table public.ambulance_verification_documents enable row level security;
alter table public.ambulance_hospital_links enable row level security;

drop policy if exists "ambulance_public_owner_staff_read" on public.ambulance_services;
drop policy if exists "ambulance_owner_staff_read" on public.ambulance_services;
create policy "ambulance_owner_staff_read"
on public.ambulance_services for select
using (
  owner_user_id=auth.uid()
  or public.is_verification_staff()
);

drop policy if exists "ambulance_availability_private_read" on public.ambulance_availability;
create policy "ambulance_availability_private_read"
on public.ambulance_availability for select
using (
  public.is_ambulance_owner(ambulance_id)
  or public.is_verification_staff()
);

drop policy if exists "ambulance_documents_owner_staff_read" on public.ambulance_verification_documents;
create policy "ambulance_documents_owner_staff_read"
on public.ambulance_verification_documents for select
using (
  public.is_ambulance_owner(ambulance_id)
  or public.is_verification_staff()
);

drop policy if exists "ambulance_documents_owner_insert" on public.ambulance_verification_documents;
create policy "ambulance_documents_owner_insert"
on public.ambulance_verification_documents for insert
with check (
  uploaded_by=auth.uid()
  and public.is_ambulance_owner(ambulance_id)
);

drop policy if exists "ambulance_documents_owner_delete" on public.ambulance_verification_documents;
create policy "ambulance_documents_owner_delete"
on public.ambulance_verification_documents for delete
using (
  uploaded_by=auth.uid()
  and public.can_edit_ambulance_documents(ambulance_id)
);

drop policy if exists "ambulance_links_public_participant_read" on public.ambulance_hospital_links;
create policy "ambulance_links_public_participant_read"
on public.ambulance_hospital_links for select
using (
  public.is_ambulance_owner(ambulance_id)
  or public.is_provider_owner(hospital_id)
  or public.is_verification_staff()
);

-- Supabase projects commonly grant new public-schema tables by default.
-- Remove those broad grants first, then add only the operations required by
-- the owner document workflow. Listing reads go through safe RPC shapes.
revoke all on table
  public.ambulance_services,
  public.ambulance_availability,
  public.ambulance_verification_documents,
  public.ambulance_hospital_links
from anon,authenticated;

grant select on table
  public.ambulance_availability,
  public.ambulance_verification_documents,
  public.ambulance_hospital_links
to authenticated;

grant insert,delete on table public.ambulance_verification_documents
to authenticated;

-- ------------------------------------------------------------
-- SELF-REGISTRATION / ADMIN MANUAL ENTRY
-- Admin can pass an owner. Normal users can register only for themselves.
-- A patient account is converted to the ambulance role dynamically when
-- this RPC is called after the migration has committed.
-- ------------------------------------------------------------
create or replace function public.register_ambulance_service(
  p_operator_name text,
  p_phone text,
  p_vehicle_registration_no text,
  p_vehicle_type text,
  p_address text,
  p_driver_name text default null,
  p_secondary_phone text default null,
  p_capabilities text[] default '{}'::text[],
  p_service_area text default null,
  p_district_id bigint default null,
  p_upazila_id bigint default null,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_price_note text default null,
  p_operates_24_hours boolean default false,
  p_owner_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  target_owner uuid;
  caller_is_admin boolean;
  target_role text;
  new_ambulance_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  caller_is_admin := public.is_admin_or_above();
  target_owner := coalesce(p_owner_user_id,auth.uid());

  if target_owner<>auth.uid() and not caller_is_admin then
    raise exception 'Only Admin can register an ambulance for another user';
  end if;

  select p.role::text into target_role
  from public.profiles p
  where p.id=target_owner and p.account_status='active';

  if target_role is null then
    raise exception 'Active owner profile not found';
  end if;

  if target_role not in ('patient','ambulance','admin','super_admin') then
    raise exception 'This account role cannot own an ambulance listing';
  end if;

  if length(trim(coalesce(p_operator_name,'')))<2 then
    raise exception 'Operator name is required';
  end if;

  if length(regexp_replace(coalesce(p_phone,''),'[^0-9+]','','g'))<7 then
    raise exception 'A valid phone number is required';
  end if;

  if length(trim(coalesce(p_vehicle_registration_no,'')))<3 then
    raise exception 'Vehicle registration number is required';
  end if;

  if p_vehicle_type not in ('ac','non_ac','icu','freezer','basic','other') then
    raise exception 'Invalid vehicle type';
  end if;

  if length(trim(coalesce(p_address,'')))<3 then
    raise exception 'Address is required';
  end if;

  if (p_latitude is null) <> (p_longitude is null) then
    raise exception 'Latitude and longitude must be provided together';
  end if;

  if p_latitude is not null and not (p_latitude between -90 and 90) then
    raise exception 'Invalid latitude';
  end if;

  if p_longitude is not null and not (p_longitude between -180 and 180) then
    raise exception 'Invalid longitude';
  end if;

  insert into public.ambulance_services(
    owner_user_id,operator_name,driver_name,phone,secondary_phone,
    vehicle_registration_no,vehicle_type,capabilities,service_area,address,
    district_id,upazila_id,latitude,longitude,price_note,operates_24_hours
  ) values (
    target_owner,trim(p_operator_name),nullif(trim(p_driver_name),''),trim(p_phone),
    nullif(trim(p_secondary_phone),''),upper(trim(p_vehicle_registration_no)),
    p_vehicle_type,coalesce(p_capabilities,'{}'::text[]),nullif(trim(p_service_area),''),
    trim(p_address),p_district_id,p_upazila_id,p_latitude,p_longitude,
    nullif(trim(p_price_note),''),coalesce(p_operates_24_hours,false)
  )
  returning id into new_ambulance_id;

  insert into public.ambulance_availability(ambulance_id,is_available)
  values(new_ambulance_id,false);

  if target_role='patient' then
    execute
      'update public.profiles set role=$1::public.user_role,updated_at=now() where id=$2'
      using 'ambulance',target_owner;
  end if;

  insert into public.admin_audit_logs(
    actor_id,action,target_user_id,target_type,target_id,metadata
  ) values (
    auth.uid(),'ambulance_registered',target_owner,'ambulance',new_ambulance_id::text,
    jsonb_build_object('manual_admin_entry',target_owner<>auth.uid())
  );

  return new_ambulance_id;
end;
$$;

-- ------------------------------------------------------------
-- OWNER PROFILE UPDATE
-- Any change to identity/contact/location moves an approved listing back to
-- pending verification. Availability is managed separately and does not.
-- ------------------------------------------------------------
create or replace function public.update_my_ambulance_service(
  p_ambulance_id uuid,
  p_operator_name text,
  p_phone text,
  p_vehicle_registration_no text,
  p_vehicle_type text,
  p_address text,
  p_driver_name text default null,
  p_secondary_phone text default null,
  p_capabilities text[] default '{}'::text[],
  p_service_area text default null,
  p_district_id bigint default null,
  p_upazila_id bigint default null,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_price_note text default null,
  p_operates_24_hours boolean default false
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

  if length(trim(coalesce(p_operator_name,'')))<2
     or length(trim(coalesce(p_vehicle_registration_no,'')))<3
     or length(trim(coalesce(p_address,'')))<3 then
    raise exception 'Operator, vehicle registration and address are required';
  end if;

  if length(regexp_replace(coalesce(p_phone,''),'[^0-9+]','','g'))<7 then
    raise exception 'A valid phone number is required';
  end if;

  if p_vehicle_type not in ('ac','non_ac','icu','freezer','basic','other') then
    raise exception 'Invalid vehicle type';
  end if;

  if (p_latitude is null) <> (p_longitude is null) then
    raise exception 'Latitude and longitude must be provided together';
  end if;

  update public.ambulance_services a
  set operator_name=trim(p_operator_name),
      driver_name=nullif(trim(p_driver_name),''),
      phone=trim(p_phone),
      secondary_phone=nullif(trim(p_secondary_phone),''),
      vehicle_registration_no=upper(trim(p_vehicle_registration_no)),
      vehicle_type=p_vehicle_type,
      capabilities=coalesce(p_capabilities,'{}'::text[]),
      service_area=nullif(trim(p_service_area),''),
      address=trim(p_address),
      district_id=p_district_id,
      upazila_id=p_upazila_id,
      latitude=p_latitude,
      longitude=p_longitude,
      price_note=nullif(trim(p_price_note),''),
      operates_24_hours=coalesce(p_operates_24_hours,false),
      status='pending',
      verified=false,
      admin_note=null,
      verified_by=null,
      verified_at=null
  where a.id=p_ambulance_id
    and a.owner_user_id=auth.uid();

  if not found then
    raise exception 'Ambulance listing not found or access denied';
  end if;

  update public.ambulance_availability
  set is_available=false,last_seen_at=now()
  where ambulance_id=p_ambulance_id;

  return true;
end;
$$;

-- ------------------------------------------------------------
-- OWNER AVAILABILITY / LIVE LOCATION
-- An approved listing can advertise availability. Stale availability is
-- ignored by public search after 30 minutes when live tracking is present.
-- ------------------------------------------------------------
create or replace function public.set_my_ambulance_availability(
  p_ambulance_id uuid,
  p_is_available boolean,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_accuracy_meters numeric default null
)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
begin
  if not exists(
    select 1
    from public.ambulance_services a
    where a.id=p_ambulance_id
      and a.owner_user_id=auth.uid()
      and a.status='approved'
      and a.verified
  ) then
    raise exception 'Only an approved ambulance owner can update availability';
  end if;

  if (p_latitude is null) <> (p_longitude is null) then
    raise exception 'Latitude and longitude must be provided together';
  end if;

  if p_latitude is not null and not (p_latitude between -90 and 90) then
    raise exception 'Invalid latitude';
  end if;

  if p_longitude is not null and not (p_longitude between -180 and 180) then
    raise exception 'Invalid longitude';
  end if;

  insert into public.ambulance_availability(
    ambulance_id,is_available,current_latitude,current_longitude,
    location_accuracy_meters,last_seen_at
  ) values (
    p_ambulance_id,coalesce(p_is_available,false),p_latitude,p_longitude,
    p_accuracy_meters,now()
  )
  on conflict(ambulance_id) do update
  set is_available=excluded.is_available,
      current_latitude=excluded.current_latitude,
      current_longitude=excluded.current_longitude,
      location_accuracy_meters=excluded.location_accuracy_meters,
      last_seen_at=excluded.last_seen_at,
      updated_at=now();

  return true;
end;
$$;

-- ------------------------------------------------------------
-- HOSPITAL LINK REQUEST / RESPONSE
-- ------------------------------------------------------------
create or replace function public.request_ambulance_hospital_link(
  p_ambulance_id uuid,
  p_hospital_id uuid
)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
begin
  if not exists(
    select 1 from public.ambulance_services a
    where a.id=p_ambulance_id and a.owner_user_id=auth.uid()
  ) then
    raise exception 'Ambulance listing not found or access denied';
  end if;

  if not exists(
    select 1 from public.providers p
    where p.id=p_hospital_id and p.provider_type='hospital'
  ) then
    raise exception 'Hospital not found';
  end if;

  insert into public.ambulance_hospital_links(
    ambulance_id,hospital_id,status,requested_by,reviewed_by,review_note
  ) values (
    p_ambulance_id,p_hospital_id,'pending',auth.uid(),null,null
  )
  on conflict(ambulance_id,hospital_id) do update
  set status='pending',requested_by=auth.uid(),reviewed_by=null,
      review_note=null,updated_at=now();

  return true;
end;
$$;

create or replace function public.respond_to_ambulance_hospital_link(
  p_ambulance_id uuid,
  p_hospital_id uuid,
  p_status text,
  p_review_note text default null
)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
begin
  if p_status not in ('approved','rejected','removed') then
    raise exception 'Invalid link status';
  end if;

  if not (
    public.is_admin_or_above()
    or exists(
      select 1 from public.providers p
      where p.id=p_hospital_id
        and p.provider_type='hospital'
        and p.owner_user_id=auth.uid()
    )
  ) then
    raise exception 'Hospital owner or Admin access required';
  end if;

  update public.ambulance_hospital_links
  set status=p_status,reviewed_by=auth.uid(),
      review_note=nullif(trim(p_review_note),''),updated_at=now()
  where ambulance_id=p_ambulance_id and hospital_id=p_hospital_id;

  if not found then
    raise exception 'Hospital link request not found';
  end if;

  return true;
end;
$$;

create or replace function public.get_hospital_ambulance_link_requests(
  p_hospital_id uuid,
  p_status text default 'pending'
)
returns table(
  ambulance_id uuid,
  operator_name text,
  phone text,
  vehicle_registration_no text,
  vehicle_type text,
  ambulance_status public.provider_status,
  link_status text,
  requested_at timestamptz,
  review_note text
)
language plpgsql
stable
security definer
set search_path=public
as $$
begin
  if not (
    public.is_admin_or_above()
    or public.is_provider_owner(p_hospital_id)
  ) then
    raise exception 'Hospital owner or Admin access required';
  end if;

  return query
  select a.id,a.operator_name,a.phone,a.vehicle_registration_no,a.vehicle_type,
         a.status,l.status,l.created_at,l.review_note
  from public.ambulance_hospital_links l
  join public.ambulance_services a on a.id=l.ambulance_id
  where l.hospital_id=p_hospital_id
    and (p_status is null or l.status=p_status)
  order by l.created_at,a.id;
end;
$$;

-- ------------------------------------------------------------
-- VERIFICATION QUEUE
-- Oldest pending listing first. This returns operational contact details only
-- to Verification Officer/Admin/Super Admin.
-- ------------------------------------------------------------
create or replace function public.get_ambulance_verification_queue(
  p_limit integer default 30,
  p_offset integer default 0
)
returns table(
  ambulance_id uuid,
  owner_user_id uuid,
  operator_name text,
  driver_name text,
  phone text,
  vehicle_registration_no text,
  vehicle_type text,
  address text,
  district_id bigint,
  upazila_id bigint,
  document_count bigint,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path=public
as $$
begin
  if not public.is_verification_staff() then
    raise exception 'Verification staff access required';
  end if;

  return query
  select a.id,a.owner_user_id,a.operator_name,a.driver_name,a.phone,
         a.vehicle_registration_no,a.vehicle_type,a.address,
         a.district_id,a.upazila_id,
         (select count(*)
          from public.ambulance_verification_documents d
          where d.ambulance_id=a.id),
         a.created_at
  from public.ambulance_services a
  where a.status='pending'
  order by a.created_at,a.id
  limit greatest(1,least(p_limit,100))
  offset greatest(p_offset,0);
end;
$$;

create or replace function public.set_ambulance_verification(
  p_ambulance_id uuid,
  p_status text,
  p_admin_note text default null
)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare
  listing_owner uuid;
begin
  if not public.is_verification_staff() then
    raise exception 'Verification staff access required';
  end if;

  if p_status not in ('approved','rejected') then
    raise exception 'Status must be approved or rejected';
  end if;

  if p_status='rejected' and length(trim(coalesce(p_admin_note,'')))<3 then
    raise exception 'A rejection reason is required';
  end if;

  update public.ambulance_services
  set status=p_status::public.provider_status,
      verified=(p_status='approved'),
      admin_note=nullif(trim(p_admin_note),''),
      verified_by=auth.uid(),
      verified_at=now(),
      updated_at=now()
  where id=p_ambulance_id
  returning owner_user_id into listing_owner;

  if listing_owner is null then
    raise exception 'Ambulance listing not found';
  end if;

  if p_status='rejected' then
    update public.ambulance_availability
    set is_available=false,last_seen_at=now()
    where ambulance_id=p_ambulance_id;
  end if;

  insert into public.notifications(
    recipient_id,sender_id,type,title_bn,body_bn,data
  ) values (
    listing_owner,auth.uid(),'ambulance_verification',
    'অ্যাম্বুলেন্স ভেরিফিকেশন আপডেট',
    case
      when p_status='approved' then 'আপনার অ্যাম্বুলেন্স তালিকা অনুমোদিত হয়েছে। এখন availability চালু করতে পারবেন।'
      else 'আপনার অ্যাম্বুলেন্স তালিকা অনুমোদিত হয়নি। কারণ দেখে তথ্য সংশোধন করে আবার জমা দিন।'
    end,
    jsonb_build_object(
      'ambulance_id',p_ambulance_id,
      'status',p_status,
      'admin_note',nullif(trim(p_admin_note),'')
    )
  );

  insert into public.admin_audit_logs(
    actor_id,action,target_user_id,target_type,target_id,metadata
  ) values (
    auth.uid(),'ambulance_verification_changed',listing_owner,'ambulance',
    p_ambulance_id::text,
    jsonb_build_object('status',p_status,'admin_note',nullif(trim(p_admin_note),''))
  );

  return true;
end;
$$;

-- ------------------------------------------------------------
-- PUBLIC AMBULANCE SEARCH
-- Returns exact live coordinates to nobody. If caller location is provided,
-- distance is calculated from a fresh live location or the verified base pin.
-- ------------------------------------------------------------
create or replace function public.search_ambulances(
  p_district_id bigint default null,
  p_upazila_id bigint default null,
  p_vehicle_types text[] default null,
  p_available_only boolean default true,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_radius_km double precision default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table(
  ambulance_id uuid,
  operator_name text,
  driver_name text,
  phone text,
  secondary_phone text,
  vehicle_type text,
  capabilities text[],
  service_area text,
  address text,
  district_id bigint,
  district_name_bn text,
  upazila_id bigint,
  upazila_name_bn text,
  price_note text,
  operates_24_hours boolean,
  is_available boolean,
  distance_km double precision,
  hospital_id uuid,
  hospital_name_bn text,
  total_count bigint
)
language sql
stable
security definer
set search_path=public
as $$
  with candidates as (
    select
      a.id as ambulance_id,
      a.operator_name,
      a.driver_name,
      a.phone,
      a.secondary_phone,
      a.vehicle_type,
      a.capabilities,
      a.service_area,
      a.address,
      a.district_id,
      d.name_bn as district_name_bn,
      a.upazila_id,
      u.name_bn as upazila_name_bn,
      a.price_note,
      a.operates_24_hours,
      coalesce(av.is_available,false)
        and (
          av.current_latitude is null
          or av.last_seen_at >= now()-interval '30 minutes'
        ) as is_available,
      case
        when p_latitude is not null and p_longitude is not null
         and coalesce(
           case when av.last_seen_at >= now()-interval '30 minutes'
                then av.current_latitude end,
           a.latitude
         ) is not null
         and coalesce(
           case when av.last_seen_at >= now()-interval '30 minutes'
                then av.current_longitude end,
           a.longitude
         ) is not null
        then public.location_distance_km(
          p_latitude,p_longitude,
          coalesce(
            case when av.last_seen_at >= now()-interval '30 minutes'
                 then av.current_latitude end,
            a.latitude
          ),
          coalesce(
            case when av.last_seen_at >= now()-interval '30 minutes'
                 then av.current_longitude end,
            a.longitude
          )
        )
        else null
      end as distance_km,
      linked.hospital_id,
      linked.hospital_name_bn
    from public.ambulance_services a
    left join public.ambulance_availability av on av.ambulance_id=a.id
    left join public.districts d on d.id=a.district_id
    left join public.upazilas u on u.id=a.upazila_id
    left join lateral (
      select p.id as hospital_id,p.name_bn as hospital_name_bn
      from public.ambulance_hospital_links l
      join public.providers p on p.id=l.hospital_id
      where l.ambulance_id=a.id
        and l.status='approved'
        and p.provider_type='hospital'
        and p.status='approved'
        and p.verified
      order by l.updated_at desc
      limit 1
    ) linked on true
    where a.status='approved'
      and a.verified
      and (p_district_id is null or a.district_id=p_district_id)
      and (p_upazila_id is null or a.upazila_id=p_upazila_id)
      and (
        p_vehicle_types is null
        or cardinality(p_vehicle_types)=0
        or a.vehicle_type=any(p_vehicle_types)
      )
  ), filtered as (
    select *
    from candidates c
    where (not coalesce(p_available_only,true) or c.is_available)
      and (
        p_radius_km is null
        or (
          c.distance_km is not null
          and c.distance_km<=greatest(p_radius_km,0)
        )
      )
  )
  select
    f.ambulance_id,f.operator_name,f.driver_name,f.phone,f.secondary_phone,
    f.vehicle_type,f.capabilities,f.service_area,f.address,
    f.district_id,f.district_name_bn,f.upazila_id,f.upazila_name_bn,
    f.price_note,f.operates_24_hours,f.is_available,
    round(f.distance_km::numeric,2)::double precision,
    f.hospital_id,f.hospital_name_bn,
    count(*) over() as total_count
  from filtered f
  order by f.is_available desc,f.distance_km asc nulls last,f.operator_name,f.ambulance_id
  limit greatest(1,least(p_limit,100))
  offset greatest(p_offset,0);
$$;

-- ------------------------------------------------------------
-- OWNER DASHBOARD DATA
-- Includes rejection note and private availability for the authenticated
-- owner without exposing those fields through the public directory.
-- ------------------------------------------------------------
create or replace function public.get_my_ambulance_services()
returns table(
  ambulance_id uuid,
  operator_name text,
  driver_name text,
  phone text,
  secondary_phone text,
  vehicle_registration_no text,
  vehicle_type text,
  capabilities text[],
  service_area text,
  address text,
  district_id bigint,
  upazila_id bigint,
  latitude double precision,
  longitude double precision,
  price_note text,
  operates_24_hours boolean,
  status public.provider_status,
  verified boolean,
  admin_note text,
  verified_at timestamptz,
  is_available boolean,
  last_seen_at timestamptz,
  document_count bigint,
  hospital_links jsonb,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path=public
as $$
  select
    a.id,a.operator_name,a.driver_name,a.phone,a.secondary_phone,
    a.vehicle_registration_no,a.vehicle_type,a.capabilities,a.service_area,
    a.address,a.district_id,a.upazila_id,a.latitude,a.longitude,a.price_note,
    a.operates_24_hours,a.status,a.verified,a.admin_note,a.verified_at,
    coalesce(av.is_available,false),av.last_seen_at,
    (select count(*)
     from public.ambulance_verification_documents d
     where d.ambulance_id=a.id),
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'hospital_id',l.hospital_id,
          'hospital_name_bn',p.name_bn,
          'status',l.status,
          'review_note',l.review_note
        ) order by l.updated_at desc
      )
      from public.ambulance_hospital_links l
      join public.providers p on p.id=l.hospital_id
      where l.ambulance_id=a.id
    ),'[]'::jsonb),
    a.created_at,a.updated_at
  from public.ambulance_services a
  left join public.ambulance_availability av on av.ambulance_id=a.id
  where a.owner_user_id=auth.uid()
  order by a.created_at desc,a.id;
$$;

-- ------------------------------------------------------------
-- FUNCTION PRIVILEGES
-- ------------------------------------------------------------
revoke all on function public.is_verification_staff() from public,anon;
revoke all on function public.is_ambulance_owner(uuid) from public,anon;
revoke all on function public.can_edit_ambulance_documents(uuid) from public,anon;
revoke all on function public.is_provider_owner(uuid) from public,anon;
revoke all on function public.register_ambulance_service(
  text,text,text,text,text,text,text,text[],text,bigint,bigint,
  double precision,double precision,text,boolean,uuid
) from public,anon;
revoke all on function public.update_my_ambulance_service(
  uuid,text,text,text,text,text,text,text,text[],text,bigint,bigint,
  double precision,double precision,text,boolean
) from public,anon;
revoke all on function public.set_my_ambulance_availability(
  uuid,boolean,double precision,double precision,numeric
) from public,anon;
revoke all on function public.request_ambulance_hospital_link(uuid,uuid) from public,anon;
revoke all on function public.respond_to_ambulance_hospital_link(uuid,uuid,text,text) from public,anon;
revoke all on function public.get_hospital_ambulance_link_requests(uuid,text) from public,anon;
revoke all on function public.get_ambulance_verification_queue(integer,integer) from public,anon;
revoke all on function public.set_ambulance_verification(uuid,text,text) from public,anon;
revoke all on function public.search_ambulances(
  bigint,bigint,text[],boolean,double precision,double precision,
  double precision,integer,integer
) from public,anon;
revoke all on function public.get_my_ambulance_services() from public,anon;

grant execute on function public.is_verification_staff()
to authenticated,service_role;

grant execute on function public.is_ambulance_owner(uuid)
to authenticated,service_role;

grant execute on function public.can_edit_ambulance_documents(uuid)
to authenticated,service_role;

grant execute on function public.is_provider_owner(uuid)
to authenticated,service_role;

grant execute on function public.register_ambulance_service(
  text,text,text,text,text,text,text,text[],text,bigint,bigint,
  double precision,double precision,text,boolean,uuid
) to authenticated,service_role;

grant execute on function public.update_my_ambulance_service(
  uuid,text,text,text,text,text,text,text,text[],text,bigint,bigint,
  double precision,double precision,text,boolean
) to authenticated,service_role;

grant execute on function public.set_my_ambulance_availability(
  uuid,boolean,double precision,double precision,numeric
) to authenticated,service_role;

grant execute on function public.request_ambulance_hospital_link(uuid,uuid)
to authenticated,service_role;

grant execute on function public.respond_to_ambulance_hospital_link(uuid,uuid,text,text)
to authenticated,service_role;

grant execute on function public.get_hospital_ambulance_link_requests(uuid,text)
to authenticated,service_role;

grant execute on function public.get_ambulance_verification_queue(integer,integer)
to authenticated,service_role;

grant execute on function public.set_ambulance_verification(uuid,text,text)
to authenticated,service_role;

grant execute on function public.search_ambulances(
  bigint,bigint,text[],boolean,double precision,double precision,
  double precision,integer,integer
) to anon,authenticated,service_role;

grant execute on function public.get_my_ambulance_services()
to authenticated,service_role;

-- ============================================================
-- END STEP 10
-- ============================================================
