-- ============================================================
-- STEP 31 — DOCTOR CHAMBER DETAILS + LOCATION
-- Reuses providers, doctor_provider_links and chamber_schedules.
-- No duplicate chamber/location/distance tables are created.
-- Run after Step 30. Safe to re-run.
-- ============================================================

-- Extend the canonical Doctor owner read with chamber location/ownership data.
create or replace function public.get_my_doctor_profile()
returns jsonb
language sql
stable
security definer
set search_path=public
as $$
  select jsonb_build_object(
    'doctor',jsonb_build_object(
      'id',d.id,'full_name',p.full_name,'email',p.email,'phone',p.phone,
      'district_id',p.district_id,'upazila_id',p.upazila_id,
      'professional_title',d.professional_title,'degree',d.degree,
      'designation',d.designation,'bmdc_registration_no',d.bmdc_registration_no,
      'medical_college',d.medical_college,'present_job',d.present_job,
      'bmdc_verified',d.bmdc_verified,'bio',d.bio,
      'consultation_fee',d.consultation_fee,
      'experience_years',d.experience_years,
      'verification_status',d.verification_status,
      'profile_headline',d.profile_headline,
      'profile_photo_url',coalesce(d.profile_photo_url,p.avatar_url),
      'consultation_note',d.consultation_note,'languages',d.languages,
      'accepting_appointments',d.accepting_appointments
    ),
    'specialty_ids',coalesce((
      select jsonb_agg(ds.specialty_id order by ds.is_primary desc,s.sort_order,s.id)
      from public.doctor_specialties ds
      join public.specialties s on s.id=ds.specialty_id
      where ds.doctor_id=d.id and s.is_active
    ),'[]'::jsonb),
    'chambers',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',pr.id,'name_bn',pr.name_bn,'provider_type',pr.provider_type,
        'address',pr.address,'phone',pr.phone,
        'district_id',pr.district_id,'upazila_id',pr.upazila_id,
        'latitude',pr.latitude,'longitude',pr.longitude,
        'map_url',coalesce(pr.google_maps_url,pr.map_url),
        'owned_by_doctor',(pr.owner_user_id=d.id and pr.provider_type='chamber'),
        'link_status',l.status,'provider_status',pr.status,
        'verified',pr.verified,
        'schedules',coalesce((
          select jsonb_agg(jsonb_build_object(
            'id',cs.id,'day_of_week',cs.day_of_week,
            'start_time',cs.start_time,'end_time',cs.end_time,
            'fee',cs.fee,'is_active',cs.is_active
          ) order by cs.day_of_week,cs.start_time,cs.id)
          from public.chamber_schedules cs
          where cs.doctor_id=d.id and cs.provider_id=pr.id
        ),'[]'::jsonb)
      ) order by (pr.owner_user_id=d.id) desc,pr.name_bn,pr.id)
      from public.doctor_provider_links l
      join public.providers pr on pr.id=l.provider_id
      where l.doctor_id=d.id
    ),'[]'::jsonb)
  )
  from public.doctors d
  join public.profiles p on p.id=d.id
  where d.id=auth.uid() and p.role='doctor' and p.account_status='active';
$$;

