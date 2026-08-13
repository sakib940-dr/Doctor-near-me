-- ============================================================
-- STEP 14 — PATIENT PROFILE + APPOINTMENT SECURITY
-- Run after Step 13. Safe to re-run.
-- ============================================================

create or replace function public.get_my_patient_profile()
returns jsonb
language sql
stable
security definer
set search_path=public
as $$
  select jsonb_build_object(
    'user_id',p.id,
    'full_name',p.full_name,
    'email',p.email,
    'phone',p.phone,
    'date_of_birth',p.date_of_birth,
    'gender',p.gender,
    'blood_group',p.blood_group,
    'address_line',p.address_line,
    'district_id',p.district_id,
    'upazila_id',p.upazila_id,
    'emergency_contact_name',p.emergency_contact_name,
    'emergency_contact_phone',p.emergency_contact_phone,
    'preferred_language',p.preferred_language,
    'profile_completed',p.profile_completed
  )
  from public.profiles p
  where p.id=auth.uid()
    and p.role='patient'
    and p.account_status='active';
$$;

create or replace function public.update_my_patient_profile(
  p_full_name text default null,
  p_phone text default null,
  p_date_of_birth date default null,
  p_gender text default null,
  p_blood_group text default null,
  p_address_line text default null,
  p_district_id bigint default null,
  p_upazila_id bigint default null,
  p_emergency_contact_name text default null,
  p_emergency_contact_phone text default null
)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists(
    select 1 from public.profiles
    where id=auth.uid() and role='patient' and account_status='active'
  ) then
    raise exception 'Only active patient accounts can update this profile';
  end if;

  if p_full_name is not null and length(trim(p_full_name))<2 then
    raise exception 'Full name is required';
  end if;

  if p_gender is not null and p_gender not in ('male','female','other') then
    raise exception 'Invalid gender';
  end if;

  if p_blood_group is not null
     and upper(p_blood_group) not in ('A+','A-','B+','B-','AB+','AB-','O+','O-') then
    raise exception 'Invalid blood group';
  end if;

  if p_date_of_birth is not null and p_date_of_birth>current_date then
    raise exception 'Date of birth cannot be in the future';
  end if;

  if p_upazila_id is not null and not exists(
    select 1 from public.upazilas u
    where u.id=p_upazila_id and u.district_id=p_district_id and u.is_active
  ) then
    raise exception 'Upazila does not belong to the selected district';
  end if;

  update public.profiles
  set full_name=coalesce(nullif(trim(p_full_name),''),full_name),
      phone=coalesce(nullif(trim(p_phone),''),phone),
      date_of_birth=coalesce(p_date_of_birth,date_of_birth),
      gender=coalesce(p_gender,gender),
      blood_group=coalesce(upper(p_blood_group),blood_group),
      address_line=coalesce(nullif(trim(p_address_line),''),address_line),
      district_id=coalesce(p_district_id,district_id),
      upazila_id=case
        when p_district_id is not null then p_upazila_id
        else upazila_id
      end,
      emergency_contact_name=coalesce(
        nullif(trim(p_emergency_contact_name),''),emergency_contact_name
      ),
      emergency_contact_phone=coalesce(
        nullif(trim(p_emergency_contact_phone),''),emergency_contact_phone
      ),
      profile_completed=true,
      updated_at=now()
  where id=auth.uid();

  return found;
end;
$$;

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
security definer
set search_path=public
as $$
  select a.id,a.appointment_date,a.start_time,a.end_time,a.status,
         pp.full_name,dp.full_name,pr.name_bn,pr.provider_type,pr.address,
         coalesce(cs.fee,d.consultation_fee),a.patient_note,a.created_at
  from public.appointments a
  join public.profiles pp on pp.id=a.patient_id
  join public.profiles dp on dp.id=a.doctor_id
  join public.doctors d on d.id=a.doctor_id
  left join public.providers pr on pr.id=a.provider_id
  left join public.chamber_schedules cs
    on cs.doctor_id=a.doctor_id and cs.provider_id=a.provider_id
   and cs.day_of_week=extract(dow from a.appointment_date)::smallint
   and cs.start_time=a.start_time and cs.end_time=a.end_time
  where auth.uid() is not null
    and (
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
      and profile_completed
  ) then
    raise exception 'Complete an active patient profile before booking';
  end if;

  if p_provider_id is null or p_appointment_date is null
     or p_start_time is null or p_end_time is null then
    raise exception 'Chamber, date, and visiting time are required';
  end if;

  if p_appointment_date<current_date
     or p_appointment_date>current_date+180 then
    raise exception 'Appointment date must be within the next 180 days';
  end if;

  if p_patient_note is not null and length(p_patient_note)>500 then
    raise exception 'Patient note must be 500 characters or fewer';
  end if;

  if not exists(
    select 1
    from public.doctors d
    join public.profiles dp on dp.id=d.id
    join public.doctor_provider_links l
      on l.doctor_id=d.id and l.provider_id=p_provider_id
    join public.providers pr on pr.id=l.provider_id
    join public.chamber_schedules cs
      on cs.doctor_id=d.id and cs.provider_id=pr.id
    where d.id=p_doctor_id
      and d.verification_status='approved'
      and d.accepting_appointments
      and dp.account_status='active'
      and l.status='approved'
      and pr.status='approved' and pr.verified
      and cs.is_active
      and cs.day_of_week=extract(dow from p_appointment_date)::smallint
      and cs.start_time=p_start_time
      and cs.end_time=p_end_time
  ) then
    raise exception 'Selected doctor/chamber schedule is not available';
  end if;

  if exists(
    select 1 from public.appointments a
    where a.patient_id=auth.uid()
      and a.doctor_id=p_doctor_id
      and a.provider_id=p_provider_id
      and a.appointment_date=p_appointment_date
      and a.start_time=p_start_time
      and a.status in ('pending','confirmed')
  ) then
    raise exception 'You already have an active request for this schedule';
  end if;

  insert into public.appointments(
    patient_id,doctor_id,provider_id,appointment_date,
    start_time,end_time,patient_note,status
  ) values(
    auth.uid(),p_doctor_id,p_provider_id,p_appointment_date,
    p_start_time,p_end_time,nullif(trim(p_patient_note),''),'pending'
  ) returning id into new_id;

  insert into public.notifications(
    recipient_id,sender_id,type,title_bn,body_bn,data
  ) values(
    p_doctor_id,auth.uid(),'appointment_new','নতুন অ্যাপয়েন্টমেন্ট',
    coalesce((select full_name from public.profiles where id=auth.uid()),'একজন রোগী')
      || ' একটি অ্যাপয়েন্টমেন্টের অনুরোধ করেছেন।',
    jsonb_build_object('appointment_id',new_id)
  );

  return new_id;
