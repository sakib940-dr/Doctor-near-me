-- ============================================================
-- STEP 33 — AUTH PHONE IDENTITY + ROLE ONBOARDING
-- Run after Step 32. Preserves Supabase Auth as the password owner.
-- ============================================================

alter table public.profiles
  add column if not exists onboarding_step smallint not null default 1,
  add column if not exists onboarding_completed_at timestamptz;

alter table public.profiles drop constraint if exists profiles_onboarding_step_check;
alter table public.profiles add constraint profiles_onboarding_step_check
  check(onboarding_step between 1 and 5);

-- Existing deployed users that were already considered complete must not be
-- forced through the new wizard.
update public.profiles
set onboarding_step=5,
    onboarding_completed_at=coalesce(onboarding_completed_at,updated_at,created_at,now())
where profile_completed=true and onboarding_completed_at is null;

create or replace function public.normalize_auth_phone(p_phone text)
returns text
language plpgsql
immutable
set search_path=public
as $$
declare v text;
begin
  v:=regexp_replace(coalesce(trim(p_phone),''),'[\s().-]','','g');
  if v='' then return null; end if;
  if v ~ '^01[3-9][0-9]{8}$' then return '+88'||v; end if;
  if v ~ '^8801[3-9][0-9]{8}$' then return '+'||v; end if;
  if v ~ '^\+8801[3-9][0-9]{8}$' then return v; end if;
  if v ~ '^\+[1-9][0-9]{7,14}$' then return v; end if;
  return null;
end;
$$;

revoke all on function public.normalize_auth_phone(text) from public,anon,authenticated;
grant execute on function public.normalize_auth_phone(text) to service_role;

-- Preserve the Step 21 privileged invitation logic while enforcing a
-- normalized professional signup phone and preventing accidental Doctor/
-- Hospital duplicate accounts by phone.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  requested_role public.user_role;
  matched_invite public.privileged_account_invites%rowtype;
  completed boolean:=false;
  requested_phone text;
begin
  select * into matched_invite
  from public.privileged_account_invites i
  where new.email is not null
    and lower(i.email)=lower(new.email)
    and i.claimed_at is null and i.cancelled_at is null and i.expires_at>now()
  order by i.created_at desc limit 1 for update;

  if found then
    requested_role:=matched_invite.target_role;
    completed:=true;
    requested_phone:=public.normalize_auth_phone(matched_invite.phone);
  else
    requested_role := case new.raw_user_meta_data ->> 'intended_role'
      when 'doctor' then 'doctor'::public.user_role
      when 'hospital' then 'hospital'::public.user_role
      when 'ambulance' then 'ambulance'::public.user_role
      else 'patient'::public.user_role
    end;
    requested_phone:=public.normalize_auth_phone(coalesce(new.phone,new.raw_user_meta_data ->> 'phone'));
  end if;

  if requested_role in ('doctor','hospital') and requested_phone is null then
    raise exception 'A valid phone number is required for Doctor/Hospital registration';
  end if;

  if requested_phone is not null and requested_role in ('doctor','hospital') and exists(
    select 1 from public.profiles p
    where p.id<>new.id and public.normalize_auth_phone(p.phone)=requested_phone
  ) then
    raise exception 'This phone number is already associated with an account';
  end if;

  if requested_phone is not null and exists(
    select 1 from auth.users u
    where u.id<>new.id and public.normalize_auth_phone(u.phone)=requested_phone
  ) then
    raise exception 'This phone number is already associated with an Auth identity';
  end if;

  insert into public.profiles(
    id,role,full_name,email,phone,profile_completed,onboarding_step,onboarding_completed_at
  ) values(
    new.id,requested_role,
    case when completed then matched_invite.full_name
      else coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'),''),'') end,
    new.email,
    requested_phone,
    completed,
    case when completed then 5 else 1 end,
    case when completed then now() else null end
  ) on conflict(id) do nothing;

  if requested_role='doctor' then
    insert into public.doctors(id,verification_status)
    values(new.id,'pending') on conflict(id) do nothing;
  end if;

  if completed then
    update public.privileged_account_invites
    set claimed_at=now(),claimed_user_id=new.id where id=matched_invite.id;
    insert into public.admin_audit_logs(actor_id,action,target_user_id,target_type,target_id,metadata)
    values(matched_invite.invited_by,'privileged_invite_claimed',new.id,'profile',new.id::text,
      jsonb_build_object('email',lower(new.email),'role',requested_role));
  end if;
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public,anon,authenticated;

-- Account context now carries canonical contact and onboarding state.
create or replace function public.get_my_account_context()
returns jsonb
language sql
stable
security invoker
set search_path=public
as $$
  select jsonb_build_object(
    'user_id',p.id,
    'role',p.role,
    'account_status',p.account_status,
    'full_name',p.full_name,
    'email',p.email,
    'phone',p.phone,
    'district_id',p.district_id,
    'upazila_id',p.upazila_id,
    'avatar_url',p.avatar_url,
    'profile_completed',p.profile_completed,
    'onboarding_step',p.onboarding_step,
    'onboarding_completed',p.onboarding_completed_at is not null,
    'onboarding_completed_at',p.onboarding_completed_at
  )
  from public.profiles p
  where p.id=auth.uid();
$$;

revoke all on function public.get_my_account_context() from public,anon;
grant execute on function public.get_my_account_context() to authenticated,service_role;

