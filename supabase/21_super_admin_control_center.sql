-- ============================================================
-- STEP 21 — SUPER ADMIN CONTROL CENTER
-- Run after Step 20. Safe to re-run.
-- ============================================================

do $single_super_admin$
begin
  if (select count(*) from public.profiles where role='super_admin')>1 then
    raise exception 'Step 21 requires exactly one or zero existing Super Admin accounts; demote extras first';
  end if;
end;
$single_super_admin$;

create unique index if not exists ux_profiles_single_super_admin
on public.profiles ((role)) where role='super_admin';

create table if not exists public.privileged_account_invites(
  id uuid primary key default gen_random_uuid(),
  email text not null,
  full_name text not null,
  phone text,
  target_role public.user_role not null
    check(target_role in ('admin','verification_officer')),
  invited_by uuid not null references public.profiles(id) on delete restrict,
  expires_at timestamptz not null default now()+interval '7 days',
  claimed_at timestamptz,
  claimed_user_id uuid references public.profiles(id) on delete set null,
  cancelled_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists ux_privileged_invite_open_email
on public.privileged_account_invites(lower(email))
where claimed_at is null and cancelled_at is null;
create index if not exists idx_privileged_invites_created
on public.privileged_account_invites(created_at desc);

alter table public.privileged_account_invites enable row level security;
revoke all on table public.privileged_account_invites from public,anon,authenticated;

-- Invited email owners still register through normal Supabase Auth. The trigger
-- consumes an active Super Admin invitation and never trusts browser role data.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  requested_role public.user_role;
  matched_invite public.privileged_account_invites%rowtype;
  completed boolean:=false;
begin
  select * into matched_invite
  from public.privileged_account_invites i
  where lower(i.email)=lower(new.email)
    and i.claimed_at is null and i.cancelled_at is null and i.expires_at>now()
  order by i.created_at desc limit 1 for update;

  if found then
    requested_role:=matched_invite.target_role;
    completed:=true;
  else
    requested_role := case new.raw_user_meta_data ->> 'intended_role'
      when 'doctor' then 'doctor'::public.user_role
      when 'hospital' then 'hospital'::public.user_role
      when 'ambulance' then 'ambulance'::public.user_role
      else 'patient'::public.user_role
    end;
  end if;

  insert into public.profiles(id,role,full_name,email,phone,profile_completed)
  values(
    new.id,requested_role,
    case when completed then matched_invite.full_name
      else coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'),''),'') end,
    new.email,
    case when completed then matched_invite.phone
      else coalesce(new.phone,nullif(trim(new.raw_user_meta_data ->> 'phone'),'')) end,
    completed
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

create or replace function public.super_admin_user_directory_v2(
  p_role text default null,p_status text default null,p_district_id bigint default null,
  p_upazila_id bigint default null,p_search text default null,
  p_limit integer default 50,p_offset integer default 0
)
returns table(
  user_id uuid,full_name text,email text,phone text,role text,account_status text,
  district_id bigint,district_name text,upazila_id bigint,upazila_name text,
  address_line text,profile_completed boolean,last_location_at timestamptz,
  last_sign_in_at timestamptz,created_at timestamptz,total_count bigint
)
language plpgsql stable security definer set search_path=public,auth
as $$
begin
  if not public.is_super_admin() then raise exception 'Only Super Admin can access the full user directory'; end if;
  if p_role is not null and p_role not in ('patient','doctor','chamber','hospital','ambulance','verification_officer','admin','super_admin') then raise exception 'Invalid role'; end if;
  if p_status is not null and p_status not in ('active','suspended','banned') then raise exception 'Invalid account status'; end if;
  if p_upazila_id is not null and not exists(select 1 from public.upazilas u where u.id=p_upazila_id and (p_district_id is null or u.district_id=p_district_id)) then raise exception 'Invalid upazila filter'; end if;
  return query
  select p.id,p.full_name,p.email,p.phone,p.role::text,p.account_status::text,
    p.district_id,d.name_bn,p.upazila_id,u.name_bn,p.address_line,p.profile_completed,
    loc.updated_at,au.last_sign_in_at,p.created_at,count(*) over()
  from public.profiles p
  left join public.districts d on d.id=p.district_id
  left join public.upazilas u on u.id=p.upazila_id
  left join public.user_current_locations loc on loc.user_id=p.id
  left join auth.users au on au.id=p.id
  where (p_role is null or p.role::text=p_role)
    and (p_status is null or p.account_status::text=p_status)
    and (p_district_id is null or p.district_id=p_district_id)
    and (p_upazila_id is null or p.upazila_id=p_upazila_id)
    and (nullif(trim(p_search),'') is null or p.full_name ilike '%'||trim(p_search)||'%'
      or p.email ilike '%'||trim(p_search)||'%' or p.phone ilike '%'||trim(p_search)||'%')
  order by p.created_at desc,p.id
  limit greatest(1,least(p_limit,100)) offset greatest(p_offset,0);
end;
$$;

create or replace function public.super_admin_get_user_detail_v2(p_user_id uuid)
returns jsonb
language plpgsql security definer set search_path=public,auth
as $$
declare result jsonb;
begin
  if not public.is_super_admin() then raise exception 'Only Super Admin can access full user details'; end if;
  select jsonb_build_object(
    'profile',to_jsonb(p),
    'auth',jsonb_build_object('email_confirmed_at',au.email_confirmed_at,
      'phone_confirmed_at',au.phone_confirmed_at,'last_sign_in_at',au.last_sign_in_at,
      'auth_created_at',au.created_at),
    'district',jsonb_build_object('id',d.id,'name_bn',d.name_bn,'name_en',d.name_en),
    'upazila',jsonb_build_object('id',u.id,'name_bn',u.name_bn,'name_en',u.name_en),
    'last_location',(select jsonb_build_object(
      'latitude',l.latitude,'longitude',l.longitude,'accuracy_meters',l.accuracy_meters,
      'source',l.source,'updated_at',l.updated_at,'district_id',l.district_id,
      'district_name',ld.name_bn,'upazila_id',l.upazila_id,'upazila_name',lu.name_bn
    ) from public.user_current_locations l
      left join public.districts ld on ld.id=l.district_id
      left join public.upazilas lu on lu.id=l.upazila_id where l.user_id=p.id),
    'doctor',(select to_jsonb(doc) from public.doctors doc where doc.id=p.id),
    'providers',coalesce((select jsonb_agg(to_jsonb(pr) order by pr.created_at)
      from public.providers pr where pr.owner_user_id=p.id),'[]'::jsonb),
    'ambulances',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at)
      from public.ambulance_services a where a.owner_user_id=p.id),'[]'::jsonb),
    'blood_donor',(select to_jsonb(b) from public.blood_donor_profiles b where b.user_id=p.id),
    'appointment_counts',jsonb_build_object(
      'as_patient',(select count(*) from public.appointments a where a.patient_id=p.id),
      'as_doctor',(select count(*) from public.appointments a where a.doctor_id=p.id),
      'pending',(select count(*) from public.appointments a where (a.patient_id=p.id or a.doctor_id=p.id) and a.status='pending')
    ),
    'recent_appointments',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc)
      from (select a.id,a.patient_id,a.doctor_id,a.provider_id,a.appointment_date,a.start_time,a.end_time,a.status,a.patient_note,a.created_at
        from public.appointments a where a.patient_id=p.id or a.doctor_id=p.id
        order by a.created_at desc limit 20) x),'[]'::jsonb),
    'recent_audit',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc)
      from (select l.id,l.actor_id,l.action,l.target_type,l.target_id,l.metadata,l.created_at
        from public.admin_audit_logs l where l.target_user_id=p.id
        order by l.created_at desc limit 20) x),'[]'::jsonb)
  ) into result
  from public.profiles p left join auth.users au on au.id=p.id
  left join public.districts d on d.id=p.district_id
  left join public.upazilas u on u.id=p.upazila_id where p.id=p_user_id;
  if result is null then raise exception 'User not found'; end if;
  insert into public.admin_audit_logs(actor_id,action,target_user_id,target_type,target_id,metadata)
  values(auth.uid(),'sensitive_user_detail_viewed',p_user_id,'profile',p_user_id::text,
    jsonb_build_object('included_last_location',true));
  return result;
