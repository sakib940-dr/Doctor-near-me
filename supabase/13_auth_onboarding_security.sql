-- ============================================================
-- STEP 13 — AUTH + SELF-ONBOARDING SECURITY
-- Run after Step 12. Safe to re-run.
-- ============================================================

-- New users may self-select only launch-facing roles. Privileged roles are
-- deliberately absent. Doctor rows start pending and cannot become public
-- until the verification workflow approves them.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  requested_role public.user_role;
begin
  requested_role := case new.raw_user_meta_data ->> 'intended_role'
    when 'doctor' then 'doctor'::public.user_role
    when 'hospital' then 'hospital'::public.user_role
    when 'ambulance' then 'ambulance'::public.user_role
    else 'patient'::public.user_role
  end;

  insert into public.profiles(id,role,full_name,email,phone)
  values(
    new.id,requested_role,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'),''),''),
    new.email,
    coalesce(new.phone,nullif(trim(new.raw_user_meta_data ->> 'phone'),''))
  )
  on conflict(id) do nothing;

  if requested_role='doctor' then
    insert into public.doctors(id,verification_status)
    values(new.id,'pending')
    on conflict(id) do nothing;
  end if;

  return new;
end;
$$;

revoke all on function public.handle_new_user()
from public,anon,authenticated;

-- Block direct changes to role, status, and other profile columns. Existing
-- safe profile/admin RPCs are SECURITY DEFINER and keep working.
revoke update on table public.profiles from public,anon,authenticated;

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
set search_path=public
as $$
declare
  current_profile public.profiles%rowtype;
  requested_role public.user_role;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if length(trim(coalesce(p_full_name,'')))<2 then
    raise exception 'Full name is required';
  end if;

  requested_role := case p_role
    when 'doctor' then 'doctor'::public.user_role
    when 'hospital' then 'hospital'::public.user_role
    when 'ambulance' then 'ambulance'::public.user_role
    when 'patient' then 'patient'::public.user_role
    else null
  end;

  if requested_role is null then
    raise exception 'Unsupported self-registration role';
  end if;

  select * into current_profile
  from public.profiles
  where id=auth.uid()
  for update;

  if not found then
    raise exception 'Profile not found';
  end if;

  if current_profile.account_status<>'active' then
    raise exception 'Account is not active';
  end if;

  if current_profile.profile_completed
     and current_profile.role<>requested_role then
    raise exception 'Completed account role cannot be self-changed';
  end if;

  if p_upazila_id is not null and not exists(
    select 1 from public.upazilas u
    where u.id=p_upazila_id and u.district_id=p_district_id and u.is_active
  ) then
    raise exception 'Upazila does not belong to the selected district';
  end if;

  update public.profiles
  set full_name=trim(p_full_name),
      phone=coalesce(nullif(trim(p_phone),''),phone),
      role=requested_role,
      district_id=p_district_id,
      upazila_id=p_upazila_id,
      profile_completed=true,
      updated_at=now()
  where id=auth.uid();

  if requested_role='doctor' then
    insert into public.doctors(id,verification_status)
    values(auth.uid(),'pending')
    on conflict(id) do nothing;
  end if;

  return jsonb_build_object(
    'user_id',auth.uid(),
    'role',requested_role,
    'profile_completed',true
  );
end;
$$;

revoke all on function public.complete_my_account_onboarding(
  text,text,text,bigint,bigint
) from public,anon;
grant execute on function public.complete_my_account_onboarding(
  text,text,text,bigint,bigint
) to authenticated,service_role;

-- Account context and profile update RPCs are authenticated APIs, not public
-- anonymous APIs. Explicit ACLs also repair stale default grants.
revoke all on function public.get_my_account_context()
from public,anon;
grant execute on function public.get_my_account_context()
to authenticated,service_role;

revoke all on function public.get_role_dashboard_context()
from public,anon;
grant execute on function public.get_role_dashboard_context()
to authenticated,service_role;

revoke all on function public.update_my_patient_profile(
  text,text,date,text,text,text,bigint,bigint,text,text
) from public,anon;
grant execute on function public.update_my_patient_profile(
  text,text,date,text,text,text,bigint,bigint,text,text
) to authenticated,service_role;

do $assert$
begin
  if has_table_privilege('authenticated','public.profiles','UPDATE') then
    raise exception 'Step 13 failed: authenticated must not directly UPDATE profiles';
  end if;

  if has_function_privilege(
    'anon','public.complete_my_account_onboarding(text,text,text,bigint,bigint)','EXECUTE'
  ) then
    raise exception 'Step 13 failed: anon onboarding EXECUTE must be blocked';
  end if;

  if not has_function_privilege(
    'authenticated','public.complete_my_account_onboarding(text,text,text,bigint,bigint)','EXECUTE'
  ) then
    raise exception 'Step 13 failed: authenticated onboarding EXECUTE is missing';
  end if;
end;
$assert$;

select 'STEP 13 AUTH ONBOARDING SECURITY PASSED' as result;
