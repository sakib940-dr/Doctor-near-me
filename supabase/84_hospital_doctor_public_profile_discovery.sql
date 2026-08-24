-- ============================================================
-- STEP 84 — HOSPITAL-MANAGED DOCTOR PUBLIC PROFILE + DISCOVERY
-- Run after Step 83. This migration never reads or mutates public.doctors.
-- Hospital-managed doctors remain independent reception directory entries.
-- ============================================================

begin;

create or replace function public.get_public_hospital_doctor_profile(p_card_id uuid)
returns jsonb
language sql stable security definer set search_path=public
as $$
  select jsonb_build_object(
    'doctor',jsonb_build_object(
      'id',c.id,'provider_id',c.provider_id,'doctor_name',c.doctor_name,'photo_path',c.photo_path,
      'degree',c.degree,'designation',c.designation,'specialty',c.specialty,
      'bmdc_registration_no',c.bmdc_registration_no,'experience_years',c.experience_years,
      'consultation_fee',c.consultation_fee,'visiting_schedule',c.visiting_schedule,
      'appointment_note',c.appointment_note,'room_information',c.room_information,
      'contact_mode',c.contact_mode,
      'individual_phone',case when c.contact_mode='individual' then c.individual_phone else null end,
      'individual_whatsapp',case when c.contact_mode='individual' then c.individual_whatsapp else null end,
      'sort_order',c.sort_order
    ),
    'hospital',jsonb_build_object(
      'id',p.id,'provider_type',p.provider_type,'name_bn',p.name_bn,'name_en',p.name_en,'slug',p.slug,
      'logo_url',p.logo_url,'banner_url',p.banner_url,'phone',p.phone,'whatsapp',p.whatsapp,
      'address',p.address,'district_id',p.district_id,'upazila_id',p.upazila_id,
      'latitude',p.latitude,'longitude',p.longitude,'map_url',p.map_url,'verified',p.verified
    )
  )
  from public.provider_managed_doctor_cards c
  join public.public_provider_directory p on p.id=c.provider_id and p.provider_type='hospital'
  where c.id=p_card_id and c.is_active=true and c.archived_at is null
    and public.is_provider_publicly_listable(c.provider_id)
  limit 1;
$$;

create or replace function public.search_public_hospital_doctors(
  p_query text default null,p_district_id bigint default null,p_upazila_id bigint default null,
  p_specialty_ids bigint[] default null,p_degrees text[] default null,p_medical_types text[] default null,
  p_min_fee numeric default null,p_max_fee numeric default null,p_available_today boolean default false,
  p_sort text default 'name',p_limit integer default 20,p_offset integer default 0
)
returns table(
  id uuid,provider_id uuid,doctor_name text,photo_path text,degree text,designation text,
  specialty text,bmdc_registration_no text,experience_years integer,consultation_fee numeric,
  visiting_schedule text,appointment_note text,room_information text,contact_mode text,
  individual_phone text,individual_whatsapp text,hospital_name text,hospital_logo text,
  hospital_phone text,hospital_whatsapp text,hospital_address text,hospital_latitude double precision,
  hospital_longitude double precision,hospital_map_url text,district_id bigint,upazila_id bigint,total_count bigint
)
language sql stable security definer set search_path=public
as $$
  with filtered as (
    select c.*,p.name_bn as hospital_name,p.logo_url as hospital_logo,p.phone as hospital_phone,
      p.whatsapp as hospital_whatsapp,p.address as hospital_address,p.latitude as hospital_latitude,
      p.longitude as hospital_longitude,p.map_url as hospital_map_url,p.district_id,p.upazila_id
    from public.provider_managed_doctor_cards c
    join public.public_provider_directory p on p.id=c.provider_id and p.provider_type='hospital'
    where c.is_active=true and c.archived_at is null and public.is_provider_publicly_listable(c.provider_id)
      and (nullif(btrim(coalesce(p_query,'')),'') is null or concat_ws(' ',c.doctor_name,c.degree,c.designation,c.specialty,c.bmdc_registration_no,p.name_bn,p.address) ilike '%'||btrim(p_query)||'%')
      and (p_district_id is null or p.district_id=p_district_id)
      and (p_upazila_id is null or p.upazila_id=p_upazila_id)
      and (p_specialty_ids is null or exists(
        select 1 from public.specialties s where s.id=any(p_specialty_ids)
          and (c.specialty ilike '%'||s.name_bn||'%' or c.specialty ilike '%'||s.name_en||'%')
      ))
      and (p_degrees is null or exists(select 1 from unnest(p_degrees) d where c.degree ilike '%'||d||'%'))
      and (p_medical_types is null or exists(select 1 from unnest(p_medical_types) m where c.degree ilike '%'||m||'%'))
      and (p_min_fee is null or c.consultation_fee>=p_min_fee)
      and (p_max_fee is null or c.consultation_fee<=p_max_fee)
      and (not coalesce(p_available_today,false) or nullif(btrim(coalesce(c.visiting_schedule,'')),'') is not null)
  )
  select f.id,f.provider_id,f.doctor_name,f.photo_path,f.degree,f.designation,f.specialty,
    f.bmdc_registration_no,f.experience_years,f.consultation_fee,f.visiting_schedule,
    f.appointment_note,f.room_information,f.contact_mode,
    case when f.contact_mode='individual' then f.individual_phone else null end,
    case when f.contact_mode='individual' then f.individual_whatsapp else null end,
    f.hospital_name,f.hospital_logo,f.hospital_phone,f.hospital_whatsapp,f.hospital_address,
    f.hospital_latitude,f.hospital_longitude,f.hospital_map_url,f.district_id,f.upazila_id,
    count(*) over() as total_count
  from filtered f
  order by
    case when p_sort='fee_low' then f.consultation_fee end asc nulls last,
    case when p_sort='fee_high' then f.consultation_fee end desc nulls last,
    case when p_sort='newest' then f.created_at end desc,
    case when p_sort not in ('fee_low','fee_high','newest') then lower(f.doctor_name) end,
    f.id
  limit least(greatest(coalesce(p_limit,20),1),20) offset greatest(coalesce(p_offset,0),0);
$$;

revoke all on function public.get_public_hospital_doctor_profile(uuid) from public;
revoke all on function public.search_public_hospital_doctors(text,bigint,bigint,bigint[],text[],text[],numeric,numeric,boolean,text,integer,integer) from public;
grant execute on function public.get_public_hospital_doctor_profile(uuid) to anon,authenticated,service_role;
grant execute on function public.search_public_hospital_doctors(text,bigint,bigint,bigint[],text[],text[],numeric,numeric,boolean,text,integer,integer) to anon,authenticated,service_role;

commit;
