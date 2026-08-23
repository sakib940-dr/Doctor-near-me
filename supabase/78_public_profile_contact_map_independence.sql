-- STEP 78: Public profile/contact/map independence from verification
-- Verification remains an identity/BMDC badge. Active owners may publish and
-- operate contact, chamber, schedule and appointment features without approval.
-- Admin report-moderation suspension remains authoritative.

-- ---------------------------------------------------------------------------
-- 1) Central public-listing rules
-- ---------------------------------------------------------------------------
create or replace function public.is_doctor_publicly_listable(p_doctor_id uuid)
returns boolean
language sql stable security definer set search_path=public
as $$
  select coalesce((
    select p.account_status='active'
      and not (
        d.verification_status='rejected'
        and coalesce(d.verification_note,'') like 'Profile report moderation:%'
      )
    from public.doctors d
    join public.profiles p on p.id=d.id
    where d.id=p_doctor_id
  ),false);
$$;

create or replace function public.is_provider_publicly_listable(p_provider_id uuid)
returns boolean
language sql stable security definer set search_path=public
as $$
  select coalesce((
    select owner.account_status='active' and pr.status<>'suspended'
    from public.providers pr
    join public.profiles owner on owner.id=pr.owner_user_id
    where pr.id=p_provider_id
  ),false);
$$;

revoke all on function public.is_doctor_publicly_listable(uuid) from public;
revoke all on function public.is_provider_publicly_listable(uuid) from public;
grant execute on function public.is_doctor_publicly_listable(uuid) to anon,authenticated,service_role;
grant execute on function public.is_provider_publicly_listable(uuid) to anon,authenticated,service_role;

update public.site_settings
set setting_value=jsonb_build_object(
  'hide_unverified_doctors',false,
  'new_registration_requires_verification',false,
  'new_registration_verification_enabled_at',null
),updated_at=now()
where setting_key='doctor_verification_publication_policy';

-- A definer view exposes only the existing public-safe column list. It does not
-- grant anonymous callers access to private provider/verification columns.
create or replace view public.public_provider_directory
with (security_barrier=true,security_invoker=false) as
select
  pr.id,pr.provider_type,pr.name_bn,pr.name_en,pr.slug,pr.logo_url,pr.banner_url,
  pr.phone,pr.address,pr.district_id,pr.upazila_id,pr.latitude,pr.longitude,
  coalesce(pr.google_maps_url,pr.map_url) as map_url,pr.verified,
  pr.short_description,pr.whatsapp,pr.email,pr.facebook_url,pr.website_url,
  pr.opening_note,pr.emergency_available,pr.about_bn,pr.about_en
from public.providers pr
where public.is_provider_publicly_listable(pr.id);

revoke all on public.public_provider_directory from public;
grant select on public.public_provider_directory to anon,authenticated,service_role;

-- ---------------------------------------------------------------------------
-- 2) Public provider route, cards, content, distance and reception
-- ---------------------------------------------------------------------------
create or replace function public.resolve_public_provider_route(p_identifier text)
returns jsonb
language plpgsql stable security definer set search_path=public
as $$
declare v text:=lower(trim(coalesce(p_identifier,''))); result_id uuid; result_slug text;
begin
  if v='' then return null; end if;
  if v ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select p.id,p.slug into result_id,result_slug from public.providers p
    where p.id=v::uuid and public.is_provider_publicly_listable(p.id);
  else
    select p.id,p.slug into result_id,result_slug from public.providers p
    where p.slug=v and public.is_provider_publicly_listable(p.id);
    if result_id is null then
      select p.id,p.slug into result_id,result_slug
      from public.public_slug_aliases a join public.providers p on p.id=a.entity_id
      where a.entity_type='provider' and a.slug=v and public.is_provider_publicly_listable(p.id);
    end if;
  end if;
  if result_id is null or result_slug is null then return null; end if;
  return jsonb_build_object('id',result_id,'slug',result_slug);
