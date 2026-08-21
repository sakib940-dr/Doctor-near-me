-- ============================================================
-- STEP 63 — DOCTOR FULL ONBOARDING + PROFILE INTEGRATION
-- Additive/backward-compatible migration. Migrations 01–62 are unchanged.
-- Reuses profiles, doctors, doctor_specialties, providers, doctor_provider_links,
-- verification evidence, public content and existing search/appointment systems.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1) Minimum canonical fields that did not already exist
-- ------------------------------------------------------------
alter table public.doctors
  add column if not exists medical_type text,
  add column if not exists specialty_text text,
  add column if not exists public_address text;

alter table public.profiles
  add column if not exists permanent_address text;

alter table public.doctors drop constraint if exists doctors_medical_type_check;
alter table public.doctors add constraint doctors_medical_type_check
  check (medical_type is null or medical_type in ('MBBS','BDS'));

create index if not exists idx_doctors_medical_type on public.doctors(medical_type,id);

-- Safe backward-compatible backfill only where the existing degree text is explicit.
update public.doctors set medical_type='BDS'
where medical_type is null and upper(coalesce(degree,'')) ~ '(^|[^A-Z])BDS([^A-Z]|$)';
update public.doctors set medical_type='MBBS'
where medical_type is null and upper(coalesce(degree,'')) ~ '(^|[^A-Z])MBBS([^A-Z]|$)';

-- Doctor onboarding is now seven steps. Hospital onboarding remains five steps.
alter table public.profiles drop constraint if exists profiles_onboarding_step_check;
alter table public.profiles add constraint profiles_onboarding_step_check
  check(onboarding_step between 1 and 7);

create or replace function public.set_my_onboarding_step(p_step smallint)
returns smallint
language plpgsql
security definer
set search_path=public
as $$
declare r public.user_role; max_step smallint;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select role into r from public.profiles
  where id=auth.uid() and account_status='active' for update;
  if r not in ('doctor','hospital') then raise exception 'Guided onboarding is only for Doctor/Hospital accounts'; end if;
  max_step:=case when r='doctor' then 7 else 5 end;
  if p_step<1 or p_step>max_step then raise exception 'Invalid onboarding step'; end if;
  update public.profiles set onboarding_step=p_step,updated_at=now() where id=auth.uid();
  return p_step;
end;
$$;

revoke all on function public.set_my_onboarding_step(smallint) from public,anon;
grant execute on function public.set_my_onboarding_step(smallint) to authenticated,service_role;

