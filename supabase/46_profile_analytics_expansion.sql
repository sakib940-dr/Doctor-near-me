-- ============================================================
-- STEP 46 — DOCTOR / HOSPITAL PROFILE ANALYTICS EXPANSION
-- Depends on STEP 45 and reuses profile_interactions, appointments,
-- patient_follows, structured reviews and existing ownership/RLS rules.
-- No duplicate analytics/event table is created.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Extend canonical event history + dedupe support.
-- ------------------------------------------------------------
alter table public.profile_interactions
  add column if not exists dedupe_key text;

alter table public.profile_interactions
  drop constraint if exists profile_interactions_event_type_check;

alter table public.profile_interactions
  add constraint profile_interactions_event_type_check
  check(event_type in (
    'profile_view','call_click','whatsapp_click','appointment_click','appointment_submitted',
    'follow_gain','follow_loss','map_click','review_submitted','review_edited'
  ));

do $$
begin
  if not exists(
    select 1 from pg_constraint
    where conrelid='public.profile_interactions'::regclass
      and conname='profile_interactions_dedupe_key_length'
  ) then
    alter table public.profile_interactions
      add constraint profile_interactions_dedupe_key_length
      check(dedupe_key is null or length(dedupe_key)<=180);
  end if;
end $$;

create unique index if not exists ux_profile_interactions_doctor_dedupe
  on public.profile_interactions(doctor_id,event_type,dedupe_key)
  where doctor_id is not null and dedupe_key is not null;
create unique index if not exists ux_profile_interactions_provider_dedupe
  on public.profile_interactions(provider_id,event_type,dedupe_key)
  where provider_id is not null and dedupe_key is not null;
create index if not exists idx_profile_interactions_doctor_event_time
  on public.profile_interactions(doctor_id,event_type,occurred_at desc)
  where doctor_id is not null;
create index if not exists idx_profile_interactions_provider_event_time
  on public.profile_interactions(provider_id,event_type,occurred_at desc)
  where provider_id is not null;

-- Public callers can create only view/click events. Follow/review/appointment-submit
-- events remain server-owned. dedupe_key is removed from JSON metadata and stored
-- only in its narrow indexed column.
create or replace function public.record_public_profile_interaction(
  p_doctor_id uuid default null,
  p_provider_id uuid default null,
  p_event_type text default 'profile_view',
  p_source text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare
  actor uuid:=null;
  key_value text:=nullif(trim(coalesce(p_metadata->>'dedupe_key','')),'');
  clean_metadata jsonb:=coalesce(p_metadata,'{}'::jsonb)-'dedupe_key';
  changed_rows integer:=0;
begin
  if ((p_doctor_id is not null)::int + (p_provider_id is not null)::int)<>1 then
    raise exception 'Choose exactly one Doctor or Provider';
  end if;
  if p_event_type not in ('profile_view','call_click','whatsapp_click','appointment_click','map_click') then
    raise exception 'Unsupported public interaction type';
  end if;
  if length(coalesce(p_source,''))>80 then raise exception 'Interaction source is too long'; end if;
  if key_value is not null and length(key_value)>180 then raise exception 'Interaction dedupe key is too long'; end if;
  if pg_column_size(clean_metadata)>2048 then raise exception 'Interaction metadata is too large'; end if;

  if p_doctor_id is not null and not public.is_doctor_publicly_listable(p_doctor_id) then return false; end if;
  if p_provider_id is not null and not exists(
    select 1 from public.providers where id=p_provider_id and status='approved' and verified=true
  ) then return false; end if;

  if auth.uid() is not null and exists(
    select 1 from public.profiles where id=auth.uid() and account_status='active'
  ) then actor:=auth.uid(); end if;

  -- Owners viewing/clicking their own public profile are not visitor engagement.
  if actor is not null and p_doctor_id is not null and actor=p_doctor_id then return false; end if;
  if actor is not null and p_provider_id is not null and exists(
    select 1 from public.providers where id=p_provider_id and owner_user_id=actor
  ) then return false; end if;

  insert into public.profile_interactions(
    doctor_id,provider_id,actor_user_id,event_type,source,metadata,dedupe_key
  ) values(
    p_doctor_id,p_provider_id,actor,p_event_type,nullif(trim(p_source),''),clean_metadata,key_value
  ) on conflict do nothing;
  get diagnostics changed_rows=row_count;
  return changed_rows>0;
end;
$$;

revoke all on function public.record_public_profile_interaction(uuid,uuid,text,text,jsonb) from public;
grant execute on function public.record_public_profile_interaction(uuid,uuid,text,text,jsonb)
to anon,authenticated,service_role;

-- ------------------------------------------------------------
-- 2) Successful appointment submission is tracked server-side for both
--    Doctor and the selected Hospital/Chamber. Existing booking behavior,
--    validation and notifications are preserved.
-- ------------------------------------------------------------
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

  insert into public.notifications(recipient_id,sender_id,type,title_bn,body_bn,data)
  values(
    p_doctor_id,auth.uid(),'appointment_new','নতুন অ্যাপয়েন্টমেন্ট',
    coalesce((select full_name from public.profiles where id=auth.uid()),'একজন রোগী') || ' একটি অ্যাপয়েন্টমেন্টের অনুরোধ করেছেন।',
    jsonb_build_object('appointment_id',new_id)
  );

  insert into public.profile_interactions(doctor_id,actor_user_id,event_type,source,metadata)
  values(p_doctor_id,auth.uid(),'appointment_submitted','appointment_rpc','{}'::jsonb);
  insert into public.profile_interactions(provider_id,actor_user_id,event_type,source,metadata)
  values(p_provider_id,auth.uid(),'appointment_submitted','appointment_rpc','{}'::jsonb);

  return new_id;
