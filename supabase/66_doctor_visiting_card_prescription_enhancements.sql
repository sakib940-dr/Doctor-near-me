-- STEP 66: Doctor visiting-card publicity + persistent prescription defaults,
-- prescription history management, and doctor advice templates.
-- Backward-compatible: existing V2 visiting-card/save-prescription RPCs remain available.

-- ------------------------------------------------------------
-- 1) Medical College public visibility control
-- ------------------------------------------------------------
alter table public.doctors
  add column if not exists show_medical_college_public boolean not null default true;

comment on column public.doctors.show_medical_college_public is
  'Doctor-controlled publicity flag. Medical College remains owner-visible but is masked from public read models when false.';

create or replace function public.update_my_doctor_visiting_card_v3(
  p_full_name text,
  p_profile_photo_url text default null,
  p_professional_title text default null,
  p_degree text default null,
  p_designation text default null,
  p_medical_college text default null,
  p_present_job text default null,
  p_specialty_text text default null,
  p_public_address text default null,
  p_specialty_ids bigint[] default null,
  p_show_medical_college_public boolean default true
)
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare
  result jsonb;
begin
  result := public.update_my_doctor_visiting_card_v2(
    p_full_name,
    p_profile_photo_url,
    p_professional_title,
    p_degree,
    p_designation,
    p_medical_college,
    p_present_job,
    p_specialty_text,
    p_public_address,
    p_specialty_ids
  );

  update public.doctors
  set show_medical_college_public=coalesce(p_show_medical_college_public,true),updated_at=now()
  where id=auth.uid();

  return result || jsonb_build_object(
    'show_medical_college_public',coalesce(p_show_medical_college_public,true)
  );
end;
$$;

revoke all on function public.update_my_doctor_visiting_card_v3(text,text,text,text,text,text,text,text,text,bigint[],boolean) from public,anon;
grant execute on function public.update_my_doctor_visiting_card_v3(text,text,text,text,text,text,text,text,text,bigint[],boolean) to authenticated,service_role;

-- Owner read keeps the source value and exposes the doctor's visibility choice.
create or replace function public.get_my_doctor_profile()
returns jsonb
language sql stable security definer set search_path=public
as $$
  select jsonb_build_object(
    'doctor',jsonb_build_object(
      'id',d.id,'full_name',p.full_name,'email',p.email,'phone',p.phone,
      'district_id',p.district_id,'upazila_id',p.upazila_id,
      'medical_type',d.medical_type,'professional_title',d.professional_title,'specialty_text',d.specialty_text,
      'degree',d.degree,'designation',d.designation,'bmdc_registration_no',d.bmdc_registration_no,
      'medical_college',d.medical_college,'show_medical_college_public',d.show_medical_college_public,
      'present_job',d.present_job,'public_address',d.public_address,
      'bmdc_verified',d.bmdc_verified,'bio',d.bio,'bio_bn',d.bio_bn,'bio_en',d.bio_en,
      'consultation_fee',d.consultation_fee,'experience_years',d.experience_years,
      'verification_status',d.verification_status,'profile_headline',d.profile_headline,
      'profile_photo_url',coalesce(d.profile_photo_url,p.avatar_url),'consultation_note',d.consultation_note,
      'languages',d.languages,'accepting_appointments',d.accepting_appointments
    ),
    'specialty_ids',coalesce((select jsonb_agg(ds.specialty_id order by ds.is_primary desc,s.sort_order,s.id)
      from public.doctor_specialties ds join public.specialties s on s.id=ds.specialty_id
      where ds.doctor_id=d.id and s.is_active),'[]'::jsonb),
    'specialties',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name_bn',s.name_bn,'name_en',s.name_en)
      order by ds.is_primary desc,s.sort_order,s.id)
      from public.doctor_specialties ds join public.specialties s on s.id=ds.specialty_id
      where ds.doctor_id=d.id and s.is_active),'[]'::jsonb),
    'chambers',coalesce((select jsonb_agg(jsonb_build_object(
      'id',pr.id,'name_bn',pr.name_bn,'provider_type',pr.provider_type,'address',pr.address,'phone',pr.phone,'whatsapp',pr.whatsapp,
      'district_id',pr.district_id,'upazila_id',pr.upazila_id,'latitude',pr.latitude,'longitude',pr.longitude,
      'map_url',coalesce(pr.google_maps_url,pr.map_url),'owned_by_doctor',(pr.owner_user_id=d.id and pr.provider_type='chamber'),
      'link_status',l.status,'provider_status',pr.status,'verified',pr.verified,
      'schedules',coalesce((select jsonb_agg(jsonb_build_object(
        'id',cs.id,'day_of_week',cs.day_of_week,'start_time',cs.start_time,'end_time',cs.end_time,
        'fee',cs.fee,'note',cs.note,'is_active',cs.is_active
      ) order by cs.day_of_week,cs.start_time,cs.id) from public.chamber_schedules cs
      where cs.doctor_id=d.id and cs.provider_id=pr.id),'[]'::jsonb)
    ) order by (pr.owner_user_id=d.id) desc,pr.name_bn,pr.id)
    from public.doctor_provider_links l join public.providers pr on pr.id=l.provider_id where l.doctor_id=d.id),'[]'::jsonb)
  )
  from public.doctors d join public.profiles p on p.id=d.id
  where d.id=auth.uid() and p.role='doctor' and p.account_status='active';
$$;

revoke all on function public.get_my_doctor_profile() from public,anon;
grant execute on function public.get_my_doctor_profile() to authenticated,service_role;

