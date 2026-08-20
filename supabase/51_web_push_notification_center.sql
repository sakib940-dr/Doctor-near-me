-- ============================================================
-- STEP 51 — WEB PUSH + NOTIFICATION CENTER
-- Depends on STEP 50.
-- Reuses public.notifications as the single canonical in-app record.
-- Push delivery is downstream through an outbox; no duplicate notification table.
-- ============================================================

-- -----------------------------------------------------------------------------
-- 1) Canonical notification hardening + idempotency.
-- -----------------------------------------------------------------------------
alter table public.notifications add column if not exists dedupe_key text;
create unique index if not exists ux_notifications_recipient_dedupe
  on public.notifications(recipient_id,dedupe_key)
  where dedupe_key is not null;

-- Users may only see/update their own rows. Admin operational access should use
-- purpose-built RPCs rather than bypassing a user's notification privacy.
drop policy if exists "notifications_recipient_select" on public.notifications;
create policy "notifications_recipient_select" on public.notifications for select
using (recipient_id=auth.uid());

drop policy if exists "notifications_recipient_update" on public.notifications;
create policy "notifications_recipient_update" on public.notifications for update
using (recipient_id=auth.uid())
with check (recipient_id=auth.uid());

create or replace function public.get_my_notifications(
  p_unread_only boolean default false,
  p_limit integer default 30,
  p_offset integer default 0
)
returns table(
  notification_id uuid,
  type text,
  title_bn text,
  body_bn text,
  data jsonb,
  is_read boolean,
  created_at timestamptz
)
language sql
stable
security definer
set search_path=public
as $$
  select n.id,n.type,n.title_bn,n.body_bn,n.data,
         (n.read_at is not null),n.created_at
  from public.notifications n
  where auth.uid() is not null
    and n.recipient_id=auth.uid()
    and (not p_unread_only or n.read_at is null)
  order by n.created_at desc
  limit greatest(1,least(coalesce(p_limit,30),100))
  offset greatest(coalesce(p_offset,0),0);
$$;

create or replace function public.get_my_notification_unread_count()
returns integer
language sql
stable
security definer
set search_path=public
as $$
  select case when auth.uid() is null then 0 else (
    select count(*)::integer from public.notifications
    where recipient_id=auth.uid() and read_at is null
  ) end;
$$;

create or replace function public.mark_notification_read(p_notification_id uuid)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  update public.notifications
  set read_at=coalesce(read_at,now())
  where id=p_notification_id and recipient_id=auth.uid();
  return found;
end;
$$;

create or replace function public.mark_all_notifications_read()
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare affected integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  update public.notifications
  set read_at=coalesce(read_at,now())
  where recipient_id=auth.uid() and read_at is null;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

-- Direct client table access is unnecessary; all client reads/mutations use RPCs.
revoke all on table public.notifications from anon,authenticated;
revoke all on function public.get_my_notifications(boolean,integer,integer) from public,anon;
grant execute on function public.get_my_notifications(boolean,integer,integer) to authenticated,service_role;
revoke all on function public.get_my_notification_unread_count() from public,anon;
grant execute on function public.get_my_notification_unread_count() to authenticated,service_role;
revoke all on function public.mark_notification_read(uuid) from public,anon;
grant execute on function public.mark_notification_read(uuid) to authenticated,service_role;
revoke all on function public.mark_all_notifications_read() from public,anon;
grant execute on function public.mark_all_notifications_read() to authenticated,service_role;

-- -----------------------------------------------------------------------------
-- 2) Browser push subscriptions. Private VAPID material never lives here/client.
-- -----------------------------------------------------------------------------
create table if not exists public.web_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  expiration_time bigint,
  user_agent text,
  device_label text,
  is_active boolean not null default true,
  failure_count integer not null default 0 check (failure_count>=0),
  last_seen_at timestamptz not null default now(),
  last_success_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_web_push_subscriptions_user
  on public.web_push_subscriptions(user_id,is_active,last_seen_at desc);

alter table public.web_push_subscriptions enable row level security;
drop policy if exists "web_push_own_select" on public.web_push_subscriptions;
create policy "web_push_own_select" on public.web_push_subscriptions for select
using (user_id=auth.uid());
drop policy if exists "web_push_own_delete" on public.web_push_subscriptions;
create policy "web_push_own_delete" on public.web_push_subscriptions for delete
using (user_id=auth.uid());

create or replace function public.upsert_my_web_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_expiration_time bigint default null,
  p_user_agent text default null,
  p_device_label text default null
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare result_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if nullif(trim(coalesce(p_endpoint,'')),'') is null then raise exception 'Push endpoint is required'; end if;
  if nullif(trim(coalesce(p_p256dh,'')),'') is null or nullif(trim(coalesce(p_auth,'')),'') is null then
    raise exception 'Push subscription keys are required';
  end if;

  insert into public.web_push_subscriptions(
    user_id,endpoint,p256dh,auth,expiration_time,user_agent,device_label,
    is_active,failure_count,last_seen_at,last_error,updated_at
  ) values(
    auth.uid(),trim(p_endpoint),trim(p_p256dh),trim(p_auth),p_expiration_time,
    left(p_user_agent,1000),left(p_device_label,160),true,0,now(),null,now()
  )
  on conflict(endpoint) do update set
    user_id=auth.uid(),p256dh=excluded.p256dh,auth=excluded.auth,
    expiration_time=excluded.expiration_time,user_agent=excluded.user_agent,
    device_label=excluded.device_label,is_active=true,failure_count=0,
    last_seen_at=now(),last_error=null,updated_at=now()
  returning id into result_id;

  return result_id;