end;
$$;

create or replace function public.super_admin_update_user_profile(
  p_user_id uuid,p_full_name text,p_phone text default null,p_date_of_birth date default null,
  p_gender text default null,p_blood_group text default null,p_address_line text default null,
  p_district_id bigint default null,p_upazila_id bigint default null,
  p_emergency_contact_name text default null,p_emergency_contact_phone text default null,
  p_reason text default null
)
returns boolean language plpgsql security definer set search_path=public
as $$
declare old_data jsonb;
begin
  if not public.is_super_admin() then raise exception 'Only Super Admin can edit another user profile'; end if;
  if length(trim(coalesce(p_full_name,'')))<2 then raise exception 'Full name is required'; end if;
  if p_gender is not null and p_gender not in ('male','female','other') then raise exception 'Invalid gender'; end if;
  if p_blood_group is not null and upper(p_blood_group) not in ('A+','A-','B+','B-','AB+','AB-','O+','O-') then raise exception 'Invalid blood group'; end if;
  if p_date_of_birth is not null and p_date_of_birth>current_date then raise exception 'Date of birth cannot be in the future'; end if;
  if p_upazila_id is not null and not exists(select 1 from public.upazilas u where u.id=p_upazila_id and u.district_id=p_district_id and u.is_active) then raise exception 'Upazila does not belong to selected district'; end if;
  if length(trim(coalesce(p_reason,'')))<3 then raise exception 'An edit reason is required'; end if;
  select jsonb_build_object('full_name',p.full_name,'phone',p.phone,'date_of_birth',p.date_of_birth,
    'gender',p.gender,'blood_group',p.blood_group,'address_line',p.address_line,
    'district_id',p.district_id,'upazila_id',p.upazila_id) into old_data
  from public.profiles p where p.id=p_user_id for update;
  if old_data is null then raise exception 'User not found'; end if;
  update public.profiles set full_name=trim(p_full_name),phone=nullif(trim(p_phone),''),
    date_of_birth=p_date_of_birth,gender=p_gender,blood_group=upper(p_blood_group),
    address_line=nullif(trim(p_address_line),''),district_id=p_district_id,upazila_id=p_upazila_id,
    emergency_contact_name=nullif(trim(p_emergency_contact_name),''),
    emergency_contact_phone=nullif(trim(p_emergency_contact_phone),''),updated_at=now()
  where id=p_user_id;
  insert into public.admin_audit_logs(actor_id,action,target_user_id,target_type,target_id,metadata)
  values(auth.uid(),'super_admin_profile_updated',p_user_id,'profile',p_user_id::text,
    jsonb_build_object('reason',trim(p_reason),'before',old_data));
  return true;