-- Preserve the established signature while allowing the already-saved login
-- phone to satisfy Step 1 when the UI intentionally keeps it read-only.
create or replace function public.complete_my_account_onboarding(
  p_full_name text,
  p_phone text default null,
  p_role text default 'patient',
  p_district_id bigint default null,
  p_upazila_id bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  current_profile public.profiles%rowtype;
  requested_role public.user_role;
  normalized_phone text;
  auth_phone text;
  auth_phone_confirmed timestamptz;
  is_guided boolean;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if length(trim(coalesce(p_full_name,'')))<2 then raise exception 'Full name is required'; end if;

  requested_role := case p_role
    when 'doctor' then 'doctor'::public.user_role
    when 'hospital' then 'hospital'::public.user_role
    when 'ambulance' then 'ambulance'::public.user_role
    when 'patient' then 'patient'::public.user_role
    else null
  end;
  if requested_role is null then raise exception 'Unsupported self-registration role'; end if;

  select * into current_profile from public.profiles where id=auth.uid() for update;
  if not found then raise exception 'Profile not found'; end if;
  if current_profile.account_status<>'active' then raise exception 'Account is not active'; end if;
  if current_profile.role in ('doctor','hospital') and current_profile.role<>requested_role then
    raise exception 'Professional account role cannot be self-changed';
  end if;
  if current_profile.onboarding_completed_at is not null and current_profile.role<>requested_role then
    raise exception 'Completed account role cannot be self-changed';
  end if;

  if p_upazila_id is not null and not exists(
    select 1 from public.upazilas u
    where u.id=p_upazila_id and u.district_id=p_district_id and u.is_active
  ) then raise exception 'Upazila does not belong to the selected district'; end if;

  is_guided:=requested_role in ('doctor','hospital');
  normalized_phone:=public.normalize_auth_phone(coalesce(p_phone,current_profile.phone));
  if is_guided and normalized_phone is null then raise exception 'A valid phone number is required'; end if;

  if normalized_phone is not null and exists(
    select 1 from public.profiles p
    where p.id<>auth.uid() and public.normalize_auth_phone(p.phone)=normalized_phone
  ) then raise exception 'This phone number is already associated with another account'; end if;

  if is_guided and public.professional_identity_verification_required('phone') then
    select public.normalize_auth_phone(u.phone),u.phone_confirmed_at into auth_phone,auth_phone_confirmed
    from auth.users u where u.id=auth.uid();
    if auth_phone_confirmed is null or auth_phone is null or auth_phone<>normalized_phone then
      raise exception 'Verify this phone number in Supabase Auth before continuing';
    end if;
  end if;

  update public.profiles
  set full_name=trim(p_full_name),phone=coalesce(normalized_phone,phone),role=requested_role,
      district_id=p_district_id,upazila_id=p_upazila_id,
      profile_completed=case when is_guided then profile_completed else true end,
      onboarding_step=case when is_guided then greatest(onboarding_step,2) else 5 end,
      onboarding_completed_at=case when is_guided then onboarding_completed_at else coalesce(onboarding_completed_at,now()) end,
      updated_at=now()
  where id=auth.uid();

  if requested_role='doctor' then
    insert into public.doctors(id,verification_status) values(auth.uid(),'pending') on conflict(id) do nothing;
  end if;

  return jsonb_build_object(
    'user_id',auth.uid(),'role',requested_role,
    'profile_completed',case when is_guided then current_profile.profile_completed else true end,
    'onboarding_step',case when is_guided then greatest(current_profile.onboarding_step,2) else 5 end,
    'onboarding_completed',case when is_guided then current_profile.onboarding_completed_at is not null else true end
  );
end;
$$;

revoke all on function public.complete_my_account_onboarding(text,text,text,bigint,bigint) from public,anon;
grant execute on function public.complete_my_account_onboarding(text,text,text,bigint,bigint) to authenticated,service_role;

-- Medical type is selected in Step 1 and is a verification identity field.
create or replace function public.save_my_doctor_basic_onboarding(p_medical_type text)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare d public.doctors%rowtype; clean_type text:=upper(trim(coalesce(p_medical_type,'')));
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if clean_type not in ('MBBS','BDS') then raise exception 'Medical Type must be MBBS or BDS'; end if;
  select * into d from public.doctors where id=auth.uid() for update;
  if d.id is null then raise exception 'Doctor profile not found'; end if;
  if d.verification_status='approved' or (d.verification_status='pending' and d.verification_submitted_at is not null) then
    if d.medical_type is distinct from clean_type then raise exception 'Medical Type is locked while verification is pending or approved'; end if;
    return true;
  end if;
  update public.doctors set medical_type=clean_type,updated_at=now() where id=auth.uid();
  return true;
end;
$$;

revoke all on function public.save_my_doctor_basic_onboarding(text) from public,anon;
grant execute on function public.save_my_doctor_basic_onboarding(text) to authenticated,service_role;

-- Include Medical Type in the existing verification-identity guard.
create or replace function public.guard_doctor_verification_locked_identity()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if auth.uid()=old.id and old.verification_status='rejected' and (
       new.medical_type is distinct from old.medical_type
       or new.medical_college is distinct from old.medical_college
       or new.medical_session is distinct from old.medical_session
       or new.medical_batch is distinct from old.medical_batch
       or new.bmdc_registration_no is distinct from old.bmdc_registration_no
     ) then
    new.verification_status := 'rejected';
    new.bmdc_verified := false;
  end if;

  if auth.uid()=old.id
     and (old.verification_status='approved' or (old.verification_status='pending' and old.verification_submitted_at is not null))
     and (
       new.medical_type is distinct from old.medical_type
       or new.medical_college is distinct from old.medical_college
       or new.medical_session is distinct from old.medical_session
       or new.medical_batch is distinct from old.medical_batch
       or new.bmdc_registration_no is distinct from old.bmdc_registration_no
     ) then
    raise exception 'Verification identity is locked while pending or approved';
  end if;
  return new;
end;
$$;

-- ------------------------------------------------------------
-- 2) Verification Step 2: education + Medical Type + BMDC
-- ------------------------------------------------------------
create or replace function public.get_my_doctor_verification_profile()
returns jsonb
language plpgsql stable security definer set search_path=public
as $$
declare result jsonb;
begin
  if not exists(select 1 from public.profiles where id=auth.uid() and role='doctor' and account_status='active') then
    raise exception 'Active Doctor account required';
  end if;
  select jsonb_build_object(
    'doctor_id',d.id,'medical_type',d.medical_type,'medical_college',d.medical_college,
    'medical_session',d.medical_session,'medical_batch',d.medical_batch,
    'bmdc_registration_no',d.bmdc_registration_no,'degree',d.degree,
    'verification_status',d.verification_status::text,'verification_note',d.verification_note,
    'bmdc_verified',d.bmdc_verified,'verified_at',d.verified_at,
    'verification_submitted_at',d.verification_submitted_at
  ) into result from public.doctors d where d.id=auth.uid();
  if result is null then raise exception 'Doctor profile not found'; end if;
  return result;
end;
$$;