end;
$$;

create or replace function public.get_public_profile_slugs(
  p_doctor_ids uuid[] default null,p_provider_ids uuid[] default null
)
returns table(target_type text,target_id uuid,slug text)
language sql stable security definer set search_path=public
as $$
  select 'doctor'::text,d.id,d.profile_slug from public.doctors d
  where d.profile_slug is not null and p_doctor_ids is not null and d.id=any(p_doctor_ids)
    and public.is_doctor_publicly_listable(d.id)
  union all
  select 'provider'::text,p.id,p.slug from public.providers p
  where p.slug is not null and p_provider_ids is not null and p.id=any(p_provider_ids)
    and public.is_provider_publicly_listable(p.id);
$$;

create or replace function public.get_public_ranked_providers(
  p_district_id bigint default null,p_upazila_id bigint default null,p_limit integer default 20,p_offset integer default 0
)
returns table(
  id uuid,provider_type text,name_bn text,name_en text,slug text,logo_url text,banner_url text,phone text,address text,
  district_id bigint,upazila_id bigint,latitude double precision,longitude double precision,map_url text,verified boolean,
  short_description text,whatsapp text,email text,facebook_url text,website_url text,opening_note text,emergency_available boolean,
  ranking_tier text,is_premium boolean,total_count bigint
)
language sql stable security definer set search_path=public
as $$
  select p.id,p.provider_type,p.name_bn,p.name_en,p.slug,p.logo_url,p.banner_url,p.phone,p.address,p.district_id,p.upazila_id,
    p.latitude,p.longitude,coalesce(p.google_maps_url,p.map_url),p.verified,p.short_description,p.whatsapp,p.email,p.facebook_url,p.website_url,
    p.opening_note,p.emergency_available,public.provider_public_rank_tier(p.id),public.is_provider_premium(p.id),count(*) over()
  from public.providers p
  where public.is_provider_publicly_listable(p.id)
    and (p_district_id is null or p.district_id=p_district_id)
    and (p_upazila_id is null or p.upazila_id=p_upazila_id)
  order by public.provider_public_rank_score(p.id) desc,p.created_at desc,p.name_bn,p.id
  limit greatest(1,least(coalesce(p_limit,20),100)) offset greatest(coalesce(p_offset,0),0);
$$;

create or replace function public.get_public_provider_page_content(p_provider_id uuid)
returns jsonb
language sql stable security definer set search_path=public
as $$
  select jsonb_build_object(
    'provider_id',p.id,'about_bn',p.about_bn,'about_en',p.about_en,
    'slider_images',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'image',s.image,'caption',s.caption,'sort_order',s.sort_order) order by s.sort_order,s.id)
      from (select * from public.provider_slider_images where provider_id=p.id and is_active=true order by sort_order,id limit 4) s),'[]'::jsonb),
    'opening_hours',coalesce((select jsonb_agg(jsonb_build_object('id',h.id,'day_of_week',h.day_of_week,'open_time',h.open_time,'close_time',h.close_time,'is_closed',h.is_closed,'is_24_hours',h.is_24_hours,'note',h.note) order by h.day_of_week)
      from public.provider_opening_hours h where h.provider_id=p.id),'[]'::jsonb),
    'services',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'description',s.description,'icon',s.icon,'image',s.image,'sort_order',s.sort_order) order by s.sort_order,s.id)
      from public.provider_services s where s.provider_id=p.id and s.is_active=true),'[]'::jsonb),
    'treatment_costs',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'cost',c.cost,'sort_order',c.sort_order) order by c.sort_order,c.id)
      from public.provider_treatment_costs c where c.provider_id=p.id),'[]'::jsonb),
    'investigation_costs',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'cost',c.cost,'sort_order',c.sort_order) order by c.sort_order,c.id)
      from public.provider_investigation_costs c where c.provider_id=p.id),'[]'::jsonb)
  )
  from public.providers p
  where p.id=p_provider_id and public.is_provider_publicly_listable(p.id);