-- A Doctor may create/edit only chamber providers that the same Doctor owns.
-- Shared hospitals/chambers remain owned and editable by their provider account.
create or replace function public.save_my_doctor_chamber(
  p_provider_id uuid default null,
  p_name_bn text default null,
  p_address text default null,
  p_district_id bigint default null,
  p_upazila_id bigint default null,
  p_phone text default null,
  p_latitude double precision default null,
  p_longitude double precision default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  result_id uuid;
  old_provider public.providers%rowtype;
  identity_or_location_changed boolean:=false;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists(
    select 1 from public.profiles
    where id=auth.uid() and role='doctor' and account_status='active'
  ) then raise exception 'Active doctor account required'; end if;

  if length(trim(coalesce(p_name_bn,'')))<2 then raise exception 'Chamber name is required'; end if;
  if length(trim(coalesce(p_address,'')))<3 then raise exception 'Chamber address is required'; end if;
  if p_district_id is null or not exists(
    select 1 from public.districts x where x.id=p_district_id and x.is_active
  ) then raise exception 'Valid district is required'; end if;
  if p_upazila_id is not null and not exists(
    select 1 from public.upazilas u
    where u.id=p_upazila_id and u.district_id=p_district_id and u.is_active
  ) then raise exception 'Upazila does not belong to selected district'; end if;
  if (p_latitude is null) <> (p_longitude is null) then
    raise exception 'Latitude and longitude must be provided together';
  end if;
  if (p_latitude is not null and (p_latitude < -90 or p_latitude > 90))
     or (p_longitude is not null and (p_longitude < -180 or p_longitude > 180)) then
    raise exception 'Invalid map coordinates';
  end if;

  if p_provider_id is null then
    result_id:=gen_random_uuid();
    insert into public.providers(
      id,owner_user_id,provider_type,name_bn,slug,phone,address,
      district_id,upazila_id,latitude,longitude,status,verified
    ) values(
      result_id,auth.uid(),'chamber',trim(p_name_bn),
      'doctor-chamber-'||replace(result_id::text,'-',''),nullif(trim(p_phone),''),
      trim(p_address),p_district_id,p_upazila_id,p_latitude,p_longitude,
      'pending',false
    );

    insert into public.doctor_provider_links(doctor_id,provider_id,status,invited_by)
    values(auth.uid(),result_id,'approved',auth.uid())
    on conflict(doctor_id,provider_id) do update
      set status='approved',invited_by=auth.uid();

    identity_or_location_changed:=true;
  else
    select * into old_provider
    from public.providers
    where id=p_provider_id and owner_user_id=auth.uid() and provider_type='chamber'
    for update;
    if not found then raise exception 'Doctor-owned chamber not found'; end if;

    identity_or_location_changed:=
      old_provider.name_bn is distinct from trim(p_name_bn)
      or old_provider.address is distinct from trim(p_address)
      or old_provider.district_id is distinct from p_district_id
      or old_provider.upazila_id is distinct from p_upazila_id
      or old_provider.latitude is distinct from p_latitude
      or old_provider.longitude is distinct from p_longitude;

    update public.providers set
      name_bn=trim(p_name_bn),
      phone=nullif(trim(p_phone),''),
      address=trim(p_address),
      district_id=p_district_id,
      upazila_id=p_upazila_id,
      latitude=p_latitude,
      longitude=p_longitude,
      status=case when identity_or_location_changed then 'pending'::public.provider_status else status end,
      verified=case when identity_or_location_changed then false else verified end,
      verification_note=case when identity_or_location_changed then null else verification_note end,
      verified_by=case when identity_or_location_changed then null else verified_by end,
      verified_at=case when identity_or_location_changed then null else verified_at end,
      updated_at=now()
    where id=p_provider_id;

    insert into public.doctor_provider_links(doctor_id,provider_id,status,invited_by)
    values(auth.uid(),p_provider_id,'approved',auth.uid())
    on conflict(doctor_id,provider_id) do update
      set status='approved';
    result_id:=p_provider_id;
  end if;

  return jsonb_build_object(
    'provider_id',result_id,
    'verification_reset',identity_or_location_changed
  );
end;
$$;

-- Preserve the existing schedule system. Doctors may prepare schedules for
-- their own pending chamber before provider verification; shared providers
-- still require the existing approved+verified link.
create or replace function public.save_my_chamber_schedule(
  p_provider_id uuid,
  p_day_of_week smallint,
  p_start_time time,
  p_end_time time,
  p_fee numeric default null,
  p_is_active boolean default true,
  p_schedule_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  result_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists(
    select 1 from public.profiles
    where id=auth.uid() and role='doctor' and account_status='active'
  ) then raise exception 'Active doctor account required'; end if;
  if p_day_of_week not between 0 and 6 then raise exception 'Invalid weekday'; end if;
  if p_start_time is null or p_end_time is null or p_end_time<=p_start_time then
    raise exception 'End time must be after start time';
  end if;
  if p_fee is not null and p_fee<0 then raise exception 'Fee cannot be negative'; end if;

  if not exists(
    select 1
    from public.doctor_provider_links l
    join public.providers p on p.id=l.provider_id
    where l.doctor_id=auth.uid() and l.provider_id=p_provider_id
      and l.status='approved'
      and (
        (p.owner_user_id=auth.uid() and p.provider_type='chamber')
        or (p.status='approved' and p.verified)
      )
  ) then raise exception 'An approved provider link or Doctor-owned chamber is required'; end if;

  if p_schedule_id is null then
    insert into public.chamber_schedules(
      doctor_id,provider_id,day_of_week,start_time,end_time,fee,is_active
    ) values(
      auth.uid(),p_provider_id,p_day_of_week,p_start_time,p_end_time,p_fee,p_is_active
    ) returning id into result_id;
  else
    update public.chamber_schedules
    set provider_id=p_provider_id,day_of_week=p_day_of_week,
        start_time=p_start_time,end_time=p_end_time,fee=p_fee,
        is_active=p_is_active
    where id=p_schedule_id and doctor_id=auth.uid()
    returning id into result_id;
    if result_id is null then raise exception 'Schedule not found'; end if;
  end if;
  return result_id;
exception
  when unique_violation then raise exception 'This schedule already exists';
end;
$$;

-- Existing verification evidence infrastructure can recognize a Doctor-owned
-- chamber provider without granting access to providers owned by other users.
create or replace function public.is_entity_verification_owner(
  p_entity_type text,p_entity_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select case p_entity_type
    when 'doctor' then exists(
      select 1 from public.profiles p
      where p.id=p_entity_id and p.id=auth.uid()
        and p.role='doctor' and p.account_status='active'
    )
    when 'provider' then exists(
      select 1 from public.providers pr
      join public.profiles p on p.id=pr.owner_user_id
      where pr.id=p_entity_id and pr.owner_user_id=auth.uid()
        and p.account_status='active'
        and (
          p.role in ('hospital','chamber')
          or (p.role='doctor' and pr.provider_type='chamber')
        )
    )
    else false
  end;
$$;

revoke all on function public.save_my_doctor_chamber(
  uuid,text,text,bigint,bigint,text,double precision,double precision
) from public,anon;
grant execute on function public.save_my_doctor_chamber(
  uuid,text,text,bigint,bigint,text,double precision,double precision
) to authenticated,service_role;

revoke all on function public.get_my_doctor_profile() from public,anon;
grant execute on function public.get_my_doctor_profile() to authenticated,service_role;

revoke all on function public.save_my_chamber_schedule(
  uuid,smallint,time,time,numeric,boolean,uuid
) from public,anon;
grant execute on function public.save_my_chamber_schedule(
  uuid,smallint,time,time,numeric,boolean,uuid
) to authenticated,service_role;

revoke all on function public.is_entity_verification_owner(text,uuid) from public,anon;
grant execute on function public.is_entity_verification_owner(text,uuid) to authenticated,service_role;

-- Keep sensitive mutation RPC-only and preserve RLS.
revoke insert,update,delete on table public.providers from public,anon,authenticated;
revoke insert,update,delete on table public.doctor_provider_links from public,anon,authenticated;
revoke insert,update,delete on table public.chamber_schedules from public,anon,authenticated;

do $assert$
begin
  if has_table_privilege('authenticated','public.providers','UPDATE')
     or has_table_privilege('authenticated','public.doctor_provider_links','INSERT')
     or has_table_privilege('authenticated','public.chamber_schedules','INSERT') then
    raise exception 'Step 31 failed: direct chamber mutation grant remains';
  end if;
  if has_function_privilege(
    'anon',
    'public.save_my_doctor_chamber(uuid,text,text,bigint,bigint,text,double precision,double precision)',
    'EXECUTE'
  ) then raise exception 'Step 31 failed: anon chamber mutation must be blocked'; end if;
end;
$assert$;

select 'STEP 31 DOCTOR CHAMBER DETAILS PASSED' as result;