create or replace function public.update_my_doctor_verification_info_v2(
  p_medical_type text,
  p_medical_college text,
  p_medical_session text,
  p_medical_batch text,
  p_bmdc_registration_no text
)
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare old_row public.doctors%rowtype; changed boolean; next_status text; clean_type text:=upper(trim(coalesce(p_medical_type,'')));
begin
  if not exists(select 1 from public.profiles where id=auth.uid() and role='doctor' and account_status='active') then
    raise exception 'Active Doctor account required';
  end if;
  select * into old_row from public.doctors where id=auth.uid() for update;
  if old_row.id is null then raise exception 'Doctor profile not found'; end if;
  if old_row.verification_status='approved' or (old_row.verification_status='pending' and old_row.verification_submitted_at is not null) then
    raise exception 'Verification application is locked while pending or approved';
  end if;
  if clean_type not in ('MBBS','BDS') then raise exception 'Medical Type must be MBBS or BDS'; end if;
  if length(trim(coalesce(p_medical_college,'')))<2 then raise exception 'Medical College Name is required'; end if;
  if length(trim(coalesce(p_medical_session,'')))<1 then raise exception 'Session is required'; end if;
  if length(trim(coalesce(p_medical_batch,'')))<1 then raise exception 'Batch is required'; end if;
  if length(trim(coalesce(p_bmdc_registration_no,'')))<3 then raise exception 'BMDC Registration Number is required'; end if;

  changed := old_row.medical_type is distinct from clean_type
    or old_row.medical_college is distinct from nullif(trim(p_medical_college),'')
    or old_row.medical_session is distinct from nullif(trim(p_medical_session),'')
    or old_row.medical_batch is distinct from nullif(trim(p_medical_batch),'')
    or old_row.bmdc_registration_no is distinct from nullif(trim(p_bmdc_registration_no),'');

  update public.doctors set
    medical_type=clean_type,medical_college=nullif(trim(p_medical_college),''),
    medical_session=nullif(trim(p_medical_session),''),medical_batch=nullif(trim(p_medical_batch),''),
    bmdc_registration_no=nullif(trim(p_bmdc_registration_no),''),updated_at=now()
  where id=auth.uid();

  select verification_status::text into next_status from public.doctors where id=auth.uid();
  return jsonb_build_object('verification_status',next_status,'verification_reset',false,'information_changed',changed);
exception when unique_violation then
  raise exception 'This BMDC registration number is already in use';
end;
$$;

revoke all on function public.get_my_doctor_verification_profile() from public,anon;
grant execute on function public.get_my_doctor_verification_profile() to authenticated,service_role;
revoke all on function public.update_my_doctor_verification_info_v2(text,text,text,text,text) from public,anon;
grant execute on function public.update_my_doctor_verification_info_v2(text,text,text,text,text) to authenticated,service_role;

create or replace function public.submit_my_doctor_verification_application()
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare d public.doctors%rowtype; evidence_count integer;
begin
  if not exists(select 1 from public.profiles where id=auth.uid() and role='doctor' and account_status='active') then raise exception 'Active Doctor account required'; end if;
  select * into d from public.doctors where id=auth.uid() for update;
  if d.id is null then raise exception 'Doctor profile not found'; end if;
  if d.verification_status='approved' then raise exception 'Approved verification is locked'; end if;
  if d.verification_status='pending' and d.verification_submitted_at is not null then raise exception 'Verification application is already pending review'; end if;
  if d.medical_type not in ('MBBS','BDS') then raise exception 'Select Medical Type before applying'; end if;
  if length(trim(coalesce(d.medical_college,'')))<2 or length(trim(coalesce(d.medical_session,'')))<1 or length(trim(coalesce(d.medical_batch,'')))<1 then
    raise exception 'Complete Medical College, Session and Batch before applying';
  end if;
  if length(trim(coalesce(d.bmdc_registration_no,'')))<3 then raise exception 'BMDC Registration Number is required'; end if;
  select count(*) into evidence_count from public.entity_verification_documents x where x.entity_type='doctor' and x.entity_id=auth.uid();
  if evidence_count<1 then raise exception 'Upload at least one verification document before applying'; end if;

  update public.doctors set verification_status='pending',bmdc_verified=false,verification_note=null,
    verified_by=null,verified_at=null,verification_submitted_at=now(),updated_at=now() where id=auth.uid();

  insert into public.notifications(recipient_id,sender_id,type,title_bn,body_bn,data)
  select p.id,auth.uid(),'verification_submitted','নতুন ডাক্তার ভেরিফিকেশন আবেদন',
    'একটি Doctor verification application review-এর জন্য জমা হয়েছে।',
    jsonb_build_object('entity_type','doctor','entity_id',auth.uid())
  from public.profiles p where p.role in ('verification_officer','admin','super_admin') and p.account_status='active';

  return jsonb_build_object('status','pending','submitted_at',(select verification_submitted_at from public.doctors where id=auth.uid()));
end;
$$;

revoke all on function public.submit_my_doctor_verification_application() from public,anon;
grant execute on function public.submit_my_doctor_verification_application() to authenticated,service_role;