$$;

create or replace function public.get_public_provider_distance(
  p_provider_id uuid,p_lat double precision,p_lon double precision
)
returns double precision
language sql stable security definer set search_path=public
as $$
  select round(public.location_distance_km(p_lat,p_lon,p.latitude,p.longitude)::numeric,2)::double precision
  from public.providers p
  where p.id=p_provider_id and public.is_provider_publicly_listable(p.id)
    and p.latitude is not null and p.longitude is not null
    and p_lat between -90 and 90 and p_lon between -180 and 180;
$$;

create or replace function public.get_public_provider_managed_doctor_cards(p_provider_id uuid)
returns table(
  id uuid,provider_id uuid,doctor_name text,photo_path text,degree text,
  designation text,specialty text,bmdc_registration_no text,experience_years integer,
  consultation_fee numeric,visiting_schedule text,appointment_note text,sort_order integer
)
language sql stable security definer set search_path=public
as $$
  select c.id,c.provider_id,c.doctor_name,c.photo_path,c.degree,c.designation,c.specialty,
    c.bmdc_registration_no,c.experience_years,c.consultation_fee,c.visiting_schedule,c.appointment_note,c.sort_order
  from public.provider_managed_doctor_cards c
  where c.provider_id=p_provider_id and c.is_active=true
    and public.is_provider_publicly_listable(c.provider_id)
  order by c.sort_order,c.created_at,c.id;
$$;

create or replace function public.create_provider_reception_appointment(
  p_doctor_card_id uuid,p_appointment_date date,p_preferred_time time default null,p_patient_note text default null
)
returns uuid
language plpgsql security definer set search_path=public
as $$
declare v_id uuid; v_provider uuid; v_owner uuid; v_doctor_name text; v_patient_name text;
begin
  if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if not exists(select 1 from public.profiles where id=auth.uid() and role='patient' and account_status='active' and profile_completed) then
    raise exception 'COMPLETE_PATIENT_PROFILE_REQUIRED';
  end if;
  if p_appointment_date is null or p_appointment_date<current_date or p_appointment_date>current_date+180 then raise exception 'INVALID_APPOINTMENT_DATE'; end if;
  if char_length(coalesce(p_patient_note,''))>500 then raise exception 'PATIENT_NOTE_TOO_LONG'; end if;
  select c.provider_id,pr.owner_user_id,c.doctor_name into v_provider,v_owner,v_doctor_name
  from public.provider_managed_doctor_cards c join public.providers pr on pr.id=c.provider_id
  where c.id=p_doctor_card_id and c.is_active=true and public.is_provider_publicly_listable(pr.id);
  if not found then raise exception 'DOCTOR_CARD_NOT_AVAILABLE'; end if;
  if v_owner is null then raise exception 'RECEPTION_NOT_AVAILABLE'; end if;
  insert into public.provider_reception_appointments(provider_id,doctor_card_id,patient_id,appointment_date,preferred_time,patient_note)
  values(v_provider,p_doctor_card_id,auth.uid(),p_appointment_date,p_preferred_time,nullif(btrim(coalesce(p_patient_note,'')),'')) returning id into v_id;
  select full_name into v_patient_name from public.profiles where id=auth.uid();
  insert into public.notifications(recipient_id,sender_id,type,title_bn,body_bn,data,dedupe_key)
  values(v_owner,auth.uid(),'reception_appointment_new','নতুন Reception appointment',
    coalesce(v_patient_name,'একজন রোগী')||' '||v_doctor_name||'-এর serial চেয়েছেন।',
    jsonb_build_object('reception_appointment_id',v_id,'provider_id',v_provider,'doctor_card_id',p_doctor_card_id,'deep_link','/provider/appointments'),
    'reception_appointment_new:'||v_id::text)
  on conflict(recipient_id,dedupe_key) where dedupe_key is not null do nothing;
  return v_id;
