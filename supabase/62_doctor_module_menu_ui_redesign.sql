-- STEP 62 — DOCTOR MODULE MENU + UI REDESIGN SUPPORT
-- Additive migration. Existing migrations remain unchanged.
-- Adds explicit doctor verification submission state plus Doctor↔Admin support
-- chat and feedback/bug-report persistence. Existing canonical doctor/profile,
-- appointment, prescription, provider-link and public-content tables are reused.

begin;

-- ============================================================
-- 1) Verification draft/submitted state
-- ============================================================
alter table public.doctors
  add column if not exists verification_submitted_at timestamptz;

-- Preserve existing real applications: a pending doctor who already has evidence
-- is treated as submitted. Pending doctors without evidence remain editable drafts.
update public.doctors d
set verification_submitted_at = coalesce(
  d.verification_submitted_at,
  (select max(x.created_at) from public.entity_verification_documents x
   where x.entity_type='doctor' and x.entity_id=d.id),
  d.updated_at
)
where d.verification_status='pending'
  and d.verification_submitted_at is null
  and exists(
    select 1 from public.entity_verification_documents x
    where x.entity_type='doctor' and x.entity_id=d.id
  );

-- Verification identity remains immutable to the Doctor while an application is
-- submitted/pending or approved. Non-verification profile fields remain editable.
create or replace function public.guard_doctor_verification_locked_identity()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  -- Legacy profile/Visiting Card RPCs used to auto-reset changed credentials to
  -- pending. After a rejection, preserve the rejected draft until the Doctor
  -- explicitly presses Re-Apply; otherwise an edit could silently re-submit.
  if auth.uid()=old.id
     and old.verification_status='rejected'
     and (
       new.medical_college is distinct from old.medical_college
       or new.medical_session is distinct from old.medical_session
       or new.medical_batch is distinct from old.medical_batch
       or new.bmdc_registration_no is distinct from old.bmdc_registration_no
       or new.degree is distinct from old.degree
       or new.designation is distinct from old.designation
     ) then
    new.verification_status := 'rejected';
    new.bmdc_verified := false;
  end if;

  if auth.uid()=old.id
     and (old.verification_status='approved' or (old.verification_status='pending' and old.verification_submitted_at is not null))
     and (
       new.medical_college is distinct from old.medical_college
       or new.medical_session is distinct from old.medical_session
       or new.medical_batch is distinct from old.medical_batch
       or new.bmdc_registration_no is distinct from old.bmdc_registration_no
       or new.degree is distinct from old.degree
       or new.designation is distinct from old.designation
     ) then
    raise exception 'Verification identity is locked while pending or approved';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_doctor_verification_locked_identity on public.doctors;
create trigger guard_doctor_verification_locked_identity
before update on public.doctors
for each row execute function public.guard_doctor_verification_locked_identity();