-- ------------------------------------------------------------
-- 3) Canonical Visiting Card owner edit/read; no duplicate card table
-- ------------------------------------------------------------
create or replace function public.update_my_doctor_visiting_card_v2(
  p_full_name text,
  p_profile_photo_url text default null,
  p_professional_title text default null,
  p_degree text default null,
  p_designation text default null,
  p_medical_college text default null,
  p_present_job text default null,
  p_specialty_text text default null,
  p_public_address text default null,
  p_specialty_ids bigint[] default null
)
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare old_doctor public.doctors%rowtype; credentials_changed boolean;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists(select 1 from public.profiles where id=auth.uid() and role='doctor' and account_status='active') then raise exception 'Active doctor account required'; end if;
  if length(trim(coalesce(p_full_name,'')))<2 then raise exception 'Full name is required'; end if;
  if p_profile_photo_url is not null and p_profile_photo_url<>'' and p_profile_photo_url not like auth.uid()::text||'/%' then raise exception 'Profile photo path must belong to the current user'; end if;
  if p_specialty_ids is not null and exists(
    select 1 from unnest(p_specialty_ids) requested(id)
    left join public.specialties s on s.id=requested.id and s.is_active where s.id is null
  ) then raise exception 'One or more specialties are invalid'; end if;
  if p_public_address is not null and char_length(trim(p_public_address))>500 then raise exception 'Public address must be 500 characters or fewer'; end if;

  select * into old_doctor from public.doctors where id=auth.uid() for update;
  if not found then raise exception 'Doctor profile not found'; end if;

  credentials_changed := false;

  update public.profiles set full_name=trim(p_full_name),profile_completed=true,updated_at=now() where id=auth.uid();
  update public.doctors set
    profile_photo_url=nullif(trim(p_profile_photo_url),''),professional_title=nullif(trim(p_professional_title),''),
    degree=nullif(trim(p_degree),''),designation=nullif(trim(p_designation),''),
    medical_college=nullif(trim(p_medical_college),''),present_job=nullif(trim(p_present_job),''),
    specialty_text=nullif(trim(p_specialty_text),''),public_address=nullif(trim(p_public_address),''),
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

  return jsonb_build_object('verification_status',(select verification_status::text from public.doctors where id=auth.uid()),'credentials_changed',credentials_changed);
end;
$$;

revoke all on function public.update_my_doctor_visiting_card_v2(text,text,text,text,text,text,text,text,text,bigint[]) from public,anon;
grant execute on function public.update_my_doctor_visiting_card_v2(text,text,text,text,text,text,text,text,text,bigint[]) to authenticated,service_role;

-- Keep the legacy My Profile RPC signature, but align it with the new split:
-- Degree/Designation are editable public-card fields; BMDC remains verification-managed.
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
language plpgsql security definer set search_path=public
as $$
declare old_doctor public.doctors%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists(select 1 from public.profiles where id=auth.uid() and role='doctor' and account_status='active') then raise exception 'Active doctor account required'; end if;
  if length(trim(coalesce(p_full_name,'')))<2 then raise exception 'Full name is required'; end if;
  if p_consultation_fee is not null and p_consultation_fee<0 then raise exception 'Consultation fee cannot be negative'; end if;
  if p_experience_years is not null and (p_experience_years<0 or p_experience_years>80) then raise exception 'Experience years must be between 0 and 80'; end if;
  if p_bio is not null and length(p_bio)>4000 then raise exception 'Bio must be 4000 characters or fewer'; end if;
  if p_upazila_id is not null and not exists(select 1 from public.upazilas u where u.id=p_upazila_id and u.district_id=p_district_id and u.is_active) then raise exception 'Upazila does not belong to selected district'; end if;
  if p_profile_photo_url is not null and p_profile_photo_url<>'' and p_profile_photo_url not like auth.uid()::text||'/%' then raise exception 'Profile photo path must belong to the current user'; end if;
  if p_specialty_ids is not null and exists(select 1 from unnest(p_specialty_ids) requested(id) left join public.specialties s on s.id=requested.id and s.is_active where s.id is null) then raise exception 'One or more specialties are invalid'; end if;

  select * into old_doctor from public.doctors where id=auth.uid() for update;
  if not found then raise exception 'Doctor profile not found'; end if;
  if nullif(trim(coalesce(p_bmdc_registration_no,'')),'') is distinct from old_doctor.bmdc_registration_no then
    raise exception 'BMDC Registration Number is managed from Verification Application';
  end if;

  update public.profiles set full_name=trim(p_full_name),
    phone=case when p_phone is null then phone else nullif(trim(p_phone),'') end,
    district_id=p_district_id,upazila_id=p_upazila_id,profile_completed=true,updated_at=now()
  where id=auth.uid();

  update public.doctors set professional_title=nullif(trim(p_professional_title),''),degree=nullif(trim(p_degree),''),
    designation=nullif(trim(p_designation),''),bio=nullif(trim(p_bio),''),consultation_fee=p_consultation_fee,
    experience_years=p_experience_years,profile_headline=nullif(trim(p_profile_headline),''),
    profile_photo_url=nullif(trim(p_profile_photo_url),''),consultation_note=nullif(trim(p_consultation_note),''),
    languages=coalesce(p_languages,'{}'::text[]),accepting_appointments=p_accepting_appointments,updated_at=now()
  where id=auth.uid();

  if p_specialty_ids is not null then
    delete from public.doctor_specialties where doctor_id=auth.uid();
    insert into public.doctor_specialties(doctor_id,specialty_id,is_primary)
    select auth.uid(),requested.id,(row_number() over(order by s.sort_order,s.id)=1)
    from unnest(p_specialty_ids) requested(id) join public.specialties s on s.id=requested.id and s.is_active
    order by s.sort_order,s.id;
  end if;

  return jsonb_build_object('verification_status',(select verification_status::text from public.doctors where id=auth.uid()),'credentials_changed',false);
