-- ============================================================
-- STEP 32 — DOCTOR VERIFICATION PUBLICATION POLICY + DASHBOARD
-- Run after Step 31. Safe to re-run.
--
-- Reuses:
--   doctors.verification_status / bmdc_verified
--   entity_verification_documents
--   verification review queue / decision RPC
--   site_settings
--   public doctor search/profile/Near Me RPCs
--
-- Provider/Hospital publication policy is intentionally unchanged.
-- ============================================================

alter table public.doctors
  add column if not exists medical_session text,
  add column if not exists medical_batch text;

-- Medical college/session/batch are verification identity. Any change
-- invalidates a previous doctor approval but does not suspend the account.
create or replace function public.reset_doctor_verification_on_medical_identity_change()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  if new.medical_college is distinct from old.medical_college
     or new.medical_session is distinct from old.medical_session
     or new.medical_batch is distinct from old.medical_batch then
    new.verification_status := 'pending';
    new.bmdc_verified := false;
    new.verification_note := null;
    new.verified_by := null;
    new.verified_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_doctor_medical_identity_verification_reset on public.doctors;
create trigger trg_doctor_medical_identity_verification_reset
before update of medical_college,medical_session,medical_batch on public.doctors
for each row execute function public.reset_doctor_verification_on_medical_identity_change();

revoke all on function public.reset_doctor_verification_on_medical_identity_change()
from public,anon,authenticated;

insert into public.site_settings(setting_key,setting_value,is_public,description)
values(
  'doctor_verification_publication_policy',
  jsonb_build_object(
    'hide_unverified_doctors',false,
    'new_registration_requires_verification',false,
    'new_registration_verification_enabled_at',null
  ),
  false,
  'Super Admin controlled doctor verification/publication policy'
)
on conflict(setting_key) do nothing;

