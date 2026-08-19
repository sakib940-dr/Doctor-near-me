-- ============================================================
-- STEP 36 — DEFER PROFESSIONAL EMAIL/PHONE VERIFICATION
-- Temporary rollout policy while SMS/email verification providers are not
-- configured. Email + Phone inputs remain required where already required,
-- duplicate-phone protections remain active, but verification does not block
-- Doctor/Hospital onboarding or dashboard completion.
--
-- Later, after providers are configured, set the existing setting booleans to
-- true (or replace these functions in a later migration) to enforce identity
-- verification again without changing the account/data model.
-- Run after Step 35. Safe to re-run.
-- ============================================================

insert into public.site_settings(setting_key,setting_value,is_public,description)
values(
  'professional_identity_verification_policy',
  jsonb_build_object(
    'require_email_verification',false,
    'require_phone_verification',false
  ),
  false,
  'Temporary Doctor/Hospital identity verification gates. Keep false until email/SMS providers are configured.'
)
on conflict(setting_key) do update
set setting_value=jsonb_build_object(
      'require_email_verification',false,
      'require_phone_verification',false
    ),
    is_public=false,
    description=excluded.description,
    updated_at=now();

create or replace function public.professional_identity_verification_required(p_identity text)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select case lower(coalesce(p_identity,''))
    when 'email' then coalesce((s.setting_value ->> 'require_email_verification')::boolean,false)
    when 'phone' then coalesce((s.setting_value ->> 'require_phone_verification')::boolean,false)
    else false
  end
  from (select 1) x
  left join public.site_settings s
    on s.setting_key='professional_identity_verification_policy';
$$;

revoke all on function public.professional_identity_verification_required(text) from public,anon,authenticated;
grant execute on function public.professional_identity_verification_required(text) to service_role;

-- Keep the Step 33 RPC signature/data model. Phone remains required for guided
-- Doctor/Hospital onboarding, but a verified native Auth phone is enforced only
-- when the policy is later enabled.
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
  normalized_phone:=public.normalize_auth_phone(p_phone);

  if is_guided and normalized_phone is null then
    raise exception 'A valid phone number is required';
  end if;

  if normalized_phone is not null and exists(
    select 1 from public.profiles p
    where p.id<>auth.uid() and public.normalize_auth_phone(p.phone)=normalized_phone
  ) then raise exception 'This phone number is already associated with another account'; end if;

  if is_guided and public.professional_identity_verification_required('phone') then
    select public.normalize_auth_phone(u.phone),u.phone_confirmed_at
      into auth_phone,auth_phone_confirmed
    from auth.users u where u.id=auth.uid();
    if auth_phone_confirmed is null or auth_phone is null or auth_phone<>normalized_phone then
      raise exception 'Verify this phone number in Supabase Auth before continuing';
    end if;
  end if;

  update public.profiles
  set full_name=trim(p_full_name),
      phone=coalesce(normalized_phone,phone),
      role=requested_role,
      district_id=p_district_id,
      upazila_id=p_upazila_id,
      profile_completed=case when is_guided then profile_completed else true end,
      onboarding_step=case when is_guided then greatest(onboarding_step,2) else 5 end,
      onboarding_completed_at=case when is_guided then onboarding_completed_at else coalesce(onboarding_completed_at,now()) end,
      updated_at=now()
  where id=auth.uid();

  if requested_role='doctor' then
    insert into public.doctors(id,verification_status)
    values(auth.uid(),'pending') on conflict(id) do nothing;
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

-- Final completion still validates the professional profile/chamber/provider
-- requirements, but email/phone confirmation timestamps only become mandatory
-- when the policy is later enabled.
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
  verified_auth_phone text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into p from public.profiles where id=auth.uid() for update;
  if not found or p.account_status<>'active' then raise exception 'Active account required'; end if;
  if p.role not in ('doctor','hospital') then raise exception 'This account does not use guided professional onboarding'; end if;
  select * into au from auth.users where id=auth.uid();

  if au.email is null then raise exception 'Email identity is required'; end if;
  if public.professional_identity_verification_required('email') and au.email_confirmed_at is null then
    raise exception 'Verified email identity is required';
  end if;

  normalized_profile_phone:=public.normalize_auth_phone(p.phone);
  if normalized_profile_phone is null then raise exception 'A valid phone number is required'; end if;

  if au.phone_confirmed_at is not null then
    verified_auth_phone:=public.normalize_auth_phone(au.phone);
  end if;

  if public.professional_identity_verification_required('phone') then
    if verified_auth_phone is null or verified_auth_phone<>normalized_profile_phone then
      raise exception 'Verified phone identity is required';
    end if;
  end if;

  if p.role='doctor' then
    if not exists(select 1 from public.doctors d where d.id=auth.uid()) then raise exception 'Doctor profile is missing'; end if;
    if not exists(select 1 from public.doctor_specialties ds where ds.doctor_id=auth.uid()) then raise exception 'Complete Visiting Card specialty first'; end if;
    if not exists(select 1 from public.providers pr where pr.owner_user_id=auth.uid() and pr.provider_type='chamber') then raise exception 'Add at least one Chamber Details record first'; end if;
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
  set phone=coalesce(verified_auth_phone,normalized_profile_phone),
      profile_completed=true,
      onboarding_step=5,
      onboarding_completed_at=coalesce(onboarding_completed_at,now()),
      updated_at=now()
  where id=auth.uid();

  return jsonb_build_object(
    'completed',true,
    'role',p.role,
    'onboarding_step',5,
    'email_verification_required',public.professional_identity_verification_required('email'),
    'phone_verification_required',public.professional_identity_verification_required('phone')
  );
end;
$$;

revoke all on function public.finish_my_role_onboarding() from public,anon;
grant execute on function public.finish_my_role_onboarding() to authenticated,service_role;

-- Static safety assertions.
do $assert$
begin
  if has_function_privilege('anon','public.complete_my_account_onboarding(text,text,text,bigint,bigint)','EXECUTE') then
    raise exception 'Step 36 failed: anon must not complete onboarding';
  end if;
  if has_function_privilege('anon','public.finish_my_role_onboarding()','EXECUTE') then
    raise exception 'Step 36 failed: anon must not finish professional onboarding';
  end if;
  if coalesce((select (setting_value ->> 'require_phone_verification')::boolean
               from public.site_settings where setting_key='professional_identity_verification_policy'),true) then
    raise exception 'Step 36 failed: phone verification must be deferred';
  end if;
end
$assert$;