-- Public profile returns NULL instead of the private source value when visibility is disabled.
create or replace function public.get_doctor_public_profile(p_doctor_id uuid)
returns jsonb
language sql stable security definer set search_path=public
as $$
  select jsonb_build_object(
    'doctor',jsonb_build_object(
      'id',d.id,'name',p.full_name,'avatar_url',coalesce(d.profile_photo_url,p.avatar_url),
      'medical_type',d.medical_type,'degree',d.degree,'designation',d.designation,
      'professional_title',d.professional_title,'specialty_text',d.specialty_text,
      'bmdc_registration_no',d.bmdc_registration_no,'verification_status',d.verification_status::text,
      'medical_college',case when d.show_medical_college_public then d.medical_college else null end,
      'present_job',d.present_job,'public_address',d.public_address,
      'experience_years',d.experience_years,'consultation_fee',d.consultation_fee,'headline',d.profile_headline,
      'bio',d.bio,'bio_bn',coalesce(d.bio_bn,d.bio),'bio_en',d.bio_en,'languages',d.languages,
      'accepting_appointments',d.accepting_appointments
    ),
    'specialties',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name_bn',s.name_bn,'name_en',s.name_en,'icon_url',s.icon_url)
      order by ds.is_primary desc,s.sort_order,s.name_bn) from public.doctor_specialties ds join public.specialties s on s.id=ds.specialty_id
      where ds.doctor_id=d.id and s.is_active=true),'[]'::jsonb),
    'chambers',coalesce((select jsonb_agg(jsonb_build_object(
      'id',pr.id,'type',pr.provider_type,'name_bn',pr.name_bn,'name_en',pr.name_en,'address',pr.address,
      'district_id',pr.district_id,'upazila_id',pr.upazila_id,'latitude',pr.latitude,'longitude',pr.longitude,
      'map_url',coalesce(pr.google_maps_url,pr.map_url),'phone',pr.phone,'whatsapp',pr.whatsapp,
      'emergency_available',pr.emergency_available,
      'schedules',coalesce((select jsonb_agg(jsonb_build_object('day_of_week',cs.day_of_week,'start_time',cs.start_time,
        'end_time',cs.end_time,'fee',cs.fee,'note',cs.note) order by cs.day_of_week,cs.start_time)
        from public.chamber_schedules cs where cs.doctor_id=d.id and cs.provider_id=pr.id and cs.is_active=true),'[]'::jsonb)
    ) order by pr.name_bn) from public.doctor_provider_links dl join public.providers pr on pr.id=dl.provider_id
      where dl.doctor_id=d.id and dl.status='approved' and pr.status='approved' and pr.verified=true),'[]'::jsonb)
  )
  from public.doctors d join public.profiles p on p.id=d.id
  where d.id=p_doctor_id and public.is_doctor_publicly_listable(d.id) and p.account_status='active';
$$;

revoke all on function public.get_doctor_public_profile(uuid) from public;
grant execute on function public.get_doctor_public_profile(uuid) to anon,authenticated,service_role;

create or replace function public.get_public_doctor_card_bundle_v2(p_doctor_ids uuid[])
returns table(
  doctor_id uuid,doctor_name text,avatar_url text,medical_type text,degree text,designation text,professional_title text,specialty_text text,
  bmdc_registration_no text,medical_college text,present_job text,public_address text,consultation_fee numeric,experience_years integer,
  district_id bigint,district_name_bn text,upazila_id bigint,upazila_name_bn text,specialties jsonb,
  verification_status text,nearest_provider_id uuid,nearest_provider_name text,nearest_provider_type text,
  nearest_provider_address text,nearest_provider_latitude double precision,nearest_provider_longitude double precision,profile_slug text
)
language sql stable security definer set search_path=public
as $$
  with requested as (select distinct id from unnest(coalesce(p_doctor_ids,'{}'::uuid[])) as x(id) limit 100)
  select d.id,p.full_name,coalesce(d.profile_photo_url,p.avatar_url),d.medical_type,d.degree,d.designation,d.professional_title,d.specialty_text,
    d.bmdc_registration_no,case when d.show_medical_college_public then d.medical_college else null end,d.present_job,d.public_address,
    d.consultation_fee,d.experience_years,p.district_id,di.name_bn,p.upazila_id,up.name_bn,coalesce(sp.items,'[]'::jsonb),d.verification_status::text,
    chamber.id,chamber.name_bn,chamber.provider_type,chamber.address,chamber.latitude,chamber.longitude,d.profile_slug
  from requested r join public.doctors d on d.id=r.id join public.profiles p on p.id=d.id and p.account_status='active'
  left join public.districts di on di.id=p.district_id left join public.upazilas up on up.id=p.upazila_id
  left join lateral (
    select jsonb_agg(jsonb_build_object('id',s.id,'name_bn',s.name_bn,'name_en',s.name_en,'slug',s.slug,'is_primary',ds.is_primary)
      order by ds.is_primary desc,s.sort_order,s.id) items
    from public.doctor_specialties ds join public.specialties s on s.id=ds.specialty_id and s.is_active=true where ds.doctor_id=d.id
  ) sp on true
  left join lateral (
    select pr.id,pr.name_bn,pr.provider_type,pr.address,pr.latitude,pr.longitude
    from public.doctor_provider_links l join public.providers pr on pr.id=l.provider_id
    where l.doctor_id=d.id and l.status='approved' and pr.status='approved' and pr.verified=true
    order by case when p.upazila_id is not null and pr.upazila_id=p.upazila_id then 0 else 1 end,
      case when p.district_id is not null and pr.district_id=p.district_id then 0 else 1 end,
      case when pr.provider_type='chamber' then 0 else 1 end,pr.name_bn,pr.id limit 1
  ) chamber on true
  where public.is_doctor_publicly_listable(d.id)
  order by p.full_name,d.id;
$$;

revoke all on function public.get_public_doctor_card_bundle_v2(uuid[]) from public;
grant execute on function public.get_public_doctor_card_bundle_v2(uuid[]) to anon,authenticated,service_role;

