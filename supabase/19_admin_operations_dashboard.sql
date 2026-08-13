-- ============================================================
-- STEP 19 — ADMIN OPERATIONS DASHBOARD
-- Run after Step 18. Safe to re-run.
-- ============================================================

create or replace function public.get_admin_operational_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
begin
  if not public.is_admin_or_above() then
    raise exception 'Admin access required';
  end if;

  return jsonb_build_object(
    'total_users',(select count(*) from public.profiles),
    'active_users',(select count(*) from public.profiles where account_status='active'),
    'suspended_users',(select count(*) from public.profiles where account_status='suspended'),
    'banned_users',(select count(*) from public.profiles where account_status='banned'),
    'doctors',(select count(*) from public.doctors),
    'providers',(select count(*) from public.providers),
    'ambulances',(select count(*) from public.ambulance_services),
    'pending_doctors',(select count(*) from public.doctors where verification_status='pending'),
    'pending_providers',(select count(*) from public.providers where status='pending'),
    'pending_ambulances',(select count(*) from public.ambulance_services where status='pending'),
    'pending_verifications',
      (select count(*) from public.doctors where verification_status='pending')+
      (select count(*) from public.providers where status='pending')+
      (select count(*) from public.ambulance_services where status='pending'),
    'appointments_today',(select count(*) from public.appointments where appointment_date=current_date),
    'pending_appointments',(select count(*) from public.appointments where status='pending'),
    'appointments_last_30_days',(select count(*) from public.appointments where created_at>=now()-interval '30 days'),
    'role_counts',coalesce((select jsonb_object_agg(role::text,total) from (
      select role,count(*)::bigint total from public.profiles group by role
    ) role_totals),'{}'::jsonb)
  );
end;
$$;

