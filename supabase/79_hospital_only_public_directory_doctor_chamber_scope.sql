-- STEP 79: Hospital-only visitor directory and Doctor-owned Chamber scope
-- Public Hospital discovery contains only approved + verified Hospital accounts.
-- A Doctor's own Chamber needs no separate Provider verification and is exposed
-- only through that Doctor's public details/booking flow.

-- ---------------------------------------------------------------------------
-- 1) Public Provider pages/directories are Hospital-account only and verified.
-- ---------------------------------------------------------------------------
create or replace function public.is_provider_publicly_listable(p_provider_id uuid)
returns boolean
language sql stable security definer set search_path=public
as $$
  select coalesce((
    select pr.provider_type='hospital'
      and owner.role='hospital'
      and owner.account_status='active'
      and pr.status='approved'
      and pr.verified=true
    from public.providers pr
    join public.profiles owner on owner.id=pr.owner_user_id
    where pr.id=p_provider_id
  ),false);
$$;

-- This helper is deliberately narrower than general Provider publication:
-- it accepts only a Chamber owned by the same active Doctor account and does
-- not require Provider approval/verification.
create or replace function public.is_doctor_owned_chamber_publicly_listable(
  p_provider_id uuid,p_doctor_id uuid
)
returns boolean
language sql stable security definer set search_path=public
as $$
  select coalesce((
    select pr.provider_type='chamber'
      and pr.owner_user_id=p_doctor_id
      and owner.id=p_doctor_id
      and owner.role='doctor'
      and owner.account_status='active'
      and pr.status<>'suspended'
    from public.providers pr
    join public.profiles owner on owner.id=pr.owner_user_id
    where pr.id=p_provider_id
  ),false);
$$;

revoke all on function public.is_provider_publicly_listable(uuid) from public;
revoke all on function public.is_doctor_owned_chamber_publicly_listable(uuid,uuid) from public;
grant execute on function public.is_provider_publicly_listable(uuid) to anon,authenticated,service_role;
grant execute on function public.is_doctor_owned_chamber_publicly_listable(uuid,uuid) to anon,authenticated,service_role;

-- Doctor-owned Chambers are operational profile details, not independently
-- verifiable Provider listings. Remove legacy pending items from Provider review.
update public.providers pr
set status='approved',verified=false,verification_note=null,verified_by=null,verified_at=null,updated_at=now()
where pr.provider_type='chamber' and pr.status='pending'
  and exists(select 1 from public.profiles owner where owner.id=pr.owner_user_id and owner.role='doctor');