create or replace function public.get_public_doctor_search_cards_v2(
  p_query text default null,p_district_id bigint default null,p_upazila_id bigint default null,
  p_specialty_ids bigint[] default null,p_degrees text[] default null,p_medical_types text[] default null,
  p_min_fee numeric default null,p_max_fee numeric default null,p_available_today boolean default false,
  p_sort text default 'name',p_limit integer default 20,p_offset integer default 0
)
returns table(
  doctor_id uuid,doctor_name text,avatar_url text,medical_type text,degree text,designation text,professional_title text,specialty_text text,
  bmdc_registration_no text,medical_college text,present_job text,public_address text,consultation_fee numeric,experience_years integer,
  district_id bigint,district_name_bn text,upazila_id bigint,upazila_name_bn text,specialties jsonb,
  available_today boolean,total_count bigint,verification_status text,profile_slug text,
  nearest_provider_id uuid,nearest_provider_name text,nearest_provider_type text,nearest_provider_address text,
  nearest_provider_latitude double precision,nearest_provider_longitude double precision
)
language sql stable security definer set search_path=public
as $$
  with matched as materialized (
    select
      d.id doctor_id,p.full_name doctor_name,coalesce(d.profile_photo_url,p.avatar_url) avatar_url,d.medical_type,d.degree,d.designation,
      d.professional_title,d.specialty_text,d.bmdc_registration_no,
      case when d.show_medical_college_public then d.medical_college else null end medical_college,
      d.present_job,d.public_address,d.consultation_fee,d.experience_years,p.district_id,dist.name_bn district_name_bn,
      p.upazila_id,upz.name_bn upazila_name_bn,d.verification_status::text verification_status,d.profile_slug,d.created_at,
      public.doctor_public_rank_score(d.id) rank_score,
      coalesce((select jsonb_agg(jsonb_build_object('id',sp.id,'name_bn',sp.name_bn,'name_en',sp.name_en,'slug',sp.slug,'is_primary',ds.is_primary)
        order by ds.is_primary desc,sp.sort_order,sp.id) from public.doctor_specialties ds join public.specialties sp on sp.id=ds.specialty_id
        where ds.doctor_id=d.id and sp.is_active),'[]'::jsonb) specialties,
      exists(select 1 from public.chamber_schedules cs join public.providers pr on pr.id=cs.provider_id
        where cs.doctor_id=d.id and cs.is_active and cs.day_of_week=extract(dow from now() at time zone 'Asia/Dhaka')::smallint
          and pr.status='approved' and pr.verified) available_today
    from public.doctors d join public.profiles p on p.id=d.id
    left join public.districts dist on dist.id=p.district_id left join public.upazilas upz on upz.id=p.upazila_id
    where public.is_doctor_publicly_listable(d.id) and p.account_status='active'
      and (nullif(trim(p_query),'') is not null or p_district_id is not null or p_upazila_id is not null or p_min_fee is not null
        or p_max_fee is not null or p_available_today or (p_specialty_ids is not null and cardinality(p_specialty_ids)>0)
        or (p_degrees is not null and cardinality(p_degrees)>0) or (p_medical_types is not null and cardinality(p_medical_types)>0))
      and (p_district_id is null or p.district_id=p_district_id)
      and (p_upazila_id is null or p.upazila_id=p_upazila_id)
      and (p_min_fee is null or d.consultation_fee>=p_min_fee) and (p_max_fee is null or d.consultation_fee<=p_max_fee)
      and (p_specialty_ids is null or cardinality(p_specialty_ids)=0 or exists(select 1 from public.doctor_specialties ds where ds.doctor_id=d.id and ds.specialty_id=any(p_specialty_ids)))
      and (p_degrees is null or cardinality(p_degrees)=0 or public.degree_text_matches_requested(d.degree,p_degrees))
      and (p_medical_types is null or cardinality(p_medical_types)=0 or d.medical_type=any(p_medical_types))
      and (nullif(trim(p_query),'') is null or p.full_name ilike '%'||trim(p_query)||'%' or d.degree ilike '%'||trim(p_query)||'%'
        or d.designation ilike '%'||trim(p_query)||'%' or d.professional_title ilike '%'||trim(p_query)||'%'
        or d.specialty_text ilike '%'||trim(p_query)||'%'
        or (d.show_medical_college_public and d.medical_college ilike '%'||trim(p_query)||'%')
        or d.present_job ilike '%'||trim(p_query)||'%' or dist.name_bn ilike '%'||trim(p_query)||'%' or dist.name_en ilike '%'||trim(p_query)||'%'
        or upz.name_bn ilike '%'||trim(p_query)||'%' or upz.name_en ilike '%'||trim(p_query)||'%'
        or exists(select 1 from public.doctor_specialties ds join public.specialties sp on sp.id=ds.specialty_id
          where ds.doctor_id=d.id and (sp.name_bn ilike '%'||trim(p_query)||'%' or sp.name_en ilike '%'||trim(p_query)||'%')))
  ), filtered as (select * from matched where not p_available_today or available_today), paged as (
    select f.*,count(*) over() total_count
    from filtered f order by f.rank_score desc,
      case when p_sort='newest' then f.created_at end desc,
      case when p_sort='fee_low' then f.consultation_fee end asc nulls last,
      case when p_sort='fee_high' then f.consultation_fee end desc nulls last,
      f.doctor_name asc nulls last,f.doctor_id
    limit greatest(1,least(coalesce(p_limit,20),20)) offset greatest(coalesce(p_offset,0),0)
  )
  select x.doctor_id,x.doctor_name,x.avatar_url,x.medical_type,x.degree,x.designation,x.professional_title,x.specialty_text,
    x.bmdc_registration_no,x.medical_college,x.present_job,x.public_address,x.consultation_fee,x.experience_years,
    x.district_id,x.district_name_bn,x.upazila_id,x.upazila_name_bn,x.specialties,x.available_today,x.total_count,
    x.verification_status,x.profile_slug,ch.id,ch.name_bn,ch.provider_type,ch.address,ch.latitude,ch.longitude
  from paged x
  left join lateral (
    select pr.id,pr.name_bn,pr.provider_type,pr.address,pr.latitude,pr.longitude
    from public.doctor_provider_links l join public.providers pr on pr.id=l.provider_id
    where l.doctor_id=x.doctor_id and l.status='approved' and pr.status='approved' and pr.verified=true
    order by case when x.upazila_id is not null and pr.upazila_id=x.upazila_id then 0 else 1 end,
      case when x.district_id is not null and pr.district_id=x.district_id then 0 else 1 end,
      case when pr.provider_type='chamber' then 0 else 1 end,pr.name_bn,pr.id limit 1
  ) ch on true;