end;
$$;

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
  can_manage boolean:=false;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into a from public.appointments
  where id=p_appointment_id for update;
  if not found then raise exception 'Appointment not found'; end if;

  if a.patient_id=auth.uid() then
    if p_status<>'cancelled' or a.status not in ('pending','confirmed') then
      raise exception 'Patient can only cancel pending or confirmed appointments';
    end if;
    can_manage:=true;
  elsif a.doctor_id=auth.uid()
     or exists(
       select 1 from public.providers p
       where p.id=a.provider_id and p.owner_user_id=auth.uid()
     )
     or public.is_admin_or_above() then
    can_manage:=true;
  end if;

  if not can_manage then raise exception 'Not authorized'; end if;

  if p_status not in (
    'pending','confirmed','rejected','cancelled','completed','no_show'
  ) then
    raise exception 'Invalid appointment status';
  end if;

  update public.appointments
  set status=p_status,updated_at=now()
  where id=p_appointment_id;

  if a.patient_id<>auth.uid() then
    insert into public.notifications(
      recipient_id,sender_id,type,title_bn,body_bn,data
    ) values(
      a.patient_id,auth.uid(),'appointment_status',
      'অ্যাপয়েন্টমেন্ট আপডেট',
      'আপনার অ্যাপয়েন্টমেন্টের স্ট্যাটাস পরিবর্তন হয়েছে।',
      jsonb_build_object('appointment_id',a.id,'status',p_status)
    );
  end if;

  return true;
end;
$$;

-- Appointment mutations are RPC-only. This blocks direct payload tampering.
revoke insert,update,delete on table public.appointments
from public,anon,authenticated;

revoke all on function public.get_my_patient_profile() from public,anon;
grant execute on function public.get_my_patient_profile()
to authenticated,service_role;

revoke all on function public.update_my_patient_profile(
  text,text,date,text,text,text,bigint,bigint,text,text
) from public,anon;
grant execute on function public.update_my_patient_profile(
  text,text,date,text,text,text,bigint,bigint,text,text
) to authenticated,service_role;

revoke all on function public.get_my_appointments(text,integer,integer)
from public,anon;
grant execute on function public.get_my_appointments(text,integer,integer)
to authenticated,service_role;

revoke all on function public.create_patient_appointment(
  uuid,uuid,date,time,time,text
) from public,anon;
grant execute on function public.create_patient_appointment(
  uuid,uuid,date,time,time,text
) to authenticated,service_role;

revoke all on function public.update_appointment_status(uuid,text)
from public,anon;
grant execute on function public.update_appointment_status(uuid,text)
to authenticated,service_role;

do $assert$
begin
  if has_table_privilege('authenticated','public.appointments','INSERT')
     or has_table_privilege('authenticated','public.appointments','UPDATE')
     or has_table_privilege('authenticated','public.appointments','DELETE') then
    raise exception 'Step 14 failed: direct appointment mutation grant remains';
  end if;

  if has_function_privilege(
    'anon','public.create_patient_appointment(uuid,uuid,date,time,time,text)','EXECUTE'
  ) then
    raise exception 'Step 14 failed: anon appointment creation must be blocked';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.create_patient_appointment(uuid,uuid,date,time,time,text)','EXECUTE'
  ) then
    raise exception 'Step 14 failed: authenticated appointment RPC is missing';
  end if;
end;
$assert$;

select 'STEP 14 PATIENT APPOINTMENT SECURITY PASSED' as result;
