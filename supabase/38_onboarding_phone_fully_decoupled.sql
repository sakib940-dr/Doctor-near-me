-- ============================================================
-- STEP 38 — FULLY DECOUPLE PHONE VERIFICATION FROM ONBOARDING
-- Run after Step 37.
--
-- Temporary rollout mode:
--   * Registration page still requires/stores Phone Number.
--   * Onboarding never sends an OTP and never requires Auth phone confirmation.
--   * The Step 1 RPC deliberately ignores p_phone and preserves the signup phone.
--   * Final Doctor/Hospital onboarding completion does not require phone/email
--     confirmation while providers are not configured.
--
-- No RLS is disabled. No password/authentication bypass is introduced.
-- ============================================================

-- Recover the registration phone from Auth signup metadata for accounts created
-- while older onboarding builds were being tested. Only fill a missing profile
-- phone and only when the metadata value is valid.
update public.profiles p
set phone = public.normalize_auth_phone(u.raw_user_meta_data ->> 'phone'),
    updated_at = now()
from auth.users u
where u.id = p.id
  and nullif(trim(coalesce(p.phone,'')),'') is null
  and public.normalize_auth_phone(u.raw_user_meta_data ->> 'phone') is not null;

-- Keep the public signature for compatibility with already deployed clients,
-- but p_phone is intentionally NOT used. Phone ownership/verification belongs
-- to the registration/auth flow, not guided onboarding.
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
  signup_phone text;
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

  is_guided := requested_role in ('doctor','hospital');

  -- Preserve the phone captured at signup. If an older profile missed it, recover
  -- only from this same Auth user's signup metadata. Never send OTP here.
  signup_phone := public.normalize_auth_phone(current_profile.phone);
  if signup_phone is null then
    select public.normalize_auth_phone(u.raw_user_meta_data ->> 'phone')
      into signup_phone
    from auth.users u where u.id=auth.uid();
  end if;

  -- Duplicate protection remains when a signup phone exists. A missing phone on
  -- a legacy test account does not block onboarding in this temporary mode.
  if signup_phone is not null and exists(
    select 1 from public.profiles p
    where p.id<>auth.uid() and public.normalize_auth_phone(p.phone)=signup_phone
  ) then raise exception 'This phone number is already associated with another account'; end if;

  update public.profiles
  set full_name=trim(p_full_name),
      phone=coalesce(signup_phone,phone),
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

-- Final professional completion validates canonical Doctor/Hospital data only.
-- There is deliberately no Auth phone/email confirmation requirement here.
create or replace function public.finish_my_role_onboarding()
returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  p public.profiles%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into p from public.profiles where id=auth.uid() for update;
  if not found or p.account_status<>'active' then raise exception 'Active account required'; end if;
  if p.role not in ('doctor','hospital') then
    raise exception 'This account does not use guided professional onboarding';
  end if;

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
  set profile_completed=true,
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

-- Assertions for this temporary mode.
do $assert$
begin
  if has_function_privilege('anon','public.complete_my_account_onboarding(text,text,text,bigint,bigint)','EXECUTE') then
    raise exception 'Step 38 failed: anon must not complete onboarding';
  end if;
  if has_function_privilege('anon','public.finish_my_role_onboarding()','EXECUTE') then
    raise exception 'Step 38 failed: anon must not finish professional onboarding';
  end if;
end
$assert$;