$$;

revoke all on function public.get_public_doctor_search_cards_v2(text,bigint,bigint,bigint[],text[],text[],numeric,numeric,boolean,text,integer,integer) from public;
grant execute on function public.get_public_doctor_search_cards_v2(text,bigint,bigint,bigint[],text[],text[],numeric,numeric,boolean,text,integer,integer) to anon,authenticated,service_role;

-- Mask Medical College in every still-supported public Doctor-card RPC, including
-- rolling-deployment fallbacks and provider / marketplace / near-me bundles.
create or replace function public.get_public_doctor_visiting_cards(p_doctor_ids uuid[])
returns table(
  doctor_id uuid,doctor_name text,avatar_url text,degree text,professional_title text,designation text,
  bmdc_registration_no text,medical_college text,present_job text,verification_status text
)
language sql stable security definer set search_path=public
as $$
  select d.id,p.full_name,coalesce(d.profile_photo_url,p.avatar_url),
    d.degree,d.professional_title,d.designation,d.bmdc_registration_no,
    case when d.show_medical_college_public then d.medical_college else null end,
    d.present_job,d.verification_status::text
  from public.doctors d
  join public.profiles p on p.id=d.id
  where d.id=any(coalesce(p_doctor_ids,'{}'::uuid[]))
    and public.is_doctor_publicly_listable(d.id)
    and p.account_status='active'
  order by p.full_name,d.id;
$$;

revoke all on function public.get_public_doctor_visiting_cards(uuid[]) from public;
grant execute on function public.get_public_doctor_visiting_cards(uuid[]) to anon,authenticated,service_role;

create or replace function public.get_public_doctor_card_bundle(p_doctor_ids uuid[])
returns table(
  doctor_id uuid,doctor_name text,avatar_url text,degree text,designation text,professional_title text,
  bmdc_registration_no text,medical_college text,present_job text,consultation_fee numeric,experience_years integer,
  district_id bigint,district_name_bn text,upazila_id bigint,upazila_name_bn text,specialties jsonb,
  verification_status text,nearest_provider_id uuid,nearest_provider_name text,nearest_provider_type text,
  nearest_provider_address text,nearest_provider_latitude double precision,nearest_provider_longitude double precision,
  profile_slug text
)
language sql stable security definer set search_path=public
as $$
  with requested as (
    select distinct id from unnest(coalesce(p_doctor_ids,'{}'::uuid[])) as x(id) limit 100
  )
  select d.id,p.full_name,coalesce(d.profile_photo_url,p.avatar_url),d.degree,d.designation,d.professional_title,
    d.bmdc_registration_no,case when d.show_medical_college_public then d.medical_college else null end,
    d.present_job,d.consultation_fee,d.experience_years,
    p.district_id,di.name_bn,p.upazila_id,up.name_bn,coalesce(sp.items,'[]'::jsonb),d.verification_status::text,
    chamber.id,chamber.name_bn,chamber.provider_type,chamber.address,chamber.latitude,chamber.longitude,d.profile_slug
  from requested r
  join public.doctors d on d.id=r.id
  join public.profiles p on p.id=d.id and p.account_status='active'
  left join public.districts di on di.id=p.district_id
  left join public.upazilas up on up.id=p.upazila_id
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'id',s.id,'name_bn',s.name_bn,'name_en',s.name_en,'slug',s.slug,'is_primary',ds.is_primary
    ) order by ds.is_primary desc,s.sort_order,s.id) as items
    from public.doctor_specialties ds
    join public.specialties s on s.id=ds.specialty_id and s.is_active=true
    where ds.doctor_id=d.id
  ) sp on true
  left join lateral (
    select pr.id,pr.name_bn,pr.provider_type,pr.address,pr.latitude,pr.longitude
    from public.doctor_provider_links l
    join public.providers pr on pr.id=l.provider_id
    where l.doctor_id=d.id and l.status='approved' and pr.status='approved' and pr.verified=true
    order by
      case when p.upazila_id is not null and pr.upazila_id=p.upazila_id then 0 else 1 end,
      case when p.district_id is not null and pr.district_id=p.district_id then 0 else 1 end,
      case when pr.provider_type='chamber' then 0 else 1 end,
      pr.name_bn,pr.id
    limit 1
  ) chamber on true
  where public.is_doctor_publicly_listable(d.id)
  order by p.full_name,d.id;
$$;

revoke all on function public.get_public_doctor_card_bundle(uuid[]) from public;
grant execute on function public.get_public_doctor_card_bundle(uuid[]) to anon,authenticated,service_role;