end;
$$;

revoke all on function public.update_my_doctor_profile(text,text,text,text,text,text,text,numeric,integer,text,text,text,text[],boolean,bigint,bigint,bigint[]) from public,anon;
grant execute on function public.update_my_doctor_profile(text,text,text,text,text,text,text,numeric,integer,text,text,text,text[],boolean,bigint,bigint,bigint[]) to authenticated,service_role;

-- Owner read now includes all new canonical fields and chamber WhatsApp.
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
      'medical_college',d.medical_college,'present_job',d.present_job,'public_address',d.public_address,
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

-- ------------------------------------------------------------
-- 4) Doctor-owned Chamber v2: same providers table + WhatsApp
-- ------------------------------------------------------------
create or replace function public.save_my_doctor_chamber_v2(
  p_provider_id uuid default null,
  p_name_bn text default null,
  p_address text default null,
  p_district_id bigint default null,
  p_upazila_id bigint default null,
  p_phone text default null,
  p_whatsapp text default null,
  p_latitude double precision default null,
  p_longitude double precision default null
)
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare result_id uuid; old_provider public.providers%rowtype; identity_or_location_changed boolean:=false;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists(select 1 from public.profiles where id=auth.uid() and role='doctor' and account_status='active') then raise exception 'Active doctor account required'; end if;
  if length(trim(coalesce(p_name_bn,'')))<2 then raise exception 'Chamber name is required'; end if;
  if length(trim(coalesce(p_address,'')))<3 then raise exception 'Chamber address is required'; end if;
  if p_district_id is null or not exists(select 1 from public.districts x where x.id=p_district_id and x.is_active) then raise exception 'Valid district is required'; end if;
  if p_upazila_id is not null and not exists(select 1 from public.upazilas u where u.id=p_upazila_id and u.district_id=p_district_id and u.is_active) then raise exception 'Upazila does not belong to selected district'; end if;
  if (p_latitude is null) <> (p_longitude is null) then raise exception 'Latitude and longitude must be provided together'; end if;
  if (p_latitude is not null and (p_latitude < -90 or p_latitude > 90)) or (p_longitude is not null and (p_longitude < -180 or p_longitude > 180)) then raise exception 'Invalid map coordinates'; end if;

  if p_provider_id is null then
    result_id:=gen_random_uuid();
    insert into public.providers(id,owner_user_id,provider_type,name_bn,slug,phone,whatsapp,address,district_id,upazila_id,latitude,longitude,status,verified)
    values(result_id,auth.uid(),'chamber',trim(p_name_bn),'doctor-chamber-'||replace(result_id::text,'-',''),
      nullif(trim(p_phone),''),nullif(trim(p_whatsapp),''),trim(p_address),p_district_id,p_upazila_id,p_latitude,p_longitude,'pending',false);
    insert into public.doctor_provider_links(doctor_id,provider_id,status,invited_by)
    values(auth.uid(),result_id,'approved',auth.uid()) on conflict(doctor_id,provider_id) do update set status='approved',invited_by=auth.uid();
    identity_or_location_changed:=true;
  else
    select * into old_provider from public.providers
    where id=p_provider_id and owner_user_id=auth.uid() and provider_type='chamber' for update;
    if not found then raise exception 'Doctor-owned chamber not found'; end if;
    identity_or_location_changed:=old_provider.name_bn is distinct from trim(p_name_bn)
      or old_provider.address is distinct from trim(p_address) or old_provider.district_id is distinct from p_district_id
      or old_provider.upazila_id is distinct from p_upazila_id or old_provider.latitude is distinct from p_latitude
      or old_provider.longitude is distinct from p_longitude;
    update public.providers set name_bn=trim(p_name_bn),phone=nullif(trim(p_phone),''),whatsapp=nullif(trim(p_whatsapp),''),
      address=trim(p_address),district_id=p_district_id,upazila_id=p_upazila_id,latitude=p_latitude,longitude=p_longitude,
      status=case when identity_or_location_changed then 'pending'::public.provider_status else status end,
      verified=case when identity_or_location_changed then false else verified end,
      verification_note=case when identity_or_location_changed then null else verification_note end,
      verified_by=case when identity_or_location_changed then null else verified_by end,
      verified_at=case when identity_or_location_changed then null else verified_at end,updated_at=now()
    where id=p_provider_id;
    insert into public.doctor_provider_links(doctor_id,provider_id,status,invited_by)
    values(auth.uid(),p_provider_id,'approved',auth.uid()) on conflict(doctor_id,provider_id) do update set status='approved';
    result_id:=p_provider_id;
  end if;
  return jsonb_build_object('provider_id',result_id,'verification_reset',identity_or_location_changed);
end;
$$;

revoke all on function public.save_my_doctor_chamber_v2(uuid,text,text,bigint,bigint,text,text,double precision,double precision) from public,anon;
grant execute on function public.save_my_doctor_chamber_v2(uuid,text,text,bigint,bigint,text,text,double precision,double precision) to authenticated,service_role;

