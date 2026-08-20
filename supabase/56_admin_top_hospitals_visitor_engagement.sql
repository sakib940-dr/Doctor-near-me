-- ============================================================
-- STEP 56 — ADMIN TOP HOSPITALS + VISITOR ENGAGEMENT
-- Reuses canonical patient_follows, profile_interactions, appointments
-- and authored/published provider + doctor reviews. No duplicate counters.
-- Safe to re-run. Run after STEP 55.
-- ============================================================

create index if not exists idx_appointments_provider_created_at_admin_top
  on public.appointments(provider_id,created_at desc);

create or replace function public.get_admin_hospital_engagement_analytics(
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
  v_engagement jsonb;
begin
  if not public.is_admin_or_above() then
    raise exception 'Admin access required';
  end if;

  if p_range='today' then
    v_from := v_today::timestamp at time zone 'Asia/Dhaka';
  elsif p_range='7d' then
    v_from := (v_today-6)::timestamp at time zone 'Asia/Dhaka';
  elsif p_range='30d' then
    v_from := (v_today-29)::timestamp at time zone 'Asia/Dhaka';
  elsif p_range='all' then
    v_from := null;
  else
    raise exception 'Invalid Hospital analytics range';
  end if;

  with hospital_ids as (
    select p.id
    from public.providers p
    where p.provider_type='hospital' and p.status='approved' and p.verified=true
  ), interaction_counts as (
    select i.provider_id,
      count(*) filter(where i.event_type='call_click')::bigint as call_clicks,
      count(*) filter(where i.event_type='whatsapp_click')::bigint as whatsapp_clicks,
      count(*) filter(where i.event_type='appointment_click')::bigint as contact_clicks,
      count(*) filter(where i.event_type='profile_view')::bigint as profile_views
    from public.profile_interactions i
    join hospital_ids h on h.id=i.provider_id
    where (v_from is null or i.occurred_at>=v_from)
      and i.occurred_at<v_to
      and i.event_type in ('call_click','whatsapp_click','appointment_click','profile_view')
    group by i.provider_id
  ), follow_counts as (
    -- Same semantics as Top Doctors: current active Save/Follow records,
    -- filtered by the date they were created for period rankings.
    select f.provider_id,count(*)::bigint as follows
    from public.patient_follows f
    join hospital_ids h on h.id=f.provider_id
    where (v_from is null or f.created_at>=v_from) and f.created_at<v_to
    group by f.provider_id
  ), appointment_counts as (
    select a.provider_id,count(*)::bigint as appointments
    from public.appointments a
    join hospital_ids h on h.id=a.provider_id
    where (v_from is null or a.created_at>=v_from) and a.created_at<v_to
    group by a.provider_id
  ), review_counts as (
    select r.provider_id,
      count(*)::bigint as reviews,
      round(avg(coalesce(r.structured_rating,r.rating::numeric))::numeric,2) as average_rating
    from public.provider_reviews r
    join public.provider_review_authors a on a.review_id=r.id and a.provider_id=r.provider_id
    join hospital_ids h on h.id=r.provider_id
    where r.is_published=true
      and (v_from is null or r.created_at>=v_from) and r.created_at<v_to
    group by r.provider_id
  ), metric_rows as (
    select 'follows'::text metric,provider_id,follows::numeric metric_value,0::bigint sample_count from follow_counts where follows>0
    union all select 'calls',provider_id,call_clicks::numeric,0 from interaction_counts where call_clicks>0
    union all select 'whatsapp',provider_id,whatsapp_clicks::numeric,0 from interaction_counts where whatsapp_clicks>0
    -- Appointment/contact ranking uses two real actions: submitted appointment
    -- rows plus direct Hospital appointment/contact button interactions.
    union all select 'appointments',coalesce(a.provider_id,i.provider_id),
      (coalesce(a.appointments,0)+coalesce(i.contact_clicks,0))::numeric,
      coalesce(a.appointments,0)::bigint
    from appointment_counts a full outer join interaction_counts i on i.provider_id=a.provider_id
    where coalesce(a.appointments,0)+coalesce(i.contact_clicks,0)>0
    union all select 'views',provider_id,profile_views::numeric,0 from interaction_counts where profile_views>0
    union all select 'reviews',provider_id,reviews::numeric,reviews from review_counts where reviews>0
    union all select 'rating',provider_id,average_rating::numeric,reviews from review_counts where reviews>0 and average_rating is not null
  ), ranked as (
    select m.*,
      row_number() over(partition by m.metric order by m.metric_value desc,m.sample_count desc,m.provider_id) as ranking_position
    from metric_rows m
  ), enriched as (
    select r.metric,r.ranking_position,r.metric_value,r.sample_count,
      p.id as provider_id,
      coalesce(nullif(trim(p.name_bn),''),nullif(trim(p.name_en),''),'Hospital') as provider_name,
      p.logo_url as photo_url,
      nullif(trim(p.address),'') as subtitle,
      p.status::text as verification_status,
      public.provider_public_rank_tier(p.id) as status_badge,
      p.slug
    from ranked r
    join public.providers p on p.id=r.provider_id
    where r.ranking_position<=v_limit
      and p.provider_type='hospital' and p.status='approved' and p.verified=true
  ), grouped as (
    select metric,jsonb_agg(jsonb_build_object(
      'rank',ranking_position,
      'provider_id',provider_id,
      'name',provider_name,
      'photo_url',photo_url,
      'subtitle',subtitle,
      'status',status_badge,
      'verification_status',verification_status,
      'slug',slug,
      'metric_value',metric_value,
      'sample_count',sample_count
    ) order by ranking_position) as items
    from enriched
    group by metric
  )
  select jsonb_build_object(
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

  with eligible_interactions as (
    select i.*
    from public.profile_interactions i
    where (v_from is null or i.occurred_at>=v_from)
      and i.occurred_at<v_to
      and (
        i.doctor_id is not null
        or exists(
          select 1 from public.providers p
          where p.id=i.provider_id and p.provider_type='hospital'
        )
      )
  ), interaction_summary as (
    select
      count(*) filter(where doctor_id is not null and event_type='follow_gain')::bigint as doctor_saves,
      count(*) filter(where provider_id is not null and event_type='follow_gain')::bigint as hospital_saves,
      count(*) filter(where event_type='call_click')::bigint as calls,
      count(*) filter(where event_type='whatsapp_click')::bigint as whatsapp,
      count(*) filter(where event_type in ('share_native','share_copy'))::bigint as shares,
      count(*) filter(where event_type='map_click')::bigint as map_clicks
    from eligible_interactions
  ), appointment_summary as (
    select count(*)::bigint as appointments
    from public.appointments a
    where (v_from is null or a.created_at>=v_from) and a.created_at<v_to
  ), review_summary as (
    select
      (
        select count(*)
        from public.doctor_reviews r
        join public.doctor_review_authors a on a.review_id=r.id and a.doctor_id=r.doctor_id
        where r.is_published=true
          and (v_from is null or r.created_at>=v_from) and r.created_at<v_to
      ) + (
        select count(*)
        from public.provider_reviews r
        join public.provider_review_authors a on a.review_id=r.id and a.provider_id=r.provider_id
        join public.providers p on p.id=r.provider_id and p.provider_type='hospital'
        where r.is_published=true
          and (v_from is null or r.created_at>=v_from) and r.created_at<v_to
      ) as reviews
  )
  select jsonb_build_object(
    'doctor_saves',coalesce(i.doctor_saves,0),
    'hospital_saves',coalesce(i.hospital_saves,0),
    'calls',coalesce(i.calls,0),
    'whatsapp',coalesce(i.whatsapp,0),
    'appointments',coalesce(a.appointments,0),
    'reviews',coalesce(r.reviews,0),
    'shares',coalesce(i.shares,0),
    'map_clicks',coalesce(i.map_clicks,0)
  ) into v_engagement
  from interaction_summary i cross join appointment_summary a cross join review_summary r;

  return jsonb_build_object(
    'range',jsonb_build_object(
      'key',p_range,
      'from',case when v_from is null then null else (v_from at time zone 'Asia/Dhaka')::date end,
      'to',(v_to at time zone 'Asia/Dhaka')::date
    ),
    'rankings',coalesce(v_rankings,'{}'::jsonb),
    'engagement',coalesce(v_engagement,'{}'::jsonb)
  );
end;
$$;

revoke all on function public.get_admin_hospital_engagement_analytics(text,integer) from public,anon;
grant execute on function public.get_admin_hospital_engagement_analytics(text,integer) to authenticated,service_role;

select 'STEP 56 ADMIN TOP HOSPITALS + VISITOR ENGAGEMENT PASSED' as result;
