-- ============================================================
-- STEP 29 — GPS -> DISTRICT / UPAZILA CONTEXT RESOLVER
-- Reuses STEP 11 Bangladesh district/upazila reference coordinates and the
-- existing STEP 02 Haversine helper. No duplicate location table, hardcoded
-- district ID, RLS bypass, or third-party reverse-geocoding dependency.
-- ============================================================

create or replace function public.resolve_location_context(
  p_lat double precision,
  p_lon double precision
)
returns table(
  district_id bigint,
  district_name_bn text,
  district_name_en text,
  district_slug text,
  upazila_id bigint,
  upazila_name_bn text,
  upazila_name_en text,
  upazila_slug text,
  resolution_source text,
  distance_km double precision
)
language sql
stable
security invoker
set search_path=public
as $$
  with valid_input as (
    -- Bangladesh-inclusive guard. Outside coordinates intentionally return
    -- no district instead of silently selecting the nearest border district.
    select p_lat as lat,p_lon as lon
    where p_lat between 20.25 and 26.75
      and p_lon between 87.80 and 92.90
  ),
  nearest_five_upazilas as (
    select
      u.id as upazila_id,
      u.district_id,
      u.name_bn as upazila_name_bn,
      u.name_en as upazila_name_en,
      u.slug as upazila_slug,
      public.location_distance_km(v.lat,v.lon,u.latitude,u.longitude) as distance_km
    from valid_input v
    join public.upazilas u
      on u.is_active and u.latitude is not null and u.longitude is not null
    order by public.location_distance_km(v.lat,v.lon,u.latitude,u.longitude),u.id
    limit 5
  ),
  district_scores as (
    -- A small centroid cluster is more stable near administrative borders
    -- than assigning the district from only one reference point.
    select
      district_id,
      sum(1.0/(distance_km+1.0)) as weighted_score,
      min(distance_km) as nearest_distance
    from nearest_five_upazilas
    group by district_id
  ),
  winning_district as (
    select district_id
    from district_scores
    order by weighted_score desc,nearest_distance,district_id
    limit 1
  ),
  nearest_upazila_in_winner as (
    select
      d.id as district_id,
      d.name_bn as district_name_bn,
      d.name_en as district_name_en,
      d.slug as district_slug,
      u.id as upazila_id,
      u.name_bn as upazila_name_bn,
      u.name_en as upazila_name_en,
      u.slug as upazila_slug,
      public.location_distance_km(v.lat,v.lon,u.latitude,u.longitude) as distance_km
    from valid_input v
    join winning_district w on true
    join public.districts d on d.id=w.district_id and d.is_active
    join public.upazilas u
      on u.district_id=d.id and u.is_active
     and u.latitude is not null and u.longitude is not null
    order by public.location_distance_km(v.lat,v.lon,u.latitude,u.longitude),u.id
    limit 1
  ),
  nearest_district as (
    select
      d.id as district_id,
      d.name_bn as district_name_bn,
      d.name_en as district_name_en,
      d.slug as district_slug,
      public.location_distance_km(v.lat,v.lon,d.latitude,d.longitude) as distance_km
    from valid_input v
    join public.districts d
      on d.is_active and d.latitude is not null and d.longitude is not null
    order by public.location_distance_km(v.lat,v.lon,d.latitude,d.longitude),d.id
    limit 1
  )
  select
    u.district_id,
    u.district_name_bn,
    u.district_name_en,
    u.district_slug,
    u.upazila_id,
    u.upazila_name_bn,
    u.upazila_name_en,
    u.upazila_slug,
    'upazila_centroid_cluster'::text,
    round(u.distance_km::numeric,2)::double precision
  from nearest_upazila_in_winner u

  union all

  select
    d.district_id,
    d.district_name_bn,
    d.district_name_en,
    d.district_slug,
    null::bigint,
    null::text,
    null::text,
    null::text,
    'district_centroid'::text,
    round(d.distance_km::numeric,2)::double precision
  from nearest_district d
  where not exists(select 1 from nearest_upazila_in_winner)

  limit 1;
$$;

revoke all on function public.resolve_location_context(double precision,double precision) from public;
grant execute on function public.resolve_location_context(double precision,double precision) to anon,authenticated;