exception when unique_violation then raise exception 'DUPLICATE_RECEPTION_APPOINTMENT';
end;
$$;

-- ---------------------------------------------------------------------------
-- 3) Doctor public chamber/contact/map and direct appointment
-- ---------------------------------------------------------------------------
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
      'present_job',d.present_job,'public_address',d.public_address,'experience_years',d.experience_years,
      'consultation_fee',d.consultation_fee,'headline',d.profile_headline,'bio',d.bio,
      'bio_bn',coalesce(d.bio_bn,d.bio),'bio_en',d.bio_en,'languages',d.languages,
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
    ) order by case when pr.owner_user_id=d.id then 0 else 1 end,pr.name_bn)
      from public.doctor_provider_links dl join public.providers pr on pr.id=dl.provider_id
      where dl.doctor_id=d.id and dl.status='approved'
        and public.is_provider_publicly_listable(pr.id)),'[]'::jsonb)
  )
  from public.doctors d join public.profiles p on p.id=d.id
  where d.id=p_doctor_id and public.is_doctor_publicly_listable(d.id) and p.account_status='active';
$$;

create or replace function public.create_patient_appointment(
  p_doctor_id uuid,p_provider_id uuid default null,p_appointment_date date default null,
  p_start_time time default null,p_end_time time default null,p_patient_note text default null
)
returns uuid
language plpgsql security definer set search_path=public
as $$
declare new_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists(select 1 from public.profiles where id=auth.uid() and role='patient' and account_status='active' and profile_completed) then
    raise exception 'Complete an active patient profile before booking';
  end if;
  if p_provider_id is null or p_appointment_date is null or p_start_time is null or p_end_time is null then
    raise exception 'Chamber, date, and visiting time are required';
  end if;
  if p_appointment_date<current_date or p_appointment_date>current_date+180 then raise exception 'Appointment date must be within the next 180 days'; end if;
  if p_patient_note is not null and length(p_patient_note)>500 then raise exception 'Patient note must be 500 characters or fewer'; end if;
  if not exists(
    select 1 from public.doctors d
    join public.profiles dp on dp.id=d.id
    join public.doctor_provider_links l on l.doctor_id=d.id and l.provider_id=p_provider_id and l.status='approved'
    join public.providers pr on pr.id=l.provider_id
    join public.chamber_schedules cs on cs.doctor_id=d.id and cs.provider_id=pr.id
    where d.id=p_doctor_id and public.is_doctor_publicly_listable(d.id) and d.accepting_appointments
      and dp.account_status='active' and public.is_provider_publicly_listable(pr.id)
      and cs.is_active and cs.day_of_week=extract(dow from p_appointment_date)::smallint
      and cs.start_time=p_start_time and cs.end_time=p_end_time
  ) then raise exception 'Selected doctor/chamber schedule is not available'; end if;
  if exists(select 1 from public.appointments a where a.patient_id=auth.uid() and a.doctor_id=p_doctor_id
    and a.provider_id=p_provider_id and a.appointment_date=p_appointment_date and a.start_time=p_start_time
    and a.status in ('pending','confirmed')) then raise exception 'You already have an active request for this schedule'; end if;
  insert into public.appointments(patient_id,doctor_id,provider_id,appointment_date,start_time,end_time,patient_note,status)
  values(auth.uid(),p_doctor_id,p_provider_id,p_appointment_date,p_start_time,p_end_time,nullif(trim(p_patient_note),''),'pending') returning id into new_id;
  insert into public.notifications(recipient_id,sender_id,type,title_bn,body_bn,data)
  values(p_doctor_id,auth.uid(),'appointment_new','নতুন অ্যাপয়েন্টমেন্ট',
    coalesce((select full_name from public.profiles where id=auth.uid()),'একজন রোগী')||' একটি অ্যাপয়েন্টমেন্টের অনুরোধ করেছেন।',
    jsonb_build_object('appointment_id',new_id));
  return new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4) Provider self-service edits never reset publication/verification
