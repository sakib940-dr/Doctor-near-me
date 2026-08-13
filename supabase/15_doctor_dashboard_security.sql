-- ============================================================
-- STEP 15 — DOCTOR DASHBOARD + SELF-SERVICE SECURITY
-- Run after Step 14. Safe to re-run.
-- ============================================================

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
      select jsonb_agg(ds.specialty_id order by s.sort_order,s.id)
      from public.doctor_specialties ds
      join public.specialties s on s.id=ds.specialty_id
      where ds.doctor_id=d.id and s.is_active
    ),'[]'::jsonb),
    'chambers',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',pr.id,'name_bn',pr.name_bn,'provider_type',pr.provider_type,
        'address',pr.address,'phone',pr.phone,
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
      ) order by pr.name_bn,pr.id)
      from public.doctor_provider_links l
      join public.providers pr on pr.id=l.provider_id
      where l.doctor_id=d.id
    ),'[]'::jsonb)
  )
  from public.doctors d
  join public.profiles p on p.id=d.id
  where d.id=auth.uid() and p.role='doctor' and p.account_status='active';
$$;

create or replace function public.update_my_doctor_profile(
  p_full_name text,
  p_phone text default null,
  p_professional_title text default null,
  p_degree text default null,
  p_designation text default null,
  p_bmdc_registration_no text default null,
  p_bio text default null,
  p_consultation_fee numeric default null,
  p_experience_years integer default null,
  p_profile_headline text default null,
  p_profile_photo_url text default null,
  p_consultation_note text default null,
  p_languages text[] default null,
  p_accepting_appointments boolean default true,
  p_district_id bigint default null,
  p_upazila_id bigint default null,
  p_specialty_ids bigint[] default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  old_doctor public.doctors%rowtype;
  credentials_changed boolean;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  if not exists(
    select 1 from public.profiles
    where id=auth.uid() and role='doctor' and account_status='active'
  ) then
    raise exception 'Active doctor account required';
  end if;

  if length(trim(coalesce(p_full_name,'')))<2 then
    raise exception 'Full name is required';
  end if;
  if p_consultation_fee is not null and p_consultation_fee<0 then
    raise exception 'Consultation fee cannot be negative';
  end if;
  if p_experience_years is not null
     and (p_experience_years<0 or p_experience_years>80) then
    raise exception 'Experience years must be between 0 and 80';
  end if;
  if p_bio is not null and length(p_bio)>4000 then
    raise exception 'Bio must be 4000 characters or fewer';
  end if;
  if p_upazila_id is not null and not exists(
    select 1 from public.upazilas u
    where u.id=p_upazila_id and u.district_id=p_district_id and u.is_active
  ) then
    raise exception 'Upazila does not belong to selected district';
  end if;
  if p_profile_photo_url is not null
     and p_profile_photo_url<>''
     and p_profile_photo_url not like auth.uid()::text||'/%' then
    raise exception 'Profile photo path must belong to the current user';
  end if;
  if p_specialty_ids is not null and exists(
    select 1 from unnest(p_specialty_ids) requested(id)
    left join public.specialties s on s.id=requested.id and s.is_active
    where s.id is null
  ) then
    raise exception 'One or more specialties are invalid';
  end if;

  select * into old_doctor from public.doctors
  where id=auth.uid() for update;
  if not found then raise exception 'Doctor profile not found'; end if;

  credentials_changed :=
    old_doctor.degree is distinct from nullif(trim(p_degree),'')
    or old_doctor.designation is distinct from nullif(trim(p_designation),'')
    or old_doctor.bmdc_registration_no is distinct from
       nullif(trim(p_bmdc_registration_no),'');

  update public.profiles
  set full_name=trim(p_full_name),
      phone=case when p_phone is null then phone else nullif(trim(p_phone),'') end,
      district_id=p_district_id,upazila_id=p_upazila_id,
      profile_completed=true,updated_at=now()
  where id=auth.uid();

  update public.doctors
  set professional_title=nullif(trim(p_professional_title),''),
      degree=nullif(trim(p_degree),''),
      designation=nullif(trim(p_designation),''),
      bmdc_registration_no=nullif(trim(p_bmdc_registration_no),''),
      bio=nullif(trim(p_bio),''),consultation_fee=p_consultation_fee,
      experience_years=p_experience_years,
      profile_headline=nullif(trim(p_profile_headline),''),
      profile_photo_url=nullif(trim(p_profile_photo_url),''),
      consultation_note=nullif(trim(p_consultation_note),''),
      languages=coalesce(p_languages,'{}'::text[]),
      accepting_appointments=p_accepting_appointments,
      verification_status=case
        when credentials_changed then 'pending'::public.verification_status
        else verification_status
      end,
      bmdc_verified=case when credentials_changed then false else bmdc_verified end,
      updated_at=now()
  where id=auth.uid();

  if p_specialty_ids is not null then
    delete from public.doctor_specialties where doctor_id=auth.uid();
    insert into public.doctor_specialties(doctor_id,specialty_id,is_primary)
    select auth.uid(),requested.id,(row_number() over(order by s.sort_order,s.id)=1)
    from unnest(p_specialty_ids) requested(id)
    join public.specialties s on s.id=requested.id and s.is_active
    order by s.sort_order,s.id;
  end if;

  return jsonb_build_object(
    'verification_status',case
      when credentials_changed then 'pending'
      else old_doctor.verification_status::text
    end,
    'credentials_changed',credentials_changed
  );
exception
  when unique_violation then
    raise exception 'This BMDC registration number is already in use';
end;
$$;

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
      and l.status='approved' and p.status='approved' and p.verified
  ) then raise exception 'An approved verified chamber link is required'; end if;

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