-- Central doctor-only publication rule.
-- Approved + active doctors are always eligible.
-- Pending + active doctors are eligible unless a Super Admin policy hides them.
-- Rejected/expired and every non-active account remain non-public.
create or replace function public.is_doctor_publicly_listable(p_doctor_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  with policy as (
    select
      coalesce(lower(s.setting_value->>'hide_unverified_doctors')='true',false) as hide_unverified,
      coalesce(lower(s.setting_value->>'new_registration_requires_verification')='true',false) as require_new_verification,
      case
        when coalesce(s.setting_value->>'new_registration_verification_enabled_at','')=''
          then null
        else (s.setting_value->>'new_registration_verification_enabled_at')::timestamptz
      end as require_from
    from public.site_settings s
    where s.setting_key='doctor_verification_publication_policy'
  )
  select coalesce((
    select
      p.account_status='active'
      and (
        d.verification_status='approved'
        or (
          d.verification_status='pending'
          and not coalesce(pol.hide_unverified,false)
          and (
            not coalesce(pol.require_new_verification,false)
            or (
              pol.require_from is not null
              and d.created_at < pol.require_from
            )
          )
        )
      )
    from public.doctors d
    join public.profiles p on p.id=d.id
    left join policy pol on true
    where d.id=p_doctor_id
  ),false);
$$;

revoke all on function public.is_doctor_publicly_listable(uuid)
from public;
grant execute on function public.is_doctor_publicly_listable(uuid)
to anon,authenticated,service_role;

create or replace function public.super_admin_get_doctor_verification_policy()
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare policy jsonb;
begin
  if not public.is_super_admin() then
    raise exception 'Only Super Admin can read doctor publication controls';
  end if;

  select setting_value into policy
  from public.site_settings
  where setting_key='doctor_verification_publication_policy';

  policy := coalesce(policy,'{}'::jsonb);

  return jsonb_build_object(
    'hide_unverified_doctors',
      coalesce(lower(policy->>'hide_unverified_doctors')='true',false),
    'new_registration_requires_verification',
      coalesce(lower(policy->>'new_registration_requires_verification')='true',false),
    'new_registration_verification_enabled_at',
      nullif(policy->>'new_registration_verification_enabled_at',''),
    'active_pending_doctors',
      (select count(*) from public.doctors d join public.profiles p on p.id=d.id
       where p.account_status='active' and d.verification_status='pending'),
    'currently_public_pending_doctors',
      (select count(*) from public.doctors d join public.profiles p on p.id=d.id
       where p.account_status='active' and d.verification_status='pending'
         and public.is_doctor_publicly_listable(d.id)),
    'approved_active_doctors',
      (select count(*) from public.doctors d join public.profiles p on p.id=d.id
       where p.account_status='active' and d.verification_status='approved')
  );
end;
$$;

create or replace function public.super_admin_set_doctor_verification_policy(
  p_hide_unverified_doctors boolean,
  p_new_registration_requires_verification boolean
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  old_policy jsonb := '{}'::jsonb;
  old_require boolean := false;
  enabled_at timestamptz := null;
  next_policy jsonb;
begin
  if not public.is_super_admin() then
    raise exception 'Only Super Admin can change doctor publication controls';
  end if;

  select setting_value into old_policy
  from public.site_settings
  where setting_key='doctor_verification_publication_policy'
  for update;

  old_policy := coalesce(old_policy,'{}'::jsonb);
  old_require := coalesce(lower(old_policy->>'new_registration_requires_verification')='true',false);

  if coalesce(p_new_registration_requires_verification,false) then
    if old_require then
      begin
        enabled_at := nullif(old_policy->>'new_registration_verification_enabled_at','')::timestamptz;
      exception when others then
        enabled_at := null;
      end;
    end if;
    enabled_at := coalesce(enabled_at,now());
  else
    enabled_at := null;
  end if;

  next_policy := jsonb_build_object(
    'hide_unverified_doctors',coalesce(p_hide_unverified_doctors,false),
    'new_registration_requires_verification',coalesce(p_new_registration_requires_verification,false),
    'new_registration_verification_enabled_at',
      case when enabled_at is null then null else to_jsonb(enabled_at) end
  );

  insert into public.site_settings(setting_key,setting_value,is_public,description,updated_by)
  values(
    'doctor_verification_publication_policy',next_policy,false,
    'Super Admin controlled doctor verification/publication policy',auth.uid()
  )
  on conflict(setting_key) do update set
    setting_value=excluded.setting_value,
    is_public=false,
    description=excluded.description,
    updated_by=auth.uid(),
    updated_at=now();

  insert into public.admin_audit_logs(actor_id,action,target_type,target_id,metadata)
  values(
    auth.uid(),'doctor_verification_publication_policy_changed',
    'site_setting','doctor_verification_publication_policy',
    jsonb_build_object('old',old_policy,'new',next_policy)
  );

  return public.super_admin_get_doctor_verification_policy();
end;
$$;

revoke all on function public.super_admin_get_doctor_verification_policy()
from public,anon;
grant execute on function public.super_admin_get_doctor_verification_policy()
to authenticated,service_role;

revoke all on function public.super_admin_set_doctor_verification_policy(boolean,boolean)
from public,anon;
grant execute on function public.super_admin_set_doctor_verification_policy(boolean,boolean)
to authenticated,service_role;

create or replace function public.get_my_doctor_verification_profile()
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare result jsonb;
begin
  if not exists(
    select 1 from public.profiles
    where id=auth.uid() and role='doctor' and account_status='active'
  ) then
    raise exception 'Active Doctor account required';
  end if;

  select jsonb_build_object(
    'doctor_id',d.id,
    'medical_college',d.medical_college,
    'medical_session',d.medical_session,
    'medical_batch',d.medical_batch,
    'bmdc_registration_no',d.bmdc_registration_no,
    'degree',d.degree,
    'verification_status',d.verification_status::text,
    'verification_note',d.verification_note,
    'bmdc_verified',d.bmdc_verified,
    'verified_at',d.verified_at
  ) into result
  from public.doctors d
  where d.id=auth.uid();

  if result is null then
    raise exception 'Doctor profile not found';
  end if;
  return result;
end;
$$;

create or replace function public.update_my_doctor_verification_info(
  p_medical_college text,
  p_medical_session text,
  p_medical_batch text
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  old_row public.doctors%rowtype;
  changed boolean;
  next_status text;
begin
  if not exists(
    select 1 from public.profiles
    where id=auth.uid() and role='doctor' and account_status='active'
  ) then
    raise exception 'Active Doctor account required';
  end if;

  if length(trim(coalesce(p_medical_college,'')))<2 then
    raise exception 'Medical College Name is required';
  end if;
  if length(trim(coalesce(p_medical_session,'')))<1 then
    raise exception 'Session is required';
  end if;
  if length(trim(coalesce(p_medical_batch,'')))<1 then
    raise exception 'Batch is required';
  end if;

  select * into old_row from public.doctors where id=auth.uid() for update;
  if old_row.id is null then raise exception 'Doctor profile not found'; end if;

  changed :=
    old_row.medical_college is distinct from nullif(trim(p_medical_college),'')
    or old_row.medical_session is distinct from nullif(trim(p_medical_session),'')
    or old_row.medical_batch is distinct from nullif(trim(p_medical_batch),'');

  update public.doctors
  set
    medical_college=nullif(trim(p_medical_college),''),
    medical_session=nullif(trim(p_medical_session),''),
    medical_batch=nullif(trim(p_medical_batch),''),
    updated_at=now()
  where id=auth.uid();

  select verification_status::text into next_status
  from public.doctors where id=auth.uid();

  return jsonb_build_object(
    'verification_status',next_status,
    'verification_reset',changed and old_row.verification_status='approved',
    'information_changed',changed
  );
end;
$$;

revoke all on function public.get_my_doctor_verification_profile()
from public,anon;
grant execute on function public.get_my_doctor_verification_profile()
to authenticated,service_role;

revoke all on function public.update_my_doctor_verification_info(text,text,text)
from public,anon;
grant execute on function public.update_my_doctor_verification_info(text,text,text)
to authenticated,service_role;


create or replace view public.public_doctor_directory with (security_invoker=true) as
select d.id as doctor_id,p.full_name,p.avatar_url,d.degree,d.designation,d.professional_title,
d.bmdc_registration_no,d.consultation_fee,d.experience_years,p.district_id,p.upazila_id,d.verification_status
from public.doctors d
join public.profiles p on p.id=d.id
where public.is_doctor_publicly_listable(d.id) and p.account_status='active';

-- get_public_doctor_visiting_cards return shape adds verification_status.
drop function if exists public.get_public_doctor_visiting_cards(uuid[]);
create or replace function public.get_public_doctor_visiting_cards(p_doctor_ids uuid[])
returns table(
  doctor_id uuid,
  doctor_name text,
  avatar_url text,
  degree text,
  professional_title text,
  designation text,
  bmdc_registration_no text,
  medical_college text,
  present_job text,
  verification_status text
)
language sql
stable
security definer
set search_path=public
as $$
  select d.id,p.full_name,coalesce(d.profile_photo_url,p.avatar_url),
         d.degree,d.professional_title,d.designation,d.bmdc_registration_no,
         d.medical_college,d.present_job,d.verification_status::text
  from public.doctors d
  join public.profiles p on p.id=d.id
  where d.id=any(coalesce(p_doctor_ids,'{}'::uuid[]))
    and public.is_doctor_publicly_listable(d.id)
    and p.account_status='active'
  order by p.full_name,d.id;
$$;

create or replace function public.search_doctors_advanced(
  p_query text default null,
  p_district_id bigint default null,
  p_upazila_id bigint default null,
  p_specialty_ids bigint[] default null,
  p_degrees text[] default null,
  p_designations text[] default null,
  p_min_fee numeric default null,
  p_max_fee numeric default null,
  p_available_today boolean default false,
  p_sort text default 'name',
  p_limit integer default 20,
  p_offset integer default 0
)
returns table(
  doctor_id uuid,
  doctor_name text,
  avatar_url text,
  degree text,
  designation text,
  professional_title text,
  consultation_fee numeric,
  experience_years integer,
  district_id bigint,
  district_name_bn text,
  upazila_id bigint,
  upazila_name_bn text,
  specialties jsonb,
  available_today boolean,
  total_count bigint
)
language sql
stable
security definer
set search_path=public
as $$
  with matched as (
    select
      d.id as doctor_id,
      p.full_name as doctor_name,
      p.avatar_url,
      d.degree,
      d.designation,
      d.professional_title,
      d.consultation_fee,
      d.experience_years,
      p.district_id,
      dist.name_bn as district_name_bn,
      p.upazila_id,
      upz.name_bn as upazila_name_bn,
      d.created_at,
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id',sp.id,
            'name_bn',sp.name_bn,
            'name_en',sp.name_en,
            'slug',sp.slug,
            'is_primary',ds.is_primary
          ) order by ds.is_primary desc,sp.sort_order,sp.id
        )
        from public.doctor_specialties ds
        join public.specialties sp on sp.id=ds.specialty_id
        where ds.doctor_id=d.id and sp.is_active
      ),'[]'::jsonb) as specialties,
      exists (
        select 1
        from public.chamber_schedules cs
        join public.providers pr on pr.id=cs.provider_id
        where cs.doctor_id=d.id
          and cs.is_active
          and cs.day_of_week=extract(dow from now() at time zone 'Asia/Dhaka')::smallint
          and pr.status='approved'
          and pr.verified
      ) as available_today
    from public.doctors d
    join public.profiles p on p.id=d.id
    left join public.districts dist on dist.id=p.district_id
    left join public.upazilas upz on upz.id=p.upazila_id
    where public.is_doctor_publicly_listable(d.id)
      and p.account_status='active'
      and (p_district_id is null or p.district_id=p_district_id)
      and (p_upazila_id is null or p.upazila_id=p_upazila_id)
      and (p_min_fee is null or d.consultation_fee >= p_min_fee)
      and (p_max_fee is null or d.consultation_fee <= p_max_fee)
      and (
        p_specialty_ids is null
        or cardinality(p_specialty_ids)=0
        or exists (
          select 1 from public.doctor_specialties ds
          where ds.doctor_id=d.id
            and ds.specialty_id=any(p_specialty_ids)
        )
      )
      and (
        p_degrees is null
        or cardinality(p_degrees)=0
        or exists (
          select 1 from unnest(p_degrees) requested_degree
          where d.degree ilike '%'||requested_degree||'%'
        )
      )
      and (
        p_designations is null
        or cardinality(p_designations)=0
        or exists (
          select 1 from unnest(p_designations) requested_designation
          where d.designation ilike '%'||requested_designation||'%'
        )
      )
      and (
        nullif(trim(p_query),'') is null
        or p.full_name ilike '%'||trim(p_query)||'%'
        or d.degree ilike '%'||trim(p_query)||'%'
        or d.designation ilike '%'||trim(p_query)||'%'
        or d.professional_title ilike '%'||trim(p_query)||'%'
        or dist.name_bn ilike '%'||trim(p_query)||'%'
        or dist.name_en ilike '%'||trim(p_query)||'%'
        or upz.name_bn ilike '%'||trim(p_query)||'%'
        or upz.name_en ilike '%'||trim(p_query)||'%'
        or exists (
          select 1
          from public.doctor_specialties ds
          join public.specialties sp on sp.id=ds.specialty_id
          where ds.doctor_id=d.id
            and (
              sp.name_bn ilike '%'||trim(p_query)||'%'
              or sp.name_en ilike '%'||trim(p_query)||'%'
            )
        )
        or exists (
          select 1
          from public.doctor_specialties ds
          join public.discovery_topic_specialties dts
            on dts.specialty_id=ds.specialty_id
          join public.discovery_topics dt on dt.id=dts.topic_id
          where ds.doctor_id=d.id
            and dt.is_active
            and (
              dt.name_bn ilike '%'||trim(p_query)||'%'
              or dt.name_en ilike '%'||trim(p_query)||'%'
              or exists (
                select 1 from unnest(dt.search_keywords) keyword
                where keyword ilike '%'||trim(p_query)||'%'
                   or trim(p_query) ilike '%'||keyword||'%'
              )
            )
        )
      )
  ), filtered as (
    select *
    from matched
    where not p_available_today or available_today
  )
  select
    f.doctor_id,
    f.doctor_name,
    f.avatar_url,
    f.degree,
    f.designation,
    f.professional_title,
    f.consultation_fee,
    f.experience_years,
    f.district_id,
    f.district_name_bn,
    f.upazila_id,
    f.upazila_name_bn,
    f.specialties,
    f.available_today,
    count(*) over() as total_count
  from filtered f
  order by
    case when p_sort='newest' then f.created_at end desc,
    case when p_sort='fee_low' then f.consultation_fee end asc nulls last,
    case when p_sort='fee_high' then f.consultation_fee end desc nulls last,
    f.doctor_name asc nulls last,
    f.doctor_id
  limit greatest(1,least(p_limit,100))
  offset greatest(p_offset,0);