-- ---------------------------------------------------------------------------
create or replace function public.save_my_provider_profile(
  p_provider_id uuid default null,p_name_bn text default null,p_name_en text default null,
  p_short_description text default null,p_logo_url text default null,p_banner_url text default null,
  p_phone text default null,p_whatsapp text default null,p_email text default null,
  p_facebook_url text default null,p_website_url text default null,p_address text default null,
  p_district_id bigint default null,p_upazila_id bigint default null,
  p_latitude double precision default null,p_longitude double precision default null,
  p_google_maps_url text default null,p_opening_note text default null,
  p_emergency_available boolean default false,p_departments text[] default null,
  p_services text[] default null,p_gallery_paths text[] default null
)
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare account_role public.user_role; required_type text; result_id uuid; old_provider public.providers%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select role into account_role from public.profiles where id=auth.uid() and role in ('hospital','chamber') and account_status='active' for update;
  if account_role is null then raise exception 'Active Hospital/Chamber account required'; end if;
  required_type:=case when account_role='hospital' then 'hospital' else 'chamber' end;
  if length(trim(coalesce(p_name_bn,'')))<2 then raise exception 'Provider name is required'; end if;
  if p_short_description is not null and length(p_short_description)>2000 then raise exception 'Description must be 2000 characters or fewer'; end if;
  if cardinality(coalesce(p_departments,'{}'::text[]))>50 or cardinality(coalesce(p_services,'{}'::text[]))>100 then raise exception 'Too many departments or services'; end if;
  if cardinality(coalesce(p_gallery_paths,'{}'::text[]))>8 then raise exception 'Gallery can contain at most 8 images'; end if;
  if p_upazila_id is not null and not exists(select 1 from public.upazilas u where u.id=p_upazila_id and u.district_id=p_district_id and u.is_active) then raise exception 'Upazila does not belong to selected district'; end if;
  if (p_latitude is null)<>(p_longitude is null) then raise exception 'Latitude and longitude must be provided together'; end if;
  if (p_latitude is not null and (p_latitude < -90 or p_latitude > 90)) or (p_longitude is not null and (p_longitude < -180 or p_longitude > 180)) then raise exception 'Invalid map coordinates'; end if;
  if exists(select 1 from unnest(array[p_logo_url,p_banner_url]) path where path is not null and path<>'' and path not like auth.uid()::text||'/%') then raise exception 'Media path must belong to current user'; end if;
  if exists(select 1 from unnest(coalesce(p_gallery_paths,'{}'::text[])) path where path is null or path='' or path not like auth.uid()::text||'/%') then raise exception 'Gallery path must belong to current user'; end if;
  if p_provider_id is null then
    if exists(select 1 from public.providers where owner_user_id=auth.uid()) then raise exception 'This account already has a Provider profile'; end if;
    result_id:=gen_random_uuid();
    insert into public.providers(id,owner_user_id,provider_type,name_bn,name_en,slug,short_description,logo_url,banner_url,phone,whatsapp,email,facebook_url,website_url,address,district_id,upazila_id,latitude,longitude,google_maps_url,opening_note,emergency_available,departments,services,gallery_paths,status,verified)
    values(result_id,auth.uid(),required_type,trim(p_name_bn),nullif(trim(p_name_en),''),required_type||'-'||replace(result_id::text,'-',''),nullif(trim(p_short_description),''),nullif(trim(p_logo_url),''),nullif(trim(p_banner_url),''),nullif(trim(p_phone),''),nullif(trim(p_whatsapp),''),nullif(trim(p_email),''),nullif(trim(p_facebook_url),''),nullif(trim(p_website_url),''),nullif(trim(p_address),''),p_district_id,p_upazila_id,p_latitude,p_longitude,nullif(trim(p_google_maps_url),''),nullif(trim(p_opening_note),''),p_emergency_available,coalesce(p_departments,'{}'::text[]),coalesce(p_services,'{}'::text[]),coalesce(p_gallery_paths,'{}'::text[]),'pending',false);
  else
    select * into old_provider from public.providers where id=p_provider_id and owner_user_id=auth.uid() for update;
    if not found then raise exception 'Provider not found or not owned by this account'; end if;
    if old_provider.provider_type<>required_type then raise exception 'Provider type does not match account role'; end if;
    update public.providers set name_bn=trim(p_name_bn),name_en=nullif(trim(p_name_en),''),short_description=nullif(trim(p_short_description),''),
      logo_url=nullif(trim(p_logo_url),''),banner_url=nullif(trim(p_banner_url),''),phone=nullif(trim(p_phone),''),whatsapp=nullif(trim(p_whatsapp),''),
      email=nullif(trim(p_email),''),facebook_url=nullif(trim(p_facebook_url),''),website_url=nullif(trim(p_website_url),''),address=nullif(trim(p_address),''),
      district_id=p_district_id,upazila_id=p_upazila_id,latitude=p_latitude,longitude=p_longitude,google_maps_url=nullif(trim(p_google_maps_url),''),
      opening_note=nullif(trim(p_opening_note),''),emergency_available=p_emergency_available,departments=coalesce(p_departments,'{}'::text[]),
      services=coalesce(p_services,'{}'::text[]),gallery_paths=coalesce(p_gallery_paths,'{}'::text[]),updated_at=now()
    where id=p_provider_id;
    result_id:=p_provider_id;
  end if;
  update public.profiles set profile_completed=true,updated_at=now() where id=auth.uid();
  return jsonb_build_object('provider_id',result_id,'verification_reset',false);