create or replace function public.get_public_doctor_search_cards(
  p_query text default null,
  p_district_id bigint default null,
  p_upazila_id bigint default null,
  p_specialty_ids bigint[] default null,
  p_degrees text[] default null,
  p_min_fee numeric default null,
  p_max_fee numeric default null,
  p_available_today boolean default false,
  p_sort text default 'name',
  p_limit integer default 20,
  p_offset integer default 0
)
returns table(
  doctor_id uuid,doctor_name text,avatar_url text,degree text,designation text,professional_title text,
  bmdc_registration_no text,medical_college text,present_job text,consultation_fee numeric,experience_years integer,
  district_id bigint,district_name_bn text,upazila_id bigint,upazila_name_bn text,specialties jsonb,
  available_today boolean,total_count bigint,verification_status text,profile_slug text,
  nearest_provider_id uuid,nearest_provider_name text,nearest_provider_type text,nearest_provider_address text,
  nearest_provider_latitude double precision,nearest_provider_longitude double precision
)
language sql stable security definer set search_path=public
as $$
  select x.doctor_id,x.doctor_name,x.avatar_url,x.degree,x.designation,x.professional_title,
    x.bmdc_registration_no,x.medical_college,x.present_job,x.consultation_fee,x.experience_years,
    x.district_id,x.district_name_bn,x.upazila_id,x.upazila_name_bn,x.specialties,
    x.available_today,x.total_count,x.verification_status,x.profile_slug,
    x.nearest_provider_id,x.nearest_provider_name,x.nearest_provider_type,x.nearest_provider_address,
    x.nearest_provider_latitude,x.nearest_provider_longitude
  from public.get_public_doctor_search_cards_v2(
    p_query,p_district_id,p_upazila_id,p_specialty_ids,p_degrees,null,
    p_min_fee,p_max_fee,p_available_today,p_sort,p_limit,p_offset
  ) x;
$$;

revoke all on function public.get_public_doctor_search_cards(text,bigint,bigint,bigint[],text[],numeric,numeric,boolean,text,integer,integer) from public;
grant execute on function public.get_public_doctor_search_cards(text,bigint,bigint,bigint[],text[],numeric,numeric,boolean,text,integer,integer) to anon,authenticated,service_role;

create or replace function public.get_public_marketplace_doctors(
  p_district_id bigint default null,p_upazila_id bigint default null,p_mode text default 'ranked',p_limit integer default 10
)
returns table(
  doctor_id uuid,doctor_name text,avatar_url text,degree text,designation text,professional_title text,
  bmdc_registration_no text,medical_college text,present_job text,consultation_fee numeric,experience_years integer,
  district_id bigint,district_name_bn text,upazila_id bigint,upazila_name_bn text,specialties jsonb,
  verification_status text,nearest_provider_id uuid,nearest_provider_name text,nearest_provider_address text,
  is_premium boolean,ranking_tier text,created_at timestamptz,total_count bigint
)
language sql stable security definer set search_path=public
as $$
  with eligible as (
    select d.id doctor_id,p.full_name doctor_name,coalesce(d.profile_photo_url,p.avatar_url) avatar_url,
      d.degree,d.designation,d.professional_title,d.bmdc_registration_no,
      case when d.show_medical_college_public then d.medical_college else null end medical_college,
      d.present_job,d.consultation_fee,d.experience_years,p.district_id,di.name_bn district_name_bn,
      p.upazila_id,up.name_bn upazila_name_bn,coalesce(sp.items,'[]'::jsonb) specialties,
      d.verification_status::text verification_status,chamber.id nearest_provider_id,chamber.name_bn nearest_provider_name,
      chamber.address nearest_provider_address,public.is_doctor_premium(d.id) is_premium,
      public.doctor_public_rank_tier(d.id) ranking_tier,d.created_at,
      public.doctor_public_rank_score(d.id) rank_score,public.classify_degree_text(d.degree) degree_classification
    from public.doctors d
    join public.profiles p on p.id=d.id
    left join public.districts di on di.id=p.district_id
    left join public.upazilas up on up.id=p.upazila_id
    left join lateral (
      select jsonb_agg(jsonb_build_object(
        'id',s.id,'name_bn',s.name_bn,'name_en',s.name_en,'slug',s.slug,'is_primary',ds.is_primary
      ) order by ds.is_primary desc,s.sort_order,s.name_bn) items
      from public.doctor_specialties ds
      join public.specialties s on s.id=ds.specialty_id and s.is_active=true
      where ds.doctor_id=d.id
    ) sp on true
    left join lateral (
      select pr.id,pr.name_bn,pr.address
      from public.doctor_provider_links dpl
      join public.providers pr on pr.id=dpl.provider_id
      where dpl.doctor_id=d.id and dpl.status='approved' and pr.status='approved' and pr.verified=true
      order by (pr.district_id is not distinct from p.district_id) desc,
        (pr.upazila_id is not distinct from p.upazila_id) desc,pr.name_bn,pr.id
      limit 1
    ) chamber on true
    where p.account_status='active' and public.is_doctor_publicly_listable(d.id)
      and (p_district_id is null or p.district_id=p_district_id)
      and (p_upazila_id is null or p.upazila_id=p_upazila_id)
  )
  select e.doctor_id,e.doctor_name,e.avatar_url,e.degree,e.designation,e.professional_title,e.bmdc_registration_no,
    e.medical_college,e.present_job,e.consultation_fee,e.experience_years,e.district_id,e.district_name_bn,
    e.upazila_id,e.upazila_name_bn,e.specialties,e.verification_status,e.nearest_provider_id,e.nearest_provider_name,
    e.nearest_provider_address,e.is_premium,e.ranking_tier,e.created_at,count(*) over()
  from eligible e
  where coalesce(p_mode,'ranked')='ranked'
     or (p_mode='premium' and e.is_premium)
     or (p_mode='new' and e.ranking_tier='new')
     or (p_mode='general' and e.degree_classification='general')
     or (p_mode='general_dental' and e.degree_classification='general_dental')
     or (p_mode='specialist' and e.degree_classification='specialist')
  order by e.rank_score desc,
    case when p_mode='new' then e.created_at end desc,
    e.created_at desc,e.doctor_name,e.doctor_id
  limit greatest(1,least(coalesce(p_limit,10),24));
$$;

