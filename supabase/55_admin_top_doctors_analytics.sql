-- ============================================================
-- STEP 55 — ADMIN TOP DOCTORS ANALYTICS
-- Reuses canonical prescriptions, follows, profile interactions,
-- appointments and structured reviews. No duplicate counters/tables.
-- Safe to re-run. Run after STEP 54.
-- ============================================================

-- Appointment rankings filter by Doctor + creation time. Other canonical
-- sources already have matching Doctor/time indexes from earlier steps.
create index if not exists idx_appointments_doctor_created_at_admin_top
  on public.appointments(doctor_id,created_at desc);

create or replace function public.get_admin_top_doctors_analytics(
  p_range text default '30d',
  p_limit integer default 5
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_today date := (now() at time zone 'Asia/Dhaka')::date;
  v_from timestamptz;
  v_to timestamptz := now();
  v_limit integer := greatest(1,least(coalesce(p_limit,5),10));
  v_rankings jsonb;
begin
  if not public.is_admin_or_above() then
    raise exception 'Admin access required';
  end if;

  if p_range = 'today' then
    v_from := v_today::timestamp at time zone 'Asia/Dhaka';
  elsif p_range = '7d' then
    v_from := (v_today-6)::timestamp at time zone 'Asia/Dhaka';
  elsif p_range = '30d' then
    v_from := (v_today-29)::timestamp at time zone 'Asia/Dhaka';
  elsif p_range = 'all' then
    v_from := null;
  else
    raise exception 'Invalid Top Doctors analytics range';
  end if;

  with interaction_counts as (
    select i.doctor_id,
      count(*) filter(where i.event_type='call_click')::bigint as call_clicks,
      count(*) filter(where i.event_type='whatsapp_click')::bigint as whatsapp_clicks,
      count(*) filter(where i.event_type='profile_view')::bigint as profile_views
    from public.profile_interactions i
    where i.doctor_id is not null
      and (v_from is null or i.occurred_at>=v_from)
      and i.occurred_at<v_to
      and i.event_type in ('call_click','whatsapp_click','profile_view')
    group by i.doctor_id
  ), prescription_counts as (
    select rx.doctor_id,count(*)::bigint as prescriptions
    from public.doctor_prescriptions rx
    where (v_from is null or rx.created_at>=v_from) and rx.created_at<v_to
    group by rx.doctor_id
  ), follow_counts as (
    -- patient_follows is the canonical current Saved/Follow state. The range
    -- describes when each currently-active follow was created.
    select f.doctor_id,count(*)::bigint as follows
    from public.patient_follows f
    where f.doctor_id is not null
      and (v_from is null or f.created_at>=v_from) and f.created_at<v_to
    group by f.doctor_id
  ), appointment_counts as (
    select a.doctor_id,count(*)::bigint as appointments
    from public.appointments a
    where (v_from is null or a.created_at>=v_from) and a.created_at<v_to
    group by a.doctor_id
  ), review_counts as (
    select r.doctor_id,
      count(*)::bigint as reviews,
      round(avg(r.rating)::numeric,2) as average_rating
    from public.doctor_reviews r
    join public.doctor_review_authors a on a.review_id=r.id and a.doctor_id=r.doctor_id
    where r.is_published=true
      and (v_from is null or r.created_at>=v_from) and r.created_at<v_to
    group by r.doctor_id
  ), metric_rows as (
    select 'prescriptions'::text metric,doctor_id,prescriptions::numeric metric_value,0::bigint sample_count from prescription_counts where prescriptions>0
    union all select 'follows',doctor_id,follows::numeric,0 from follow_counts where follows>0
    union all select 'calls',doctor_id,call_clicks::numeric,0 from interaction_counts where call_clicks>0
    union all select 'whatsapp',doctor_id,whatsapp_clicks::numeric,0 from interaction_counts where whatsapp_clicks>0
    union all select 'appointments',doctor_id,appointments::numeric,0 from appointment_counts where appointments>0
    union all select 'views',doctor_id,profile_views::numeric,0 from interaction_counts where profile_views>0
    union all select 'reviews',doctor_id,reviews::numeric,reviews from review_counts where reviews>0
    union all select 'rating',doctor_id,average_rating::numeric,reviews from review_counts where reviews>0 and average_rating is not null
  ), eligible as (
    select m.*
    from metric_rows m
    where public.is_doctor_publicly_listable(m.doctor_id)
  ), ranked as (
    select e.*,
      row_number() over(
        partition by e.metric
        order by e.metric_value desc,e.sample_count desc,e.doctor_id
      ) as ranking_position
    from eligible e
  ), enriched as (
    select r.metric,r.ranking_position,r.metric_value,r.sample_count,
      d.id as doctor_id,
      coalesce(nullif(trim(p.full_name),''),'Doctor') as doctor_name,
      coalesce(d.profile_photo_url,p.avatar_url) as photo_url,
      nullif(trim(d.degree),'') as degree,
      coalesce((
        select coalesce(nullif(trim(s.name_bn),''),nullif(trim(s.name_en),''))
        from public.doctor_specialties ds
        join public.specialties s on s.id=ds.specialty_id
        where ds.doctor_id=d.id and s.is_active=true
        order by ds.is_primary desc,s.sort_order,s.id
        limit 1
      ),nullif(trim(d.designation),''),nullif(trim(d.professional_title),'')) as specialty,
      d.verification_status::text as verification_status,
      public.doctor_public_rank_tier(d.id) as status_badge,
      d.profile_slug
    from ranked r
    join public.doctors d on d.id=r.doctor_id
    join public.profiles p on p.id=d.id
    where r.ranking_position<=v_limit
  ), grouped as (
    select metric,jsonb_agg(jsonb_build_object(
      'rank',ranking_position,
      'doctor_id',doctor_id,
      'name',doctor_name,
      'photo_url',photo_url,
      'degree',degree,
      'specialty',specialty,
      'status',status_badge,
      'verification_status',verification_status,
      'profile_slug',profile_slug,
      'metric_value',metric_value,
      'sample_count',sample_count
    ) order by ranking_position) as items
    from enriched
    group by metric
  )
  select
    jsonb_build_object(
      'prescriptions','[]'::jsonb,
      'follows','[]'::jsonb,
      'calls','[]'::jsonb,
      'whatsapp','[]'::jsonb,
      'appointments','[]'::jsonb,
      'views','[]'::jsonb,
      'reviews','[]'::jsonb,
      'rating','[]'::jsonb
    ) || coalesce(jsonb_object_agg(metric,items),'{}'::jsonb)
  into v_rankings
  from grouped;

  return jsonb_build_object(
    'range',jsonb_build_object(
      'key',p_range,
      'from',case when v_from is null then null else (v_from at time zone 'Asia/Dhaka')::date end,
      'to',(v_to at time zone 'Asia/Dhaka')::date
    ),
    'rankings',coalesce(v_rankings,'{}'::jsonb)
  );
end;
$$;

revoke all on function public.get_admin_top_doctors_analytics(text,integer) from public,anon;
grant execute on function public.get_admin_top_doctors_analytics(text,integer) to authenticated,service_role;

select 'STEP 55 ADMIN TOP DOCTORS ANALYTICS PASSED' as result;