-- ------------------------------------------------------------
-- 5) Private Personal Profile: current + permanent address
-- ------------------------------------------------------------
create or replace function public.get_my_doctor_private_profile()
returns jsonb
language plpgsql stable security definer set search_path=public
as $$
declare result jsonb;
begin
  if not exists(select 1 from public.profiles where id=auth.uid() and role='doctor' and account_status='active') then raise exception 'Active Doctor account required'; end if;
  select jsonb_build_object('date_of_birth',p.date_of_birth,'gender',p.gender,'blood_group',p.blood_group,
    'address_line',p.address_line,'permanent_address',p.permanent_address) into result
  from public.profiles p where p.id=auth.uid();
  return coalesce(result,'{}'::jsonb);
end;
$$;

create or replace function public.update_my_doctor_private_profile_v2(
  p_date_of_birth date default null,p_gender text default null,p_blood_group text default null,
  p_address_line text default null,p_permanent_address text default null
)
returns boolean
language plpgsql security definer set search_path=public
as $$
begin
  if not exists(select 1 from public.profiles where id=auth.uid() and role='doctor' and account_status='active') then raise exception 'Active Doctor account required'; end if;
  if p_gender is not null and p_gender not in ('male','female','other') then raise exception 'Invalid gender'; end if;
  if p_blood_group is not null and upper(p_blood_group) not in ('A+','A-','B+','B-','AB+','AB-','O+','O-') then raise exception 'Invalid blood group'; end if;
  if p_date_of_birth is not null and p_date_of_birth>current_date then raise exception 'Date of birth cannot be in the future'; end if;
  if p_address_line is not null and char_length(trim(p_address_line))>500 then raise exception 'Current address must be 500 characters or fewer'; end if;
  if p_permanent_address is not null and char_length(trim(p_permanent_address))>500 then raise exception 'Permanent address must be 500 characters or fewer'; end if;
  update public.profiles set date_of_birth=p_date_of_birth,gender=nullif(trim(coalesce(p_gender,'')),''),
    blood_group=nullif(upper(trim(coalesce(p_blood_group,''))),''),address_line=nullif(trim(coalesce(p_address_line,'')),''),
    permanent_address=nullif(trim(coalesce(p_permanent_address,'')),''),updated_at=now() where id=auth.uid();
  return found;
end;
$$;

revoke all on function public.get_my_doctor_private_profile() from public,anon;
grant execute on function public.get_my_doctor_private_profile() to authenticated,service_role;
revoke all on function public.update_my_doctor_private_profile_v2(date,text,text,text,text) from public,anon;
grant execute on function public.update_my_doctor_private_profile_v2(date,text,text,text,text) to authenticated,service_role;

-- ------------------------------------------------------------
-- 6) Public read models: new fields with old-data fallbacks preserved
-- ------------------------------------------------------------
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
      'medical_college',d.medical_college,'present_job',d.present_job,'public_address',d.public_address,
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
    d.bmdc_registration_no,d.medical_college,d.present_job,d.public_address,d.consultation_fee,d.experience_years,
    p.district_id,di.name_bn,p.upazila_id,up.name_bn,coalesce(sp.items,'[]'::jsonb),d.verification_status::text,
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

-- Search v2 adds explicit Medical Type filtering while preserving all existing filters.
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
      d.professional_title,d.specialty_text,d.bmdc_registration_no,d.medical_college,d.present_job,d.public_address,
      d.consultation_fee,d.experience_years,p.district_id,dist.name_bn district_name_bn,p.upazila_id,upz.name_bn upazila_name_bn,
      d.verification_status::text verification_status,d.profile_slug,d.created_at,public.doctor_public_rank_score(d.id) rank_score,
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
        or d.specialty_text ilike '%'||trim(p_query)||'%' or d.medical_college ilike '%'||trim(p_query)||'%'
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