revoke all on function public.get_public_marketplace_doctors(bigint,bigint,text,integer) from public;
grant execute on function public.get_public_marketplace_doctors(bigint,bigint,text,integer) to anon,authenticated,service_role;

create or replace function public.get_public_nearest_doctors_v2(
  p_lat double precision,p_lon double precision,p_radius_km double precision default 50,
  p_district_id bigint default null,p_upazila_id bigint default null,p_limit integer default 20,p_offset integer default 0
)
returns table(
  doctor_id uuid,doctor_name text,avatar_url text,degree text,designation text,professional_title text,
  bmdc_registration_no text,medical_college text,present_job text,consultation_fee numeric,experience_years integer,
  district_id bigint,district_name_bn text,upazila_id bigint,upazila_name_bn text,specialties jsonb,
  verification_status text,profile_slug text,
  nearest_provider_id uuid,nearest_provider_name text,nearest_provider_type text,nearest_provider_address text,
  nearest_provider_latitude double precision,nearest_provider_longitude double precision,distance_km double precision,total_count bigint
)
language sql stable security definer set search_path=public
as $$
  with n as (
    select * from public.nearest_doctors(
      p_lat,p_lon,p_radius_km,p_district_id,p_upazila_id,
      least(greatest(coalesce(p_limit,20),1),20),greatest(coalesce(p_offset,0),0)
    )
  )
  select n.doctor_id,p.full_name,coalesce(d.profile_photo_url,p.avatar_url),d.degree,d.designation,d.professional_title,
    d.bmdc_registration_no,case when d.show_medical_college_public then d.medical_college else null end,
    d.present_job,d.consultation_fee,d.experience_years,
    n.district_id,di.name_bn,n.upazila_id,up.name_bn,coalesce(sp.items,'[]'::jsonb),
    d.verification_status::text,d.profile_slug,n.provider_id,n.provider_name,n.provider_type,n.address,n.latitude,n.longitude,
    n.distance_km,count(*) over()
  from n
  join public.doctors d on d.id=n.doctor_id
  join public.profiles p on p.id=d.id
  left join public.districts di on di.id=n.district_id
  left join public.upazilas up on up.id=n.upazila_id
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'id',s.id,'name_bn',s.name_bn,'name_en',s.name_en,'slug',s.slug,'is_primary',ds.is_primary
    ) order by ds.is_primary desc,s.sort_order,s.id) items
    from public.doctor_specialties ds
    join public.specialties s on s.id=ds.specialty_id and s.is_active=true
    where ds.doctor_id=d.id
  ) sp on true
  order by public.doctor_near_me_priority_score(n.doctor_id,n.distance_km) desc,n.distance_km,n.doctor_name,n.doctor_id;
$$;

revoke all on function public.get_public_nearest_doctors_v2(double precision,double precision,double precision,bigint,bigint,integer,integer) from public;
grant execute on function public.get_public_nearest_doctors_v2(double precision,double precision,double precision,bigint,bigint,integer,integer) to anon,authenticated,service_role;

create or replace function public.get_public_provider_doctors_v3(
  p_provider_id uuid,p_limit integer default 20,p_offset integer default 0
)
returns table(
  doctor_id uuid,doctor_name text,avatar_url text,degree text,designation text,professional_title text,
  bmdc_registration_no text,medical_college text,present_job text,consultation_fee numeric,experience_years integer,
  district_id bigint,district_name_bn text,upazila_id bigint,upazila_name_bn text,specialties jsonb,
  available_today boolean,schedules jsonb,verification_status text,profile_slug text,total_count bigint
)
language sql stable security definer set search_path=public
as $$
  select d.id,p.full_name,coalesce(d.profile_photo_url,p.avatar_url),d.degree,d.designation,d.professional_title,
    d.bmdc_registration_no,case when d.show_medical_college_public then d.medical_college else null end,
    d.present_job,d.consultation_fee,d.experience_years,p.district_id,dist.name_bn,p.upazila_id,upz.name_bn,
    coalesce((select jsonb_agg(jsonb_build_object(
      'id',s.id,'name_bn',s.name_bn,'name_en',s.name_en,'slug',s.slug,'is_primary',ds.is_primary
    ) order by ds.is_primary desc,s.sort_order,s.id)
      from public.doctor_specialties ds
      join public.specialties s on s.id=ds.specialty_id and s.is_active=true
      where ds.doctor_id=d.id),'[]'::jsonb),
    exists(select 1 from public.chamber_schedules cs
      where cs.provider_id=pr.id and cs.doctor_id=d.id and cs.is_active=true
        and cs.day_of_week=extract(dow from now() at time zone 'Asia/Dhaka')::int),
    coalesce((select jsonb_agg(jsonb_build_object(
      'day_of_week',cs.day_of_week,'start_time',cs.start_time,'end_time',cs.end_time,'fee',cs.fee,'note',cs.note
    ) order by cs.day_of_week,cs.start_time,cs.id)
      from public.chamber_schedules cs
      where cs.provider_id=pr.id and cs.doctor_id=d.id and cs.is_active=true),'[]'::jsonb),
    d.verification_status::text,d.profile_slug,count(*) over()
  from public.providers pr
  join public.doctor_provider_links l on l.provider_id=pr.id and l.status='approved'
  join public.doctors d on d.id=l.doctor_id and public.is_doctor_publicly_listable(d.id)
  join public.profiles p on p.id=d.id and p.account_status='active'
  left join public.districts dist on dist.id=p.district_id
  left join public.upazilas upz on upz.id=p.upazila_id
  where pr.id=p_provider_id and pr.status='approved' and pr.verified=true
  order by public.doctor_public_rank_score(d.id) desc,d.created_at desc,p.full_name,d.id
  limit least(greatest(coalesce(p_limit,20),1),50)
  offset greatest(coalesce(p_offset,0),0);
$$;