create or replace function public.can_write_entity_verification(
  p_entity_type text,p_entity_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select public.is_entity_verification_owner(p_entity_type,p_entity_id)
    and case p_entity_type
      when 'doctor' then exists(
        select 1 from public.doctors d where d.id=p_entity_id
          and (
            d.verification_status='rejected'
            or (d.verification_status='pending' and d.verification_submitted_at is null)
          )
      )
      when 'provider' then exists(
        select 1 from public.providers p where p.id=p_entity_id
          and p.status in ('pending','rejected')
      )
      else false
    end;
$$;

create or replace function public.get_my_doctor_verification_profile()
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare result jsonb;
begin
  if not exists(
    select 1 from public.profiles
    where id=auth.uid() and role='doctor' and account_status='active'
  ) then
    raise exception 'Active Doctor account required';
  end if;

  select jsonb_build_object(
    'doctor_id',d.id,
    'medical_college',d.medical_college,
    'medical_session',d.medical_session,
    'medical_batch',d.medical_batch,
    'bmdc_registration_no',d.bmdc_registration_no,
    'degree',d.degree,
    'verification_status',d.verification_status::text,
    'verification_note',d.verification_note,
    'bmdc_verified',d.bmdc_verified,
    'verified_at',d.verified_at,
    'verification_submitted_at',d.verification_submitted_at
  ) into result
  from public.doctors d
  where d.id=auth.uid();

  if result is null then raise exception 'Doctor profile not found'; end if;
  return result;
end;
$$;

create or replace function public.update_my_doctor_verification_info(
  p_medical_college text,
  p_medical_session text,
  p_medical_batch text
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  old_row public.doctors%rowtype;
  changed boolean;
  next_status text;
begin
  if not exists(
    select 1 from public.profiles
    where id=auth.uid() and role='doctor' and account_status='active'
  ) then
    raise exception 'Active Doctor account required';
  end if;

  select * into old_row from public.doctors where id=auth.uid() for update;
  if old_row.id is null then raise exception 'Doctor profile not found'; end if;

  if old_row.verification_status='approved'
     or (old_row.verification_status='pending' and old_row.verification_submitted_at is not null) then
    raise exception 'Verification application is locked while pending or approved';
  end if;

  if length(trim(coalesce(p_medical_college,'')))<2 then raise exception 'Medical College Name is required'; end if;
  if length(trim(coalesce(p_medical_session,'')))<1 then raise exception 'Session is required'; end if;
  if length(trim(coalesce(p_medical_batch,'')))<1 then raise exception 'Batch is required'; end if;

  changed :=
    old_row.medical_college is distinct from nullif(trim(p_medical_college),'')
    or old_row.medical_session is distinct from nullif(trim(p_medical_session),'')
    or old_row.medical_batch is distinct from nullif(trim(p_medical_batch),'');

  update public.doctors
  set medical_college=nullif(trim(p_medical_college),''),
      medical_session=nullif(trim(p_medical_session),''),
      medical_batch=nullif(trim(p_medical_batch),''),
      updated_at=now()
  where id=auth.uid();

  select verification_status::text into next_status from public.doctors where id=auth.uid();
  return jsonb_build_object(
    'verification_status',next_status,
    'verification_reset',false,
    'information_changed',changed
  );
end;
$$;

-- Upload/delete remains possible only during a draft or after rejection.
-- Unlike the old behavior, uploading evidence does not auto-submit the doctor.
create or replace function public.add_my_entity_verification_document(
  p_entity_type text,p_entity_id uuid,p_document_type text,p_storage_path text
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare result_id uuid; expected_folder text;
begin
  if p_entity_type not in ('doctor','provider') then raise exception 'Invalid entity type'; end if;
  if p_document_type not in ('bmdc_certificate','medical_degree','national_id','trade_license','organization_document','facility_photo','other') then
    raise exception 'Invalid document type';
  end if;
  expected_folder:=case when p_entity_type='doctor' then 'doctors/' else 'providers/' end;
  if p_storage_path not like expected_folder||p_entity_id::text||'/%' then raise exception 'Invalid document storage path'; end if;
  if not public.can_write_entity_verification(p_entity_type,p_entity_id) then
    raise exception 'Evidence is locked while verification is pending or approved';
  end if;

  insert into public.entity_verification_documents(entity_type,entity_id,document_type,storage_path,uploaded_by)
  values(p_entity_type,p_entity_id,p_document_type,p_storage_path,auth.uid())
  returning id into result_id;

  if p_entity_type='provider' then
    update public.providers set status='pending',verified=false,
      verification_note=null,verified_by=null,verified_at=null,updated_at=now()
    where id=p_entity_id;
  end if;
  return result_id;
end;
$$;

create or replace function public.submit_my_doctor_verification_application()
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare d public.doctors%rowtype; evidence_count integer;
begin
  if not exists(
    select 1 from public.profiles
    where id=auth.uid() and role='doctor' and account_status='active'
  ) then raise exception 'Active Doctor account required'; end if;

  select * into d from public.doctors where id=auth.uid() for update;
  if d.id is null then raise exception 'Doctor profile not found'; end if;
  if d.verification_status='approved' then raise exception 'Approved verification is locked'; end if;
  if d.verification_status='pending' and d.verification_submitted_at is not null then
    raise exception 'Verification application is already pending review';
  end if;
  if length(trim(coalesce(d.medical_college,'')))<2
     or length(trim(coalesce(d.medical_session,'')))<1
     or length(trim(coalesce(d.medical_batch,'')))<1 then
    raise exception 'Complete Medical College, Session and Batch before applying';
  end if;
  select count(*) into evidence_count from public.entity_verification_documents x
  where x.entity_type='doctor' and x.entity_id=auth.uid();
  if evidence_count<1 then raise exception 'Upload at least one verification document before applying'; end if;

  update public.doctors
  set verification_status='pending', bmdc_verified=false,
      verification_note=null, verified_by=null, verified_at=null,
      verification_submitted_at=now(), updated_at=now()
  where id=auth.uid();

  insert into public.notifications(recipient_id,sender_id,type,title_bn,body_bn,data)
  select p.id,auth.uid(),'verification_submitted','নতুন ডাক্তার ভেরিফিকেশন আবেদন',
    'একটি Doctor verification application review-এর জন্য জমা হয়েছে।',
    jsonb_build_object('entity_type','doctor','entity_id',auth.uid())
  from public.profiles p where p.role in ('verification_officer','admin','super_admin') and p.account_status='active';

  return jsonb_build_object('status','pending','submitted_at',(select verification_submitted_at from public.doctors where id=auth.uid()));
end;
$$;

-- Draft pending doctors must not appear in the staff queue until Apply is pressed.
create or replace function public.get_verification_review_queue(
  p_entity_type text default null,p_status text default 'pending',
  p_limit integer default 50,p_offset integer default 0
)
returns table(
  entity_type text,entity_id uuid,display_name text,subtitle text,
  district_id bigint,upazila_id bigint,status text,evidence_count bigint,
  submitted_at timestamptz
)
language plpgsql
stable
security definer
set search_path=public
as $$
begin
  if not public.is_verification_staff() then raise exception 'Verification staff access required'; end if;
  if p_entity_type is not null and p_entity_type not in ('doctor','provider','ambulance') then raise exception 'Invalid entity type'; end if;
  if p_status is not null and p_status not in ('pending','approved','rejected','suspended','expired') then raise exception 'Invalid status'; end if;
  return query
  select q.entity_type,q.entity_id,q.display_name,q.subtitle,q.district_id,q.upazila_id,q.status,q.evidence_count,q.submitted_at
  from (
    select 'doctor'::text entity_type,d.id entity_id,p.full_name display_name,
      coalesce(d.bmdc_registration_no,d.degree,d.designation) subtitle,
      p.district_id,p.upazila_id,d.verification_status::text status,
      (select count(*) from public.entity_verification_documents x where x.entity_type='doctor' and x.entity_id=d.id) evidence_count,
      coalesce(d.verification_submitted_at,d.updated_at) submitted_at
    from public.doctors d join public.profiles p on p.id=d.id
    where p.account_status='active'
      and (d.verification_status<>'pending' or d.verification_submitted_at is not null)
    union all
    select 'provider',pr.id,pr.name_bn,pr.provider_type,pr.district_id,pr.upazila_id,
      pr.status::text,(select count(*) from public.entity_verification_documents x where x.entity_type='provider' and x.entity_id=pr.id),pr.updated_at
    from public.providers pr join public.profiles owner on owner.id=pr.owner_user_id where owner.account_status='active'
    union all
    select 'ambulance',a.id,a.operator_name,a.vehicle_registration_no,a.district_id,a.upazila_id,a.status::text,
      (select count(*) from public.ambulance_verification_documents x where x.ambulance_id=a.id),a.updated_at
    from public.ambulance_services a join public.profiles owner on owner.id=a.owner_user_id where owner.account_status='active'
  ) q
  where (p_entity_type is null or q.entity_type=p_entity_type)
    and (p_status is null or q.status=p_status)
  order by q.submitted_at,q.entity_type,q.entity_id
  limit greatest(1,least(p_limit,100)) offset greatest(p_offset,0);
end;
$$;


-- Keep staff badges/counters aligned with the explicit Apply action.
create or replace function public.get_my_pending_verification_count()
returns integer
language plpgsql
stable
security definer
set search_path=public
as $$
declare result integer;
begin
  if not public.is_verification_staff() then raise exception 'Verification staff access required'; end if;
  select count(*)::integer into result from (
    select d.id from public.doctors d join public.profiles p on p.id=d.id and p.account_status='active'
      where d.verification_status='pending' and d.verification_submitted_at is not null
    union all
    select pr.id from public.providers pr join public.profiles p on p.id=pr.owner_user_id and p.account_status='active' where pr.status='pending'
    union all
    select a.id from public.ambulance_services a join public.profiles p on p.id=a.owner_user_id and p.account_status='active' where a.status='pending'
  ) x;
  return coalesce(result,0);
end;
$$;

create or replace function public.get_admin_operational_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
begin
  if not public.is_admin_or_above() then raise exception 'Admin access required'; end if;
  return jsonb_build_object(
    'total_users',(select count(*) from public.profiles),
    'active_users',(select count(*) from public.profiles where account_status='active'),
    'suspended_users',(select count(*) from public.profiles where account_status='suspended'),
    'banned_users',(select count(*) from public.profiles where account_status='banned'),
    'doctors',(select count(*) from public.doctors),
    'providers',(select count(*) from public.providers),
    'ambulances',(select count(*) from public.ambulance_services),
    'patients',(select count(*) from public.profiles where role::text='patient'),
    'hospitals',(select count(*) from public.providers where provider_type='hospital'),
    'premium_members',(select count(*) from public.premium_memberships where status='active' and (expires_at is null or expires_at>now())),
    'verified_doctors',(select count(*) from public.doctors where verification_status='approved'),
    'total_appointments',(select count(*) from public.appointments),
    'total_prescriptions',(select count(*) from public.doctor_prescriptions),
    'total_reviews',(select count(*) from public.doctor_reviews)+(select count(*) from public.provider_reviews),
    'pending_doctors',(select count(*) from public.doctors where verification_status='pending' and verification_submitted_at is not null),
    'pending_providers',(select count(*) from public.providers where status='pending'),
    'pending_ambulances',(select count(*) from public.ambulance_services where status='pending'),
    'pending_verifications',
      (select count(*) from public.doctors where verification_status='pending' and verification_submitted_at is not null)+
      (select count(*) from public.providers where status='pending')+
      (select count(*) from public.ambulance_services where status='pending'),
    'pending_doctor_verifications',(select count(*) from public.doctors where verification_status='pending' and verification_submitted_at is not null),
    'pending_hospital_verifications',(select count(*) from public.providers where provider_type='hospital' and status='pending'),
    'pending_premium_memberships',(select count(*) from public.premium_memberships where status='pending'),
    'premium_requests',(select count(*) from public.premium_memberships where status='pending'),
    'expiring_premium_memberships',(select count(*) from public.premium_memberships where status='active' and expires_at is not null and expires_at>now() and expires_at<=now()+interval '30 days'),
    'flagged_reviews_supported',false,
    'flagged_reviews',0,
    'appointments_today',(select count(*) from public.appointments where appointment_date=current_date),
    'pending_appointments',(select count(*) from public.appointments where status='pending'),
    'appointments_last_30_days',(select count(*) from public.appointments where created_at>=now()-interval '30 days'),
    'failed_push_deliveries',(select count(*) from public.web_push_outbox where status='failed'),
    'role_counts',coalesce((select jsonb_object_agg(role::text,total) from (select role,count(*)::bigint total from public.profiles group by role) role_totals),'{}'::jsonb)
  );
end;
$$;

revoke all on function public.get_my_pending_verification_count() from public,anon;
grant execute on function public.get_my_pending_verification_count() to authenticated,service_role;
revoke all on function public.get_admin_operational_summary() from public,anon;
grant execute on function public.get_admin_operational_summary() to authenticated,service_role;

revoke all on function public.submit_my_doctor_verification_application() from public,anon;
grant execute on function public.submit_my_doctor_verification_application() to authenticated,service_role;
revoke all on function public.get_my_doctor_verification_profile() from public,anon;
grant execute on function public.get_my_doctor_verification_profile() to authenticated,service_role;
revoke all on function public.update_my_doctor_verification_info(text,text,text) from public,anon;
grant execute on function public.update_my_doctor_verification_info(text,text,text) to authenticated,service_role;

-- ============================================================
-- 2) Doctor private profile details (reuse existing profiles columns)
-- ============================================================
create or replace function public.get_my_doctor_private_profile()
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare result jsonb;
begin
  if not exists(select 1 from public.profiles where id=auth.uid() and role='doctor' and account_status='active') then
    raise exception 'Active Doctor account required';
  end if;
  select jsonb_build_object(
    'date_of_birth',p.date_of_birth,
    'gender',p.gender,
    'blood_group',p.blood_group,
    'address_line',p.address_line
  ) into result
  from public.profiles p where p.id=auth.uid();
  return coalesce(result,'{}'::jsonb);
end;
$$;

create or replace function public.update_my_doctor_private_profile(
  p_date_of_birth date default null,
  p_gender text default null,
  p_blood_group text default null,
  p_address_line text default null
)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
begin
  if not exists(select 1 from public.profiles where id=auth.uid() and role='doctor' and account_status='active') then
    raise exception 'Active Doctor account required';
  end if;
  if p_gender is not null and p_gender not in ('male','female','other') then raise exception 'Invalid gender'; end if;
  if p_blood_group is not null and upper(p_blood_group) not in ('A+','A-','B+','B-','AB+','AB-','O+','O-') then raise exception 'Invalid blood group'; end if;
  if p_date_of_birth is not null and p_date_of_birth>current_date then raise exception 'Date of birth cannot be in the future'; end if;
  if p_address_line is not null and char_length(trim(p_address_line))>500 then raise exception 'Address must be 500 characters or fewer'; end if;

  update public.profiles
  set date_of_birth=p_date_of_birth,
      gender=nullif(trim(coalesce(p_gender,'')),''),
      blood_group=nullif(upper(trim(coalesce(p_blood_group,''))),''),
      address_line=nullif(trim(coalesce(p_address_line,'')),''),
      updated_at=now()
  where id=auth.uid();
  return found;
end;
$$;

revoke all on function public.get_my_doctor_private_profile() from public,anon;
grant execute on function public.get_my_doctor_private_profile() to authenticated,service_role;
revoke all on function public.update_my_doctor_private_profile(date,text,text,text) from public,anon;
grant execute on function public.update_my_doctor_private_profile(date,text,text,text) to authenticated,service_role;

-- ============================================================
-- 3) Doctor ↔ Admin support chat
-- ============================================================
create table if not exists public.doctor_support_threads (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null unique references public.profiles(id) on delete cascade,
  subject text not null default 'Doctor support',
  status text not null default 'open' check(status in ('open','closed')),
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.doctor_support_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.doctor_support_threads(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  message text not null check(char_length(message) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index if not exists idx_doctor_support_threads_last on public.doctor_support_threads(status,last_message_at desc);
create index if not exists idx_doctor_support_messages_thread on public.doctor_support_messages(thread_id,created_at);

drop trigger if exists set_doctor_support_threads_updated_at on public.doctor_support_threads;
create trigger set_doctor_support_threads_updated_at before update on public.doctor_support_threads
for each row execute function public.set_updated_at();

alter table public.doctor_support_threads enable row level security;
alter table public.doctor_support_messages enable row level security;
revoke all on table public.doctor_support_threads,public.doctor_support_messages from public,anon,authenticated;
grant all on table public.doctor_support_threads,public.doctor_support_messages to service_role;

create or replace function public.get_my_doctor_support_chat()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare tid uuid; result jsonb;
begin
  if not exists(select 1 from public.profiles where id=auth.uid() and role='doctor' and account_status='active') then
    raise exception 'Active Doctor account required';
  end if;
  select id into tid from public.doctor_support_threads where doctor_id=auth.uid();
  if tid is null then return jsonb_build_object('thread',null,'messages','[]'::jsonb); end if;
  select jsonb_build_object(
    'thread',jsonb_build_object('id',t.id,'subject',t.subject,'status',t.status,'last_message_at',t.last_message_at),
    'messages',coalesce((select jsonb_agg(jsonb_build_object(
      'id',m.id,'sender_id',m.sender_id,'sender_role',p.role::text,'sender_name',p.full_name,
      'message',m.message,'created_at',m.created_at
    ) order by m.created_at) from public.doctor_support_messages m join public.profiles p on p.id=m.sender_id where m.thread_id=t.id),'[]'::jsonb)
  ) into result from public.doctor_support_threads t where t.id=tid;
  return result;
end; $$;

create or replace function public.send_my_doctor_support_message(p_message text)
returns uuid language plpgsql security definer set search_path=public as $$
declare tid uuid; mid uuid; clean text:=trim(coalesce(p_message,''));
begin
  if not exists(select 1 from public.profiles where id=auth.uid() and role='doctor' and account_status='active') then raise exception 'Active Doctor account required'; end if;
  if char_length(clean)<1 or char_length(clean)>4000 then raise exception 'Message must be 1–4000 characters'; end if;
  insert into public.doctor_support_threads(doctor_id,status,last_message_at)
  values(auth.uid(),'open',now())
  on conflict(doctor_id) do update set status='open',last_message_at=now(),updated_at=now()
  returning id into tid;
  insert into public.doctor_support_messages(thread_id,sender_id,message) values(tid,auth.uid(),clean) returning id into mid;
  update public.doctor_support_threads set last_message_at=now(),updated_at=now() where id=tid;
  return mid;
end; $$;

create or replace function public.admin_get_doctor_support_threads(p_limit integer default 50,p_offset integer default 0)
returns table(thread_id uuid,doctor_id uuid,doctor_name text,doctor_phone text,doctor_email text,subject text,status text,last_message_at timestamptz,message_count bigint)
language plpgsql stable security definer set search_path=public as $$
begin
  if not public.is_admin_or_above() then raise exception 'Admin access required'; end if;
  return query select t.id,t.doctor_id,p.full_name,p.phone,p.email,t.subject,t.status,t.last_message_at,
    (select count(*) from public.doctor_support_messages m where m.thread_id=t.id)
  from public.doctor_support_threads t join public.profiles p on p.id=t.doctor_id
  order by t.last_message_at desc limit greatest(1,least(p_limit,100)) offset greatest(p_offset,0);
end; $$;

create or replace function public.admin_get_doctor_support_chat(p_thread_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare result jsonb;
begin
  if not public.is_admin_or_above() then raise exception 'Admin access required'; end if;
  select jsonb_build_object(
    'thread',jsonb_build_object('id',t.id,'doctor_id',t.doctor_id,'doctor_name',d.full_name,'subject',t.subject,'status',t.status,'last_message_at',t.last_message_at),
    'messages',coalesce((select jsonb_agg(jsonb_build_object(
      'id',m.id,'sender_id',m.sender_id,'sender_role',p.role::text,'sender_name',p.full_name,'message',m.message,'created_at',m.created_at
    ) order by m.created_at) from public.doctor_support_messages m join public.profiles p on p.id=m.sender_id where m.thread_id=t.id),'[]'::jsonb)
  ) into result from public.doctor_support_threads t join public.profiles d on d.id=t.doctor_id where t.id=p_thread_id;
  if result is null then raise exception 'Support thread not found'; end if;
  return result;
end; $$;

create or replace function public.admin_send_doctor_support_message(p_thread_id uuid,p_message text)
returns uuid language plpgsql security definer set search_path=public as $$
declare mid uuid; clean text:=trim(coalesce(p_message,'')); doctor_uid uuid;
begin
  if not public.is_admin_or_above() then raise exception 'Admin access required'; end if;
  if char_length(clean)<1 or char_length(clean)>4000 then raise exception 'Message must be 1–4000 characters'; end if;
  select doctor_id into doctor_uid from public.doctor_support_threads where id=p_thread_id;
  if doctor_uid is null then raise exception 'Support thread not found'; end if;
  insert into public.doctor_support_messages(thread_id,sender_id,message) values(p_thread_id,auth.uid(),clean) returning id into mid;
  update public.doctor_support_threads set status='open',last_message_at=now(),updated_at=now() where id=p_thread_id;
  insert into public.notifications(recipient_id,sender_id,type,title_bn,body_bn,data)
  values(doctor_uid,auth.uid(),'support_reply','Support reply','Admin আপনার support message-এর উত্তর দিয়েছেন।',jsonb_build_object('thread_id',p_thread_id));
  return mid;
end; $$;

create or replace function public.admin_set_doctor_support_status(p_thread_id uuid,p_status text)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  if not public.is_admin_or_above() then raise exception 'Admin access required'; end if;
  if p_status not in ('open','closed') then raise exception 'Invalid support status'; end if;
  update public.doctor_support_threads set status=p_status,updated_at=now() where id=p_thread_id;
  if not found then raise exception 'Support thread not found'; end if;
  return true;
end; $$;

-- ============================================================
-- 4) Feedback / Bug Report
-- ============================================================
create table if not exists public.doctor_feedback_reports (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.profiles(id) on delete cascade,
  report_type text not null check(report_type in ('feedback','bug')),
  subject text not null check(char_length(subject) between 2 and 160),
  message text not null check(char_length(message) between 2 and 5000),
  status text not null default 'open' check(status in ('open','reviewed','resolved')),
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_doctor_feedback_reports_status on public.doctor_feedback_reports(status,created_at desc);
drop trigger if exists set_doctor_feedback_reports_updated_at on public.doctor_feedback_reports;
create trigger set_doctor_feedback_reports_updated_at before update on public.doctor_feedback_reports
for each row execute function public.set_updated_at();
alter table public.doctor_feedback_reports enable row level security;
revoke all on table public.doctor_feedback_reports from public,anon,authenticated;
grant all on table public.doctor_feedback_reports to service_role;

create or replace function public.submit_my_doctor_feedback(p_report_type text,p_subject text,p_message text)
returns uuid language plpgsql security definer set search_path=public as $$
declare rid uuid;
begin
  if not exists(select 1 from public.profiles where id=auth.uid() and role='doctor' and account_status='active') then raise exception 'Active Doctor account required'; end if;
  if p_report_type not in ('feedback','bug') then raise exception 'Invalid report type'; end if;
  if char_length(trim(coalesce(p_subject,'')))<2 then raise exception 'Subject is required'; end if;
  if char_length(trim(coalesce(p_message,'')))<2 then raise exception 'Message is required'; end if;
  insert into public.doctor_feedback_reports(doctor_id,report_type,subject,message)
  values(auth.uid(),p_report_type,trim(p_subject),trim(p_message)) returning id into rid;
  return rid;
end; $$;

create or replace function public.get_my_doctor_feedback()
returns table(id uuid,report_type text,subject text,message text,status text,admin_note text,created_at timestamptz,updated_at timestamptz)
language plpgsql stable security definer set search_path=public as $$
begin
  if not exists(select 1 from public.profiles where id=auth.uid() and role='doctor' and account_status='active') then raise exception 'Active Doctor account required'; end if;
  return query select r.id,r.report_type,r.subject,r.message,r.status,r.admin_note,r.created_at,r.updated_at
  from public.doctor_feedback_reports r where r.doctor_id=auth.uid() order by r.created_at desc limit 50;
end; $$;

create or replace function public.admin_get_doctor_feedback(p_limit integer default 100,p_offset integer default 0)
returns table(id uuid,doctor_id uuid,doctor_name text,report_type text,subject text,message text,status text,admin_note text,created_at timestamptz,updated_at timestamptz)
language plpgsql stable security definer set search_path=public as $$
begin
  if not public.is_admin_or_above() then raise exception 'Admin access required'; end if;
  return query select r.id,r.doctor_id,p.full_name,r.report_type,r.subject,r.message,r.status,r.admin_note,r.created_at,r.updated_at
  from public.doctor_feedback_reports r join public.profiles p on p.id=r.doctor_id
  order by r.created_at desc limit greatest(1,least(p_limit,200)) offset greatest(p_offset,0);
end; $$;

create or replace function public.admin_update_doctor_feedback(p_id uuid,p_status text,p_admin_note text default null)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  if not public.is_admin_or_above() then raise exception 'Admin access required'; end if;
  if p_status not in ('open','reviewed','resolved') then raise exception 'Invalid feedback status'; end if;
  update public.doctor_feedback_reports set status=p_status,admin_note=nullif(trim(coalesce(p_admin_note,'')),''),updated_at=now() where id=p_id;
  if not found then raise exception 'Feedback report not found'; end if;
  return true;
end; $$;

revoke all on function public.get_my_doctor_support_chat() from public,anon;
revoke all on function public.send_my_doctor_support_message(text) from public,anon;
revoke all on function public.admin_get_doctor_support_threads(integer,integer) from public,anon;
revoke all on function public.admin_get_doctor_support_chat(uuid) from public,anon;
revoke all on function public.admin_send_doctor_support_message(uuid,text) from public,anon;
revoke all on function public.admin_set_doctor_support_status(uuid,text) from public,anon;
revoke all on function public.submit_my_doctor_feedback(text,text,text) from public,anon;
revoke all on function public.get_my_doctor_feedback() from public,anon;
revoke all on function public.admin_get_doctor_feedback(integer,integer) from public,anon;
revoke all on function public.admin_update_doctor_feedback(uuid,text,text) from public,anon;

grant execute on function public.get_my_doctor_support_chat() to authenticated,service_role;
grant execute on function public.send_my_doctor_support_message(text) to authenticated,service_role;
grant execute on function public.admin_get_doctor_support_threads(integer,integer) to authenticated,service_role;
grant execute on function public.admin_get_doctor_support_chat(uuid) to authenticated,service_role;
grant execute on function public.admin_send_doctor_support_message(uuid,text) to authenticated,service_role;
grant execute on function public.admin_set_doctor_support_status(uuid,text) to authenticated,service_role;
grant execute on function public.submit_my_doctor_feedback(text,text,text) to authenticated,service_role;
grant execute on function public.get_my_doctor_feedback() to authenticated,service_role;
grant execute on function public.admin_get_doctor_feedback(integer,integer) to authenticated,service_role;
grant execute on function public.admin_update_doctor_feedback(uuid,text,text) to authenticated,service_role;

commit;
