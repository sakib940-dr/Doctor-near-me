-- ============================================================
-- STEP 37 — REMOVE RESIDUAL OTP GATE FROM PROFESSIONAL ONBOARDING
-- Temporary rollout mode while Email/SMS providers are not configured.
--
-- Phone Number remains REQUIRED and duplicate-phone protection remains active,
-- but Email/Phone confirmation timestamps do NOT block Doctor/Hospital
-- onboarding or dashboard completion. This migration is intentionally
-- standalone over Step 33/36 behavior so a stale verification RPC cannot keep
-- Step 1 blocked.
--
-- Later, when providers are configured, add a later migration to re-enable
-- identity confirmation requirements. Do not edit historical migrations.
-- Run after Step 36 (safe if Step 36 was already applied).
-- ============================================================

insert into public.site_settings(setting_key,setting_value,is_public,description)
values(
  'professional_identity_verification_policy',
  jsonb_build_object(
    'require_email_verification',false,
    'require_phone_verification',false
  ),
  false,
  'Temporary rollout: professional email/phone confirmation does not block onboarding until providers are configured.'
)
on conflict(setting_key) do update
set setting_value=jsonb_build_object(
      'require_email_verification',false,
      'require_phone_verification',false
    ),
    is_public=false,
    description=excluded.description,
    updated_at=now();

-- Step 1 save. No OTP/confirmation check here. Authentication, active-account,
-- role lock, valid phone and duplicate phone checks remain enforced.
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
  normalized_phone:=public.normalize_auth_phone(p_phone);

  if is_guided and normalized_phone is null then
    raise exception 'A valid phone number is required';
  end if;

  if normalized_phone is not null and exists(
    select 1 from public.profiles p
    where p.id<>auth.uid() and public.normalize_auth_phone(p.phone)=normalized_phone
  ) then raise exception 'This phone number is already associated with another account'; end if;

  update public.profiles
  set full_name=trim(p_full_name),
      phone=coalesce(normalized_phone,phone),
      role=requested_role,
      district_id=p_district_id,
      upazila_id=p_upazila_id,
      profile_completed=case when is_guided then profile_completed else true end,
      onboarding_step=case when is_guided then greatest(coalesce(onboarding_step,1),2) else 5 end,
      onboarding_completed_at=case when is_guided then onboarding_completed_at else coalesce(onboarding_completed_at,now()) end,
      updated_at=now()
  where id=auth.uid();

  if requested_role='doctor' then
    insert into public.doctors(id,verification_status)
    values(auth.uid(),'pending') on conflict(id) do nothing;
  end if;

  return jsonb_build_object(
    'user_id',auth.uid(),
    'role',requested_role,
    'profile_completed',case when is_guided then current_profile.profile_completed else true end,
    'onboarding_step',case when is_guided then greatest(coalesce(current_profile.onboarding_step,1),2) else 5 end,
    'onboarding_completed',case when is_guided then current_profile.onboarding_completed_at is not null else true end,
    'phone_verification_required',false,
    'email_verification_required',false
  );
end;
$$;

revoke all on function public.complete_my_account_onboarding(text,text,text,bigint,bigint) from public,anon;
grant execute on function public.complete_my_account_onboarding(text,text,text,bigint,bigint) to authenticated,service_role;

-- Final guided completion. Canonical Doctor/Hospital data requirements remain;
-- only Auth email/phone confirmation gates are deferred.
create or replace function public.finish_my_role_onboarding()
returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  p public.profiles%rowtype;
  au auth.users%rowtype;
  normalized_profile_phone text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into p from public.profiles where id=auth.uid() for update;
  if not found or p.account_status<>'active' then raise exception 'Active account required'; end if;
  if p.role not in ('doctor','hospital') then
    raise exception 'This account does not use guided professional onboarding';
  end if;

  select * into au from auth.users where id=auth.uid();
  if au.email is null then raise exception 'Email identity is required'; end if;

  normalized_profile_phone:=public.normalize_auth_phone(p.phone);
  if normalized_profile_phone is null then raise exception 'A valid phone number is required'; end if;

  if p.role='doctor' then
    if not exists(select 1 from public.doctors d where d.id=auth.uid()) then
      raise exception 'Doctor profile is missing';
    end if;
    if not exists(select 1 from public.doctor_specialties ds where ds.doctor_id=auth.uid()) then
      raise exception 'Complete Visiting Card specialty first';
    end if;
    if not exists(
      select 1 from public.providers pr
      where pr.owner_user_id=auth.uid() and pr.provider_type='chamber'
    ) then raise exception 'Add at least one Chamber Details record first'; end if;
    if not exists(
      select 1 from public.doctors d where d.id=auth.uid()
        and nullif(trim(d.medical_college),'') is not null
        and nullif(trim(d.medical_session),'') is not null
        and nullif(trim(d.medical_batch),'') is not null
    ) then raise exception 'Complete Verification education information first'; end if;
  else
    if not exists(
      select 1 from public.providers pr
      where pr.owner_user_id=auth.uid() and pr.provider_type='hospital'
        and nullif(trim(pr.name_bn),'') is not null
        and nullif(trim(pr.address),'') is not null
        and pr.district_id is not null
    ) then raise exception 'Complete Hospital details and location first'; end if;
  end if;

  update public.profiles
  set phone=normalized_profile_phone,
      profile_completed=true,
      onboarding_step=5,
      onboarding_completed_at=coalesce(onboarding_completed_at,now()),
      updated_at=now()
  where id=auth.uid();

  return jsonb_build_object(
    'completed',true,
    'role',p.role,
    'onboarding_step',5,
    'email_verification_required',false,
    'phone_verification_required',false
  );
end;
$$;

revoke all on function public.finish_my_role_onboarding() from public,anon;
grant execute on function public.finish_my_role_onboarding() to authenticated,service_role;

-- Deployment assertions: fail closed if anonymous execution was accidentally
-- exposed or the temporary policy was not actually stored as disabled.
do $assert$
begin
  if has_function_privilege('anon','public.complete_my_account_onboarding(text,text,text,bigint,bigint)','EXECUTE') then
    raise exception 'Step 37 failed: anon must not complete onboarding';
  end if;
  if has_function_privilege('anon','public.finish_my_role_onboarding()','EXECUTE') then
    raise exception 'Step 37 failed: anon must not finish professional onboarding';
  end if;
  if coalesce((select (setting_value ->> 'require_phone_verification')::boolean
               from public.site_settings where setting_key='professional_identity_verification_policy'),true) then
    raise exception 'Step 37 failed: phone verification must remain deferred';
  end if;
end
$assert$;