create or replace function public.delete_my_chamber_schedule(p_schedule_id uuid)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists(
    select 1 from public.profiles
    where id=auth.uid() and role='doctor' and account_status='active'
  ) then raise exception 'Active doctor account required'; end if;
  delete from public.chamber_schedules
  where id=p_schedule_id and doctor_id=auth.uid();
  if not found then raise exception 'Schedule not found'; end if;
  return true;
end;
$$;

-- Preserve the Step 14 patient cancellation rule and add strict provider-side
-- transitions for Doctor/Hospital/Admin processing.
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
  manager boolean:=false;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into a from public.appointments where id=p_appointment_id for update;
  if not found then raise exception 'Appointment not found'; end if;

  if not exists(
    select 1 from public.profiles
    where id=auth.uid() and account_status='active'
  ) then raise exception 'Active account required'; end if;

  if a.patient_id=auth.uid() then
    if p_status<>'cancelled' or a.status not in ('pending','confirmed') then
      raise exception 'Patient can only cancel pending or confirmed appointments';
    end if;
  else
    manager := a.doctor_id=auth.uid()
      or exists(
        select 1 from public.providers p
        where p.id=a.provider_id and p.owner_user_id=auth.uid()
      )
      or public.is_admin_or_above();
    if not manager then raise exception 'Not authorized'; end if;
    if p_status=a.status then return true; end if;
    if not (
      (a.status='pending' and p_status in ('confirmed','rejected','cancelled'))
      or (a.status='confirmed' and p_status in ('completed','no_show','cancelled'))
    ) then raise exception 'Invalid appointment status transition'; end if;
  end if;

  update public.appointments set status=p_status,updated_at=now()
  where id=p_appointment_id;

  if a.patient_id<>auth.uid() then
    insert into public.notifications(
      recipient_id,sender_id,type,title_bn,body_bn,data
    ) values(
      a.patient_id,auth.uid(),'appointment_status','অ্যাপয়েন্টমেন্ট আপডেট',
      'আপনার অ্যাপয়েন্টমেন্টের স্ট্যাটাস পরিবর্তন হয়েছে।',
      jsonb_build_object('appointment_id',a.id,'status',p_status)
    );
  end if;
  return true;
end;
$$;

-- All sensitive Doctor mutations are RPC-only. Admin/provider SECURITY DEFINER
-- functions continue to work without direct client table grants.
revoke insert,update,delete on table public.doctors
from public,anon,authenticated;
revoke insert,update,delete on table public.doctor_specialties
from public,anon,authenticated;
revoke insert,update,delete on table public.chamber_schedules
from public,anon,authenticated;
revoke insert,update,delete on table public.doctor_provider_links
from public,anon,authenticated;

revoke all on function public.get_my_doctor_profile() from public,anon;
grant execute on function public.get_my_doctor_profile()
to authenticated,service_role;
revoke all on function public.update_my_doctor_profile(
  text,text,text,text,text,text,text,numeric,integer,text,text,text,text[],
  boolean,bigint,bigint,bigint[]
) from public,anon;
grant execute on function public.update_my_doctor_profile(
  text,text,text,text,text,text,text,numeric,integer,text,text,text,text[],
  boolean,bigint,bigint,bigint[]
) to authenticated,service_role;
revoke all on function public.save_my_chamber_schedule(
  uuid,smallint,time,time,numeric,boolean,uuid
) from public,anon;
grant execute on function public.save_my_chamber_schedule(
  uuid,smallint,time,time,numeric,boolean,uuid
) to authenticated,service_role;
revoke all on function public.delete_my_chamber_schedule(uuid)
from public,anon;
grant execute on function public.delete_my_chamber_schedule(uuid)
to authenticated,service_role;
revoke all on function public.update_appointment_status(uuid,text)
from public,anon;
grant execute on function public.update_appointment_status(uuid,text)
to authenticated,service_role;

do $assert$
begin
  if has_table_privilege('authenticated','public.doctors','UPDATE')
     or has_table_privilege('authenticated','public.doctor_specialties','INSERT')
     or has_table_privilege('authenticated','public.chamber_schedules','INSERT')
     or has_table_privilege('authenticated','public.doctor_provider_links','UPDATE') then
    raise exception 'Step 15 failed: direct Doctor mutation grant remains';
  end if;
  if has_function_privilege(
    'anon','public.update_my_doctor_profile(text,text,text,text,text,text,text,numeric,integer,text,text,text,text[],boolean,bigint,bigint,bigint[])','EXECUTE'
  ) then raise exception 'Step 15 failed: anon Doctor update must be blocked'; end if;
  if not has_function_privilege(
    'authenticated','public.get_my_doctor_profile()','EXECUTE'
  ) then raise exception 'Step 15 failed: Doctor profile RPC grant missing'; end if;
  if has_function_privilege(
    'anon','public.save_my_chamber_schedule(uuid,smallint,time,time,numeric,boolean,uuid)','EXECUTE'
  ) then raise exception 'Step 15 failed: anon schedule mutation must be blocked'; end if;
end;
$assert$;

select 'STEP 15 DOCTOR DASHBOARD SECURITY PASSED' as result;