end;
$$;

revoke all on function public.create_patient_appointment(uuid,uuid,date,time,time,text) from public,anon;
grant execute on function public.create_patient_appointment(uuid,uuid,date,time,time,text) to authenticated,service_role;

-- ------------------------------------------------------------
-- 3) Structured review submit/edit events are logged only after a valid
--    Patient-owned mutation. No public RPC can forge these event types.
-- ------------------------------------------------------------
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
  select full_name into display_name from public.profiles
  where id=auth.uid() and role='patient' and account_status='active' for update;
  if not found then raise exception 'Only an active Patient account can review a Doctor'; end if;
  if not public.is_doctor_publicly_listable(p_doctor_id) then raise exception 'Doctor is not available for review'; end if;
  if p_q1_score not between 1 and 5 or p_q2_score not between 1 and 5 or p_q3_score not between 1 and 5
     or p_q4_score not between 1 and 5 or p_q5_score not between 1 and 5 then
    raise exception 'Every review score must be between 1 and 5';
  end if;
  if length(coalesce(p_comment,''))>2000 then raise exception 'Review comment is too long'; end if;

  select review_id into result_id from public.doctor_review_authors
  where patient_id=auth.uid() and doctor_id=p_doctor_id;

  if result_id is null then
    is_new:=true;
    insert into public.doctor_reviews(
      doctor_id,reviewer_name,q1_score,q2_score,q3_score,q4_score,q5_score,comment,is_published,review_version
    ) values(
      p_doctor_id,coalesce(nullif(trim(display_name),''),'Patient'),p_q1_score,p_q2_score,p_q3_score,p_q4_score,p_q5_score,
      nullif(trim(p_comment),''),true,1
    ) returning id into result_id;
    insert into public.doctor_review_authors(review_id,patient_id,doctor_id)
    values(result_id,auth.uid(),p_doctor_id);
  else
    select * into previous from public.doctor_reviews where id=result_id for update;
    content_changed := previous.q1_score is distinct from p_q1_score
      or previous.q2_score is distinct from p_q2_score or previous.q3_score is distinct from p_q3_score
      or previous.q4_score is distinct from p_q4_score or previous.q5_score is distinct from p_q5_score
      or previous.comment is distinct from nullif(trim(p_comment),'');
    update public.doctor_reviews
    set reviewer_name=coalesce(nullif(trim(display_name),''),'Patient'),
        q1_score=p_q1_score,q2_score=p_q2_score,q3_score=p_q3_score,q4_score=p_q4_score,q5_score=p_q5_score,
        comment=nullif(trim(p_comment),'')
    where id=result_id;
  end if;

  if is_new then
    insert into public.profile_interactions(doctor_id,actor_user_id,event_type,source,metadata)
    values(p_doctor_id,auth.uid(),'review_submitted','structured_review_rpc','{}'::jsonb);
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
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select full_name into display_name from public.profiles
  where id=auth.uid() and role='patient' and account_status='active' for update;
  if not found then raise exception 'Only an active Patient account can review a Hospital/Provider'; end if;
  if not exists(select 1 from public.providers where id=p_provider_id and status='approved' and verified=true) then
    raise exception 'Hospital/Provider is not available for review';
  end if;
  if p_q1_score not between 1 and 5 or p_q2_score not between 1 and 5 or p_q3_score not between 1 and 5
     or p_q4_score not between 1 and 5 or p_q5_score not between 1 and 5 then
    raise exception 'Every review score must be between 1 and 5';
  end if;
  if length(coalesce(p_comment,''))>2000 then raise exception 'Review comment is too long'; end if;

  select review_id into result_id from public.provider_review_authors
  where patient_id=auth.uid() and provider_id=p_provider_id;

  if result_id is null then
    is_new:=true;
    insert into public.provider_reviews(
      provider_id,name,rating,comment,is_published,sort_order,review_source,q1_score,q2_score,q3_score,q4_score,q5_score,review_version
    ) values(
      p_provider_id,coalesce(nullif(trim(display_name),''),'Patient'),
      round((p_q1_score+p_q2_score+p_q3_score+p_q4_score+p_q5_score)::numeric/5)::smallint,
      nullif(trim(p_comment),''),true,0,'patient',p_q1_score,p_q2_score,p_q3_score,p_q4_score,p_q5_score,1
    ) returning id into result_id;
    insert into public.provider_review_authors(review_id,patient_id,provider_id)
    values(result_id,auth.uid(),p_provider_id);
  else
    select * into previous from public.provider_reviews where id=result_id for update;
    content_changed := previous.q1_score is distinct from p_q1_score
      or previous.q2_score is distinct from p_q2_score or previous.q3_score is distinct from p_q3_score
      or previous.q4_score is distinct from p_q4_score or previous.q5_score is distinct from p_q5_score
      or previous.comment is distinct from nullif(trim(p_comment),'');
    update public.provider_reviews
    set q1_score=p_q1_score,q2_score=p_q2_score,q3_score=p_q3_score,q4_score=p_q4_score,q5_score=p_q5_score,
        comment=nullif(trim(p_comment),'')
    where id=result_id;
  end if;

  if is_new then
    insert into public.profile_interactions(provider_id,actor_user_id,event_type,source,metadata)
    values(p_provider_id,auth.uid(),'review_submitted','structured_review_rpc','{}'::jsonb);
  elsif content_changed then
    insert into public.profile_interactions(provider_id,actor_user_id,event_type,source,metadata)
    values(p_provider_id,auth.uid(),'review_edited','structured_review_rpc','{}'::jsonb);
  end if;
  return result_id;
