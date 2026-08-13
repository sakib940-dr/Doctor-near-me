-- STEP 2: LOCATION CORE
create or replace function public.location_distance_km(lat1 double precision,lon1 double precision,lat2 double precision,lon2 double precision)
returns double precision language sql immutable as $$
select 6371.0*2*asin(sqrt(power(sin(radians(lat2-lat1)/2),2)+cos(radians(lat1))*cos(radians(lat2))*power(sin(radians(lon2-lon1)/2),2))); $$;

create or replace function public.get_districts(p_division_id bigint default null)
returns table(id bigint,division_id bigint,name_bn text,name_en text,slug text)
language sql stable security invoker set search_path=public as $$
select id,division_id,name_bn,name_en,slug from public.districts
where is_active=true and (p_division_id is null or division_id=p_division_id) order by name_bn; $$;

create or replace function public.get_upazilas(p_district_id bigint)
returns table(id bigint,district_id bigint,name_bn text,name_en text,slug text)
language sql stable security invoker set search_path=public as $$
select id,district_id,name_bn,name_en,slug from public.upazilas
where is_active=true and district_id=p_district_id order by name_bn; $$;

insert into public.divisions(name_bn,name_en,slug) values
('ঢাকা','Dhaka','dhaka'),('চট্টগ্রাম','Chattogram','chattogram'),
('রাজশাহী','Rajshahi','rajshahi'),('খুলনা','Khulna','khulna'),
('বরিশাল','Barishal','barishal'),('সিলেট','Sylhet','sylhet'),
('রংপুর','Rangpur','rangpur'),('ময়মনসিংহ','Mymensingh','mymensingh')
on conflict(slug) do update set name_bn=excluded.name_bn,name_en=excluded.name_en,is_active=true;

create index if not exists idx_doctors_verification on public.doctors(verification_status);
create index if not exists idx_providers_status_verified on public.providers(status,verified);
create index if not exists idx_doctor_provider_status on public.doctor_provider_links(status,doctor_id,provider_id);

create or replace function public.nearest_doctors(
p_lat double precision,p_lon double precision,p_radius_km double precision default 50,
p_district_id bigint default null,p_upazila_id bigint default null,
p_limit integer default 20,p_offset integer default 0)
returns table(doctor_id uuid,provider_id uuid,doctor_name text,degree text,designation text,
consultation_fee numeric,provider_name text,provider_type text,address text,
district_id bigint,upazila_id bigint,latitude double precision,longitude double precision,distance_km double precision)
language sql stable security invoker set search_path=public as $$
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
limit greatest(1,least(p_limit,100)) offset greatest(p_offset,0); $$;