-- ------------------------------------------------------------
-- 7) Admin/Super Admin Medical Type filters (new RPCs; old RPCs remain)
-- ------------------------------------------------------------
create or replace function public.get_admin_user_directory_v2(
  p_role text default null,p_status text default null,p_medical_type text default null,
  p_district_id bigint default null,p_upazila_id bigint default null,p_specialty_id bigint default null,p_search text default null,
  p_limit integer default 50,p_offset integer default 0
)
returns table(
  user_id uuid,full_name text,email text,phone text,role text,account_status text,district_id bigint,upazila_id bigint,
  professional_status text,entity_id uuid,medical_type text,created_at timestamptz,updated_at timestamptz,total_count bigint
)
language plpgsql stable security definer set search_path=public
as $$
begin
  if not public.is_admin_or_above() then raise exception 'Admin access required'; end if;
  if p_role is not null and p_role not in ('patient','doctor','chamber','hospital','ambulance','verification_officer','admin','super_admin') then raise exception 'Invalid role'; end if;
  if p_status is not null and p_status not in ('active','suspended','banned') then raise exception 'Invalid account status'; end if;
  if p_medical_type is not null and upper(p_medical_type) not in ('MBBS','BDS') then raise exception 'Invalid Medical Type'; end if;
  if p_upazila_id is not null and not exists(select 1 from public.upazilas u where u.id=p_upazila_id and (p_district_id is null or u.district_id=p_district_id)) then raise exception 'Invalid upazila filter'; end if;
  if p_specialty_id is not null and not exists(select 1 from public.specialties s where s.id=p_specialty_id and s.is_active) then raise exception 'Invalid specialty filter'; end if;
  return query
  with directory as (
    select p.id,p.full_name,p.email,p.phone,p.role::text role,p.account_status::text account_status,p.district_id,p.upazila_id,
      case p.role::text when 'doctor' then d.verification_status::text
        when 'hospital' then (select pr.status::text from public.providers pr where pr.owner_user_id=p.id order by pr.updated_at desc limit 1)
        when 'chamber' then (select pr.status::text from public.providers pr where pr.owner_user_id=p.id order by pr.updated_at desc limit 1)
        when 'ambulance' then (select a.status::text from public.ambulance_services a where a.owner_user_id=p.id order by a.updated_at desc limit 1) else null end professional_status,
      case p.role::text when 'doctor' then d.id
        when 'hospital' then (select pr.id from public.providers pr where pr.owner_user_id=p.id order by pr.updated_at desc limit 1)
        when 'chamber' then (select pr.id from public.providers pr where pr.owner_user_id=p.id order by pr.updated_at desc limit 1)
        when 'ambulance' then (select a.id from public.ambulance_services a where a.owner_user_id=p.id order by a.updated_at desc limit 1) else null end entity_id,
      d.medical_type,p.created_at,p.updated_at
    from public.profiles p left join public.doctors d on d.id=p.id
    where (public.is_super_admin() or p.role::text not in ('admin','super_admin'))
      and (p_role is null or p.role::text=p_role) and (p_status is null or p.account_status::text=p_status)
      and (p_district_id is null or p.district_id=p_district_id)
      and (p_upazila_id is null or p.upazila_id=p_upazila_id)
      and (p_medical_type is null or (p.role='doctor' and d.medical_type=upper(p_medical_type)))
      and (p_specialty_id is null or (p.role='doctor' and exists(
        select 1 from public.doctor_specialties ds where ds.doctor_id=d.id and ds.specialty_id=p_specialty_id
      )))
      and (nullif(trim(p_search),'') is null or p.full_name ilike '%'||trim(p_search)||'%' or p.email ilike '%'||trim(p_search)||'%' or p.phone ilike '%'||trim(p_search)||'%')
  )
  select d.*,count(*) over() total_count from directory d order by d.created_at desc,d.id
  limit greatest(1,least(p_limit,100)) offset greatest(p_offset,0);
end;
$$;

revoke all on function public.get_admin_user_directory_v2(text,text,text,bigint,bigint,bigint,text,integer,integer) from public,anon;
grant execute on function public.get_admin_user_directory_v2(text,text,text,bigint,bigint,bigint,text,integer,integer) to authenticated,service_role;

create or replace function public.super_admin_user_directory_v3(
  p_role text default null,p_status text default null,p_district_id bigint default null,p_upazila_id bigint default null,
  p_medical_type text default null,p_specialty_id bigint default null,p_search text default null,p_limit integer default 50,p_offset integer default 0
)
returns table(
  user_id uuid,full_name text,email text,phone text,role text,account_status text,district_id bigint,district_name text,
  upazila_id bigint,upazila_name text,address_line text,profile_completed boolean,medical_type text,
  last_location_at timestamptz,last_sign_in_at timestamptz,created_at timestamptz,total_count bigint
)
language plpgsql stable security definer set search_path=public,auth
as $$
begin
  if not public.is_super_admin() then raise exception 'Only Super Admin can access the full user directory'; end if;
  if p_role is not null and p_role not in ('patient','doctor','chamber','hospital','ambulance','verification_officer','admin','super_admin') then raise exception 'Invalid role'; end if;
  if p_status is not null and p_status not in ('active','suspended','banned') then raise exception 'Invalid account status'; end if;
  if p_medical_type is not null and upper(p_medical_type) not in ('MBBS','BDS') then raise exception 'Invalid Medical Type'; end if;
  if p_upazila_id is not null and not exists(select 1 from public.upazilas u where u.id=p_upazila_id and (p_district_id is null or u.district_id=p_district_id)) then raise exception 'Invalid upazila filter'; end if;
  if p_specialty_id is not null and not exists(select 1 from public.specialties s where s.id=p_specialty_id and s.is_active) then raise exception 'Invalid specialty filter'; end if;
  return query
  select p.id,p.full_name,p.email,p.phone,p.role::text,p.account_status::text,p.district_id,dist.name_bn,p.upazila_id,u.name_bn,
    p.address_line,p.profile_completed,doc.medical_type,loc.updated_at,au.last_sign_in_at,p.created_at,count(*) over()
  from public.profiles p
  left join public.doctors doc on doc.id=p.id left join public.districts dist on dist.id=p.district_id
  left join public.upazilas u on u.id=p.upazila_id left join public.user_current_locations loc on loc.user_id=p.id
  left join auth.users au on au.id=p.id
  where (p_role is null or p.role::text=p_role) and (p_status is null or p.account_status::text=p_status)
    and (p_district_id is null or p.district_id=p_district_id) and (p_upazila_id is null or p.upazila_id=p_upazila_id)
    and (p_medical_type is null or (p.role='doctor' and doc.medical_type=upper(p_medical_type)))
    and (p_specialty_id is null or (p.role='doctor' and exists(
      select 1 from public.doctor_specialties ds where ds.doctor_id=doc.id and ds.specialty_id=p_specialty_id
    )))
    and (nullif(trim(p_search),'') is null or p.full_name ilike '%'||trim(p_search)||'%' or p.email ilike '%'||trim(p_search)||'%' or p.phone ilike '%'||trim(p_search)||'%')
  order by p.created_at desc,p.id limit greatest(1,least(p_limit,100)) offset greatest(p_offset,0);