end;
$$;

create or replace function public.remove_my_web_push_subscription(p_endpoint text)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  delete from public.web_push_subscriptions
  where endpoint=p_endpoint and user_id=auth.uid();
  return found;
end;
$$;

create or replace function public.deactivate_my_web_push_subscriptions()
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare affected integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  update public.web_push_subscriptions
  set is_active=false,updated_at=now()
  where user_id=auth.uid() and is_active;
  get diagnostics affected=row_count;
  return affected;
end;
$$;

revoke all on table public.web_push_subscriptions from anon,authenticated;
grant select,update,delete on table public.web_push_subscriptions to service_role;
revoke all on function public.upsert_my_web_push_subscription(text,text,text,bigint,text,text) from public,anon;
grant execute on function public.upsert_my_web_push_subscription(text,text,text,bigint,text,text) to authenticated,service_role;
revoke all on function public.remove_my_web_push_subscription(text) from public,anon;
grant execute on function public.remove_my_web_push_subscription(text) to authenticated,service_role;
revoke all on function public.deactivate_my_web_push_subscriptions() from public,anon;
grant execute on function public.deactivate_my_web_push_subscriptions() to authenticated,service_role;

-- -----------------------------------------------------------------------------
-- 3) Push outbox. One outbox row per canonical notification row.
-- -----------------------------------------------------------------------------
create table if not exists public.web_push_outbox (
  id bigint generated by default as identity primary key,
  notification_id uuid not null unique references public.notifications(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check(status in ('pending','processing','sent','no_subscription','failed')),
  attempt_count integer not null default 0 check(attempt_count>=0),
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  processed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_web_push_outbox_pending
  on public.web_push_outbox(status,next_attempt_at,created_at);

alter table public.web_push_outbox enable row level security;
revoke all on table public.web_push_outbox from anon,authenticated;
grant select,update on table public.web_push_outbox to service_role;
grant select on table public.notifications to service_role;

create or replace function public.enqueue_web_push_for_notification()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  insert into public.web_push_outbox(notification_id,recipient_id)
  values(new.id,new.recipient_id)
  on conflict(notification_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_notifications_enqueue_web_push on public.notifications;
create trigger trg_notifications_enqueue_web_push
after insert on public.notifications
for each row execute function public.enqueue_web_push_for_notification();

create or replace function public.claim_web_push_outbox(p_limit integer default 50)
returns table(outbox_id bigint,notification_id uuid,recipient_id uuid,attempt_count integer)
language plpgsql
security definer
set search_path=public
as $$
begin
  if auth.role()<>'service_role' then raise exception 'Service role required'; end if;

  -- Recover abandoned claims after a worker crash.
  update public.web_push_outbox
  set status='pending',locked_at=null,updated_at=now(),last_error=coalesce(last_error,'Worker claim timed out')
  where status='processing' and locked_at<now()-interval '10 minutes';

  return query
  with claimed as (
    select o.id
    from public.web_push_outbox o
    where o.status in ('pending','failed')
      and o.next_attempt_at<=now()
      and o.attempt_count<6
    order by o.created_at
    for update skip locked
    limit greatest(1,least(coalesce(p_limit,50),100))
  ), updated as (
    update public.web_push_outbox o
    set status='processing',attempt_count=o.attempt_count+1,locked_at=now(),updated_at=now()
    from claimed c
    where o.id=c.id
    returning o.id,o.notification_id,o.recipient_id,o.attempt_count
  )
  select u.id,u.notification_id,u.recipient_id,u.attempt_count from updated u;
end;
$$;

revoke all on function public.claim_web_push_outbox(integer) from public,anon,authenticated;
grant execute on function public.claim_web_push_outbox(integer) to service_role;

-- -----------------------------------------------------------------------------
-- 4) Appointment notifications: patient + doctor + provider owner, with safe links.
-- -----------------------------------------------------------------------------
create or replace function public.create_patient_appointment(
  p_doctor_id uuid,
  p_provider_id uuid default null,
  p_appointment_date date default null,
  p_start_time time default null,
  p_end_time time default null,
  p_patient_note text default null
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  new_id uuid;
  provider_owner uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists(
    select 1 from public.profiles
    where id=auth.uid() and role='patient' and account_status='active' and profile_completed
  ) then raise exception 'Complete an active patient profile before booking'; end if;

  if p_provider_id is null or p_appointment_date is null or p_start_time is null or p_end_time is null then
    raise exception 'Chamber, date, and visiting time are required';
  end if;
  if p_appointment_date<current_date or p_appointment_date>current_date+180 then
    raise exception 'Appointment date must be within the next 180 days';
  end if;
  if p_patient_note is not null and length(p_patient_note)>500 then raise exception 'Patient note must be 500 characters or fewer'; end if;

  if not exists(
    select 1
    from public.doctors d
    join public.profiles dp on dp.id=d.id
    join public.doctor_provider_links l on l.doctor_id=d.id and l.provider_id=p_provider_id
    join public.providers pr on pr.id=l.provider_id
    join public.chamber_schedules cs on cs.doctor_id=d.id and cs.provider_id=pr.id
    where d.id=p_doctor_id and d.verification_status='approved' and d.accepting_appointments
      and dp.account_status='active' and l.status='approved'
      and pr.status='approved' and pr.verified and cs.is_active
      and cs.day_of_week=extract(dow from p_appointment_date)::smallint
      and cs.start_time=p_start_time and cs.end_time=p_end_time
  ) then raise exception 'Selected doctor/chamber schedule is not available'; end if;

  if exists(
    select 1 from public.appointments a
    where a.patient_id=auth.uid() and a.doctor_id=p_doctor_id and a.provider_id=p_provider_id
      and a.appointment_date=p_appointment_date and a.start_time=p_start_time
      and a.status in ('pending','confirmed')
  ) then raise exception 'You already have an active request for this schedule'; end if;

  insert into public.appointments(
    patient_id,doctor_id,provider_id,appointment_date,start_time,end_time,patient_note,status
  ) values(
    auth.uid(),p_doctor_id,p_provider_id,p_appointment_date,p_start_time,p_end_time,nullif(trim(p_patient_note),''),'pending'
  ) returning id into new_id;

  insert into public.notifications(recipient_id,sender_id,type,title_bn,body_bn,data,dedupe_key)
  values(
    p_doctor_id,auth.uid(),'appointment_new','নতুন অ্যাপয়েন্টমেন্ট',
    coalesce((select full_name from public.profiles where id=auth.uid()),'একজন রোগী') || ' একটি অ্যাপয়েন্টমেন্টের অনুরোধ করেছেন।',
    jsonb_build_object('appointment_id',new_id,'deep_link','/doctor/appointments'),
    'appointment_new:doctor:'||new_id::text
  ) on conflict(recipient_id,dedupe_key) where dedupe_key is not null do nothing;

  select owner_user_id into provider_owner from public.providers where id=p_provider_id;
  if provider_owner is not null and provider_owner<>p_doctor_id then
    insert into public.notifications(recipient_id,sender_id,type,title_bn,body_bn,data,dedupe_key)
    values(
      provider_owner,auth.uid(),'appointment_provider_new','নতুন অ্যাপয়েন্টমেন্ট অনুরোধ',
      'আপনার প্রতিষ্ঠানের একটি নতুন অ্যাপয়েন্টমেন্ট অনুরোধ এসেছে।',
      jsonb_build_object('appointment_id',new_id,'provider_id',p_provider_id,'deep_link','/provider/appointments'),
      'appointment_new:provider:'||new_id::text
    ) on conflict(recipient_id,dedupe_key) where dedupe_key is not null do nothing;
  end if;

  insert into public.profile_interactions(doctor_id,actor_user_id,event_type,source,metadata)
  values(p_doctor_id,auth.uid(),'appointment_submitted','appointment_rpc','{}'::jsonb);
  insert into public.profile_interactions(provider_id,actor_user_id,event_type,source,metadata)
  values(p_provider_id,auth.uid(),'appointment_submitted','appointment_rpc','{}'::jsonb);

  return new_id;
end;
$$;

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
  provider_owner uuid;
  patient_type text;
  patient_title text;
  patient_body text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into a from public.appointments where id=p_appointment_id for update;
  if not found then raise exception 'Appointment not found'; end if;

  if not exists(select 1 from public.profiles where id=auth.uid() and account_status='active') then
    raise exception 'Active account required';
  end if;

  if a.patient_id=auth.uid() then
    if p_status<>'cancelled' or a.status not in ('pending','confirmed') then
      raise exception 'Patient can only cancel pending or confirmed appointments';
    end if;
  else
    manager := a.doctor_id=auth.uid()
      or exists(select 1 from public.providers p where p.id=a.provider_id and p.owner_user_id=auth.uid())
      or public.is_admin_or_above();
    if not manager then raise exception 'Not authorized'; end if;
    if p_status=a.status then return true; end if;
    if not (
      (a.status='pending' and p_status in ('confirmed','rejected','cancelled'))
      or (a.status='confirmed' and p_status in ('completed','no_show','cancelled'))
    ) then raise exception 'Invalid appointment status transition'; end if;
  end if;

  update public.appointments set status=p_status,updated_at=now() where id=p_appointment_id;

  if a.patient_id<>auth.uid() then
    patient_type:=case when p_status='confirmed' then 'appointment_confirmed'
      when p_status in ('cancelled','rejected') then 'appointment_cancelled'
      else 'appointment_changed' end;
    patient_title:=case when p_status='confirmed' then 'অ্যাপয়েন্টমেন্ট নিশ্চিত হয়েছে'
      when p_status in ('cancelled','rejected') then 'অ্যাপয়েন্টমেন্ট আপডেট হয়েছে'
      else 'অ্যাপয়েন্টমেন্ট পরিবর্তন হয়েছে' end;
    patient_body:=case when p_status='confirmed' then 'আপনার অ্যাপয়েন্টমেন্ট নিশ্চিত হয়েছে।'
      when p_status in ('cancelled','rejected') then 'আপনার অ্যাপয়েন্টমেন্টের অবস্থা পরিবর্তন হয়েছে।'
      else 'আপনার অ্যাপয়েন্টমেন্টে একটি আপডেট হয়েছে।' end;

    insert into public.notifications(recipient_id,sender_id,type,title_bn,body_bn,data,dedupe_key)
    values(
      a.patient_id,auth.uid(),patient_type,patient_title,patient_body,
      jsonb_build_object('appointment_id',a.id,'status',p_status,'deep_link','/appointments'),
      'appointment_status:'||a.id::text||':'||p_status
    ) on conflict(recipient_id,dedupe_key) where dedupe_key is not null do nothing;
  elsif p_status='cancelled' then
    insert into public.notifications(recipient_id,sender_id,type,title_bn,body_bn,data,dedupe_key)
    values(
      a.doctor_id,auth.uid(),'appointment_patient_cancelled','অ্যাপয়েন্টমেন্ট বাতিল হয়েছে',
      'একটি রোগীর অ্যাপয়েন্টমেন্ট বাতিল হয়েছে।',
      jsonb_build_object('appointment_id',a.id,'deep_link','/doctor/appointments'),
      'appointment_patient_cancelled:doctor:'||a.id::text
    ) on conflict(recipient_id,dedupe_key) where dedupe_key is not null do nothing;

    select owner_user_id into provider_owner from public.providers where id=a.provider_id;
    if provider_owner is not null and provider_owner<>a.doctor_id then
      insert into public.notifications(recipient_id,sender_id,type,title_bn,body_bn,data,dedupe_key)
      values(
        provider_owner,auth.uid(),'appointment_patient_cancelled','অ্যাপয়েন্টমেন্ট বাতিল হয়েছে',
        'আপনার প্রতিষ্ঠানের একটি অ্যাপয়েন্টমেন্ট বাতিল হয়েছে।',
        jsonb_build_object('appointment_id',a.id,'deep_link','/provider/appointments'),
        'appointment_patient_cancelled:provider:'||a.id::text
      ) on conflict(recipient_id,dedupe_key) where dedupe_key is not null do nothing;
    end if;
  end if;

  return true;
end;
$$;

-- Reminder generation is intentionally server/cron-only. It creates the same
-- canonical in-app row; the outbox trigger coordinates web push automatically.
create or replace function public.enqueue_due_appointment_reminders(p_window_minutes integer default 30)
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare affected integer;
begin
  if auth.role()<>'service_role' then raise exception 'Service role required'; end if;

  with due as (
    select a.id,a.patient_id
    from public.appointments a
    where a.status='confirmed'
      and a.start_time is not null
      and ((a.appointment_date+a.start_time) at time zone 'Asia/Dhaka')
          between now() and now()+make_interval(mins=>greatest(5,least(coalesce(p_window_minutes,30),180)))
  ), inserted as (
    insert into public.notifications(recipient_id,type,title_bn,body_bn,data,dedupe_key)
    select d.patient_id,'appointment_reminder','অ্যাপয়েন্টমেন্ট রিমাইন্ডার',
      'আপনার একটি আসন্ন অ্যাপয়েন্টমেন্ট আছে।',
      jsonb_build_object('appointment_id',d.id,'deep_link','/appointments'),
      'appointment_reminder:'||d.id::text
    from due d
    on conflict(recipient_id,dedupe_key) where dedupe_key is not null do nothing
    returning 1
  ) select count(*)::integer into affected from inserted;

  return coalesce(affected,0);
end;
$$;

revoke all on function public.enqueue_due_appointment_reminders(integer) from public,anon,authenticated;
grant execute on function public.enqueue_due_appointment_reminders(integer) to service_role;

-- -----------------------------------------------------------------------------
-- 5) Follow + review events generate owner notifications only on a real new row.
-- -----------------------------------------------------------------------------
create or replace function public.toggle_my_follow(
  p_doctor_id uuid default null,
  p_provider_id uuid default null,
  p_follow boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  total_followers bigint:=0;
  changed_rows integer:=0;
  now_following boolean:=false;
  provider_owner uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists(select 1 from public.profiles where id=auth.uid() and role='patient' and account_status='active') then
    raise exception 'Only an active Patient account can follow/save profiles';
  end if;
  if ((p_doctor_id is not null)::int + (p_provider_id is not null)::int)<>1 then raise exception 'Choose exactly one Doctor or Provider'; end if;
  if p_doctor_id is not null and not public.is_doctor_publicly_listable(p_doctor_id) then raise exception 'Doctor is not available for public follow/save'; end if;
  if p_provider_id is not null and not exists(select 1 from public.providers where id=p_provider_id and status='approved' and verified=true) then
    raise exception 'Hospital/Provider is not available for public follow/save';
  end if;

  if coalesce(p_follow,true) then
    insert into public.patient_follows(patient_id,doctor_id,provider_id)
    values(auth.uid(),p_doctor_id,p_provider_id)
    on conflict do nothing;
    get diagnostics changed_rows=row_count;

    if changed_rows>0 then
      insert into public.profile_interactions(doctor_id,provider_id,actor_user_id,event_type,source,metadata)
      values(p_doctor_id,p_provider_id,auth.uid(),'follow_gain','patient_follow','{}'::jsonb);

      if p_doctor_id is not null then
        insert into public.notifications(recipient_id,sender_id,type,title_bn,body_bn,data,dedupe_key)
        values(
          p_doctor_id,auth.uid(),'new_follower','নতুন follower','আপনার Doctor প্রোফাইলে একজন নতুন follower যুক্ত হয়েছে।',
          jsonb_build_object('doctor_id',p_doctor_id,'deep_link','/doctor/analytics'),
          'new_follower:doctor:'||auth.uid()::text||':'||p_doctor_id::text
        ) on conflict(recipient_id,dedupe_key) where dedupe_key is not null do nothing;
      else
        select owner_user_id into provider_owner from public.providers where id=p_provider_id;
        if provider_owner is not null then
          insert into public.notifications(recipient_id,sender_id,type,title_bn,body_bn,data,dedupe_key)
          values(
            provider_owner,auth.uid(),'new_follower','নতুন follower','আপনার প্রতিষ্ঠান প্রোফাইলে একজন নতুন follower যুক্ত হয়েছে।',
            jsonb_build_object('provider_id',p_provider_id,'deep_link','/provider/analytics'),
            'new_follower:provider:'||auth.uid()::text||':'||p_provider_id::text
          ) on conflict(recipient_id,dedupe_key) where dedupe_key is not null do nothing;
        end if;
      end if;
    end if;
  else
    delete from public.patient_follows
    where patient_id=auth.uid()
      and doctor_id is not distinct from p_doctor_id
      and provider_id is not distinct from p_provider_id;
    get diagnostics changed_rows=row_count;
    if changed_rows>0 then
      insert into public.profile_interactions(doctor_id,provider_id,actor_user_id,event_type,source,metadata)
      values(p_doctor_id,p_provider_id,auth.uid(),'follow_loss','patient_follow','{}'::jsonb);
    end if;
  end if;

  select exists(
    select 1 from public.patient_follows where patient_id=auth.uid()
      and doctor_id is not distinct from p_doctor_id and provider_id is not distinct from p_provider_id
  ) into now_following;

  if p_doctor_id is not null then
    select count(*) into total_followers from public.patient_follows where doctor_id=p_doctor_id;
  else
    select count(*) into total_followers from public.patient_follows where provider_id=p_provider_id;
  end if;

  return jsonb_build_object('following',now_following,'follower_count',total_followers);
end;
$$;

create or replace function public.upsert_my_doctor_review(
  p_doctor_id uuid,
  p_q1_score smallint,
  p_q2_score smallint,
  p_q3_score smallint,
  p_q4_score smallint,
  p_q5_score smallint,
  p_comment text default null
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  result_id uuid;
  display_name text;
  previous public.doctor_reviews%rowtype;
  is_new boolean:=false;
  content_changed boolean:=false;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select full_name into display_name from public.profiles where id=auth.uid() and role='patient' and account_status='active' for update;
  if not found then raise exception 'Only an active Patient account can review a Doctor'; end if;
  if not public.is_doctor_publicly_listable(p_doctor_id) then raise exception 'Doctor is not available for review'; end if;
  if p_q1_score not between 1 and 5 or p_q2_score not between 1 and 5 or p_q3_score not between 1 and 5
     or p_q4_score not between 1 and 5 or p_q5_score not between 1 and 5 then raise exception 'Every review score must be between 1 and 5'; end if;

  select review_id into result_id from public.doctor_review_authors where patient_id=auth.uid() and doctor_id=p_doctor_id;
  if result_id is null then
    is_new:=true;
    insert into public.doctor_reviews(doctor_id,reviewer_name,q1_score,q2_score,q3_score,q4_score,q5_score,comment,is_published,review_version)
    values(p_doctor_id,coalesce(nullif(trim(display_name),''),'Patient'),p_q1_score,p_q2_score,p_q3_score,p_q4_score,p_q5_score,null,true,1)
    returning id into result_id;
    insert into public.doctor_review_authors(review_id,patient_id,doctor_id) values(result_id,auth.uid(),p_doctor_id);
  else
    select * into previous from public.doctor_reviews where id=result_id for update;
    content_changed:=previous.q1_score is distinct from p_q1_score or previous.q2_score is distinct from p_q2_score
      or previous.q3_score is distinct from p_q3_score or previous.q4_score is distinct from p_q4_score or previous.q5_score is distinct from p_q5_score;
    update public.doctor_reviews set reviewer_name=coalesce(nullif(trim(display_name),''),'Patient'),
      q1_score=p_q1_score,q2_score=p_q2_score,q3_score=p_q3_score,q4_score=p_q4_score,q5_score=p_q5_score,comment=null
    where id=result_id;
  end if;

  if is_new then
    insert into public.profile_interactions(doctor_id,actor_user_id,event_type,source,metadata)
    values(p_doctor_id,auth.uid(),'review_submitted','structured_review_rpc','{}'::jsonb);
    insert into public.notifications(recipient_id,sender_id,type,title_bn,body_bn,data,dedupe_key)
    values(
      p_doctor_id,auth.uid(),'new_review','নতুন review','আপনার Doctor প্রোফাইলে একটি নতুন review এসেছে।',
      jsonb_build_object('doctor_id',p_doctor_id,'review_id',result_id,'deep_link','/doctor/analytics'),
      'new_review:doctor:'||result_id::text
    ) on conflict(recipient_id,dedupe_key) where dedupe_key is not null do nothing;
  elsif content_changed then
    insert into public.profile_interactions(doctor_id,actor_user_id,event_type,source,metadata)
    values(p_doctor_id,auth.uid(),'review_edited','structured_review_rpc','{}'::jsonb);
  end if;
  return result_id;
end;
$$;

create or replace function public.upsert_my_provider_review(
  p_provider_id uuid,
  p_q1_score smallint,
  p_q2_score smallint,
  p_q3_score smallint,
  p_q4_score smallint,
  p_q5_score smallint,
  p_comment text default null
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  result_id uuid;
  display_name text;
  previous public.provider_reviews%rowtype;
  is_new boolean:=false;
  content_changed boolean:=false;
  provider_owner uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select full_name into display_name from public.profiles where id=auth.uid() and role='patient' and account_status='active' for update;
  if not found then raise exception 'Only an active Patient account can review a Hospital/Provider'; end if;
  select owner_user_id into provider_owner from public.providers where id=p_provider_id and status='approved' and verified=true;
  if not found then raise exception 'Hospital/Provider is not available for review'; end if;
  if p_q1_score not between 1 and 5 or p_q2_score not between 1 and 5 or p_q3_score not between 1 and 5
     or p_q4_score not between 1 and 5 or p_q5_score not between 1 and 5 then raise exception 'Every review score must be between 1 and 5'; end if;

  select review_id into result_id from public.provider_review_authors where patient_id=auth.uid() and provider_id=p_provider_id;
  if result_id is null then
    is_new:=true;
    insert into public.provider_reviews(provider_id,name,rating,comment,is_published,sort_order,review_source,q1_score,q2_score,q3_score,q4_score,q5_score,review_version)
    values(p_provider_id,coalesce(nullif(trim(display_name),''),'Patient'),
      round((p_q1_score+p_q2_score+p_q3_score+p_q4_score+p_q5_score)::numeric/5)::smallint,
      null,true,0,'patient',p_q1_score,p_q2_score,p_q3_score,p_q4_score,p_q5_score,1)
    returning id into result_id;
    insert into public.provider_review_authors(review_id,patient_id,provider_id) values(result_id,auth.uid(),p_provider_id);
  else
    select * into previous from public.provider_reviews where id=result_id for update;
    content_changed:=previous.q1_score is distinct from p_q1_score or previous.q2_score is distinct from p_q2_score
      or previous.q3_score is distinct from p_q3_score or previous.q4_score is distinct from p_q4_score or previous.q5_score is distinct from p_q5_score;
    update public.provider_reviews set q1_score=p_q1_score,q2_score=p_q2_score,q3_score=p_q3_score,q4_score=p_q4_score,q5_score=p_q5_score,comment=null
    where id=result_id;
  end if;

  if is_new then
    insert into public.profile_interactions(provider_id,actor_user_id,event_type,source,metadata)
    values(p_provider_id,auth.uid(),'review_submitted','structured_review_rpc','{}'::jsonb);
    if provider_owner is not null then
      insert into public.notifications(recipient_id,sender_id,type,title_bn,body_bn,data,dedupe_key)
      values(
        provider_owner,auth.uid(),'new_review','নতুন review','আপনার প্রতিষ্ঠান প্রোফাইলে একটি নতুন review এসেছে।',
        jsonb_build_object('provider_id',p_provider_id,'review_id',result_id,'deep_link','/provider/analytics'),
        'new_review:provider:'||result_id::text
      ) on conflict(recipient_id,dedupe_key) where dedupe_key is not null do nothing;
    end if;
  elsif content_changed then
    insert into public.profile_interactions(provider_id,actor_user_id,event_type,source,metadata)
    values(p_provider_id,auth.uid(),'review_edited','structured_review_rpc','{}'::jsonb);
  end if;
  return result_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 6) Verification and Premium status notifications.
-- -----------------------------------------------------------------------------
create or replace function public.admin_set_doctor_verification(
  p_doctor_id uuid,
  p_status text
)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
begin
  if not public.is_admin_or_above() then raise exception 'Admin access required'; end if;
  if p_status not in ('pending','approved','rejected') then raise exception 'Invalid verification status'; end if;

  update public.doctors set verification_status=p_status,updated_at=now() where id=p_doctor_id;
  if not found then raise exception 'Doctor not found'; end if;

  insert into public.notifications(recipient_id,sender_id,type,title_bn,body_bn,data,dedupe_key)
  values(
    p_doctor_id,auth.uid(),'doctor_verification','ডক্টর প্রোফাইল যাচাই আপডেট',
    case when p_status='approved' then 'আপনার ডক্টর প্রোফাইল অনুমোদিত হয়েছে।'
      when p_status='rejected' then 'আপনার ডক্টর প্রোফাইল অনুমোদিত হয়নি।'
      else 'আপনার ডক্টর প্রোফাইল পুনরায় যাচাইয়ের জন্য অপেক্ষমাণ।' end,
    jsonb_build_object('doctor_id',p_doctor_id,'status',p_status,'deep_link','/doctor/verification'),
    'doctor_verification:'||p_doctor_id::text||':'||p_status
  ) on conflict(recipient_id,dedupe_key) where dedupe_key is not null do nothing;

  return true;
end;
$$;

create or replace function public.admin_set_provider_verification(
  p_provider_id uuid,
  p_status text,
  p_verified boolean default null
)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare owner_id uuid;
begin
  if not public.is_admin_or_above() then raise exception 'Admin access required'; end if;
  if p_status not in ('pending','approved','rejected','suspended') then raise exception 'Invalid provider status'; end if;

  update public.providers
  set status=p_status,verified=coalesce(p_verified,verified),updated_at=now()
  where id=p_provider_id
  returning owner_user_id into owner_id;
  if not found then raise exception 'Provider not found'; end if;

  if owner_id is not null then
    insert into public.notifications(recipient_id,sender_id,type,title_bn,body_bn,data,dedupe_key)
    values(
      owner_id,auth.uid(),'provider_verification','প্রতিষ্ঠান verification আপডেট','আপনার প্রতিষ্ঠানের verification status আপডেট হয়েছে।',
      jsonb_build_object('provider_id',p_provider_id,'status',p_status,'verified',p_verified,'deep_link','/verification/evidence'),
      'provider_verification:'||p_provider_id::text||':'||p_status||':'||coalesce(p_verified::text,'unchanged')
    ) on conflict(recipient_id,dedupe_key) where dedupe_key is not null do nothing;
  end if;
  return true;
end;
$$;

create or replace function public.notify_premium_membership_status()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare recipient uuid; target_type text; target_id uuid; link text;
begin
  if tg_op='UPDATE' and old.status is not distinct from new.status and old.expires_at is not distinct from new.expires_at then
    return new;
  end if;
  if new.doctor_id is not null then
    recipient:=new.doctor_id; target_type:='doctor'; target_id:=new.doctor_id; link:='/doctor/premium';
  elsif new.provider_id is not null then
    select owner_user_id into recipient from public.providers where id=new.provider_id;
    target_type:='provider'; target_id:=new.provider_id; link:='/provider/premium';
  end if;
  if recipient is not null then
    insert into public.notifications(recipient_id,type,title_bn,body_bn,data,dedupe_key)
    values(
      recipient,'premium_status','Premium status আপডেট','আপনার Premium Membership status আপডেট হয়েছে।',
      jsonb_build_object('membership_id',new.id,'status',new.status,'target_type',target_type,'target_id',target_id,'deep_link',link),
      'premium_status:'||new.id::text||':'||new.status
    ) on conflict(recipient_id,dedupe_key) where dedupe_key is not null do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_premium_membership_notification on public.premium_memberships;
create trigger trg_premium_membership_notification
after insert or update of status,expires_at on public.premium_memberships
for each row execute function public.notify_premium_membership_status();

-- -----------------------------------------------------------------------------
-- 7) Controlled system/saved-doctor notifications for future business events.
-- -----------------------------------------------------------------------------

create or replace function public.notify_provider_contact_request(
  p_provider_id uuid,
  p_event_key text,
  p_deep_link text default '/provider/appointments'
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare recipient uuid; result_id uuid;
begin
  if auth.role()<>'service_role' and not public.is_admin_or_above() then raise exception 'Admin/service access required'; end if;
  if nullif(trim(coalesce(p_event_key,'')),'') is null then raise exception 'Event key is required'; end if;
  select owner_user_id into recipient from public.providers where id=p_provider_id;
  if recipient is null then raise exception 'Provider owner not found'; end if;

  insert into public.notifications(recipient_id,sender_id,type,title_bn,body_bn,data,dedupe_key)
  values(
    recipient,case when auth.role()='service_role' then null else auth.uid() end,
    'provider_contact_request','নতুন যোগাযোগ অনুরোধ','আপনার প্রতিষ্ঠানের জন্য একটি নতুন যোগাযোগ অনুরোধ এসেছে।',
    jsonb_build_object('provider_id',p_provider_id,'deep_link',coalesce(nullif(trim(p_deep_link),''),'/provider/appointments')),
    'provider_contact_request:'||p_provider_id::text||':'||trim(p_event_key)
  )
  on conflict(recipient_id,dedupe_key) where dedupe_key is not null do nothing
  returning id into result_id;
  return result_id;
end;
$$;

create or replace function public.notify_saved_doctor_followers(
  p_doctor_id uuid,
  p_event_key text,
  p_title_bn text default 'Saved Doctor আপডেট',
  p_body_bn text default 'আপনার saved Doctor-এর একটি গুরুত্বপূর্ণ আপডেট আছে।',
  p_deep_link text default null
)
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare affected integer;
begin
  if auth.role()<>'service_role' and not public.is_admin_or_above() then raise exception 'Admin/service access required'; end if;
  if nullif(trim(coalesce(p_event_key,'')),'') is null then raise exception 'Event key is required'; end if;

  with inserted as (
    insert into public.notifications(recipient_id,sender_id,type,title_bn,body_bn,data,dedupe_key)
    select f.patient_id,case when auth.role()='service_role' then null else auth.uid() end,
      'saved_doctor_update',left(coalesce(nullif(trim(p_title_bn),''),'Saved Doctor আপডেট'),160),
      left(coalesce(nullif(trim(p_body_bn),''),'আপনার saved Doctor-এর একটি গুরুত্বপূর্ণ আপডেট আছে।'),500),
      jsonb_build_object('doctor_id',p_doctor_id,'deep_link',coalesce(nullif(trim(p_deep_link),''),'/doctors/'||p_doctor_id::text)),
      'saved_doctor_update:'||p_doctor_id::text||':'||trim(p_event_key)
    from public.patient_follows f where f.doctor_id=p_doctor_id
    on conflict(recipient_id,dedupe_key) where dedupe_key is not null do nothing
    returning 1
  ) select count(*)::integer into affected from inserted;
  return coalesce(affected,0);
end;
$$;


create or replace function public.notify_premium_progress_update(
  p_target_type text,
  p_target_id uuid,
  p_event_key text,
  p_body_bn text default 'আপনার Premium Membership progress-এ একটি আপডেট আছে।'
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare recipient uuid; result_id uuid; link text;
begin
  if auth.role()<>'service_role' and not public.is_admin_or_above() then raise exception 'Admin/service access required'; end if;
  if p_target_type not in ('doctor','provider') then raise exception 'Invalid premium target type'; end if;
  if nullif(trim(coalesce(p_event_key,'')),'') is null then raise exception 'Event key is required'; end if;

  if p_target_type='doctor' then
    recipient:=p_target_id;
    link:='/doctor/premium';
    if not exists(select 1 from public.profiles where id=recipient) then raise exception 'Doctor account not found'; end if;
  else
    select owner_user_id into recipient from public.providers where id=p_target_id;
    link:='/provider/premium';
    if recipient is null then raise exception 'Provider owner not found'; end if;
  end if;

  insert into public.notifications(recipient_id,sender_id,type,title_bn,body_bn,data,dedupe_key)
  values(
    recipient,case when auth.role()='service_role' then null else auth.uid() end,'premium_progress',
    'Premium progress আপডেট',left(coalesce(nullif(trim(p_body_bn),''),'আপনার Premium Membership progress-এ একটি আপডেট আছে।'),1000),
    jsonb_build_object('target_type',p_target_type,'target_id',p_target_id,'deep_link',link),
    'premium_progress:'||p_target_type||':'||p_target_id::text||':'||trim(p_event_key)
  )
  on conflict(recipient_id,dedupe_key) where dedupe_key is not null do update
    set body_bn=excluded.body_bn,data=excluded.data
  returning id into result_id;
  return result_id;
end;
$$;

create or replace function public.admin_send_account_notification(
  p_recipient_id uuid,
  p_event_key text,
  p_title_bn text,
  p_body_bn text,
  p_deep_link text default '/dashboard'
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare result_id uuid;
begin
  if auth.role()<>'service_role' and not public.is_admin_or_above() then raise exception 'Admin/service access required'; end if;
  if nullif(trim(coalesce(p_event_key,'')),'') is null then raise exception 'Event key is required'; end if;
  if not exists(select 1 from public.profiles where id=p_recipient_id) then raise exception 'Recipient not found'; end if;

  insert into public.notifications(recipient_id,sender_id,type,title_bn,body_bn,data,dedupe_key)
  values(
    p_recipient_id,case when auth.role()='service_role' then null else auth.uid() end,'system_notification',
    left(coalesce(nullif(trim(p_title_bn),''),'docbd.info আপডেট'),160),
    left(coalesce(nullif(trim(p_body_bn),''),'আপনার অ্যাকাউন্টে একটি গুরুত্বপূর্ণ আপডেট আছে।'),1000),
    jsonb_build_object('deep_link',coalesce(nullif(trim(p_deep_link),''),'/dashboard')),
    'system_notification:'||trim(p_event_key)
  )
  on conflict(recipient_id,dedupe_key) where dedupe_key is not null do update
    set title_bn=excluded.title_bn,body_bn=excluded.body_bn,data=excluded.data
  returning id into result_id;
  return result_id;
end;
$$;

revoke all on function public.notify_provider_contact_request(uuid,text,text) from public,anon;
grant execute on function public.notify_provider_contact_request(uuid,text,text) to authenticated,service_role;
revoke all on function public.notify_saved_doctor_followers(uuid,text,text,text,text) from public,anon;
grant execute on function public.notify_saved_doctor_followers(uuid,text,text,text,text) to authenticated,service_role;
revoke all on function public.notify_premium_progress_update(text,uuid,text,text) from public,anon;
grant execute on function public.notify_premium_progress_update(text,uuid,text,text) to authenticated,service_role;
revoke all on function public.admin_send_account_notification(uuid,text,text,text,text) from public,anon;
grant execute on function public.admin_send_account_notification(uuid,text,text,text,text) to authenticated,service_role;

-- -----------------------------------------------------------------------------
-- 8) Self-checks.
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists(select 1 from information_schema.tables where table_schema='public' and table_name='web_push_subscriptions') then
    raise exception 'STEP51: web_push_subscriptions missing';
  end if;
  if not exists(select 1 from information_schema.tables where table_schema='public' and table_name='web_push_outbox') then
    raise exception 'STEP51: web_push_outbox missing';
  end if;
  if has_table_privilege('authenticated','public.web_push_subscriptions','INSERT') then
    raise exception 'STEP51: direct push subscription INSERT grant remains';
  end if;
  if has_table_privilege('authenticated','public.notifications','SELECT') then
    raise exception 'STEP51: direct notification SELECT grant remains';
  end if;
end;
$$;