create or replace function public.get_admin_user_directory(
  p_role text default null,
  p_status text default null,
  p_search text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table(
  user_id uuid,full_name text,email text,phone text,role text,
  account_status text,district_id bigint,upazila_id bigint,
  professional_status text,entity_id uuid,created_at timestamptz,
  updated_at timestamptz,total_count bigint
)
language plpgsql
stable
security definer
set search_path=public
as $$
begin
  if not public.is_admin_or_above() then raise exception 'Admin access required'; end if;
  if p_role is not null and p_role not in (
    'patient','doctor','chamber','hospital','ambulance',
    'verification_officer','admin','super_admin'
  ) then raise exception 'Invalid role'; end if;
  if p_status is not null and p_status not in ('active','suspended','banned') then
    raise exception 'Invalid account status';
  end if;

  return query
  with directory as (
    select p.id,p.full_name,p.email,p.phone,p.role::text role,
      p.account_status::text account_status,p.district_id,p.upazila_id,
      case p.role::text
        when 'doctor' then (select d.verification_status::text from public.doctors d where d.id=p.id)
        when 'hospital' then (select pr.status::text from public.providers pr where pr.owner_user_id=p.id order by pr.updated_at desc limit 1)
        when 'chamber' then (select pr.status::text from public.providers pr where pr.owner_user_id=p.id order by pr.updated_at desc limit 1)
        when 'ambulance' then (select a.status::text from public.ambulance_services a where a.owner_user_id=p.id order by a.updated_at desc limit 1)
        else null
      end professional_status,
      case p.role::text
        when 'doctor' then (select d.id from public.doctors d where d.id=p.id)
        when 'hospital' then (select pr.id from public.providers pr where pr.owner_user_id=p.id order by pr.updated_at desc limit 1)
        when 'chamber' then (select pr.id from public.providers pr where pr.owner_user_id=p.id order by pr.updated_at desc limit 1)
        when 'ambulance' then (select a.id from public.ambulance_services a where a.owner_user_id=p.id order by a.updated_at desc limit 1)
        else null
      end entity_id,
      p.created_at,p.updated_at
    from public.profiles p
    where (public.is_super_admin() or p.role::text not in ('admin','super_admin'))
      and (p_role is null or p.role::text=p_role)
      and (p_status is null or p.account_status::text=p_status)
      and (
        nullif(trim(p_search),'') is null
        or p.full_name ilike '%'||trim(p_search)||'%'
        or p.email ilike '%'||trim(p_search)||'%'
        or p.phone ilike '%'||trim(p_search)||'%'
      )
  )
  select d.*,count(*) over() total_count
  from directory d
  order by d.created_at desc,d.id
  limit greatest(1,least(p_limit,100)) offset greatest(p_offset,0);
end;
$$;

create or replace function public.admin_set_user_account_status(
  p_user_id uuid,p_status text,p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare target_role text; old_status text; target_name text;
begin
  if not public.is_admin_or_above() then raise exception 'Admin access required'; end if;
  if p_user_id=auth.uid() then raise exception 'You cannot change your own account status'; end if;
  if p_status not in ('active','suspended') then
    raise exception 'Admin can only activate or suspend accounts';
  end if;
  if p_status='suspended' and length(trim(coalesce(p_reason,'')))<3 then
    raise exception 'A suspension reason is required';
  end if;

  select p.role::text,p.account_status::text,p.full_name
  into target_role,old_status,target_name
  from public.profiles p where p.id=p_user_id for update;
  if target_role is null then raise exception 'User profile not found'; end if;
  if not public.is_super_admin() and target_role in ('admin','super_admin') then
    raise exception 'Admin cannot manage Admin or Super Admin accounts';
  end if;
  if not public.is_super_admin() and old_status='banned' then
    raise exception 'Only Super Admin can restore a banned account';
  end if;
  if target_role='super_admin' and p_status<>'active' and (
    select count(*) from public.profiles
    where role='super_admin' and account_status='active'
  )<=1 then raise exception 'Cannot suspend the last active Super Admin'; end if;
  if old_status=p_status then return true; end if;

  update public.profiles set account_status=p_status::public.account_status,updated_at=now()
  where id=p_user_id;
  if p_status='suspended' and target_role='ambulance' then
    update public.ambulance_availability av set is_available=false,last_seen_at=now()
    where exists(
      select 1 from public.ambulance_services a
      where a.id=av.ambulance_id and a.owner_user_id=p_user_id
    );
  end if;

  insert into public.notifications(recipient_id,sender_id,type,title_bn,body_bn,data)
  values(p_user_id,auth.uid(),'account_status_changed','অ্যাকাউন্ট স্ট্যাটাস আপডেট',
    case when p_status='active' then 'আপনার অ্যাকাউন্ট আবার সক্রিয় করা হয়েছে।'
      else 'আপনার অ্যাকাউন্ট সাময়িকভাবে স্থগিত করা হয়েছে। কারণ: '||trim(p_reason) end,
    jsonb_build_object('status',p_status,'reason',nullif(trim(p_reason),'')));
  insert into public.admin_audit_logs(actor_id,action,target_user_id,target_type,target_id,metadata)
  values(auth.uid(),'account_status_changed',p_user_id,'profile',p_user_id::text,
    jsonb_build_object('old_status',old_status,'new_status',p_status,
      'reason',nullif(trim(p_reason),''),'target_role',target_role,'target_name',target_name));
  return true;
end;
$$;

create or replace function public.get_admin_appointment_directory(
  p_status text default null,p_search text default null,
  p_date_from date default null,p_date_to date default null,
  p_limit integer default 50,p_offset integer default 0
)
returns table(
  appointment_id uuid,appointment_date date,start_time time,end_time time,
  status text,patient_id uuid,patient_name text,patient_phone text,
  doctor_id uuid,doctor_name text,provider_id uuid,provider_name text,
  patient_note text,created_at timestamptz,updated_at timestamptz,total_count bigint
)
language plpgsql
stable
security definer
set search_path=public
as $$
begin
  if not public.is_admin_or_above() then raise exception 'Admin access required'; end if;
  if p_status is not null and p_status not in (
    'pending','confirmed','rejected','cancelled','completed','no_show'
  ) then raise exception 'Invalid appointment status'; end if;
  return query
  select a.id,a.appointment_date,a.start_time,a.end_time,a.status,
    a.patient_id,patient.full_name,patient.phone,a.doctor_id,doctor.full_name,
    a.provider_id,pr.name_bn,a.patient_note,a.created_at,a.updated_at,
    count(*) over()
  from public.appointments a
  join public.profiles patient on patient.id=a.patient_id
  join public.profiles doctor on doctor.id=a.doctor_id
  left join public.providers pr on pr.id=a.provider_id
  where (p_status is null or a.status=p_status)
    and (p_date_from is null or a.appointment_date>=p_date_from)
    and (p_date_to is null or a.appointment_date<=p_date_to)
    and (
      nullif(trim(p_search),'') is null
      or patient.full_name ilike '%'||trim(p_search)||'%'
      or patient.phone ilike '%'||trim(p_search)||'%'
      or doctor.full_name ilike '%'||trim(p_search)||'%'
      or pr.name_bn ilike '%'||trim(p_search)||'%'
    )
  order by a.appointment_date desc,a.start_time desc nulls last,a.created_at desc
  limit greatest(1,least(p_limit,100)) offset greatest(p_offset,0);
end;
$$;

create or replace function public.admin_override_appointment_status(
  p_appointment_id uuid,p_status text,p_reason text
)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare target_patient uuid; target_doctor uuid; old_status text;
begin
  if not public.is_admin_or_above() then raise exception 'Admin access required'; end if;
  if p_status not in ('pending','confirmed','rejected','cancelled','completed','no_show') then
    raise exception 'Invalid appointment status';
  end if;
  if length(trim(coalesce(p_reason,'')))<3 then
    raise exception 'An override reason is required';
  end if;
  select a.patient_id,a.doctor_id,a.status into target_patient,target_doctor,old_status
  from public.appointments a where a.id=p_appointment_id for update;
  if target_patient is null then raise exception 'Appointment not found'; end if;
  if old_status=p_status then return true; end if;
  update public.appointments set status=p_status,updated_at=now()
  where id=p_appointment_id;

  insert into public.notifications(recipient_id,sender_id,type,title_bn,body_bn,data)
  select recipient,auth.uid(),'appointment_admin_override','অ্যাপয়েন্টমেন্ট স্ট্যাটাস আপডেট',
    'Admin আপনার অ্যাপয়েন্টমেন্টের স্ট্যাটাস '||p_status||' করেছেন। কারণ: '||trim(p_reason),
    jsonb_build_object('appointment_id',p_appointment_id,'status',p_status,'reason',trim(p_reason))
  from (values(target_patient),(target_doctor)) recipients(recipient);
  insert into public.admin_audit_logs(actor_id,action,target_user_id,target_type,target_id,metadata)
  values(auth.uid(),'appointment_status_override',target_patient,'appointment',p_appointment_id::text,
    jsonb_build_object('old_status',old_status,'new_status',p_status,
      'reason',trim(p_reason),'doctor_id',target_doctor));
  return true;
end;
$$;

create or replace function public.get_admin_activity(
  p_limit integer default 30,p_offset integer default 0
)
returns table(
  audit_id uuid,actor_id uuid,actor_name text,action text,
  target_user_id uuid,target_type text,target_id text,metadata jsonb,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path=public
as $$
begin
  if not public.is_admin_or_above() then raise exception 'Admin access required'; end if;
  return query
  select l.id,l.actor_id,actor.full_name,l.action,l.target_user_id,
    l.target_type,l.target_id,l.metadata,l.created_at
  from public.admin_audit_logs l
  left join public.profiles actor on actor.id=l.actor_id
  where public.is_super_admin() or l.actor_id=auth.uid()
  order by l.created_at desc,l.id
  limit greatest(1,least(p_limit,100)) offset greatest(p_offset,0);
end;
$$;

revoke all on function public.get_admin_operational_summary() from public,anon;
grant execute on function public.get_admin_operational_summary() to authenticated,service_role;
revoke all on function public.get_admin_user_directory(text,text,text,integer,integer) from public,anon;
grant execute on function public.get_admin_user_directory(text,text,text,integer,integer) to authenticated,service_role;
revoke all on function public.admin_set_user_account_status(uuid,text,text) from public,anon;
grant execute on function public.admin_set_user_account_status(uuid,text,text) to authenticated,service_role;
revoke all on function public.get_admin_appointment_directory(text,text,date,date,integer,integer) from public,anon;
grant execute on function public.get_admin_appointment_directory(text,text,date,date,integer,integer) to authenticated,service_role;
revoke all on function public.admin_override_appointment_status(uuid,text,text) from public,anon;
grant execute on function public.admin_override_appointment_status(uuid,text,text) to authenticated,service_role;
revoke all on function public.get_admin_activity(integer,integer) from public,anon;
grant execute on function public.get_admin_activity(integer,integer) to authenticated,service_role;

do $assert$
begin
  if has_function_privilege('anon','public.get_admin_operational_summary()','EXECUTE')
     or has_function_privilege('anon','public.get_admin_user_directory(text,text,text,integer,integer)','EXECUTE')
     or has_function_privilege('anon','public.admin_set_user_account_status(uuid,text,text)','EXECUTE') then
    raise exception 'Step 19 failed: anonymous Admin RPC access remains';
  end if;
  if not has_function_privilege('authenticated','public.get_admin_operational_summary()','EXECUTE')
     or not has_function_privilege('authenticated','public.admin_override_appointment_status(uuid,text,text)','EXECUTE') then
    raise exception 'Step 19 failed: authenticated Admin RPC grant missing';
  end if;
  if has_table_privilege('authenticated','public.profiles','UPDATE')
     or has_table_privilege('authenticated','public.appointments','UPDATE') then
    raise exception 'Step 19 failed: direct Admin mutation grant remains';
  end if;
end;
$assert$;

select 'STEP 19 ADMIN OPERATIONS SECURITY PASSED' as result;