end;
$$;

revoke all on function public.upsert_my_doctor_review(uuid,smallint,smallint,smallint,smallint,smallint,text) from public,anon;
grant execute on function public.upsert_my_doctor_review(uuid,smallint,smallint,smallint,smallint,smallint,text) to authenticated,service_role;
revoke all on function public.upsert_my_provider_review(uuid,smallint,smallint,smallint,smallint,smallint,text) from public,anon;
grant execute on function public.upsert_my_provider_review(uuid,smallint,smallint,smallint,smallint,smallint,text) to authenticated,service_role;

-- ------------------------------------------------------------
-- 4) Central analytics builder. Current follower/review/appointment totals are
--    calculated from their canonical tables; interaction clicks/views and
--    gain/edit event history come from profile_interactions.
-- ------------------------------------------------------------
create or replace function public.build_profile_analytics(
  p_doctor_id uuid default null,
  p_provider_id uuid default null,
  p_days integer default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  days_back integer:=case when coalesce(p_days,30)=0 then 0 else greatest(1,least(coalesce(p_days,30),365)) end;
  start_ts timestamptz;
  first_ts timestamptz;
  bucket_unit text;
  bucket_step interval;
  series jsonb:='[]'::jsonb;
  result jsonb;
begin
  if ((p_doctor_id is not null)::int + (p_provider_id is not null)::int)<>1 then
    raise exception 'Choose exactly one Doctor or Provider';
  end if;
  if days_back=0 then
    select least(
      coalesce((select min(occurred_at) from public.profile_interactions i where (p_doctor_id is not null and i.doctor_id=p_doctor_id) or (p_provider_id is not null and i.provider_id=p_provider_id)),now()),
      coalesce((select min(created_at) from public.appointments a where (p_doctor_id is not null and a.doctor_id=p_doctor_id) or (p_provider_id is not null and a.provider_id=p_provider_id)),now())
    ) into first_ts;
    start_ts:=date_trunc('month',first_ts);
    bucket_unit:='month'; bucket_step:='1 month'::interval;
  else
    start_ts:=date_trunc('day',now())-(days_back-1)*interval '1 day';
    bucket_unit:='day'; bucket_step:='1 day'::interval;
  end if;

  with buckets as (
    select generate_series(
      date_trunc(bucket_unit,start_ts),
      date_trunc(bucket_unit,now()),
      bucket_step
    ) as bucket
  ), event_counts as (
    select date_trunc(bucket_unit,i.occurred_at) bucket,
      count(*) filter(where i.event_type='profile_view') profile_views,
      count(*) filter(where i.event_type='call_click') call_clicks,
      count(*) filter(where i.event_type='whatsapp_click') whatsapp_clicks,
      count(*) filter(where i.event_type='appointment_click') appointment_clicks,
      count(*) filter(where i.event_type='map_click') map_clicks,
      count(*) filter(where i.event_type='follow_gain') follows,
      count(*) filter(where i.event_type='review_submitted') reviews
    from public.profile_interactions i
    where ((p_doctor_id is not null and i.doctor_id=p_doctor_id) or (p_provider_id is not null and i.provider_id=p_provider_id))
      and i.occurred_at>=start_ts
    group by 1
  ), appointment_counts as (
    select date_trunc(bucket_unit,a.created_at) bucket,count(*) appointment_requests
    from public.appointments a
    where ((p_doctor_id is not null and a.doctor_id=p_doctor_id) or (p_provider_id is not null and a.provider_id=p_provider_id))
      and a.created_at>=start_ts
    group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'bucket',case when bucket_unit='month' then to_char(b.bucket,'YYYY-MM') else to_char(b.bucket,'YYYY-MM-DD') end,
    'profile_views',coalesce(e.profile_views,0),
    'call_clicks',coalesce(e.call_clicks,0),
    'whatsapp_clicks',coalesce(e.whatsapp_clicks,0),
    'appointment_clicks',coalesce(e.appointment_clicks,0),
    'appointment_requests',coalesce(a.appointment_requests,0),
    'map_clicks',coalesce(e.map_clicks,0),
    'follows',coalesce(e.follows,0),
    'reviews',coalesce(e.reviews,0)
  ) order by b.bucket),'[]'::jsonb)
  into series
  from buckets b
  left join event_counts e on e.bucket=b.bucket
  left join appointment_counts a on a.bucket=b.bucket;

  if p_doctor_id is not null then
    result:=jsonb_build_object(
      'target_type','doctor','target_id',p_doctor_id,'days',days_back,'bucket',bucket_unit,
      'profile_views',(select count(*) from public.profile_interactions where doctor_id=p_doctor_id and event_type='profile_view' and occurred_at>=start_ts),
      'call_clicks',(select count(*) from public.profile_interactions where doctor_id=p_doctor_id and event_type='call_click' and occurred_at>=start_ts),
      'whatsapp_clicks',(select count(*) from public.profile_interactions where doctor_id=p_doctor_id and event_type='whatsapp_click' and occurred_at>=start_ts),
      'appointment_clicks',(select count(*) from public.profile_interactions where doctor_id=p_doctor_id and event_type='appointment_click' and occurred_at>=start_ts),
      'appointment_requests',(select count(*) from public.appointments where doctor_id=p_doctor_id and created_at>=start_ts),
      'map_clicks',(select count(*) from public.profile_interactions where doctor_id=p_doctor_id and event_type='map_click' and occurred_at>=start_ts),
      'followers',(select count(*) from public.patient_follows where doctor_id=p_doctor_id),
      'followers_new',(select count(*) from public.profile_interactions where doctor_id=p_doctor_id and event_type='follow_gain' and occurred_at>=start_ts),
      'followers_lost',(select count(*) from public.profile_interactions where doctor_id=p_doctor_id and event_type='follow_loss' and occurred_at>=start_ts),
      'followers_net',(
        (select count(*) from public.profile_interactions where doctor_id=p_doctor_id and event_type='follow_gain' and occurred_at>=start_ts)
        -(select count(*) from public.profile_interactions where doctor_id=p_doctor_id and event_type='follow_loss' and occurred_at>=start_ts)
      ),
      'reviews',(select count(*) from public.doctor_reviews r join public.doctor_review_authors a on a.review_id=r.id where r.doctor_id=p_doctor_id and r.is_published=true),
      'review_submitted',(select count(*) from public.profile_interactions where doctor_id=p_doctor_id and event_type='review_submitted' and occurred_at>=start_ts),
      'review_edited',(select count(*) from public.profile_interactions where doctor_id=p_doctor_id and event_type='review_edited' and occurred_at>=start_ts),
      'average_rating',(select round(avg(r.rating),2) from public.doctor_reviews r join public.doctor_review_authors a on a.review_id=r.id where r.doctor_id=p_doctor_id and r.is_published=true),
      'series',series
    );
  else
    result:=jsonb_build_object(
      'target_type','provider','target_id',p_provider_id,'days',days_back,'bucket',bucket_unit,
      'profile_views',(select count(*) from public.profile_interactions where provider_id=p_provider_id and event_type='profile_view' and occurred_at>=start_ts),
      'call_clicks',(select count(*) from public.profile_interactions where provider_id=p_provider_id and event_type='call_click' and occurred_at>=start_ts),
      'whatsapp_clicks',(select count(*) from public.profile_interactions where provider_id=p_provider_id and event_type='whatsapp_click' and occurred_at>=start_ts),
      'appointment_clicks',(select count(*) from public.profile_interactions where provider_id=p_provider_id and event_type='appointment_click' and occurred_at>=start_ts),
      'appointment_requests',(select count(*) from public.appointments where provider_id=p_provider_id and created_at>=start_ts),
      'map_clicks',(select count(*) from public.profile_interactions where provider_id=p_provider_id and event_type='map_click' and occurred_at>=start_ts),
      'followers',(select count(*) from public.patient_follows where provider_id=p_provider_id),
      'followers_new',(select count(*) from public.profile_interactions where provider_id=p_provider_id and event_type='follow_gain' and occurred_at>=start_ts),
      'followers_lost',(select count(*) from public.profile_interactions where provider_id=p_provider_id and event_type='follow_loss' and occurred_at>=start_ts),
      'followers_net',(
        (select count(*) from public.profile_interactions where provider_id=p_provider_id and event_type='follow_gain' and occurred_at>=start_ts)
        -(select count(*) from public.profile_interactions where provider_id=p_provider_id and event_type='follow_loss' and occurred_at>=start_ts)
      ),
      'reviews',(select count(*) from public.provider_reviews r join public.provider_review_authors a on a.review_id=r.id where r.provider_id=p_provider_id and r.is_published=true and r.review_source='patient'),
      'review_submitted',(select count(*) from public.profile_interactions where provider_id=p_provider_id and event_type='review_submitted' and occurred_at>=start_ts),
      'review_edited',(select count(*) from public.profile_interactions where provider_id=p_provider_id and event_type='review_edited' and occurred_at>=start_ts),
      'average_rating',(select round(avg(r.structured_rating),2) from public.provider_reviews r join public.provider_review_authors a on a.review_id=r.id where r.provider_id=p_provider_id and r.is_published=true and r.review_source='patient'),
      'series',series
    );
  end if;
  return result;