end;
$$;

create or replace function public.super_admin_change_user_role_v2(
  p_user_id uuid,p_new_role text,p_reason text
)
returns boolean language plpgsql security definer set search_path=public
as $$
declare old_role public.user_role; next_role public.user_role;
begin
  if not public.is_super_admin() then raise exception 'Only Super Admin can change roles'; end if;
  if p_user_id=auth.uid() then raise exception 'Super Admin cannot change their own role'; end if;
  if p_new_role not in ('patient','doctor','chamber','hospital','ambulance','verification_officer','admin') then raise exception 'Invalid target role'; end if;
  if length(trim(coalesce(p_reason,'')))<3 then raise exception 'A role-change reason is required'; end if;
  next_role:=p_new_role::public.user_role;
  select role into old_role from public.profiles where id=p_user_id for update;
  if old_role is null then raise exception 'User not found'; end if;
  if old_role='super_admin' then raise exception 'The only Super Admin cannot be demoted'; end if;
  if old_role=next_role then return true; end if;
  if old_role='doctor' and next_role<>'doctor' then
    update public.doctors set verification_status='rejected',bmdc_verified=false,accepting_appointments=false,updated_at=now() where id=p_user_id;
  end if;
  if old_role in ('hospital','chamber') and next_role<>old_role then
    update public.providers set status='suspended',verified=false,updated_at=now() where owner_user_id=p_user_id;
  end if;
  if old_role='ambulance' and next_role<>'ambulance' then
    update public.ambulance_services set status='suspended',verified=false,updated_at=now() where owner_user_id=p_user_id;
    update public.ambulance_availability av set is_available=false,last_seen_at=now()
    where exists(select 1 from public.ambulance_services a where a.id=av.ambulance_id and a.owner_user_id=p_user_id);
  end if;
  update public.profiles set role=next_role,
    profile_completed=case when next_role in ('admin','verification_officer') then true else profile_completed end,
    updated_at=now() where id=p_user_id;
  if next_role='doctor' then insert into public.doctors(id,verification_status)
    values(p_user_id,'pending') on conflict(id) do update set verification_status='pending',bmdc_verified=false,updated_at=now(); end if;
  insert into public.notifications(recipient_id,sender_id,type,title_bn,body_bn,data)
  values(p_user_id,auth.uid(),'super_admin_role_changed','অ্যাকাউন্ট রোল আপডেট',
    'আপনার অ্যাকাউন্ট রোল '||next_role::text||' করা হয়েছে। কারণ: '||trim(p_reason),
    jsonb_build_object('old_role',old_role,'new_role',next_role,'reason',trim(p_reason)));
  insert into public.admin_audit_logs(actor_id,action,target_user_id,target_type,target_id,metadata)
  values(auth.uid(),'super_admin_role_changed',p_user_id,'profile',p_user_id::text,
    jsonb_build_object('old_role',old_role,'new_role',next_role,'reason',trim(p_reason)));
  return true;