create or replace function public.save_my_doctor_chamber_v2(
  p_provider_id uuid default null,p_name_bn text default null,p_address text default null,
  p_district_id bigint default null,p_upazila_id bigint default null,
  p_phone text default null,p_whatsapp text default null,
  p_latitude double precision default null,p_longitude double precision default null
)
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare result_id uuid; old_provider public.providers%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists(select 1 from public.profiles where id=auth.uid() and role='doctor' and account_status='active') then raise exception 'Active doctor account required'; end if;
  if length(trim(coalesce(p_name_bn,'')))<2 then raise exception 'Chamber name is required'; end if;
  if length(trim(coalesce(p_address,'')))<3 then raise exception 'Chamber address is required'; end if;
  if p_district_id is null or not exists(select 1 from public.districts x where x.id=p_district_id and x.is_active) then raise exception 'Valid district is required'; end if;
  if p_upazila_id is not null and not exists(select 1 from public.upazilas u where u.id=p_upazila_id and u.district_id=p_district_id and u.is_active) then raise exception 'Upazila does not belong to selected district'; end if;
  if (p_latitude is null)<>(p_longitude is null) then raise exception 'Latitude and longitude must be provided together'; end if;
  if (p_latitude is not null and (p_latitude < -90 or p_latitude > 90)) or (p_longitude is not null and (p_longitude < -180 or p_longitude > 180)) then raise exception 'Invalid map coordinates'; end if;
  if p_provider_id is null then
    result_id:=gen_random_uuid();
    insert into public.providers(id,owner_user_id,provider_type,name_bn,slug,phone,whatsapp,address,district_id,upazila_id,latitude,longitude,status,verified)
    values(result_id,auth.uid(),'chamber',trim(p_name_bn),'doctor-chamber-'||replace(result_id::text,'-',''),
      nullif(trim(p_phone),''),nullif(trim(p_whatsapp),''),trim(p_address),p_district_id,p_upazila_id,p_latitude,p_longitude,'approved',false);
    insert into public.doctor_provider_links(doctor_id,provider_id,status,invited_by)
    values(auth.uid(),result_id,'approved',auth.uid())
    on conflict(doctor_id,provider_id) do update set status='approved',invited_by=auth.uid();
  else
    select * into old_provider from public.providers
    where id=p_provider_id and owner_user_id=auth.uid() and provider_type='chamber' for update;
    if not found then raise exception 'Doctor-owned chamber not found'; end if;
    update public.providers set name_bn=trim(p_name_bn),phone=nullif(trim(p_phone),''),whatsapp=nullif(trim(p_whatsapp),''),
      address=trim(p_address),district_id=p_district_id,upazila_id=p_upazila_id,latitude=p_latitude,longitude=p_longitude,
      status=case when status='pending' then 'approved'::public.provider_status else status end,
      verified=false,
      verification_note=case when status='pending' then null else verification_note end,
      verified_by=case when status='pending' then null else verified_by end,
      verified_at=case when status='pending' then null else verified_at end,
      updated_at=now()
    where id=p_provider_id;
    insert into public.doctor_provider_links(doctor_id,provider_id,status,invited_by)
    values(auth.uid(),p_provider_id,'approved',auth.uid())
    on conflict(doctor_id,provider_id) do update set status='approved',invited_by=auth.uid();
    result_id:=p_provider_id;
  end if;
  return jsonb_build_object('provider_id',result_id,'verification_reset',false,'verification_required',false);
end;
$$;

revoke all on function public.save_my_doctor_chamber_v2(uuid,text,text,bigint,bigint,text,text,double precision,double precision) from public,anon;
grant execute on function public.save_my_doctor_chamber_v2(uuid,text,text,bigint,bigint,text,text,double precision,double precision) to authenticated,service_role;

-- Staff verification is for Doctors, Hospital-account Providers and Ambulance
-- services. A Doctor's Chamber is deliberately excluded from both the queue
-- and badge count, even if an old client left it in a legacy pending state.
create or replace function public.get_verification_review_queue(
  p_entity_type text default null,p_status text default 'pending',
  p_limit integer default 50,p_offset integer default 0
)
returns table(
  entity_type text,entity_id uuid,display_name text,subtitle text,
  district_id bigint,upazila_id bigint,status text,evidence_count bigint,
  submitted_at timestamptz
)
language plpgsql stable security definer set search_path=public
as $$
begin
  if not public.is_verification_staff() then raise exception 'Verification staff access required'; end if;
  if p_entity_type is not null and p_entity_type not in ('doctor','provider','ambulance') then raise exception 'Invalid entity type'; end if;
  if p_status is not null and p_status not in ('pending','approved','rejected','suspended','expired') then raise exception 'Invalid status'; end if;
  return query
  with entity_evidence as (
    select x.entity_type,x.entity_id,count(*)::bigint evidence_count
    from public.entity_verification_documents x group by x.entity_type,x.entity_id
  ), ambulance_evidence as (
    select x.ambulance_id,count(*)::bigint evidence_count
    from public.ambulance_verification_documents x group by x.ambulance_id
  ), q as (
    select 'doctor'::text entity_type,d.id entity_id,p.full_name display_name,
      coalesce(d.bmdc_registration_no,d.degree,d.designation) subtitle,
      p.district_id,p.upazila_id,d.verification_status::text status,
      coalesce(ev.evidence_count,0)::bigint evidence_count,
      coalesce(d.verification_submitted_at,d.updated_at) submitted_at
    from public.doctors d
    join public.profiles p on p.id=d.id and p.account_status='active'
    left join entity_evidence ev on ev.entity_type='doctor' and ev.entity_id=d.id
    where d.verification_status<>'pending' or d.verification_submitted_at is not null
    union all
    select 'provider',pr.id,pr.name_bn,pr.provider_type,pr.district_id,pr.upazila_id,
      pr.status::text,coalesce(ev.evidence_count,0)::bigint,pr.updated_at
    from public.providers pr
    join public.profiles owner on owner.id=pr.owner_user_id and owner.account_status='active'
    left join entity_evidence ev on ev.entity_type='provider' and ev.entity_id=pr.id
    where pr.provider_type='hospital' and owner.role='hospital'
    union all
    select 'ambulance',a.id,a.operator_name,a.vehicle_registration_no,a.district_id,a.upazila_id,
      a.status::text,coalesce(ae.evidence_count,0)::bigint,a.updated_at
    from public.ambulance_services a
    join public.profiles owner on owner.id=a.owner_user_id and owner.account_status='active'
    left join ambulance_evidence ae on ae.ambulance_id=a.id
  )
  select q.entity_type,q.entity_id,q.display_name,q.subtitle,q.district_id,q.upazila_id,q.status,q.evidence_count,q.submitted_at
  from q
  where (p_entity_type is null or q.entity_type=p_entity_type)
    and (p_status is null or q.status=p_status)
  order by q.submitted_at,q.entity_type,q.entity_id
  limit greatest(1,least(coalesce(p_limit,50),100)) offset greatest(coalesce(p_offset,0),0);
