-- ============================================================
-- STEP 54 — ADMIN HIGH-LEVEL ANALYTICS
-- Reuses existing operational/event tables and admin authorization.
-- One aggregated RPC; no analytics shadow tables, no fake data.
-- Safe to re-run. Run after Step 53.
-- ============================================================

-- Global time indexes keep range analytics efficient as the platform grows.
create index if not exists idx_profiles_created_at_admin_analytics on public.profiles(created_at);
create index if not exists idx_doctors_created_at_admin_analytics on public.doctors(created_at);
create index if not exists idx_providers_type_created_at_admin_analytics on public.providers(provider_type,created_at);
create index if not exists idx_appointments_created_at_admin_analytics on public.appointments(created_at);
create index if not exists idx_doctor_prescriptions_created_at_admin_analytics on public.doctor_prescriptions(created_at);
create index if not exists idx_patient_follows_created_at_admin_analytics on public.patient_follows(created_at);
create index if not exists idx_doctor_reviews_created_at_admin_analytics on public.doctor_reviews(created_at);
create index if not exists idx_provider_reviews_created_at_admin_analytics on public.provider_reviews(created_at);
create index if not exists idx_premium_memberships_starts_at_admin_analytics
  on public.premium_memberships(starts_at) where starts_at is not null;

create or replace function public.get_admin_high_level_analytics(
  p_range text default '30d',
  p_from date default null,
  p_to date default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_today date := (now() at time zone 'Asia/Dhaka')::date;
  v_from date;
  v_to date;
  v_days integer;
  v_prev_from timestamptz;
  v_current_from timestamptz;
  v_current_to timestamptz;
  v_bucket text;
  v_result jsonb;
begin
  if not public.is_admin_or_above() then
    raise exception 'Admin access required';
  end if;

  if p_range = 'today' then
    v_from := v_today;
    v_to := v_today;
  elsif p_range = '7d' then
    v_from := v_today - 6;
    v_to := v_today;
  elsif p_range = '30d' then
    v_from := v_today - 29;
    v_to := v_today;
  elsif p_range = '90d' then
    v_from := v_today - 89;
    v_to := v_today;
  elsif p_range = '1y' then
    v_from := v_today - 364;
    v_to := v_today;
  elsif p_range = 'custom' then
    if p_from is null or p_to is null then raise exception 'Custom range requires from/to dates'; end if;
    if p_from > p_to then raise exception 'Invalid custom date range'; end if;
    if p_to > v_today then raise exception 'Analytics range cannot end in the future'; end if;
    if (p_to - p_from) > 729 then raise exception 'Custom analytics range is limited to 730 days'; end if;
    v_from := p_from;
    v_to := p_to;
  else
    raise exception 'Invalid analytics range';
  end if;

  v_days := (v_to - v_from) + 1;
  v_current_from := v_from::timestamp at time zone 'Asia/Dhaka';
  v_current_to := (v_to + 1)::timestamp at time zone 'Asia/Dhaka';
  v_prev_from := v_current_from - make_interval(days => v_days);
  v_bucket := case when v_days <= 45 then 'day' when v_days <= 180 then 'week' else 'month' end;

  with events as (
    select p.created_at as ts, 'users'::text as metric
      from public.profiles p where p.created_at >= v_prev_from and p.created_at < v_current_to
    union all
    select d.created_at, 'doctors' from public.doctors d where d.created_at >= v_prev_from and d.created_at < v_current_to
    union all
    select pr.created_at, 'hospitals' from public.providers pr where pr.provider_type='hospital' and pr.created_at >= v_prev_from and pr.created_at < v_current_to
    union all
    select p.created_at, 'patients' from public.profiles p where p.role::text='patient' and p.created_at >= v_prev_from and p.created_at < v_current_to
    union all
    select a.created_at, 'appointments' from public.appointments a where a.created_at >= v_prev_from and a.created_at < v_current_to
    union all
    select rx.created_at, 'prescriptions' from public.doctor_prescriptions rx where rx.created_at >= v_prev_from and rx.created_at < v_current_to
    union all
    select f.created_at, 'follows' from public.patient_follows f where f.created_at >= v_prev_from and f.created_at < v_current_to
    union all
    select i.occurred_at, 'calls' from public.profile_interactions i where i.event_type='call_click' and i.occurred_at >= v_prev_from and i.occurred_at < v_current_to
    union all
    select i.occurred_at, 'whatsapp' from public.profile_interactions i where i.event_type='whatsapp_click' and i.occurred_at >= v_prev_from and i.occurred_at < v_current_to
    union all
    select r.created_at, 'reviews' from public.doctor_reviews r
      where r.created_at >= v_prev_from and r.created_at < v_current_to
        and exists(select 1 from public.doctor_review_authors a where a.review_id=r.id)
    union all
    select r.created_at, 'reviews' from public.provider_reviews r
      where r.created_at >= v_prev_from and r.created_at < v_current_to
        and exists(select 1 from public.provider_review_authors a where a.review_id=r.id)
    union all
    select coalesce(m.starts_at,m.created_at), 'premium' from public.premium_memberships m
      where m.starts_at is not null
        and m.starts_at >= v_prev_from and m.starts_at < v_current_to
  ), metric_totals as (
    select metric,
      count(*) filter(where ts >= v_current_from and ts < v_current_to)::bigint as current_total,
      count(*) filter(where ts >= v_prev_from and ts < v_current_from)::bigint as previous_total
    from events group by metric
  ), bucket_series as (
    select date_trunc(v_bucket, e.ts at time zone 'Asia/Dhaka')::date as bucket_start,
      count(*) filter(where e.metric='users')::bigint as users,
      count(*) filter(where e.metric='doctors')::bigint as doctors,
      count(*) filter(where e.metric='hospitals')::bigint as hospitals,
      count(*) filter(where e.metric='patients')::bigint as patients,
      count(*) filter(where e.metric='appointments')::bigint as appointments,
      count(*) filter(where e.metric='prescriptions')::bigint as prescriptions,
      count(*) filter(where e.metric='follows')::bigint as follows,
      count(*) filter(where e.metric='calls')::bigint as calls,
      count(*) filter(where e.metric='whatsapp')::bigint as whatsapp,
      count(*) filter(where e.metric='reviews')::bigint as reviews,
      count(*) filter(where e.metric='premium')::bigint as premium
    from events e
    where e.ts >= v_current_from and e.ts < v_current_to
    group by date_trunc(v_bucket,e.ts at time zone 'Asia/Dhaka')::date
  ), buckets as (
    select case
      when v_bucket='day' then gs::date
      when v_bucket='week' then date_trunc('week',gs)::date
      else date_trunc('month',gs)::date
    end as bucket_start
    from generate_series(
      case when v_bucket='day' then v_from::timestamp
           when v_bucket='week' then date_trunc('week',v_from::timestamp)
           else date_trunc('month',v_from::timestamp) end,
      v_to::timestamp,
      case when v_bucket='day' then interval '1 day'
           when v_bucket='week' then interval '1 week'
           else interval '1 month' end
    ) gs
  ), complete_series as (
    select b.bucket_start,
      coalesce(s.users,0)::bigint users,
      coalesce(s.doctors,0)::bigint doctors,
      coalesce(s.hospitals,0)::bigint hospitals,
      coalesce(s.patients,0)::bigint patients,
      coalesce(s.appointments,0)::bigint appointments,
      coalesce(s.prescriptions,0)::bigint prescriptions,
      coalesce(s.follows,0)::bigint follows,
      coalesce(s.calls,0)::bigint calls,
      coalesce(s.whatsapp,0)::bigint whatsapp,
      coalesce(s.reviews,0)::bigint reviews,
      coalesce(s.premium,0)::bigint premium
    from buckets b left join bucket_series s using(bucket_start)
    group by b.bucket_start,s.users,s.doctors,s.hospitals,s.patients,s.appointments,s.prescriptions,s.follows,s.calls,s.whatsapp,s.reviews,s.premium
    order by b.bucket_start
  ), totals_json as (
    select coalesce(jsonb_object_agg(metric,jsonb_build_object(
      'current',current_total,
      'previous',previous_total,
      'growth_pct',case
        when previous_total=0 and current_total=0 then 0
        when previous_total=0 then null
        else round(((current_total-previous_total)::numeric/previous_total::numeric)*100,1)
      end
    )),'{}'::jsonb) data from metric_totals
  )
  select jsonb_build_object(
    'range',jsonb_build_object('key',p_range,'from',v_from,'to',v_to,'days',v_days,'bucket',v_bucket),
    'metrics',(select data from totals_json),
    'series',coalesce((select jsonb_agg(jsonb_build_object(
      'period',bucket_start,
      'users',users,'doctors',doctors,'hospitals',hospitals,'patients',patients,
      'appointments',appointments,'prescriptions',prescriptions,'follows',follows,
      'calls',calls,'whatsapp',whatsapp,'reviews',reviews,'premium',premium
    ) order by bucket_start) from complete_series),'[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.get_admin_high_level_analytics(text,date,date) from public,anon;
grant execute on function public.get_admin_high_level_analytics(text,date,date) to authenticated,service_role;

select 'STEP 54 ADMIN HIGH-LEVEL ANALYTICS PASSED' as result;