end;
$$;

create or replace function public.super_admin_set_user_status_v2(
  p_user_id uuid,p_status text,p_reason text
)
returns boolean language plpgsql security definer set search_path=public
as $$
declare old_status public.account_status; target_role public.user_role;
begin
  if not public.is_super_admin() then raise exception 'Only Super Admin can change account status'; end if;
  if p_user_id=auth.uid() then raise exception 'Super Admin cannot change their own account status'; end if;
  if p_status not in ('active','suspended','banned') then raise exception 'Invalid account status'; end if;
  if length(trim(coalesce(p_reason,'')))<3 then raise exception 'A status-change reason is required'; end if;
  select account_status,role into old_status,target_role from public.profiles where id=p_user_id for update;
  if target_role is null then raise exception 'User not found'; end if;
  if target_role='super_admin' then raise exception 'The only Super Admin cannot be suspended or banned'; end if;
  if old_status=p_status::public.account_status then return true; end if;
  update public.profiles set account_status=p_status::public.account_status,updated_at=now() where id=p_user_id;
  if p_status<>'active' then
    update public.ambulance_availability av set is_available=false,last_seen_at=now()
    where exists(select 1 from public.ambulance_services a where a.id=av.ambulance_id and a.owner_user_id=p_user_id);
  end if;
  insert into public.notifications(recipient_id,sender_id,type,title_bn,body_bn,data)
  values(p_user_id,auth.uid(),'super_admin_account_status','অ্যাকাউন্ট স্ট্যাটাস আপডেট',
    'আপনার অ্যাকাউন্ট স্ট্যাটাস '||p_status||' করা হয়েছে। কারণ: '||trim(p_reason),
    jsonb_build_object('status',p_status,'reason',trim(p_reason)));
  insert into public.admin_audit_logs(actor_id,action,target_user_id,target_type,target_id,metadata)
  values(auth.uid(),'super_admin_status_changed',p_user_id,'profile',p_user_id::text,
    jsonb_build_object('old_status',old_status,'new_status',p_status,'reason',trim(p_reason)));
  return true;