end;
$$;

revoke all on function public.build_profile_analytics(uuid,uuid,integer) from public,anon,authenticated;

create or replace function public.get_my_doctor_profile_analytics(p_days integer default 30)
returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if not exists(select 1 from public.profiles where id=auth.uid() and role='doctor' and account_status='active') then
    raise exception 'Active Doctor account required';
  end if;
  return public.build_profile_analytics(auth.uid(),null,p_days);
end; $$;

create or replace function public.get_my_provider_profile_analytics(p_provider_id uuid,p_days integer default 30)
returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if not exists(
    select 1 from public.providers p join public.profiles me on me.id=auth.uid()
    where p.id=p_provider_id and p.owner_user_id=auth.uid() and me.account_status='active' and me.role in ('hospital','chamber')
  ) then raise exception 'Owned active Hospital/Provider required'; end if;
  return public.build_profile_analytics(null,p_provider_id,p_days);
end; $$;

create or replace function public.admin_get_profile_analytics(
  p_doctor_id uuid default null,p_provider_id uuid default null,p_days integer default 30
)
returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if not public.is_admin_or_above() then raise exception 'Admin access required'; end if;
  return public.build_profile_analytics(p_doctor_id,p_provider_id,p_days);
end; $$;

-- Backward-compatible summary RPCs now use the centralized builder.
create or replace function public.get_my_doctor_interaction_summary(p_days integer default 30)
returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if not exists(select 1 from public.profiles where id=auth.uid() and role='doctor' and account_status='active') then
    raise exception 'Active Doctor account required';
  end if;
  return public.build_profile_analytics(auth.uid(),null,p_days);
