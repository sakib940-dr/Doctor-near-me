-- ============================================================
-- STEP 25 — NEAREST DOCTORS PUBLIC RPC SECURITY FIX
-- Safe to re-run on an existing database.
--
-- nearest_doctors joins public.profiles and public.doctor_provider_links.
-- Anonymous visitors intentionally do not have direct SELECT access to those
-- private tables, so this public-safe RPC must execute as its owner and expose
-- only the explicit return columns below.
-- ============================================================

create or replace function public.nearest_doctors(
  p_lat double precision,
  p_lon double precision,
  p_radius_km double precision default 50,
  p_district_id bigint default null,
  p_upazila_id bigint default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table(
  doctor_id uuid,
  provider_id uuid,
  doctor_name text,
  degree text,
  designation text,
  consultation_fee numeric,
  provider_name text,
  provider_type text,
  address text,
  district_id bigint,
  upazila_id bigint,
  latitude double precision,
  longitude double precision,
  distance_km double precision
)
language sql
stable
security definer
set search_path=public
as $$
select d.id,p.id,pr.full_name,d.degree,d.designation,d.consultation_fee,p.name_bn,p.provider_type,p.address,
p.district_id,p.upazila_id,p.latitude,p.longitude,
round(public.location_distance_km(p_lat,p_lon,p.latitude,p.longitude)::numeric,2)::double precision
from public.doctors d join public.profiles pr on pr.id=d.id
join public.doctor_provider_links l on l.doctor_id=d.id and l.status='approved'
join public.providers p on p.id=l.provider_id and p.status='approved' and p.verified=true
where d.verification_status='approved' and p.latitude is not null and p.longitude is not null
and public.location_distance_km(p_lat,p_lon,p.latitude,p.longitude)<=greatest(p_radius_km,0)
and (p_district_id is null or p.district_id=p_district_id)
and (p_upazila_id is null or p.upazila_id=p_upazila_id)
order by public.location_distance_km(p_lat,p_lon,p.latitude,p.longitude),pr.full_name
limit greatest(1,least(p_limit,100)) offset greatest(p_offset,0);
$$;

revoke all on function public.nearest_doctors(
  double precision,
  double precision,
  double precision,
  bigint,
  bigint,
  integer,
  integer
) from public;

grant execute on function public.nearest_doctors(
  double precision,
  double precision,
  double precision,
  bigint,
  bigint,
  integer,
  integer
) to anon,authenticated,service_role;
