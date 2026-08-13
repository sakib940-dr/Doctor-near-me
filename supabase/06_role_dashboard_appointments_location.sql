-- ============================================================
-- STEP 6 — ROLE-BASED DASHBOARD / ACCESS FOUNDATION
-- Run ONLY this file now.
-- Previous SQL files are stored separately for history.
-- ============================================================

-- ------------------------------------------------------------
-- ROLE DASHBOARD CONTEXT
-- Frontend calls this immediately after authentication.
-- It never returns another user's private data.
-- ------------------------------------------------------------
create or replace function public.get_role_dashboard_context()
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  p public.profiles%rowtype;
  result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into p
  from public.profiles
  where id=auth.uid();

  if not found then
    raise exception 'Profile not found';
  end if;

  result := jsonb_build_object(
    'user_id',p.id,
    'role',p.role,
    'account_status',p.account_status,
    'full_name',p.full_name,
    'avatar_url',p.avatar_url,
    'district_id',p.district_id,
    'upazila_id',p.upazila_id,
    'profile_completed',p.profile_completed
  );

  if p.role='doctor' then
    result := result || jsonb_build_object(
      'doctor',(
        select jsonb_build_object(
          'verification_status',d.verification_status,
          'bmdc_verified',d.bmdc_verified,
          'degree',d.degree,
          'designation',d.designation,
          'consultation_fee',d.consultation_fee,
          'accepting_appointments',d.accepting_appointments
        )
        from public.doctors d where d.id=p.id
      )
    );
  elsif p.role in ('chamber','hospital') then
    result := result || jsonb_build_object(
      'providers',coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',pr.id,'name_bn',pr.name_bn,'provider_type',pr.provider_type,
          'status',pr.status,'verified',pr.verified
        ) order by pr.name_bn)
        from public.providers pr
        where pr.owner_user_id=p.id
      ),'[]'::jsonb)
    );
  elsif p.role='patient' then
    result := result || jsonb_build_object(
      'donor',(
        select jsonb_build_object(
          'is_volunteer',b.is_volunteer,
          'blood_group',b.blood_group,
          'phone_public',b.phone_public,
          'last_donation_date',b.last_donation_date,
          'available_for_requests',b.available_for_requests
        )
        from public.blood_donor_profiles b where b.user_id=p.id
      )
    );
  elsif p.role in ('admin','super_admin') then
    result := result || jsonb_build_object(
      'admin_scope',
      case when p.role='super_admin' then 'full' else 'admin' end
    );
  end if;

  return result;
end;
$$;