end; $$;

create or replace function public.get_my_provider_interaction_summary(p_provider_id uuid,p_days integer default 30)
returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if not exists(
    select 1 from public.providers p join public.profiles me on me.id=auth.uid()
    where p.id=p_provider_id and p.owner_user_id=auth.uid() and me.account_status='active' and me.role in ('hospital','chamber')
  ) then raise exception 'Owned active Hospital/Provider required'; end if;
  return public.build_profile_analytics(null,p_provider_id,p_days);
end; $$;

revoke all on function public.get_my_doctor_profile_analytics(integer) from public,anon;
grant execute on function public.get_my_doctor_profile_analytics(integer) to authenticated,service_role;
revoke all on function public.get_my_provider_profile_analytics(uuid,integer) from public,anon;
grant execute on function public.get_my_provider_profile_analytics(uuid,integer) to authenticated,service_role;
revoke all on function public.admin_get_profile_analytics(uuid,uuid,integer) from public,anon;
grant execute on function public.admin_get_profile_analytics(uuid,uuid,integer) to authenticated,service_role;
revoke all on function public.get_my_doctor_interaction_summary(integer) from public,anon;
grant execute on function public.get_my_doctor_interaction_summary(integer) to authenticated,service_role;
revoke all on function public.get_my_provider_interaction_summary(uuid,integer) from public,anon;
grant execute on function public.get_my_provider_interaction_summary(uuid,integer) to authenticated,service_role;