-- Basic onboarding remains the same RPC. Doctor/Hospital now progress to the
-- next guided step instead of being marked fully onboarded immediately.
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

  if is_guided then
    if normalized_phone is null then raise exception 'A valid phone number is required'; end if;
    select public.normalize_auth_phone(u.phone) into auth_phone from auth.users u where u.id=auth.uid();
    if auth_phone is null or auth_phone<>normalized_phone then
      raise exception 'Verify this phone number in Supabase Auth before continuing';
    end if;
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

-- Preflight before auth.updateUser({phone}). It never returns another user's
-- email/identity. It also refuses an ambiguous stale phone_change collision.
create or replace function public.prepare_my_phone_link(p_phone text)
returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $$
declare normalized text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists(select 1 from public.profiles p where p.id=auth.uid() and p.account_status='active') then
    raise exception 'Active account required';
  end if;
  normalized:=public.normalize_auth_phone(p_phone);
  if normalized is null then raise exception 'Invalid phone number'; end if;

  if exists(
    select 1 from auth.users u
    where u.id<>auth.uid() and public.normalize_auth_phone(u.phone)=normalized
  ) then raise exception 'This phone number is already linked to another account'; end if;

  if exists(
    select 1 from auth.users u
    where u.id<>auth.uid()
      and public.normalize_auth_phone(to_jsonb(u)->>'phone_change')=normalized
  ) then raise exception 'Phone verification is already pending for another account; retry later or contact support'; end if;

  if exists(
    select 1 from public.profiles p
    where p.id<>auth.uid() and public.normalize_auth_phone(p.phone)=normalized
  ) then raise exception 'This phone number is already associated with another account'; end if;

  return jsonb_build_object('phone',normalized,'ready',true);
end;
$$;

revoke all on function public.prepare_my_phone_link(text) from public,anon;
grant execute on function public.prepare_my_phone_link(text) to authenticated,service_role;

create or replace function public.confirm_my_verified_phone()
returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $$
declare normalized text; confirmed timestamptz;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists(select 1 from public.profiles p where p.id=auth.uid() and p.account_status='active') then
    raise exception 'Active account required';
  end if;
  select public.normalize_auth_phone(u.phone),u.phone_confirmed_at
  into normalized,confirmed from auth.users u where u.id=auth.uid();
  if normalized is null or confirmed is null then raise exception 'Phone number is not verified yet'; end if;
  if exists(
    select 1 from public.profiles p
    where p.id<>auth.uid() and public.normalize_auth_phone(p.phone)=normalized
  ) then raise exception 'This phone number belongs to another account'; end if;
  update public.profiles set phone=normalized,updated_at=now() where id=auth.uid();
  return jsonb_build_object('phone',normalized,'verified',true);
end;
$$;

revoke all on function public.confirm_my_verified_phone() from public,anon;
grant execute on function public.confirm_my_verified_phone() to authenticated,service_role;

create or replace function public.set_my_onboarding_step(p_step smallint)
returns smallint
language plpgsql
security definer
set search_path=public
as $$
declare r public.user_role;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_step<1 or p_step>5 then raise exception 'Invalid onboarding step'; end if;
  select role into r from public.profiles
  where id=auth.uid() and account_status='active' for update;
  if r not in ('doctor','hospital') then raise exception 'Guided onboarding is only for Doctor/Hospital accounts'; end if;
  update public.profiles set onboarding_step=p_step,updated_at=now() where id=auth.uid();
  return p_step;
end;
$$;

revoke all on function public.set_my_onboarding_step(smallint) from public,anon;
grant execute on function public.set_my_onboarding_step(smallint) to authenticated,service_role;

create or replace function public.finish_my_role_onboarding()
returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $$
declare p public.profiles%rowtype; au auth.users%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into p from public.profiles where id=auth.uid() for update;
  if not found or p.account_status<>'active' then raise exception 'Active account required'; end if;
  if p.role not in ('doctor','hospital') then raise exception 'This account does not use guided professional onboarding'; end if;
  select * into au from auth.users where id=auth.uid();
  if au.email is null or au.email_confirmed_at is null then raise exception 'Verified email identity is required'; end if;
  if au.phone is null or au.phone_confirmed_at is null then raise exception 'Verified phone identity is required'; end if;

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
  set phone=public.normalize_auth_phone(au.phone),profile_completed=true,
      onboarding_step=5,onboarding_completed_at=coalesce(onboarding_completed_at,now()),updated_at=now()
  where id=auth.uid();

  return jsonb_build_object('completed',true,'role',p.role,'onboarding_step',5);
end;
$$;

revoke all on function public.finish_my_role_onboarding() from public,anon;
grant execute on function public.finish_my_role_onboarding() to authenticated,service_role;

-- Static security assertions.
do $assert$
begin
  if has_function_privilege('anon','public.prepare_my_phone_link(text)','EXECUTE') then
    raise exception 'Step 33 failed: anon must not prepare phone linking';
  end if;
  if has_function_privilege('anon','public.finish_my_role_onboarding()','EXECUTE') then
    raise exception 'Step 33 failed: anon must not finalize onboarding';
  end if;
  if has_table_privilege('authenticated','public.profiles','UPDATE') then
    raise exception 'Step 33 failed: direct authenticated profile UPDATE must remain revoked';
  end if;
end;
$assert$;

select 'STEP 33 AUTH PHONE + ROLE ONBOARDING PASSED' as result;