end;
$$;

create or replace function public.super_admin_create_privileged_invite(
  p_email text,p_full_name text,p_phone text default null,p_target_role text default 'verification_officer',
  p_expires_days integer default 7
)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare result_id uuid; normalized_email text;
begin
  if not public.is_super_admin() then raise exception 'Only Super Admin can create privileged invitations'; end if;
  normalized_email:=lower(trim(coalesce(p_email,'')));
  if normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'Valid email is required'; end if;
  if length(trim(coalesce(p_full_name,'')))<2 then raise exception 'Full name is required'; end if;
  if p_target_role not in ('admin','verification_officer') then raise exception 'Only Admin or Verification Officer can be invited'; end if;
  if p_expires_days not between 1 and 30 then raise exception 'Invite expiry must be 1–30 days'; end if;
  if exists(select 1 from public.profiles where lower(email)=normalized_email) then raise exception 'An account with this email already exists; promote it from the user detail window'; end if;
  update public.privileged_account_invites set cancelled_at=now()
  where lower(email)=normalized_email and claimed_at is null and cancelled_at is null;
  insert into public.privileged_account_invites(email,full_name,phone,target_role,invited_by,expires_at)
  values(normalized_email,trim(p_full_name),nullif(trim(p_phone),''),p_target_role::public.user_role,auth.uid(),now()+make_interval(days=>p_expires_days))
  returning id into result_id;
  insert into public.admin_audit_logs(actor_id,action,target_type,target_id,metadata)
  values(auth.uid(),'privileged_invite_created','privileged_invite',result_id::text,
    jsonb_build_object('email',normalized_email,'target_role',p_target_role,'expires_days',p_expires_days));
  return jsonb_build_object('invite_id',result_id,'email',normalized_email,'target_role',p_target_role,
    'registration_path','/auth?mode=register&email='||replace(normalized_email,'+','%2B'));
end;
$$;

create or replace function public.super_admin_list_privileged_invites()
returns table(invite_id uuid,email text,full_name text,phone text,target_role text,
  expires_at timestamptz,claimed_at timestamptz,cancelled_at timestamptz,created_at timestamptz)
language plpgsql stable security definer set search_path=public
as $$
begin
  if not public.is_super_admin() then raise exception 'Only Super Admin can list privileged invitations'; end if;
  return query select i.id,i.email,i.full_name,i.phone,i.target_role::text,i.expires_at,i.claimed_at,i.cancelled_at,i.created_at
  from public.privileged_account_invites i order by i.created_at desc limit 100;
end;
$$;

create or replace function public.super_admin_cancel_privileged_invite(p_invite_id uuid)
returns boolean language plpgsql security definer set search_path=public
as $$
begin
  if not public.is_super_admin() then raise exception 'Only Super Admin can cancel privileged invitations'; end if;
  update public.privileged_account_invites set cancelled_at=now()
  where id=p_invite_id and claimed_at is null and cancelled_at is null;
  if not found then raise exception 'Open invitation not found'; end if;
  insert into public.admin_audit_logs(actor_id,action,target_type,target_id)
  values(auth.uid(),'privileged_invite_cancelled','privileged_invite',p_invite_id::text);
  return true;
end;
$$;

create or replace function public.super_admin_delete_user_v2(
  p_user_id uuid,p_confirmation text,p_reason text
)
returns boolean language plpgsql security definer set search_path=public,auth
as $$
declare target_email text; target_role public.user_role; snapshot jsonb;
begin
  if not public.is_super_admin() then raise exception 'Only Super Admin can permanently delete accounts'; end if;
  if p_user_id=auth.uid() then raise exception 'Super Admin cannot delete their own account'; end if;
  if length(trim(coalesce(p_reason,'')))<5 then raise exception 'A detailed deletion reason is required'; end if;
  select p.email,p.role,jsonb_build_object('full_name',p.full_name,'email',p.email,'phone',p.phone,'role',p.role,'account_status',p.account_status)
  into target_email,target_role,snapshot from public.profiles p where p.id=p_user_id for update;
  if target_role is null then raise exception 'User not found'; end if;
  if target_role='super_admin' then raise exception 'The only Super Admin cannot be deleted'; end if;
  if p_confirmation is distinct from 'DELETE '||coalesce(lower(target_email),p_user_id::text) then raise exception 'Deletion confirmation does not match'; end if;
  insert into public.admin_audit_logs(actor_id,action,target_type,target_id,metadata)
  values(auth.uid(),'super_admin_user_deleted','deleted_profile',p_user_id::text,
    jsonb_build_object('reason',trim(p_reason),'snapshot',snapshot));
  delete from public.providers where owner_user_id=p_user_id;
  delete from auth.users where id=p_user_id;
  if not found then raise exception 'Auth user not found'; end if;
  return true;