-- ------------------------------------------------------------
-- 5) Deployment/security assertions.
-- ------------------------------------------------------------
do $$
begin
  if has_table_privilege('anon','public.profile_interactions','INSERT') or has_table_privilege('authenticated','public.profile_interactions','INSERT') then
    raise exception 'STEP 46 failed: direct interaction inserts must stay revoked';
  end if;
  if not has_function_privilege('anon','public.record_public_profile_interaction(uuid,uuid,text,text,jsonb)','EXECUTE') then
    raise exception 'STEP 46 failed: public interaction RPC missing for anon';
  end if;
  if has_function_privilege('anon','public.get_my_doctor_profile_analytics(integer)','EXECUTE') then
    raise exception 'STEP 46 failed: owner analytics exposed to anon';
  end if;
  if not exists(select 1 from pg_indexes where schemaname='public' and indexname='ux_profile_interactions_doctor_dedupe') then
    raise exception 'STEP 46 failed: Doctor interaction dedupe index missing';
  end if;
  if not exists(select 1 from pg_indexes where schemaname='public' and indexname='ux_profile_interactions_provider_dedupe') then
    raise exception 'STEP 46 failed: Provider interaction dedupe index missing';
  end if;
end $$;

select 'STEP 46 PROFILE ANALYTICS EXPANSION PASSED' as result;