$$;

create or replace function public.doctors_by_area(
  p_district_id bigint default null,
  p_upazila_id bigint default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table(
  doctor_id uuid,
  doctor_name text,
  avatar_url text,
  degree text,
  designation text,
  consultation_fee numeric,
  district_id bigint,
  upazila_id bigint
)
language sql
stable
security definer
set search_path=public
as $$
  select d.id,p.full_name,p.avatar_url,d.degree,d.designation,
         d.consultation_fee,p.district_id,p.upazila_id
  from public.doctors d
  join public.profiles p on p.id=d.id
  where public.is_doctor_publicly_listable(d.id)
    and p.account_status='active'
    and (p_district_id is null or p.district_id=p_district_id)
    and (p_upazila_id is null or p.upazila_id=p_upazila_id)
  order by p.full_name,d.id
  limit greatest(1,least(p_limit,100))
  offset greatest(p_offset,0);
$$;

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
where public.is_doctor_publicly_listable(d.id) and pr.account_status='active' and p.latitude is not null and p.longitude is not null
and public.location_distance_km(p_lat,p_lon,p.latitude,p.longitude)<=greatest(p_radius_km,0)
and (p_district_id is null or p.district_id=p_district_id)
and (p_upazila_id is null or p.upazila_id=p_upazila_id)
order by public.location_distance_km(p_lat,p_lon,p.latitude,p.longitude),pr.full_name
limit greatest(1,least(p_limit,100)) offset greatest(p_offset,0);
$$;

create or replace function public.get_public_provider_doctors(p_provider_id uuid)
returns table(
  doctor_id uuid,
  doctor_name text,
  avatar_url text,
  degree text,
  designation text,
  professional_title text,
  bmdc_registration_no text,
  consultation_fee numeric,
  experience_years integer,
  district_id bigint,
  district_name_bn text,
  upazila_id bigint,
  upazila_name_bn text,
  specialties jsonb,
  available_today boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    d.id as doctor_id,
    p.full_name as doctor_name,
    coalesce(d.profile_photo_url, p.avatar_url) as avatar_url,
    d.degree,
    d.designation,
    d.professional_title,
    d.bmdc_registration_no,
    d.consultation_fee,
    d.experience_years,
    p.district_id,
    dist.name_bn as district_name_bn,
    p.upazila_id,
    upz.name_bn as upazila_name_bn,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'name_bn', s.name_bn,
          'name_en', s.name_en,
          'slug', s.slug,
          'is_primary', ds.is_primary
        )
        order by ds.is_primary desc, s.sort_order, s.name_bn
      )
      from public.doctor_specialties ds
      join public.specialties s
        on s.id = ds.specialty_id
       and s.is_active = true
      where ds.doctor_id = d.id
    ), '[]'::jsonb) as specialties,
    exists(
      select 1
      from public.chamber_schedules cs
      where cs.provider_id = pr.id
        and cs.doctor_id = d.id
        and cs.is_active = true
        and cs.day_of_week = extract(dow from current_date)::int
    ) as available_today
  from public.providers pr
  join public.doctor_provider_links l
    on l.provider_id = pr.id
   and l.status = 'approved'
  join public.doctors d
    on d.id = l.doctor_id
   and public.is_doctor_publicly_listable(d.id)
  join public.profiles p
    on p.id = d.id
   and p.account_status = 'active'
  left join public.districts dist on dist.id = p.district_id
  left join public.upazilas upz on upz.id = p.upazila_id
  where pr.id = p_provider_id
    and pr.status = 'approved'
    and pr.verified = true
  order by p.full_name, d.id;