end;
$$;

-- Retire older, less constrained browser-callable Super Admin functions.
revoke all on function public.super_admin_change_role(uuid,public.user_role) from public,anon,authenticated;
revoke all on function public.super_admin_change_role_safe(uuid,public.user_role) from public,anon,authenticated;
revoke all on function public.super_admin_set_account_status(uuid,public.account_status) from public,anon,authenticated;
revoke all on function public.super_admin_get_last_location(uuid) from public,anon,authenticated;

revoke all on function public.super_admin_user_directory_v2(text,text,bigint,bigint,text,integer,integer) from public,anon;
grant execute on function public.super_admin_user_directory_v2(text,text,bigint,bigint,text,integer,integer) to authenticated,service_role;
revoke all on function public.super_admin_get_user_detail_v2(uuid) from public,anon;
grant execute on function public.super_admin_get_user_detail_v2(uuid) to authenticated,service_role;
revoke all on function public.super_admin_update_user_profile(uuid,text,text,date,text,text,text,bigint,bigint,text,text,text) from public,anon;
grant execute on function public.super_admin_update_user_profile(uuid,text,text,date,text,text,text,bigint,bigint,text,text,text) to authenticated,service_role;
revoke all on function public.super_admin_change_user_role_v2(uuid,text,text) from public,anon;
grant execute on function public.super_admin_change_user_role_v2(uuid,text,text) to authenticated,service_role;
revoke all on function public.super_admin_set_user_status_v2(uuid,text,text) from public,anon;
grant execute on function public.super_admin_set_user_status_v2(uuid,text,text) to authenticated,service_role;
revoke all on function public.super_admin_create_privileged_invite(text,text,text,text,integer) from public,anon;
grant execute on function public.super_admin_create_privileged_invite(text,text,text,text,integer) to authenticated,service_role;
revoke all on function public.super_admin_list_privileged_invites() from public,anon;
grant execute on function public.super_admin_list_privileged_invites() to authenticated,service_role;
revoke all on function public.super_admin_cancel_privileged_invite(uuid) from public,anon;
grant execute on function public.super_admin_cancel_privileged_invite(uuid) to authenticated,service_role;
revoke all on function public.super_admin_delete_user_v2(uuid,text,text) from public,anon;
grant execute on function public.super_admin_delete_user_v2(uuid,text,text) to authenticated,service_role;

do $assert$
begin
  if has_function_privilege('anon','public.super_admin_user_directory_v2(text,text,bigint,bigint,text,integer,integer)','EXECUTE')
     or has_function_privilege('anon','public.super_admin_delete_user_v2(uuid,text,text)','EXECUTE') then
    raise exception 'Step 21 failed: anonymous Super Admin access remains'; end if;
  if has_function_privilege('authenticated','public.super_admin_change_role(uuid,public.user_role)','EXECUTE') then
    raise exception 'Step 21 failed: legacy role-change RPC remains browser-callable'; end if;
  if not has_function_privilege('authenticated','public.super_admin_get_user_detail_v2(uuid)','EXECUTE') then
    raise exception 'Step 21 failed: authenticated detail RPC grant missing'; end if;
end;
$assert$;

select 'STEP 21 SUPER ADMIN SECURITY PASSED' as result;
