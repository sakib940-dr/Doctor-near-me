-- STEP 3: DOCTOR / PROVIDER DIRECTORY
create index if not exists idx_doctors_fee on public.doctors(consultation_fee);
create index if not exists idx_doctors_designation on public.doctors(designation);
create index if not exists idx_profiles_name on public.profiles using btree(full_name);

create or replace view public.public_doctor_directory with (security_invoker=true) as
select d.id as doctor_id,p.full_name,p.avatar_url,d.degree,d.designation,d.professional_title,
d.bmdc_registration_no,d.consultation_fee,d.experience_years,p.district_id,p.upazila_id,d.verification_status
from public.doctors d join public.profiles p on p.id=d.id
where d.verification_status='approved' and p.account_status='active';

create or replace view public.public_provider_directory with (security_invoker=true) as
select id,provider_type,name_bn,name_en,slug,logo_url,banner_url,phone,address,
district_id,upazila_id,latitude,longitude,map_url,verified
from public.providers where status='approved' and verified=true;

create or replace function public.doctors_by_area(
p_district_id bigint default null,p_upazila_id bigint default null,
p_limit integer default 20,p_offset integer default 0)
returns table(doctor_id uuid,doctor_name text,avatar_url text,degree text,designation text,
consultation_fee numeric,district_id bigint,upazila_id bigint)
language sql stable security invoker set search_path=public as $$
select d.id,p.full_name,p.avatar_url,d.degree,d.designation,d.consultation_fee,p.district_id,p.upazila_id
from public.doctors d join public.profiles p on p.id=d.id
where d.verification_status='approved' and p.account_status='active'
and (p_district_id is null or p.district_id=p_upazila_id*0+p_district_id)
and (p_upazila_id is null or p.upazila_id=p_upazila_id)
order by p.full_name limit greatest(1,least(p_limit,100)) offset greatest(p_offset,0); $$;