end;
$$;

-- ---------------------------------------------------------------------------
-- 5) BMDC: owner can enter it once; subsequent corrections are Admin-only
-- ---------------------------------------------------------------------------
create or replace function public.protect_doctor_bmdc_from_owner_change()
returns trigger
language plpgsql security definer set search_path=public
as $$
begin
  if old.bmdc_registration_no is not null
     and new.bmdc_registration_no is distinct from old.bmdc_registration_no
     and not exists(select 1 from public.profiles p where p.id=auth.uid() and p.role in ('admin','super_admin') and p.account_status='active') then
    raise exception 'BMDC_CHANGE_REQUIRES_ADMIN';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_doctor_bmdc_from_owner_change on public.doctors;
create trigger trg_protect_doctor_bmdc_from_owner_change
before update of bmdc_registration_no on public.doctors
for each row execute function public.protect_doctor_bmdc_from_owner_change();

create or replace function public.admin_update_doctor_bmdc(
  p_doctor_id uuid,p_bmdc_registration_no text,p_reason text
)
returns boolean
language plpgsql security definer set search_path=public
as $$
declare v_actor uuid:=auth.uid(); v_old text; v_new text:=nullif(trim(coalesce(p_bmdc_registration_no,'')),'');
begin
  if v_actor is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if not exists(select 1 from public.profiles where id=v_actor and role in ('admin','super_admin') and account_status='active') then raise exception 'ADMIN_REQUIRED'; end if;
  if v_new is null or char_length(v_new)<3 or char_length(v_new)>100 then raise exception 'INVALID_BMDC_NUMBER'; end if;
  if char_length(trim(coalesce(p_reason,'')))<3 then raise exception 'CHANGE_REASON_REQUIRED'; end if;
  select bmdc_registration_no into v_old from public.doctors where id=p_doctor_id for update;
  if not found then raise exception 'DOCTOR_NOT_FOUND'; end if;
  if exists(select 1 from public.doctors where id<>p_doctor_id and bmdc_registration_no=v_new) then raise exception 'BMDC_NUMBER_ALREADY_USED'; end if;
  update public.doctors set bmdc_registration_no=v_new,bmdc_verified=false,verification_status='pending',
    verification_note='BMDC corrected by Admin: '||trim(p_reason),verified_by=null,verified_at=null,updated_at=now()
  where id=p_doctor_id;
  insert into public.admin_audit_logs(actor_id,action,target_user_id,target_type,target_id,metadata)
  values(v_actor,'doctor_bmdc_corrected',p_doctor_id,'doctor',p_doctor_id::text,
    jsonb_build_object('old_bmdc',v_old,'new_bmdc',v_new,'reason',trim(p_reason)));
  insert into public.notifications(recipient_id,sender_id,type,title_bn,body_bn,data)
  values(p_doctor_id,v_actor,'bmdc_corrected','BMDC তথ্য সংশোধন করা হয়েছে','Admin আপনার BMDC নম্বর সংশোধন করেছেন। Verification status পুনরায় pending হয়েছে।',jsonb_build_object('doctor_id',p_doctor_id));
  return true;