$$;

create or replace function public.get_doctor_public_profile(p_doctor_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=public
as $$
  select jsonb_build_object(
    'doctor', jsonb_build_object(
      'id', d.id,
      'name', p.full_name,
      'avatar_url', coalesce(d.profile_photo_url,p.avatar_url),
      'degree', d.degree,
      'designation', d.designation,
      'professional_title', d.professional_title,
      'bmdc_registration_no', d.bmdc_registration_no,
      'verification_status', d.verification_status::text,
      'medical_college', d.medical_college,
      'present_job', d.present_job,
      'experience_years', d.experience_years,
      'consultation_fee', d.consultation_fee,
      'headline', d.profile_headline,
      'bio', d.bio,
      'languages', d.languages,
      'accepting_appointments', d.accepting_appointments
    ),
    'specialties', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',s.id,'name_bn',s.name_bn,'name_en',s.name_en,'icon_url',s.icon_url
      ) order by ds.is_primary desc,s.sort_order,s.name_bn)
      from public.doctor_specialties ds
      join public.specialties s on s.id=ds.specialty_id
      where ds.doctor_id=d.id and s.is_active=true
    ), '[]'::jsonb),
    'chambers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',pr.id,
        'type',pr.provider_type,
        'name_bn',pr.name_bn,
        'name_en',pr.name_en,
        'address',pr.address,
        'district_id',pr.district_id,
        'upazila_id',pr.upazila_id,
        'latitude',pr.latitude,
        'longitude',pr.longitude,
        'map_url',coalesce(pr.google_maps_url,pr.map_url),
        'phone',pr.phone,
        'emergency_available',pr.emergency_available,
        'schedules',coalesce((
          select jsonb_agg(jsonb_build_object(
            'day_of_week',cs.day_of_week,
            'start_time',cs.start_time,
            'end_time',cs.end_time,
            'fee',cs.fee
          ) order by cs.day_of_week,cs.start_time)
          from public.chamber_schedules cs
          where cs.doctor_id=d.id and cs.provider_id=pr.id and cs.is_active=true
        ),'[]'::jsonb)
      ) order by pr.name_bn)
      from public.doctor_provider_links dl
      join public.providers pr on pr.id=dl.provider_id
      where dl.doctor_id=d.id and dl.status='approved'
        and pr.status='approved' and pr.verified=true
    ), '[]'::jsonb)
  )
  from public.doctors d
  join public.profiles p on p.id=d.id
  where d.id=p_doctor_id
    and public.is_doctor_publicly_listable(d.id)
    and p.account_status='active';