end;
$$;

revoke all on function public.super_admin_user_directory_v3(text,text,bigint,bigint,text,bigint,text,integer,integer) from public,anon;
grant execute on function public.super_admin_user_directory_v3(text,text,bigint,bigint,text,bigint,text,integer,integer) to authenticated,service_role;

-- ------------------------------------------------------------
-- 8) Final Doctor onboarding completion (optional About/Services/Cost)
-- ------------------------------------------------------------
create or replace function public.finish_my_role_onboarding()
returns jsonb
language plpgsql security definer set search_path=public,auth
as $$
declare p public.profiles%rowtype; au auth.users%rowtype; normalized_profile_phone text; verified_auth_phone text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into p from public.profiles where id=auth.uid() for update;
  if not found or p.account_status<>'active' then raise exception 'Active account required'; end if;
  if p.role not in ('doctor','hospital') then raise exception 'This account does not use guided professional onboarding'; end if;
  select * into au from auth.users where id=auth.uid();
  if au.email is null then raise exception 'Email identity is required'; end if;
  if public.professional_identity_verification_required('email') and au.email_confirmed_at is null then raise exception 'Verified email identity is required'; end if;
  normalized_profile_phone:=public.normalize_auth_phone(p.phone);
  if normalized_profile_phone is null then raise exception 'A valid phone number is required'; end if;
  if au.phone_confirmed_at is not null then verified_auth_phone:=public.normalize_auth_phone(au.phone); end if;
  if public.professional_identity_verification_required('phone') and (verified_auth_phone is null or verified_auth_phone<>normalized_profile_phone) then raise exception 'Verified phone identity is required'; end if;

  if p.role='doctor' then
    if not exists(select 1 from public.doctors d where d.id=auth.uid() and d.medical_type in ('MBBS','BDS')) then raise exception 'Select MBBS/BDS Medical Type first'; end if;
    if not exists(select 1 from public.doctors d where d.id=auth.uid() and nullif(trim(d.bmdc_registration_no),'') is not null
      and nullif(trim(d.medical_college),'') is not null and nullif(trim(d.medical_session),'') is not null and nullif(trim(d.medical_batch),'') is not null) then
      raise exception 'Complete Verification information first';
    end if;
    if not exists(select 1 from public.doctors d where d.id=auth.uid() and nullif(trim(d.degree),'') is not null) then raise exception 'Complete Visiting Card degree first'; end if;
    if not exists(select 1 from public.doctor_specialties ds where ds.doctor_id=auth.uid())
       and not exists(select 1 from public.doctors d where d.id=auth.uid() and nullif(trim(d.specialty_text),'') is not null) then
      raise exception 'Add a Specialty text or category first';
    end if;
    if not exists(select 1 from public.providers pr where pr.owner_user_id=auth.uid() and pr.provider_type='chamber') then raise exception 'Add at least one Chamber Details record first'; end if;
    update public.profiles set phone=coalesce(verified_auth_phone,normalized_profile_phone),profile_completed=true,
      onboarding_step=7,onboarding_completed_at=coalesce(onboarding_completed_at,now()),updated_at=now() where id=auth.uid();
    return jsonb_build_object('completed',true,'role',p.role,'onboarding_step',7,
      'email_verification_required',public.professional_identity_verification_required('email'),
      'phone_verification_required',public.professional_identity_verification_required('phone'));
  else
    if not exists(select 1 from public.providers pr where pr.owner_user_id=auth.uid() and pr.provider_type='hospital'
      and nullif(trim(pr.name_bn),'') is not null and nullif(trim(pr.address),'') is not null and pr.district_id is not null) then
      raise exception 'Complete Hospital details and location first';
    end if;
    update public.profiles set phone=coalesce(verified_auth_phone,normalized_profile_phone),profile_completed=true,
      onboarding_step=5,onboarding_completed_at=coalesce(onboarding_completed_at,now()),updated_at=now() where id=auth.uid();
    return jsonb_build_object('completed',true,'role',p.role,'onboarding_step',5,
      'email_verification_required',public.professional_identity_verification_required('email'),
      'phone_verification_required',public.professional_identity_verification_required('phone'));
  end if;
end;
$$;

revoke all on function public.finish_my_role_onboarding() from public,anon;
grant execute on function public.finish_my_role_onboarding() to authenticated,service_role;

commit;
