-- ============================================================
-- STEP 60 — DHAKA DISTRICT CITY-AREA LOCATION EXTENSION
-- Preserve the existing District -> upazila_id architecture.
-- Dhaka's five administrative Upazilas remain administrative Upazilas.
-- Major Dhaka city areas are stored in the same second-level table with
-- explicit metadata so they are never represented as administrative Upazilas.
-- Other districts remain unchanged.
-- ============================================================

alter table public.upazilas
  add column if not exists location_type text not null default 'upazila';

alter table public.upazilas
  add column if not exists city_corporation text;

do $$ begin
  alter table public.upazilas
    add constraint upazilas_location_type_check
    check (location_type in ('upazila','city_area'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.upazilas
    add constraint upazilas_city_corporation_check
    check (city_corporation is null or city_corporation in ('north','south'));
exception when duplicate_object then null; end $$;

-- Every pre-existing Bangladesh reference row remains an administrative Upazila.
update public.upazilas
set location_type='upazila'
where location_type is null or location_type not in ('upazila','city_area');

-- Explicitly preserve the five real Dhaka District Upazilas.
with dhaka as (
  select id from public.districts where slug='dhaka' and is_active limit 1
)
update public.upazilas u
set location_type='upazila', city_corporation=null, is_active=true
from dhaka d
where u.district_id=d.id
  and u.slug in ('savar','dhamrai','keraniganj','dohar','nawabganj');

-- Do not delete/deactivate a possible legacy generic Dhaka row: an old
-- production record may still reference that ID. New selectors and the GPS
-- resolver explicitly hide/ignore those generic slugs instead, preserving old
-- foreign keys while preventing any new "Dhaka Sadar/Main Dhaka" selection.

-- Major Dhaka city areas. source_code is DOCBD-specific, not an administrative code.
with dhaka as (
  select id from public.districts where slug='dhaka' and is_active limit 1
), incoming(name_bn,name_en,slug,latitude,longitude,city_corporation,source_code) as (
  values
    ('মিরপুর','Mirpur','mirpur',23.8223,90.3654,'north','DOCBD-DHAKA-MIRPUR'),
    ('উত্তরা','Uttara','uttara',23.8759,90.3795,'north','DOCBD-DHAKA-UTTARA'),
    ('বনানী','Banani','banani',23.7937,90.4066,'north','DOCBD-DHAKA-BANANI'),
    ('গুলশান','Gulshan','gulshan',23.7929,90.4186,'north','DOCBD-DHAKA-GULSHAN'),
    ('ধানমন্ডি','Dhanmondi','dhanmondi',23.7461,90.3742,'south','DOCBD-DHAKA-DHANMONDI'),
    ('মোহাম্মদপুর','Mohammadpur','mohammadpur',23.7660,90.3586,'north','DOCBD-DHAKA-MOHAMMADPUR'),
    ('বাড্ডা','Badda','badda',23.7806,90.4267,'north','DOCBD-DHAKA-BADDA'),
    ('বসুন্ধরা','Bashundhara','bashundhara',23.8190,90.4278,'north','DOCBD-DHAKA-BASHUNDHARA'),
    ('রামপুরা','Rampura','rampura',23.7615,90.4197,null,'DOCBD-DHAKA-RAMPURA'),
    ('খিলগাঁও','Khilgaon','khilgaon',23.7516,90.4244,'south','DOCBD-DHAKA-KHILGAON'),
    ('তেজগাঁও','Tejgaon','tejgaon',23.7639,90.3910,'north','DOCBD-DHAKA-TEJGAON'),
    ('ফার্মগেট','Farmgate','farmgate',23.7588,90.3897,'north','DOCBD-DHAKA-FARMGATE'),
    ('মতিঝিল','Motijheel','motijheel',23.7330,90.4172,'south','DOCBD-DHAKA-MOTIJHEEL'),
    ('যাত্রাবাড়ী','Jatrabari','jatrabari',23.7107,90.4344,'south','DOCBD-DHAKA-JATRABARI'),
    ('ওয়ারী','Wari','wari',23.7176,90.4170,'south','DOCBD-DHAKA-WARI'),
    ('রমনা','Ramna','ramna',23.7373,90.3954,'south','DOCBD-DHAKA-RAMNA'),
    ('পল্লবী','Pallabi','pallabi',23.8294,90.3660,'north','DOCBD-DHAKA-PALLABI')
)
insert into public.upazilas(
  district_id,name_bn,name_en,slug,is_active,source_code,latitude,longitude,
  location_type,city_corporation
)
select d.id,i.name_bn,i.name_en,i.slug,true,i.source_code,i.latitude,i.longitude,
       'city_area',i.city_corporation
from incoming i cross join dhaka d
on conflict(district_id,slug) do update
set name_bn=excluded.name_bn,
    name_en=excluded.name_en,
    is_active=true,
    source_code=excluded.source_code,
    latitude=excluded.latitude,
    longitude=excluded.longitude,
    location_type='city_area',
    city_corporation=excluded.city_corporation;

create index if not exists idx_upazilas_district_type_active
  on public.upazilas(district_id,location_type,is_active,name_bn);

-- GPS resolver: keep the existing administrative cluster logic for the whole
-- country. Dhaka city areas are considered only inside a bounded Dhaka urban
-- envelope and only when a city-area centroid is close enough to be useful.
-- If Dhaka district is resolved but no second-level location is confident,
-- return district-only so the UI safely falls back to All Areas.
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
    select p_lat as lat,p_lon as lon
    where p_lat between 20.25 and 26.75
      and p_lon between 87.80 and 92.90
  ),
  dhaka_district as (
    select id,name_bn,name_en,slug,latitude,longitude
    from public.districts
    where slug='dhaka' and is_active
    limit 1
  ),
  nearest_dhaka_city_area as (
    select
      u.id,u.district_id,u.name_bn,u.name_en,u.slug,u.location_type,
      public.location_distance_km(v.lat,v.lon,u.latitude,u.longitude) as distance_km
    from valid_input v
    join dhaka_district dd on true
    join public.upazilas u
      on u.district_id=dd.id
     and u.is_active
     and u.location_type='city_area'
     and u.latitude is not null and u.longitude is not null
    order by public.location_distance_km(v.lat,v.lon,u.latitude,u.longitude),u.id
    limit 1
  ),
  dhaka_urban_context as (
    select dd.id as district_id
    from valid_input v
    join dhaka_district dd on true
    -- Deliberately bounded to metropolitan Dhaka. This is not a new
    -- administrative level; it only prevents the legacy centroid cluster
    -- from incorrectly jumping to Narayanganj/Gazipur inside Dhaka city.
    where v.lat >= 23.68 and v.lat < 23.89
      and v.lon >= 90.33 and v.lon <= 90.46
  ),
  dhaka_city_override as (
    select c.*
    from nearest_dhaka_city_area c
    join dhaka_urban_context duc on duc.district_id=c.district_id
    where c.distance_km <= 5.5
  ),
  nearest_five_admin_upazilas as (
    select
      u.id as upazila_id,
      u.district_id,
      u.name_bn as upazila_name_bn,
      u.name_en as upazila_name_en,
      u.slug as upazila_slug,
      public.location_distance_km(v.lat,v.lon,u.latitude,u.longitude) as distance_km
    from valid_input v
    join public.upazilas u
      on u.is_active
     and coalesce(u.location_type,'upazila')='upazila'
     and lower(u.slug) not in ('dhaka-sadar','main-dhaka','main-dhaka-city','dhaka-city')
     and u.latitude is not null and u.longitude is not null
    order by public.location_distance_km(v.lat,v.lon,u.latitude,u.longitude),u.id
    limit 5
  ),
  district_scores as (
    select
      district_id,
      sum(1.0/(distance_km+1.0)) as weighted_score,
      min(distance_km) as nearest_distance
    from nearest_five_admin_upazilas
    group by district_id
  ),
  winning_district as (
    select district_id
    from district_scores
    order by weighted_score desc,nearest_distance,district_id
    limit 1
  ),
  nearest_district as (
    select
      d.id as district_id,
      d.name_bn,d.name_en,d.slug,
      public.location_distance_km(v.lat,v.lon,d.latitude,d.longitude) as distance_km
    from valid_input v
    join public.districts d
      on d.is_active and d.latitude is not null and d.longitude is not null
    order by public.location_distance_km(v.lat,v.lon,d.latitude,d.longitude),d.id
    limit 1
  ),
  effective_district as (
    select coalesce(
      (select district_id from dhaka_urban_context limit 1),
      (select district_id from winning_district limit 1),
      (select district_id from nearest_district limit 1)
    ) as district_id
  ),
  district_context as (
    select
      d.id,d.name_bn,d.name_en,d.slug,
      public.location_distance_km(v.lat,v.lon,d.latitude,d.longitude) as distance_km
    from effective_district e
    join public.districts d on d.id=e.district_id and d.is_active
    join valid_input v on true
  ),
  nearest_admin_in_effective as (
    select
      u.id,u.district_id,u.name_bn,u.name_en,u.slug,
      public.location_distance_km(v.lat,v.lon,u.latitude,u.longitude) as distance_km
    from effective_district e
    join valid_input v on true
    join public.upazilas u
      on u.district_id=e.district_id
     and u.is_active
     and coalesce(u.location_type,'upazila')='upazila'
     and lower(u.slug) not in ('dhaka-sadar','main-dhaka','main-dhaka-city','dhaka-city')
     and u.latitude is not null and u.longitude is not null
    order by public.location_distance_km(v.lat,v.lon,u.latitude,u.longitude),u.id
    limit 1
  )
  select
    dc.id as district_id,
    dc.name_bn as district_name_bn,
    dc.name_en as district_name_en,
    dc.slug as district_slug,
    case
      when dc.slug='dhaka' and co.id is not null then co.id
      -- A coordinate very close to a real Dhaka Upazila centroid remains the
      -- real administrative Upazila (e.g. Keraniganj/Savar). Inside the
      -- metropolitan envelope, an uncertain city-area match otherwise falls
      -- back to Dhaka + All Areas rather than being mislabeled as an Upazila.
      when dc.slug='dhaka' and na.distance_km <= 4.0 then na.id
      when dc.slug='dhaka' and duc.district_id is not null then null::bigint
      when dc.slug='dhaka' and na.distance_km <= 20 then na.id
      when dc.slug<>'dhaka' then na.id
      else null::bigint
    end as upazila_id,
    case
      when dc.slug='dhaka' and co.id is not null then co.name_bn
      when dc.slug='dhaka' and na.distance_km <= 4.0 then na.name_bn
      when dc.slug='dhaka' and duc.district_id is not null then null::text
      when dc.slug='dhaka' and na.distance_km <= 20 then na.name_bn
      when dc.slug<>'dhaka' then na.name_bn
      else null::text
    end as upazila_name_bn,
    case
      when dc.slug='dhaka' and co.id is not null then co.name_en
      when dc.slug='dhaka' and na.distance_km <= 4.0 then na.name_en
      when dc.slug='dhaka' and duc.district_id is not null then null::text
      when dc.slug='dhaka' and na.distance_km <= 20 then na.name_en
      when dc.slug<>'dhaka' then na.name_en
      else null::text
    end as upazila_name_en,
    case
      when dc.slug='dhaka' and co.id is not null then co.slug
      when dc.slug='dhaka' and na.distance_km <= 4.0 then na.slug
      when dc.slug='dhaka' and duc.district_id is not null then null::text
      when dc.slug='dhaka' and na.distance_km <= 20 then na.slug
      when dc.slug<>'dhaka' then na.slug
      else null::text
    end as upazila_slug,
    case
      when dc.slug='dhaka' and co.id is not null then 'dhaka_city_area_centroid'
      when dc.slug='dhaka' and na.distance_km <= 4.0 then 'dhaka_upazila_centroid'
      when dc.slug='dhaka' and duc.district_id is not null then 'dhaka_district_fallback'
      when dc.slug='dhaka' and na.distance_km <= 20 then 'dhaka_upazila_centroid'
      when dc.slug='dhaka' then 'dhaka_district_fallback'
      when na.id is not null then 'upazila_centroid_cluster'
      else 'district_centroid'
    end::text as resolution_source,
    round((case
      when dc.slug='dhaka' and co.id is not null then co.distance_km
      when dc.slug='dhaka' and na.distance_km <= 4.0 then na.distance_km
      when dc.slug='dhaka' and duc.district_id is not null then dc.distance_km
      when dc.slug='dhaka' and na.distance_km <= 20 then na.distance_km
      when dc.slug<>'dhaka' and na.id is not null then na.distance_km
      else dc.distance_km
    end)::numeric,2)::double precision as distance_km
  from district_context dc
  left join dhaka_urban_context duc on duc.district_id=dc.id
  left join dhaka_city_override co on dc.slug='dhaka'
  left join nearest_admin_in_effective na on true
  limit 1;
$$;

revoke all on function public.resolve_location_context(double precision,double precision) from public;
grant execute on function public.resolve_location_context(double precision,double precision) to anon,authenticated;

-- Keep reference rows publicly readable through existing RLS/ACL; no new table,
-- no new third-level hierarchy, and no changes to doctor/provider/search RPC signatures.