end;
$$;

create or replace function public.get_my_pending_verification_count()
returns integer
language plpgsql stable security definer set search_path=public
as $$
declare result integer;
begin
  if not public.is_verification_staff() then raise exception 'Verification staff access required'; end if;
  select count(*)::integer into result from (
    select d.id from public.doctors d
    join public.profiles p on p.id=d.id and p.account_status='active'
    where d.verification_status='pending' and d.verification_submitted_at is not null
    union all
    select pr.id from public.providers pr
    join public.profiles p on p.id=pr.owner_user_id and p.account_status='active'
    where pr.provider_type='hospital' and p.role='hospital' and pr.status='pending'
    union all
    select a.id from public.ambulance_services a
    join public.profiles p on p.id=a.owner_user_id and p.account_status='active'
    where a.status='pending'
  ) x;
  return coalesce(result,0);
end;
$$;

revoke all on function public.get_verification_review_queue(text,text,integer,integer) from public,anon;
grant execute on function public.get_verification_review_queue(text,text,integer,integer) to authenticated,service_role;
revoke all on function public.get_my_pending_verification_count() from public,anon;
grant execute on function public.get_my_pending_verification_count() to authenticated,service_role;

-- ---------------------------------------------------------------------------
-- 2) Doctor details: own Chamber (no verification) + verified Hospital only.
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
        and (
          public.is_doctor_owned_chamber_publicly_listable(pr.id,d.id)
          or public.is_provider_publicly_listable(pr.id)
        )),'[]'::jsonb)
  )
  from public.doctors d join public.profiles p on p.id=d.id
  where d.id=p_doctor_id and public.is_doctor_publicly_listable(d.id) and p.account_status='active';
$$;

-- ---------------------------------------------------------------------------
-- 3) Patient booking follows the exact same Chamber/Hospital visibility rule.
-- ---------------------------------------------------------------------------
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
      and dp.account_status='active'
      and (
        public.is_doctor_owned_chamber_publicly_listable(pr.id,d.id)
        or public.is_provider_publicly_listable(pr.id)
      )
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

revoke all on function public.get_doctor_public_profile(uuid) from public;
grant execute on function public.get_doctor_public_profile(uuid) to anon,authenticated,service_role;
revoke all on function public.create_patient_appointment(uuid,uuid,date,time,time,text) from public,anon;
grant execute on function public.create_patient_appointment(uuid,uuid,date,time,time,text) to authenticated,service_role;

do $assert$
begin
  if not has_function_privilege('anon','public.is_provider_publicly_listable(uuid)','EXECUTE') then raise exception 'public Hospital helper grant missing'; end if;
  if not has_function_privilege('anon','public.get_doctor_public_profile(uuid)','EXECUTE') then raise exception 'public Doctor profile grant missing'; end if;
  if has_function_privilege('anon','public.create_patient_appointment(uuid,uuid,date,time without time zone,time without time zone,text)','EXECUTE') then raise exception 'anon appointment mutation access detected'; end if;
end;
$assert$;