revoke all on function public.get_public_provider_doctors_v3(uuid,integer,integer) from public;
grant execute on function public.get_public_provider_doctors_v3(uuid,integer,integer) to anon,authenticated,service_role;

-- ------------------------------------------------------------
-- 2) Persistent prescription header defaults
-- ------------------------------------------------------------
create table if not exists public.doctor_prescription_settings (
  doctor_id uuid primary key references public.doctors(id) on delete cascade,
  default_doctor_header_text text not null default '' check(char_length(default_doctor_header_text)<=800),
  default_chamber_header_text text not null default '' check(char_length(default_chamber_header_text)<=800),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.doctor_prescription_settings enable row level security;
revoke all on table public.doctor_prescription_settings from public,anon,authenticated;

create or replace function public.get_my_prescription_settings()
returns jsonb
language sql stable security definer set search_path=public
as $$
  select jsonb_build_object(
    'doctor_id',s.doctor_id,
    'default_doctor_header_text',s.default_doctor_header_text,
    'default_chamber_header_text',s.default_chamber_header_text,
    'updated_at',s.updated_at
  )
  from public.doctor_prescription_settings s
  where s.doctor_id=auth.uid()
    and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='doctor' and p.account_status='active');
$$;

revoke all on function public.get_my_prescription_settings() from public,anon;
grant execute on function public.get_my_prescription_settings() to authenticated,service_role;

-- ------------------------------------------------------------
-- 3) Advice template CRUD + recent-use tracking
-- ------------------------------------------------------------
create table if not exists public.doctor_advice_templates (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  advice_text text not null check(char_length(btrim(advice_text)) between 1 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(doctor_id,id)
);

create unique index if not exists doctor_advice_templates_doctor_text_unique
  on public.doctor_advice_templates(doctor_id,lower(btrim(advice_text)));
create index if not exists doctor_advice_templates_doctor_updated_idx
  on public.doctor_advice_templates(doctor_id,updated_at desc);

create table if not exists public.doctor_advice_usage (
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  advice_id uuid not null,
  usage_count integer not null default 1 check(usage_count>0),
  last_used_at timestamptz not null default now(),
  primary key(doctor_id,advice_id),
  constraint doctor_advice_usage_template_fk foreign key(doctor_id,advice_id)
    references public.doctor_advice_templates(doctor_id,id) on delete cascade
);

create index if not exists doctor_advice_usage_recent_idx
  on public.doctor_advice_usage(doctor_id,last_used_at desc,usage_count desc);

alter table public.doctor_advice_templates enable row level security;
alter table public.doctor_advice_usage enable row level security;
revoke all on table public.doctor_advice_templates from public,anon,authenticated;
revoke all on table public.doctor_advice_usage from public,anon,authenticated;

create or replace function public.get_my_advice_templates()
returns table(
  id uuid,advice_text text,created_at timestamptz,updated_at timestamptz,
  usage_count integer,last_used_at timestamptz
)
language sql stable security definer set search_path=public
as $$
  select t.id,t.advice_text,t.created_at,t.updated_at,
    coalesce(u.usage_count,0),u.last_used_at
  from public.doctor_advice_templates t
  left join public.doctor_advice_usage u on u.doctor_id=t.doctor_id and u.advice_id=t.id
  where t.doctor_id=auth.uid()
    and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='doctor' and p.account_status='active')
  order by u.last_used_at desc nulls last,t.updated_at desc,t.id;
$$;

create or replace function public.save_my_advice_template(p_advice_id uuid,p_advice_text text)
returns uuid
language plpgsql security definer set search_path=public
as $$
declare
  result_id uuid;
  clean_text text:=btrim(coalesce(p_advice_text,''));
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists(select 1 from public.profiles where id=auth.uid() and role='doctor' and account_status='active') then
    raise exception 'Active doctor account required';
  end if;
  if char_length(clean_text)<1 then raise exception 'Advice text is required'; end if;
  if char_length(clean_text)>500 then raise exception 'Advice text must be 500 characters or fewer'; end if;

  if p_advice_id is null then
    insert into public.doctor_advice_templates(doctor_id,advice_text)
    values(auth.uid(),clean_text)
    returning id into result_id;
  else
    update public.doctor_advice_templates
    set advice_text=clean_text,updated_at=now()
    where id=p_advice_id and doctor_id=auth.uid()
    returning id into result_id;
    if result_id is null then raise exception 'Advice template not found'; end if;
  end if;

  return result_id;
end;
$$;

create or replace function public.delete_my_advice_template(p_advice_id uuid)
returns void
language plpgsql security definer set search_path=public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists(select 1 from public.profiles where id=auth.uid() and role='doctor' and account_status='active') then
    raise exception 'Active doctor account required';
  end if;
  delete from public.doctor_advice_templates where id=p_advice_id and doctor_id=auth.uid();
  if not found then raise exception 'Advice template not found'; end if;
end;
$$;

revoke all on function public.get_my_advice_templates() from public,anon;
revoke all on function public.save_my_advice_template(uuid,text) from public,anon;
revoke all on function public.delete_my_advice_template(uuid) from public,anon;
grant execute on function public.get_my_advice_templates() to authenticated,service_role;
grant execute on function public.save_my_advice_template(uuid,text) to authenticated,service_role;
grant execute on function public.delete_my_advice_template(uuid) to authenticated,service_role;