$$;

create or replace function public.get_verification_review_detail(
  p_entity_type text,p_entity_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare result jsonb;
begin
  if not public.is_verification_staff() then raise exception 'Verification staff access required'; end if;
  if p_entity_type='doctor' then
    select jsonb_build_object(
      'entity_type','doctor','entity_id',d.id,'owner_id',d.id,
      'status',d.verification_status,'note',d.verification_note,
      'verified_at',d.verified_at,'data',jsonb_build_object(
        'full_name',p.full_name,'email',p.email,'phone',p.phone,
        'district_id',p.district_id,'upazila_id',p.upazila_id,
        'degree',d.degree,'designation',d.designation,
        'professional_title',d.professional_title,
        'bmdc_registration_no',d.bmdc_registration_no,
        'medical_college',d.medical_college,
        'medical_session',d.medical_session,
        'medical_batch',d.medical_batch,
        'experience_years',d.experience_years,
        'profile_photo_url',coalesce(d.profile_photo_url,p.avatar_url),
        'specialties',coalesce((select jsonb_agg(s.name_bn order by s.sort_order,s.id)
          from public.doctor_specialties ds join public.specialties s on s.id=ds.specialty_id
          where ds.doctor_id=d.id),'[]'::jsonb)
      ),'documents',coalesce((select jsonb_agg(jsonb_build_object(
        'document_id',x.id,'document_type',x.document_type,
        'storage_path',x.storage_path,'created_at',x.created_at
      ) order by x.created_at desc) from public.entity_verification_documents x
        where x.entity_type='doctor' and x.entity_id=d.id),'[]'::jsonb)
    ) into result from public.doctors d join public.profiles p on p.id=d.id
    where d.id=p_entity_id;
  elsif p_entity_type='provider' then
    select jsonb_build_object(
      'entity_type','provider','entity_id',pr.id,'owner_id',pr.owner_user_id,
      'status',pr.status,'note',pr.verification_note,'verified_at',pr.verified_at,
      'data',jsonb_build_object(
        'provider_type',pr.provider_type,'name_bn',pr.name_bn,'name_en',pr.name_en,
        'phone',pr.phone,'email',pr.email,'address',pr.address,
        'district_id',pr.district_id,'upazila_id',pr.upazila_id,
        'short_description',pr.short_description,'website_url',pr.website_url,
        'logo_url',pr.logo_url,'banner_url',pr.banner_url,
        'departments',pr.departments,'services',pr.services,
        'gallery_paths',pr.gallery_paths
      ),'documents',coalesce((select jsonb_agg(jsonb_build_object(
        'document_id',x.id,'document_type',x.document_type,
        'storage_path',x.storage_path,'created_at',x.created_at
      ) order by x.created_at desc) from public.entity_verification_documents x
        where x.entity_type='provider' and x.entity_id=pr.id),'[]'::jsonb)
    ) into result from public.providers pr where pr.id=p_entity_id;
  elsif p_entity_type='ambulance' then
    select jsonb_build_object(
      'entity_type','ambulance','entity_id',a.id,'owner_id',a.owner_user_id,
      'status',a.status,'note',a.admin_note,'verified_at',a.verified_at,
      'data',jsonb_build_object(
        'operator_name',a.operator_name,'driver_name',a.driver_name,
        'phone',a.phone,'secondary_phone',a.secondary_phone,
        'vehicle_registration_no',a.vehicle_registration_no,
        'vehicle_type',a.vehicle_type,'capabilities',a.capabilities,
        'service_area',a.service_area,'address',a.address,
        'district_id',a.district_id,'upazila_id',a.upazila_id,
        'latitude',a.latitude,'longitude',a.longitude,
        'operates_24_hours',a.operates_24_hours
      ),'documents',coalesce((select jsonb_agg(jsonb_build_object(
        'document_id',x.id,'document_type',x.document_type,
        'storage_path',x.storage_path,'created_at',x.created_at
      ) order by x.created_at desc) from public.ambulance_verification_documents x
        where x.ambulance_id=a.id),'[]'::jsonb)
    ) into result from public.ambulance_services a where a.id=p_entity_id;
  else raise exception 'Invalid entity type';
  end if;
  if result is null then raise exception 'Review item not found'; end if;
  return result;
end;
$$;

-- Reassert scoped function grants.
revoke all on function public.search_doctors_advanced(
  text,bigint,bigint,bigint[],text[],text[],numeric,numeric,boolean,text,integer,integer
) from public;
grant execute on function public.search_doctors_advanced(
  text,bigint,bigint,bigint[],text[],text[],numeric,numeric,boolean,text,integer,integer
) to anon,authenticated,service_role;

revoke all on function public.doctors_by_area(bigint,bigint,integer,integer) from public;
grant execute on function public.doctors_by_area(bigint,bigint,integer,integer)
to anon,authenticated,service_role;

revoke all on function public.nearest_doctors(
  double precision,double precision,double precision,bigint,bigint,integer,integer
) from public;
grant execute on function public.nearest_doctors(
  double precision,double precision,double precision,bigint,bigint,integer,integer
) to anon,authenticated,service_role;

revoke all on function public.get_public_provider_doctors(uuid) from public;
grant execute on function public.get_public_provider_doctors(uuid)
to anon,authenticated,service_role;

revoke all on function public.get_doctor_public_profile(uuid) from public,anon;
grant execute on function public.get_doctor_public_profile(uuid)
to anon,authenticated,service_role;

revoke all on function public.get_public_doctor_visiting_cards(uuid[]) from public;
grant execute on function public.get_public_doctor_visiting_cards(uuid[])
to anon,authenticated,service_role;

revoke all on function public.get_verification_review_detail(text,uuid) from public,anon;
grant execute on function public.get_verification_review_detail(text,uuid)
to authenticated,service_role;

do $assert$
begin
  if has_function_privilege('anon','public.super_admin_set_doctor_verification_policy(boolean,boolean)','EXECUTE') then
    raise exception 'Step 32 failed: anonymous Super Admin policy mutation remains';
  end if;
  if has_function_privilege('anon','public.get_verification_review_detail(text,uuid)','EXECUTE') then
    raise exception 'Step 32 failed: anonymous verification review access remains';
  end if;
  if has_table_privilege('authenticated','public.doctors','UPDATE') then
    raise exception 'Step 32 failed: direct doctor mutation grant remains';
  end if;
end;
$assert$;

select 'STEP 32 DOCTOR VERIFICATION POLICY PASSED' as result;