-- ------------------------------------------------------------
-- ROLE-SAFE APPOINTMENT DASHBOARD DATA
-- ------------------------------------------------------------
create or replace function public.get_my_appointments(
  p_status text default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table(
  appointment_id uuid,
  appointment_date date,
  start_time time,
  end_time time,
  status text,
  patient_name text,
  doctor_name text,
  provider_name text,
  provider_type text,
  address text,
  consultation_fee numeric,
  patient_note text,
  created_at timestamptz
)
language sql
stable
security invoker
set search_path=public
as $$
  select a.id,a.appointment_date,a.start_time,a.end_time,a.status,
         pp.full_name,dp.full_name,pr.name_bn,pr.provider_type,pr.address,
         d.consultation_fee,
         a.patient_note,a.created_at
  from public.appointments a
  join public.profiles pp on pp.id=a.patient_id
  join public.profiles dp on dp.id=a.doctor_id
  join public.doctors d on d.id=a.doctor_id
  left join public.providers pr on pr.id=a.provider_id
  where (
    a.patient_id=auth.uid()
    or a.doctor_id=auth.uid()
    or exists(
      select 1 from public.providers own
      where own.id=a.provider_id and own.owner_user_id=auth.uid()
    )
    or public.is_admin_or_above()
  )
  and (p_status is null or a.status=p_status)
  order by a.appointment_date desc,a.start_time desc,a.created_at desc
  limit greatest(1,least(p_limit,100))
  offset greatest(p_offset,0);
$$;

-- ------------------------------------------------------------
-- SECURE PATIENT APPOINTMENT CREATION
-- ------------------------------------------------------------
create or replace function public.create_patient_appointment(
  p_doctor_id uuid,
  p_provider_id uuid default null,
  p_appointment_date date default null,
  p_start_time time default null,
  p_end_time time default null,
  p_patient_note text default null
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists(
    select 1 from public.profiles
    where id=auth.uid() and role='patient' and account_status='active'
  ) then
    raise exception 'Only active patient accounts can create appointments';
  end if;

  insert into public.appointments(
    patient_id,doctor_id,provider_id,appointment_date,
    start_time,end_time,patient_note,status
  )
  values(
    auth.uid(),p_doctor_id,p_provider_id,p_appointment_date,
    p_start_time,p_end_time,p_patient_note,'pending'
  )
  returning id into new_id;

  insert into public.notifications(
    recipient_id,sender_id,type,title_bn,body_bn,data
  )
  values(
    p_doctor_id,auth.uid(),'appointment_new',
    'নতুন অ্যাপয়েন্টমেন্ট',
    coalesce((select full_name from public.profiles where id=auth.uid()),'একজন রোগী')
      || ' একটি অ্যাপয়েন্টমেন্টের অনুরোধ করেছেন।',
    jsonb_build_object('appointment_id',new_id)
  );

  return new_id;
end;
$$;

-- ------------------------------------------------------------
-- SECURE APPOINTMENT STATUS CHANGE
-- Patient can cancel; doctor/chamber owner/admin can process.
-- ------------------------------------------------------------
create or replace function public.update_appointment_status(
  p_appointment_id uuid,
  p_status text
)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare
  a public.appointments%rowtype;
  can_manage boolean := false;
begin
  select * into a from public.appointments
  where id=p_appointment_id for update;

  if not found then raise exception 'Appointment not found'; end if;

  if a.patient_id=auth.uid() and p_status='cancelled' then
    can_manage := true;
  elsif a.doctor_id=auth.uid() then
    can_manage := true;
  elsif exists(
    select 1 from public.providers p
    where p.id=a.provider_id and p.owner_user_id=auth.uid()
  ) then
    can_manage := true;
  elsif public.is_admin_or_above() then
    can_manage := true;
  end if;

  if not can_manage then raise exception 'Not authorized'; end if;

  if p_status not in ('pending','confirmed','rejected','cancelled','completed','no_show') then
    raise exception 'Invalid appointment status';
  end if;

  update public.appointments
  set status=p_status,updated_at=now()
  where id=p_appointment_id;

  if a.patient_id<>auth.uid() then
    insert into public.notifications(
      recipient_id,sender_id,type,title_bn,body_bn,data
    )
    values(
      a.patient_id,auth.uid(),'appointment_status',
      'অ্যাপয়েন্টমেন্ট আপডেট',
      'আপনার অ্যাপয়েন্টমেন্টের স্ট্যাটাস পরিবর্তন হয়েছে।',
      jsonb_build_object('appointment_id',a.id,'status',p_status)
    );
  end if;

  return true;
end;
$$;

-- ------------------------------------------------------------
-- LAST LOCATION UPDATE
-- Stores one current row + optional history row.
-- Exact coordinates remain protected by existing RLS.
-- ------------------------------------------------------------
create or replace function public.update_my_current_location(
  p_latitude double precision,
  p_longitude double precision,
  p_district_id bigint default null,
  p_upazila_id bigint default null,
  p_accuracy_meters numeric default null,
  p_source text default 'gps',
  p_save_history boolean default true
)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  if p_latitude not between -90 and 90
     or p_longitude not between -180 and 180 then
    raise exception 'Invalid coordinates';
  end if;

  if p_source not in ('gps','manual','network') then
    raise exception 'Invalid location source';
  end if;

  insert into public.user_current_locations(
    user_id,latitude,longitude,district_id,upazila_id,accuracy_meters,source,updated_at
  )
  values(
    auth.uid(),p_latitude,p_longitude,p_district_id,p_upazila_id,
    p_accuracy_meters,p_source,now()
  )
  on conflict(user_id) do update set
    latitude=excluded.latitude,
    longitude=excluded.longitude,
    district_id=excluded.district_id,
    upazila_id=excluded.upazila_id,
    accuracy_meters=excluded.accuracy_meters,
    source=excluded.source,
    updated_at=now();

  if p_save_history then
    insert into public.user_locations(
      user_id,latitude,longitude,district_id,upazila_id,accuracy_meters,source
    )
    values(
      auth.uid(),p_latitude,p_longitude,p_district_id,p_upazila_id,
      p_accuracy_meters,p_source
    );
  end if;

  return true;
end;
$$;

-- ------------------------------------------------------------
-- SUPER ADMIN LAST LOCATION LOOKUP
-- Only Super Admin can call this.
-- Returns latest point, not complete history.
-- ------------------------------------------------------------
create or replace function public.super_admin_get_last_location(
  p_user_id uuid
)
returns table(
  user_id uuid,
  latitude double precision,
  longitude double precision,
  district_id bigint,
  upazila_id bigint,
  accuracy_meters numeric,
  source text,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path=public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Only Super Admin can access last user location';
  end if;

  return query
  select u.user_id,u.latitude,u.longitude,u.district_id,u.upazila_id,
         u.accuracy_meters,u.source,u.updated_at
  from public.user_current_locations u
  where u.user_id=p_user_id;
end;
$$;

-- ------------------------------------------------------------
-- NOTIFICATION READ STATE
-- ------------------------------------------------------------
create or replace function public.mark_notification_read(
  p_notification_id uuid
)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
begin
  update public.notifications
  set read_at=coalesce(read_at,now())
  where id=p_notification_id and recipient_id=auth.uid();

  return found;
end;
$$;

-- ------------------------------------------------------------
-- DASHBOARD COUNTS
-- Minimal counts only; no heavy dashboard query.
-- ------------------------------------------------------------
create or replace function public.get_my_dashboard_counts()
returns jsonb
language sql
stable
security definer
set search_path=public
as $$
  select jsonb_build_object(
    'unread_notifications',(
      select count(*) from public.notifications
      where recipient_id=auth.uid() and read_at is null
    ),
    'pending_appointments',(
      select count(*) from public.appointments
      where status='pending'
        and (patient_id=auth.uid() or doctor_id=auth.uid()
          or exists(select 1 from public.providers p where p.id=provider_id and p.owner_user_id=auth.uid()))
    ),
    'open_blood_requests',(
      select count(*) from public.blood_requests
      where status in ('open','partially_fulfilled')
        and (
          requester_id=auth.uid()
          or exists(
            select 1 from public.blood_donor_profiles b
            where b.user_id=auth.uid()
              and b.is_volunteer=true
              and b.available_for_requests=true
              and b.blood_group=public.blood_requests.blood_group
          )
        )
    )
  );
$$;

-- ------------------------------------------------------------
-- INDEXES
-- ------------------------------------------------------------
create index if not exists idx_notifications_unread
  on public.notifications(recipient_id,read_at,created_at desc);

create index if not exists idx_current_location_updated
  on public.user_current_locations(updated_at desc);

create index if not exists idx_blood_requests_status_group
  on public.blood_requests(status,blood_group,created_at desc);

-- ============================================================
-- END STEP 6
-- ============================================================