end;
$$;

revoke all on function public.protect_doctor_bmdc_from_owner_change() from public,anon,authenticated;
revoke all on function public.admin_update_doctor_bmdc(uuid,text,text) from public,anon;
grant execute on function public.admin_update_doctor_bmdc(uuid,text,text) to authenticated,service_role;

-- Reassert mutation/public RPC ACLs.
revoke all on function public.create_patient_appointment(uuid,uuid,date,time,time,text) from public,anon;
grant execute on function public.create_patient_appointment(uuid,uuid,date,time,time,text) to authenticated,service_role;
revoke all on function public.create_provider_reception_appointment(uuid,date,time,text) from public,anon;
grant execute on function public.create_provider_reception_appointment(uuid,date,time,text) to authenticated,service_role;
revoke all on function public.save_my_provider_profile(uuid,text,text,text,text,text,text,text,text,text,text,text,bigint,bigint,double precision,double precision,text,text,boolean,text[],text[],text[]) from public,anon;
grant execute on function public.save_my_provider_profile(uuid,text,text,text,text,text,text,text,text,text,text,text,bigint,bigint,double precision,double precision,text,text,boolean,text[],text[],text[]) to authenticated,service_role;

revoke all on function public.resolve_public_provider_route(text) from public;
revoke all on function public.get_public_profile_slugs(uuid[],uuid[]) from public;
revoke all on function public.get_public_ranked_providers(bigint,bigint,integer,integer) from public;
revoke all on function public.get_public_provider_page_content(uuid) from public;
revoke all on function public.get_public_provider_distance(uuid,double precision,double precision) from public;
revoke all on function public.get_public_provider_managed_doctor_cards(uuid) from public;
revoke all on function public.get_doctor_public_profile(uuid) from public;
grant execute on function public.resolve_public_provider_route(text),public.get_public_profile_slugs(uuid[],uuid[]),
  public.get_public_ranked_providers(bigint,bigint,integer,integer),public.get_public_provider_page_content(uuid),
  public.get_public_provider_distance(uuid,double precision,double precision),public.get_public_provider_managed_doctor_cards(uuid),
  public.get_doctor_public_profile(uuid) to anon,authenticated,service_role;

do $assert$
begin
  if has_function_privilege('anon','public.create_patient_appointment(uuid,uuid,date,time without time zone,time without time zone,text)','EXECUTE') then raise exception 'anon appointment mutation access detected'; end if;
  if has_function_privilege('anon','public.admin_update_doctor_bmdc(uuid,text,text)','EXECUTE') then raise exception 'anon BMDC admin mutation access detected'; end if;
  if not has_function_privilege('authenticated','public.admin_update_doctor_bmdc(uuid,text,text)','EXECUTE') then raise exception 'authenticated BMDC admin RPC grant missing'; end if;
  if not has_function_privilege('anon','public.get_doctor_public_profile(uuid)','EXECUTE') then raise exception 'public doctor profile grant missing'; end if;
  if not has_function_privilege('anon','public.resolve_public_provider_route(text)','EXECUTE') then raise exception 'public provider route grant missing'; end if;
end;
$assert$;