-- Internal helper used by create/update prescription RPCs. No client role gets direct EXECUTE.
create or replace function public.apply_my_prescription_preferences(p_payload jsonb)
returns void
language plpgsql security definer set search_path=public
as $$
declare
  v_advice text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists(select 1 from public.profiles where id=auth.uid() and role='doctor' and account_status='active') then
    raise exception 'Active doctor account required';
  end if;

  insert into public.doctor_prescription_settings(
    doctor_id,default_doctor_header_text,default_chamber_header_text,updated_at
  ) values(
    auth.uid(),
    left(coalesce(p_payload->>'doctor_header_text',''),800),
    left(coalesce(p_payload->>'chamber_header_text',''),800),
    now()
  )
  on conflict(doctor_id) do update set
    default_doctor_header_text=excluded.default_doctor_header_text,
    default_chamber_header_text=excluded.default_chamber_header_text,
    updated_at=now();

  for v_advice in
    select btrim(value #>> '{}') from jsonb_array_elements(coalesce(p_payload->'advice','[]'::jsonb))
  loop
    if v_advice<>'' then
      insert into public.doctor_advice_usage(doctor_id,advice_id,usage_count,last_used_at)
      select auth.uid(),t.id,1,now()
      from public.doctor_advice_templates t
      where t.doctor_id=auth.uid() and lower(btrim(t.advice_text))=lower(v_advice)
      on conflict(doctor_id,advice_id) do update set
        usage_count=public.doctor_advice_usage.usage_count+1,
        last_used_at=now();
    end if;
  end loop;
end;
$$;

revoke all on function public.apply_my_prescription_preferences(jsonb) from public,anon,authenticated;

-- Backward-compatible wrapper: existing save_my_prescription remains unchanged.
create or replace function public.save_my_prescription_v2(p_payload jsonb)
returns uuid
language plpgsql security definer set search_path=public
as $$
declare
  result_id uuid;
begin
  result_id:=public.save_my_prescription(p_payload);
  perform public.apply_my_prescription_preferences(p_payload);
  return result_id;
end;
$$;

revoke all on function public.save_my_prescription_v2(jsonb) from public,anon;
grant execute on function public.save_my_prescription_v2(jsonb) to authenticated,service_role;

-- Owner-only update for previous prescriptions. Direct table UPDATE stays revoked.
create or replace function public.update_my_prescription(p_prescription_id uuid,p_payload jsonb)
returns uuid
language plpgsql security definer set search_path=public
as $$
declare
  current_row public.doctor_prescriptions%rowtype;
  v_appointment_id uuid;
  v_patient_id uuid;
  v_appointment_provider_id uuid;
  v_requested_provider_id uuid;
  v_provider_id uuid;
  v_doctor_header text;
  v_chamber_header text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists(select 1 from public.profiles where id=auth.uid() and role='doctor' and account_status='active') then
    raise exception 'Active doctor account required';
  end if;

  select * into current_row
  from public.doctor_prescriptions
  where id=p_prescription_id and doctor_id=auth.uid()
  for update;
  if not found then raise exception 'Prescription not found'; end if;

  v_doctor_header:=left(nullif(btrim(coalesce(p_payload->>'doctor_header_text','')),''),800);
  v_chamber_header:=left(nullif(btrim(coalesce(p_payload->>'chamber_header_text','')),''),800);
  v_appointment_id:=nullif(p_payload->>'appointment_id','')::uuid;
  v_requested_provider_id:=nullif(p_payload->>'provider_id','')::uuid;
  v_patient_id:=current_row.patient_id;

  if v_appointment_id is not null then
    select a.patient_id,a.provider_id into v_patient_id,v_appointment_provider_id
    from public.appointments a
    where a.id=v_appointment_id and a.doctor_id=auth.uid();
    if not found then raise exception 'Appointment not found for this doctor'; end if;
  end if;

  if v_requested_provider_id is not null then
    if v_appointment_provider_id is distinct from v_requested_provider_id then
      if not exists(
        select 1 from public.doctor_provider_links l
        join public.providers pr on pr.id=l.provider_id
        where l.doctor_id=auth.uid() and l.provider_id=v_requested_provider_id
          and l.status='approved' and pr.status in ('pending','approved')
      ) then
        raise exception 'Selected chamber/provider is not available to this doctor';
      end if;
    end if;
    v_provider_id:=v_requested_provider_id;
  else
    v_provider_id:=coalesce(v_appointment_provider_id,current_row.provider_id);
  end if;

  if btrim(coalesce(p_payload->>'patient_name',''))='' then raise exception 'Patient name is required'; end if;

  update public.doctor_prescriptions set
    patient_id=v_patient_id,
    appointment_id=v_appointment_id,
    provider_id=v_provider_id,
    doctor_header_text=v_doctor_header,
    chamber_header_text=v_chamber_header,
    patient_name=btrim(p_payload->>'patient_name'),
    patient_age=nullif(btrim(p_payload->>'patient_age'),''),
    patient_address=nullif(btrim(p_payload->>'patient_address'),''),
    patient_mobile=nullif(btrim(p_payload->>'patient_mobile'),''),
    patient_gender=nullif(btrim(p_payload->>'patient_gender'),''),
    chief_complaint=coalesce(p_payload->'chief_complaint','[]'::jsonb),
    history=coalesce(p_payload->'history','[]'::jsonb),
    on_examination=coalesce(p_payload->'on_examination','[]'::jsonb),
    investigation=coalesce(p_payload->'investigation','[]'::jsonb),
    treatment_plan=coalesce(p_payload->'treatment_plan','[]'::jsonb),
    medicines=coalesce(p_payload->'medicines','[]'::jsonb),
    advice=coalesce(p_payload->'advice','[]'::jsonb),
    note=nullif(btrim(p_payload->>'note'),''),
    updated_at=now()
  where id=p_prescription_id and doctor_id=auth.uid();

  perform public.apply_my_prescription_preferences(p_payload);
  return p_prescription_id;
end;
$$;

revoke all on function public.update_my_prescription(uuid,jsonb) from public,anon;
grant execute on function public.update_my_prescription(uuid,jsonb) to authenticated,service_role;

-- Reassert prescription table isolation after adding edit support.
revoke all on table public.doctor_prescriptions from public,anon,authenticated;

select 'STEP 66 DOCTOR VISITING CARD + PRESCRIPTION ENHANCEMENTS READY' as result;
