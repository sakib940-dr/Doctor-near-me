-- ============================================================
-- STEP 59 — Supabase/Vercel Free-Tier Resource Optimization
-- Read-path only optimizations. Preserves existing auth/RLS/business logic.
-- ============================================================

-- Targeted indexes for the public read patterns that were previously relying on
-- broader indexes with less useful leading columns.
create index if not exists idx_providers_public_directory_location
  on public.providers(district_id,upazila_id,created_at desc,id)
  where status='approved' and verified=true;

create index if not exists idx_doctor_provider_links_provider_approved
  on public.doctor_provider_links(provider_id,doctor_id)
  where status='approved';

create index if not exists idx_chamber_schedules_provider_doctor_active
  on public.chamber_schedules(provider_id,doctor_id,day_of_week,start_time)
  where is_active=true;

create index if not exists idx_appointments_patient_created_at_free_tier
  on public.appointments(patient_id,created_at desc);

-- ------------------------------------------------------------
-- One batch Doctor-card hydration RPC instead of three client RPCs.
-- ------------------------------------------------------------
create or replace function public.get_public_doctor_card_bundle(p_doctor_ids uuid[])
returns table(
  doctor_id uuid,doctor_name text,avatar_url text,degree text,designation text,professional_title text,
  bmdc_registration_no text,medical_college text,present_job text,consultation_fee numeric,experience_years integer,
  district_id bigint,district_name_bn text,upazila_id bigint,upazila_name_bn text,specialties jsonb,
  verification_status text,nearest_provider_id uuid,nearest_provider_name text,nearest_provider_type text,
  nearest_provider_address text,nearest_provider_latitude double precision,nearest_provider_longitude double precision,
  profile_slug text
)
language sql
stable
security definer
set search_path=public
as $$
  with requested as (
    select distinct id from unnest(coalesce(p_doctor_ids,'{}'::uuid[])) as x(id) limit 100
  )
  select d.id,p.full_name,coalesce(d.profile_photo_url,p.avatar_url),d.degree,d.designation,d.professional_title,
         d.bmdc_registration_no,d.medical_college,d.present_job,d.consultation_fee,d.experience_years,
         p.district_id,di.name_bn,p.upazila_id,up.name_bn,
         coalesce(sp.items,'[]'::jsonb),d.verification_status::text,
         chamber.id,chamber.name_bn,chamber.provider_type,chamber.address,chamber.latitude,chamber.longitude,
         d.profile_slug
  from requested r
  join public.doctors d on d.id=r.id
  join public.profiles p on p.id=d.id and p.account_status='active'
  left join public.districts di on di.id=p.district_id
  left join public.upazilas up on up.id=p.upazila_id
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'id',s.id,'name_bn',s.name_bn,'name_en',s.name_en,'slug',s.slug,'is_primary',ds.is_primary
    ) order by ds.is_primary desc,s.sort_order,s.id) as items
    from public.doctor_specialties ds
    join public.specialties s on s.id=ds.specialty_id and s.is_active=true
    where ds.doctor_id=d.id
  ) sp on true
  left join lateral (
    select pr.id,pr.name_bn,pr.provider_type,pr.address,pr.latitude,pr.longitude
    from public.doctor_provider_links l
    join public.providers pr on pr.id=l.provider_id
    where l.doctor_id=d.id and l.status='approved' and pr.status='approved' and pr.verified=true
    order by
      case when p.upazila_id is not null and pr.upazila_id=p.upazila_id then 0 else 1 end,
      case when p.district_id is not null and pr.district_id=p.district_id then 0 else 1 end,
      case when pr.provider_type='chamber' then 0 else 1 end,
      pr.name_bn,pr.id
    limit 1
  ) chamber on true
  where public.is_doctor_publicly_listable(d.id)
  order by p.full_name,d.id;
$$;

revoke all on function public.get_public_doctor_card_bundle(uuid[]) from public;
grant execute on function public.get_public_doctor_card_bundle(uuid[]) to anon,authenticated,service_role;

-- ------------------------------------------------------------
-- Search-card wrapper: existing search semantics + complete public card in one HTTP RPC.
-- ------------------------------------------------------------
create or replace function public.get_public_doctor_search_cards(
  p_query text default null,
  p_district_id bigint default null,
  p_upazila_id bigint default null,
  p_specialty_ids bigint[] default null,
  p_degrees text[] default null,
  p_min_fee numeric default null,
  p_max_fee numeric default null,
  p_available_today boolean default false,
  p_sort text default 'name',
  p_limit integer default 20,
  p_offset integer default 0
)
returns table(
  doctor_id uuid,doctor_name text,avatar_url text,degree text,designation text,professional_title text,
  bmdc_registration_no text,medical_college text,present_job text,consultation_fee numeric,experience_years integer,
  district_id bigint,district_name_bn text,upazila_id bigint,upazila_name_bn text,specialties jsonb,
  available_today boolean,total_count bigint,verification_status text,profile_slug text,
  nearest_provider_id uuid,nearest_provider_name text,nearest_provider_type text,nearest_provider_address text,
  nearest_provider_latitude double precision,nearest_provider_longitude double precision
)
language sql
stable
security definer
set search_path=public
as $$
  with base as materialized (
    select * from public.search_doctors_advanced(
      p_query,p_district_id,p_upazila_id,p_specialty_ids,p_degrees,null,
      p_min_fee,p_max_fee,p_available_today,p_sort,
      least(greatest(coalesce(p_limit,20),1),20),greatest(coalesce(p_offset,0),0)
    )
  ), bundle as materialized (
    select b.*
    from public.get_public_doctor_card_bundle(
      coalesce((select array_agg(x.doctor_id) from base x),'{}'::uuid[])
    ) b
  )
  select x.doctor_id,
         coalesce(b.doctor_name,x.doctor_name),coalesce(b.avatar_url,x.avatar_url),coalesce(b.degree,x.degree),
         coalesce(b.designation,x.designation),coalesce(b.professional_title,x.professional_title),
         b.bmdc_registration_no,b.medical_college,b.present_job,
         coalesce(b.consultation_fee,x.consultation_fee),coalesce(b.experience_years,x.experience_years),
         coalesce(b.district_id,x.district_id),coalesce(b.district_name_bn,x.district_name_bn),
         coalesce(b.upazila_id,x.upazila_id),coalesce(b.upazila_name_bn,x.upazila_name_bn),
         case when jsonb_array_length(coalesce(b.specialties,'[]'::jsonb))>0 then b.specialties else x.specialties end,
         x.available_today,x.total_count,b.verification_status,b.profile_slug,
         b.nearest_provider_id,b.nearest_provider_name,b.nearest_provider_type,b.nearest_provider_address,
         b.nearest_provider_latitude,b.nearest_provider_longitude
  from base x
  left join bundle b on b.doctor_id=x.doctor_id
  order by array_position((select array_agg(q.doctor_id) from base q),x.doctor_id);
$$;

revoke all on function public.get_public_doctor_search_cards(text,bigint,bigint,bigint[],text[],numeric,numeric,boolean,text,integer,integer) from public;
grant execute on function public.get_public_doctor_search_cards(text,bigint,bigint,bigint[],text[],numeric,numeric,boolean,text,integer,integer) to anon,authenticated,service_role;

-- Marketplace wrapper includes stable slug/provider context without a second client RPC.
create or replace function public.get_public_marketplace_doctors_v2(
  p_district_id bigint default null,p_upazila_id bigint default null,p_mode text default 'ranked',p_limit integer default 10
)
returns table(
  doctor_id uuid,doctor_name text,avatar_url text,degree text,designation text,professional_title text,
  bmdc_registration_no text,medical_college text,present_job text,consultation_fee numeric,experience_years integer,
  district_id bigint,district_name_bn text,upazila_id bigint,upazila_name_bn text,specialties jsonb,
  verification_status text,nearest_provider_id uuid,nearest_provider_name text,nearest_provider_type text,
  nearest_provider_address text,nearest_provider_latitude double precision,nearest_provider_longitude double precision,
  is_premium boolean,ranking_tier text,created_at timestamptz,total_count bigint,profile_slug text
)
language sql
stable
security definer
set search_path=public
as $$
  select x.doctor_id,x.doctor_name,x.avatar_url,x.degree,x.designation,x.professional_title,
         x.bmdc_registration_no,x.medical_college,x.present_job,x.consultation_fee,x.experience_years,
         x.district_id,x.district_name_bn,x.upazila_id,x.upazila_name_bn,x.specialties,x.verification_status,
         x.nearest_provider_id,x.nearest_provider_name,p.provider_type,x.nearest_provider_address,p.latitude,p.longitude,
         x.is_premium,x.ranking_tier,x.created_at,x.total_count,d.profile_slug
  from public.get_public_marketplace_doctors(
    p_district_id,p_upazila_id,p_mode,least(greatest(coalesce(p_limit,10),1),12)
  ) x
  join public.doctors d on d.id=x.doctor_id
  left join public.providers p on p.id=x.nearest_provider_id;
$$;

revoke all on function public.get_public_marketplace_doctors_v2(bigint,bigint,text,integer) from public;
grant execute on function public.get_public_marketplace_doctors_v2(bigint,bigint,text,integer) to anon,authenticated,service_role;

-- ------------------------------------------------------------
-- Near Me v2: complete cards in one RPC, eliminating Doctor-per-row profile N+1.
-- ------------------------------------------------------------
create or replace function public.get_public_nearest_doctors_v2(
  p_lat double precision,p_lon double precision,p_radius_km double precision default 50,
  p_district_id bigint default null,p_upazila_id bigint default null,p_limit integer default 20,p_offset integer default 0
)
returns table(
  doctor_id uuid,doctor_name text,avatar_url text,degree text,designation text,professional_title text,
  bmdc_registration_no text,medical_college text,present_job text,consultation_fee numeric,experience_years integer,
  district_id bigint,district_name_bn text,upazila_id bigint,upazila_name_bn text,specialties jsonb,
  verification_status text,profile_slug text,
  nearest_provider_id uuid,nearest_provider_name text,nearest_provider_type text,nearest_provider_address text,
  nearest_provider_latitude double precision,nearest_provider_longitude double precision,distance_km double precision,
  total_count bigint
)
language sql
stable
security definer
set search_path=public
as $$
  with n as (
    select * from public.nearest_doctors(
      p_lat,p_lon,p_radius_km,p_district_id,p_upazila_id,
      least(greatest(coalesce(p_limit,20),1),20),greatest(coalesce(p_offset,0),0)
    )
  )
  select n.doctor_id,p.full_name,coalesce(d.profile_photo_url,p.avatar_url),d.degree,d.designation,d.professional_title,
         d.bmdc_registration_no,d.medical_college,d.present_job,d.consultation_fee,d.experience_years,
         n.district_id,di.name_bn,n.upazila_id,up.name_bn,
         coalesce(sp.items,'[]'::jsonb),d.verification_status::text,d.profile_slug,
         n.provider_id,n.provider_name,n.provider_type,n.address,n.latitude,n.longitude,n.distance_km,
         count(*) over()
  from n
  join public.doctors d on d.id=n.doctor_id
  join public.profiles p on p.id=d.id
  left join public.districts di on di.id=n.district_id
  left join public.upazilas up on up.id=n.upazila_id
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'id',s.id,'name_bn',s.name_bn,'name_en',s.name_en,'slug',s.slug,'is_primary',ds.is_primary
    ) order by ds.is_primary desc,s.sort_order,s.id) as items
    from public.doctor_specialties ds
    join public.specialties s on s.id=ds.specialty_id and s.is_active=true
    where ds.doctor_id=d.id
  ) sp on true
  order by public.doctor_near_me_priority_score(n.doctor_id,n.distance_km) desc,n.distance_km,n.doctor_name,n.doctor_id;
$$;

revoke all on function public.get_public_nearest_doctors_v2(double precision,double precision,double precision,bigint,bigint,integer,integer) from public;
grant execute on function public.get_public_nearest_doctors_v2(double precision,double precision,double precision,bigint,bigint,integer,integer) to anon,authenticated,service_role;

-- ------------------------------------------------------------
-- Provider Doctor cards with server pagination and complete card fields.
-- ------------------------------------------------------------
create or replace function public.get_public_provider_doctors_v3(
  p_provider_id uuid,p_limit integer default 20,p_offset integer default 0
)
returns table(
  doctor_id uuid,doctor_name text,avatar_url text,degree text,designation text,professional_title text,
  bmdc_registration_no text,medical_college text,present_job text,consultation_fee numeric,experience_years integer,
  district_id bigint,district_name_bn text,upazila_id bigint,upazila_name_bn text,specialties jsonb,
  available_today boolean,schedules jsonb,verification_status text,profile_slug text,total_count bigint
)
language sql
stable
security definer
set search_path=public
as $$
  select d.id,p.full_name,coalesce(d.profile_photo_url,p.avatar_url),d.degree,d.designation,d.professional_title,
    d.bmdc_registration_no,d.medical_college,d.present_job,d.consultation_fee,d.experience_years,
    p.district_id,dist.name_bn,p.upazila_id,upz.name_bn,
    coalesce((select jsonb_agg(jsonb_build_object(
      'id',s.id,'name_bn',s.name_bn,'name_en',s.name_en,'slug',s.slug,'is_primary',ds.is_primary
    ) order by ds.is_primary desc,s.sort_order,s.id)
      from public.doctor_specialties ds
      join public.specialties s on s.id=ds.specialty_id and s.is_active=true
      where ds.doctor_id=d.id),'[]'::jsonb),
    exists(select 1 from public.chamber_schedules cs
      where cs.provider_id=pr.id and cs.doctor_id=d.id and cs.is_active=true
        and cs.day_of_week=extract(dow from now() at time zone 'Asia/Dhaka')::int),
    coalesce((select jsonb_agg(jsonb_build_object(
      'day_of_week',cs.day_of_week,'start_time',cs.start_time,'end_time',cs.end_time,'fee',cs.fee,'note',cs.note
    ) order by cs.day_of_week,cs.start_time,cs.id)
      from public.chamber_schedules cs
      where cs.provider_id=pr.id and cs.doctor_id=d.id and cs.is_active=true),'[]'::jsonb),
    d.verification_status::text,d.profile_slug,count(*) over()
  from public.providers pr
  join public.doctor_provider_links l on l.provider_id=pr.id and l.status='approved'
  join public.doctors d on d.id=l.doctor_id and public.is_doctor_publicly_listable(d.id)
  join public.profiles p on p.id=d.id and p.account_status='active'
  left join public.districts dist on dist.id=p.district_id
  left join public.upazilas upz on upz.id=p.upazila_id
  where pr.id=p_provider_id and pr.status='approved' and pr.verified=true
  order by public.doctor_public_rank_score(d.id) desc,d.created_at desc,p.full_name,d.id
  limit least(greatest(coalesce(p_limit,20),1),50)
  offset greatest(coalesce(p_offset,0),0);
$$;

revoke all on function public.get_public_provider_doctors_v3(uuid,integer,integer) from public;
grant execute on function public.get_public_provider_doctors_v3(uuid,integer,integer) to anon,authenticated,service_role;

-- ------------------------------------------------------------
-- Public page base bundles: route + public content in one API round trip.
-- Viewer-specific Follow state remains in the existing stats RPC and is not cached.
-- ------------------------------------------------------------
create or replace function public.get_public_doctor_page_base(p_identifier text)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare r jsonb; did uuid;
begin
  r:=public.resolve_public_doctor_route(p_identifier);
  if r is null then return null; end if;
  did:=(r->>'id')::uuid;
  return jsonb_build_object(
    'route',r,
    'profile',public.get_doctor_public_profile(did),
    'content',public.get_doctor_public_content(did)
  );
end;
$$;

create or replace function public.get_public_provider_page_base(p_identifier text,p_doctor_limit integer default 10)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare r jsonb; pid uuid; provider_json jsonb; doctor_json jsonb;
begin
  r:=public.resolve_public_provider_route(p_identifier);
  if r is null then return null; end if;
  pid:=(r->>'id')::uuid;
  select jsonb_build_object(
    'id',v.id,'provider_type',v.provider_type,'name_bn',v.name_bn,'name_en',v.name_en,'slug',v.slug,
    'logo_url',v.logo_url,'banner_url',v.banner_url,'phone',v.phone,'address',v.address,
    'district_id',v.district_id,'upazila_id',v.upazila_id,'latitude',v.latitude,'longitude',v.longitude,
    'map_url',v.map_url,'verified',v.verified,'short_description',v.short_description,'whatsapp',v.whatsapp,
    'email',v.email,'facebook_url',v.facebook_url,'website_url',v.website_url,'opening_note',v.opening_note,
    'emergency_available',v.emergency_available,'about_bn',v.about_bn,'about_en',v.about_en
  ) into provider_json
  from public.public_provider_directory v where v.id=pid;
  if provider_json is null then return null; end if;
  select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into doctor_json
  from public.get_public_provider_doctors_v3(pid,least(greatest(coalesce(p_doctor_limit,10),1),20),0) x;
  return jsonb_build_object(
    'route',r,
    'provider',provider_json,
    'content',public.get_public_provider_page_content(pid),
    'doctors',doctor_json
  );
end;
$$;

revoke all on function public.get_public_doctor_page_base(text) from public;
grant execute on function public.get_public_doctor_page_base(text) to anon,authenticated,service_role;
revoke all on function public.get_public_provider_page_base(text,integer) from public;
grant execute on function public.get_public_provider_page_base(text,integer) to anon,authenticated,service_role;

-- ------------------------------------------------------------
-- Batch follower/review stats: aggregate each source once for requested IDs.
-- Signature remains unchanged, so all existing callers stay compatible.
-- ------------------------------------------------------------
create or replace function public.get_public_profile_stats_batch(
  p_doctor_ids uuid[] default '{}'::uuid[],
  p_provider_ids uuid[] default '{}'::uuid[]
)
returns table(
  target_type text,target_id uuid,follower_count bigint,review_count bigint,average_rating numeric,
  is_following boolean,ranking_tier text,is_premium boolean
)
language sql
stable
security definer
set search_path=public
as $$
  with requested_doctors as (
    select distinct id from unnest(coalesce(p_doctor_ids,'{}'::uuid[])) as t(id)
    where public.is_doctor_publicly_listable(id)
    limit 100
  ), requested_providers as (
    select distinct t.id
    from unnest(coalesce(p_provider_ids,'{}'::uuid[])) as t(id)
    join public.providers p on p.id=t.id and p.status='approved' and p.verified=true
    limit 100
  ), df as (
    select f.doctor_id,count(*)::bigint as cnt
    from public.patient_follows f join requested_doctors r on r.id=f.doctor_id group by f.doctor_id
  ), dr as (
    select r.doctor_id,count(*)::bigint as cnt,round(avg(r.rating),2) as avg_rating
    from public.doctor_reviews r
    join requested_doctors q on q.id=r.doctor_id
    join public.doctor_review_authors a on a.review_id=r.id and a.doctor_id=r.doctor_id
    where r.is_published=true group by r.doctor_id
  ), dmy as (
    select f.doctor_id from public.patient_follows f join requested_doctors r on r.id=f.doctor_id
    where auth.uid() is not null and f.patient_id=auth.uid()
  ), pf as (
    select f.provider_id,count(*)::bigint as cnt
    from public.patient_follows f join requested_providers r on r.id=f.provider_id group by f.provider_id
  ), pr as (
    select r.provider_id,count(*)::bigint as cnt,round(avg(coalesce(r.structured_rating,r.rating::numeric)),2) as avg_rating
    from public.provider_reviews r
    join requested_providers q on q.id=r.provider_id
    join public.provider_review_authors a on a.review_id=r.id
    where r.review_source='patient' and r.is_published=true group by r.provider_id
  ), pmy as (
    select f.provider_id from public.patient_follows f join requested_providers r on r.id=f.provider_id
    where auth.uid() is not null and f.patient_id=auth.uid()
  )
  select 'doctor'::text,d.id,coalesce(df.cnt,0),coalesce(dr.cnt,0),dr.avg_rating,
         (dmy.doctor_id is not null),public.doctor_public_rank_tier(d.id),public.is_doctor_premium(d.id)
  from requested_doctors d
  left join df on df.doctor_id=d.id left join dr on dr.doctor_id=d.id left join dmy on dmy.doctor_id=d.id
  union all
  select 'provider'::text,p.id,coalesce(pf.cnt,0),coalesce(pr.cnt,0),pr.avg_rating,
         (pmy.provider_id is not null),public.provider_public_rank_tier(p.id),public.is_provider_premium(p.id)
  from requested_providers p
  left join pf on pf.provider_id=p.id left join pr on pr.provider_id=p.id left join pmy on pmy.provider_id=p.id;
$$;

revoke all on function public.get_public_profile_stats_batch(uuid[],uuid[]) from public;
grant execute on function public.get_public_profile_stats_batch(uuid[],uuid[]) to anon,authenticated,service_role;

-- ------------------------------------------------------------
-- Notification header preview: one RPC instead of list + unread-count RPC.
-- ------------------------------------------------------------
create or replace function public.get_my_notification_preview(p_limit integer default 8)
returns jsonb
language sql
stable
security definer
set search_path=public
as $$
  select case when auth.uid() is null then jsonb_build_object('items','[]'::jsonb,'unread_count',0)
  else jsonb_build_object(
    'items',coalesce((
      select jsonb_agg(jsonb_build_object(
        'notification_id',x.id,'type',x.type,'title_bn',x.title_bn,'body_bn',x.body_bn,
        'data',x.data,'is_read',(x.read_at is not null),'created_at',x.created_at
      ) order by x.created_at desc)
      from (
        select n.id,n.type,n.title_bn,n.body_bn,n.data,n.read_at,n.created_at
        from public.notifications n
        where n.recipient_id=auth.uid()
        order by n.created_at desc
        limit least(greatest(coalesce(p_limit,8),1),20)
      ) x
    ),'[]'::jsonb),
    'unread_count',(select count(*)::integer from public.notifications n where n.recipient_id=auth.uid() and n.read_at is null)
  ) end;
$$;

revoke all on function public.get_my_notification_preview(integer) from public,anon;
grant execute on function public.get_my_notification_preview(integer) to authenticated,service_role;

-- ------------------------------------------------------------
-- Doctor dashboard appointment summary: four REST queries -> one RPC.
-- ------------------------------------------------------------
create or replace function public.get_my_doctor_dashboard_analytics()
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  me uuid:=auth.uid();
  today date:=(now() at time zone 'Asia/Dhaka')::date;
  month_start date:=date_trunc('month',now() at time zone 'Asia/Dhaka')::date;
  seven_start date:=((now() at time zone 'Asia/Dhaka')::date-6);
  today_count integer:=0; unique_patients integer:=0; pending_count integer:=0; daily jsonb;
begin
  if me is null or not exists(select 1 from public.profiles p where p.id=me and p.role='doctor' and p.account_status='active') then
    raise exception 'Active doctor account required';
  end if;
  select count(*)::integer into today_count from public.appointments a where a.doctor_id=me and a.appointment_date=today;
  select count(distinct a.patient_id)::integer into unique_patients from public.appointments a
    where a.doctor_id=me and a.appointment_date between month_start and today;
  select count(*)::integer into pending_count from public.appointments a where a.doctor_id=me and a.status='pending';
  select coalesce(jsonb_agg(jsonb_build_object('date',d::text,'count',coalesce(c.cnt,0)) order by d),'[]'::jsonb)
  into daily
  from generate_series(seven_start,today,'1 day'::interval) g(d)
  left join (
    select a.appointment_date,count(*)::integer cnt from public.appointments a
    where a.doctor_id=me and a.appointment_date between seven_start and today group by a.appointment_date
  ) c on c.appointment_date=g.d::date;
  return jsonb_build_object('todayAppointments',today_count,'monthlyUniquePatients',unique_patients,'pendingAppointments',pending_count,'last7Days',daily);
end;
$$;

revoke all on function public.get_my_doctor_dashboard_analytics() from public,anon;
grant execute on function public.get_my_doctor_dashboard_analytics() to authenticated,service_role;


-- ------------------------------------------------------------
-- Patient dashboard: aggregate counts + five recent rows instead of downloading up to 100 appointments.
-- ------------------------------------------------------------
create or replace function public.get_my_patient_dashboard_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  me uuid:=auth.uid();
  today date:=(now() at time zone 'Asia/Dhaka')::date;
  summary_json jsonb;
  recent_json jsonb;
begin
  if me is null or not exists(select 1 from public.profiles p where p.id=me and p.role='patient' and p.account_status='active') then
    raise exception 'Active patient account required';
  end if;

  select jsonb_build_object(
    'upcoming',count(*) filter(where a.appointment_date>=today and a.status in ('pending','confirmed')),
    'completed',count(*) filter(where a.status='completed'),
    'pending',count(*) filter(where a.status='pending'),
    'last30Days',count(*) filter(where a.appointment_date between today-29 and today)
  ) into summary_json
  from public.appointments a where a.patient_id=me;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) into recent_json
  from (
    select a.id as appointment_id,a.appointment_date,a.start_time,a.end_time,a.status,
           pp.full_name as patient_name,dp.full_name as doctor_name,pr.name_bn as provider_name,
           pr.provider_type,pr.address,d.consultation_fee,
           a.patient_note,a.created_at
    from public.appointments a
    join public.profiles pp on pp.id=a.patient_id
    join public.profiles dp on dp.id=a.doctor_id
    join public.doctors d on d.id=a.doctor_id
    left join public.providers pr on pr.id=a.provider_id
    where a.patient_id=me
    order by a.created_at desc
    limit 5
  ) x;

  return jsonb_build_object('summary',coalesce(summary_json,'{}'::jsonb),'recent',recent_json);
end;
$$;

revoke all on function public.get_my_patient_dashboard_summary() from public,anon;
grant execute on function public.get_my_patient_dashboard_summary() to authenticated,service_role;

-- ------------------------------------------------------------
-- Structured review bundle: summary + first review page in one public RPC.
-- ------------------------------------------------------------
create or replace function public.get_public_structured_review_bundle(
  p_doctor_id uuid default null,p_provider_id uuid default null,p_limit integer default 20,p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  summary_json jsonb;
  reviews_json jsonb;
  safe_limit integer:=least(greatest(coalesce(p_limit,20),1),20);
  safe_offset integer:=greatest(coalesce(p_offset,0),0);
begin
  if (p_doctor_id is null) = (p_provider_id is null) then
    raise exception 'Exactly one review target is required';
  end if;
  summary_json:=public.get_public_structured_review_summary(p_doctor_id,p_provider_id);
  if p_doctor_id is not null then
    select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into reviews_json
    from public.get_public_doctor_reviews(p_doctor_id,safe_limit,safe_offset) x;
  else
    select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into reviews_json
    from public.get_public_provider_structured_reviews(p_provider_id,safe_limit,safe_offset) x;
  end if;
  return jsonb_build_object('summary',summary_json,'reviews',reviews_json);
end;
$$;

revoke all on function public.get_public_structured_review_bundle(uuid,uuid,integer,integer) from public;
grant execute on function public.get_public_structured_review_bundle(uuid,uuid,integer,integer) to anon,authenticated,service_role;

-- ------------------------------------------------------------
-- Batch reorder helpers: one write RPC instead of one PATCH per row.
-- ------------------------------------------------------------
create or replace function public.reorder_my_provider_content(p_table text,p_provider_id uuid,p_ids text[])
returns boolean
language plpgsql
security definer
set search_path=public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.is_admin_or_above() and not exists(
    select 1 from public.providers p where p.id=p_provider_id and p.owner_user_id=auth.uid()
  ) then raise exception 'Provider access denied'; end if;
  if coalesce(array_length(p_ids,1),0)>100 then raise exception 'Too many rows'; end if;
  case p_table
    when 'provider_services' then
      update public.provider_services t set sort_order=u.ord-1 from unnest(coalesce(p_ids,'{}'::text[])) with ordinality u(id,ord)
      where t.provider_id=p_provider_id and t.id::text=u.id;
    when 'provider_gallery_images' then
      update public.provider_gallery_images t set sort_order=u.ord-1 from unnest(coalesce(p_ids,'{}'::text[])) with ordinality u(id,ord)
      where t.provider_id=p_provider_id and t.id::text=u.id;
    when 'provider_slider_images' then
      update public.provider_slider_images t set sort_order=u.ord-1 from unnest(coalesce(p_ids,'{}'::text[])) with ordinality u(id,ord)
      where t.provider_id=p_provider_id and t.id::text=u.id;
    when 'provider_reviews' then
      update public.provider_reviews t set sort_order=u.ord-1 from unnest(coalesce(p_ids,'{}'::text[])) with ordinality u(id,ord)
      where t.provider_id=p_provider_id and t.id::text=u.id;
    when 'provider_treatment_costs' then
      update public.provider_treatment_costs t set sort_order=u.ord-1 from unnest(coalesce(p_ids,'{}'::text[])) with ordinality u(id,ord)
      where t.provider_id=p_provider_id and t.id::text=u.id;
    when 'provider_investigation_costs' then
      update public.provider_investigation_costs t set sort_order=u.ord-1 from unnest(coalesce(p_ids,'{}'::text[])) with ordinality u(id,ord)
      where t.provider_id=p_provider_id and t.id::text=u.id;
    else raise exception 'Unsupported provider content table';
  end case;
  return true;
end;
$$;

create or replace function public.reorder_my_doctor_public_content(p_table text,p_ids bigint[])
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare me uuid:=auth.uid();
begin
  if me is null then raise exception 'Authentication required'; end if;
  if not public.is_admin_or_above() and not exists(select 1 from public.doctors d where d.id=me) then
    raise exception 'Doctor access required';
  end if;
  if coalesce(array_length(p_ids,1),0)>100 then raise exception 'Too many rows'; end if;
  case p_table
    when 'doctor_slider_images' then
      update public.doctor_slider_images t set sort_order=u.ord-1 from unnest(coalesce(p_ids,'{}'::bigint[])) with ordinality u(id,ord)
      where t.doctor_id=me and t.id=u.id;
    when 'doctor_services' then
      update public.doctor_services t set sort_order=u.ord-1 from unnest(coalesce(p_ids,'{}'::bigint[])) with ordinality u(id,ord)
      where t.doctor_id=me and t.id=u.id;
    when 'doctor_treatment_costs' then
      update public.doctor_treatment_costs t set sort_order=u.ord-1 from unnest(coalesce(p_ids,'{}'::bigint[])) with ordinality u(id,ord)
      where t.doctor_id=me and t.id=u.id;
    when 'doctor_investigation_costs' then
      update public.doctor_investigation_costs t set sort_order=u.ord-1 from unnest(coalesce(p_ids,'{}'::bigint[])) with ordinality u(id,ord)
      where t.doctor_id=me and t.id=u.id;
    else raise exception 'Unsupported doctor content table';
  end case;
  return true;
end;
$$;

revoke all on function public.reorder_my_provider_content(text,uuid,text[]) from public,anon;
grant execute on function public.reorder_my_provider_content(text,uuid,text[]) to authenticated,service_role;
revoke all on function public.reorder_my_doctor_public_content(text,bigint[]) from public,anon;
grant execute on function public.reorder_my_doctor_public_content(text,bigint[]) to authenticated,service_role;

-- Saved cards include clean public slugs in the same authenticated RPC.
create or replace function public.get_my_saved_profile_cards_v2()
returns table(
  target_type text,target_id uuid,title text,subtitle text,image_url text,verification_status text,
  provider_type text,saved_at timestamptz,public_slug text
)
language sql
stable
security definer
set search_path=public
as $$
  select x.target_type,x.target_id,x.title,x.subtitle,x.image_url,x.verification_status,x.provider_type,x.saved_at,
         case when x.target_type='doctor' then d.profile_slug else p.slug end as public_slug
  from public.get_my_saved_profile_cards() x
  left join public.doctors d on x.target_type='doctor' and d.id=x.target_id
  left join public.providers p on x.target_type='provider' and p.id=x.target_id
  order by x.saved_at desc,x.target_type,x.target_id;
$$;
revoke all on function public.get_my_saved_profile_cards_v2() from public,anon;
grant execute on function public.get_my_saved_profile_cards_v2() to authenticated,service_role;

-- ------------------------------------------------------------
-- Verification queue: aggregate evidence once + lightweight pending-count RPC.
-- ------------------------------------------------------------
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
  with entity_evidence as (
    select x.entity_type,x.entity_id,count(*)::bigint evidence_count
    from public.entity_verification_documents x
    group by x.entity_type,x.entity_id
  ), ambulance_evidence as (
    select x.ambulance_id,count(*)::bigint evidence_count
    from public.ambulance_verification_documents x
    group by x.ambulance_id
  ), q as (
    select 'doctor'::text entity_type,d.id entity_id,p.full_name display_name,
      coalesce(d.bmdc_registration_no,d.degree,d.designation) subtitle,
      p.district_id,p.upazila_id,d.verification_status::text status,
      coalesce(ev.evidence_count,0)::bigint evidence_count,d.updated_at submitted_at
    from public.doctors d join public.profiles p on p.id=d.id and p.account_status='active'
    left join entity_evidence ev on ev.entity_type='doctor' and ev.entity_id=d.id
    union all
    select 'provider',pr.id,pr.name_bn,pr.provider_type,pr.district_id,pr.upazila_id,
      pr.status::text,coalesce(ev.evidence_count,0)::bigint,pr.updated_at
    from public.providers pr join public.profiles owner on owner.id=pr.owner_user_id and owner.account_status='active'
    left join entity_evidence ev on ev.entity_type='provider' and ev.entity_id=pr.id
    union all
    select 'ambulance',a.id,a.operator_name,a.vehicle_registration_no,a.district_id,a.upazila_id,
      a.status::text,coalesce(ae.evidence_count,0)::bigint,a.updated_at
    from public.ambulance_services a join public.profiles owner on owner.id=a.owner_user_id and owner.account_status='active'
    left join ambulance_evidence ae on ae.ambulance_id=a.id
  )
  select q.entity_type,q.entity_id,q.display_name,q.subtitle,q.district_id,q.upazila_id,q.status,q.evidence_count,q.submitted_at
  from q
  where (p_entity_type is null or q.entity_type=p_entity_type)
    and (p_status is null or q.status=p_status)
  order by q.submitted_at,q.entity_type,q.entity_id
  limit greatest(1,least(coalesce(p_limit,50),100)) offset greatest(coalesce(p_offset,0),0);
end;
$$;

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
  select count(*)::integer into result
  from (
    select d.id from public.doctors d join public.profiles p on p.id=d.id and p.account_status='active' where d.verification_status='pending'
    union all
    select pr.id from public.providers pr join public.profiles p on p.id=pr.owner_user_id and p.account_status='active' where pr.status='pending'
    union all
    select a.id from public.ambulance_services a join public.profiles p on p.id=a.owner_user_id and p.account_status='active' where a.status='pending'
  ) x;
  return coalesce(result,0);
end;
$$;

revoke all on function public.get_verification_review_queue(text,text,integer,integer) from public,anon;
grant execute on function public.get_verification_review_queue(text,text,integer,integer) to authenticated,service_role;
revoke all on function public.get_my_pending_verification_count() from public,anon;
grant execute on function public.get_my_pending_verification_count() to authenticated,service_role;



-- ------------------------------------------------------------
-- Homepage Doctor rails: keep primary and below-fold groups separate, but
-- batch each group into one PostgREST RPC to reduce HTTP/function overhead.
-- ------------------------------------------------------------
create or replace function public.get_public_homepage_primary_doctors(
  p_district_id bigint default null,
  p_upazila_id bigint default null,
  p_limit integer default 8
)
returns jsonb
language sql
stable
security definer
set search_path=public
as $$
  select jsonb_build_object(
    'ranked',coalesce((select jsonb_agg(to_jsonb(x)) from public.get_public_marketplace_doctors_v2(p_district_id,p_upazila_id,'ranked',least(greatest(coalesce(p_limit,8),1),8)) x),'[]'::jsonb),
    'general',coalesce((select jsonb_agg(to_jsonb(x)) from public.get_public_marketplace_doctors_v2(p_district_id,p_upazila_id,'general',least(greatest(coalesce(p_limit,8),1),8)) x),'[]'::jsonb),
    'specialist',coalesce((select jsonb_agg(to_jsonb(x)) from public.get_public_marketplace_doctors_v2(p_district_id,p_upazila_id,'specialist',least(greatest(coalesce(p_limit,8),1),8)) x),'[]'::jsonb)
  );
$$;

create or replace function public.get_public_homepage_secondary_doctors(
  p_district_id bigint default null,
  p_upazila_id bigint default null,
  p_topic_ids bigint[] default '{}'::bigint[],
  p_marketplace_limit integer default 8,
  p_topic_limit integer default 7
)
returns jsonb
language sql
stable
security definer
set search_path=public
as $$
  with requested as (
    select u.id,u.ord
    from unnest(coalesce(p_topic_ids,'{}'::bigint[])) with ordinality as u(id,ord)
    where u.ord<=5 and u.id>0
  ), topic_defs as (
    select r.id,r.ord,dt.name_bn,
      coalesce(array_agg(dts.specialty_id order by dts.specialty_id) filter(where dts.specialty_id is not null),'{}'::bigint[]) as specialty_ids
    from requested r
    join public.discovery_topics dt on dt.id=r.id and dt.is_active=true
    left join public.discovery_topic_specialties dts on dts.topic_id=dt.id
    group by r.id,r.ord,dt.name_bn
  ), topic_results as (
    select t.id,t.ord,
      coalesce((
        select jsonb_agg(to_jsonb(x))
        from public.get_public_doctor_search_cards(
          case when cardinality(t.specialty_ids)=0 then t.name_bn else null end,
          p_district_id,p_upazila_id,
          case when cardinality(t.specialty_ids)>0 then t.specialty_ids else null end,
          null,null,null,false,'name',least(greatest(coalesce(p_topic_limit,7),1),7),0
        ) x
      ),'[]'::jsonb) as doctors
    from topic_defs t
  )
  select jsonb_build_object(
    'premium',coalesce((select jsonb_agg(to_jsonb(x)) from public.get_public_marketplace_doctors_v2(p_district_id,p_upazila_id,'premium',least(greatest(coalesce(p_marketplace_limit,8),1),8)) x),'[]'::jsonb),
    'new',coalesce((select jsonb_agg(to_jsonb(x)) from public.get_public_marketplace_doctors_v2(p_district_id,p_upazila_id,'new',least(greatest(coalesce(p_marketplace_limit,8),1),8)) x),'[]'::jsonb),
    'topics',coalesce((select jsonb_object_agg(t.id::text,t.doctors order by t.ord) from topic_results t),'{}'::jsonb)
  );
$$;

revoke all on function public.get_public_homepage_primary_doctors(bigint,bigint,integer) from public;
grant execute on function public.get_public_homepage_primary_doctors(bigint,bigint,integer) to anon,authenticated,service_role;
revoke all on function public.get_public_homepage_secondary_doctors(bigint,bigint,bigint[],integer,integer) from public;
grant execute on function public.get_public_homepage_secondary_doctors(bigint,bigint,bigint[],integer,integer) to anon,authenticated,service_role;



-- ------------------------------------------------------------
-- Notification Center: one private RPC for a page + unread count.
-- The existing per-user notification RLS/RPC rules remain the authority.
-- ------------------------------------------------------------
create or replace function public.get_my_notification_page(
  p_unread_only boolean default false,
  p_limit integer default 20,
  p_offset integer default 0
)
returns jsonb
language sql
stable
security definer
set search_path=public
as $$
  select jsonb_build_object(
    'items',coalesce((
      select jsonb_agg(to_jsonb(n) order by n.created_at desc)
      from public.get_my_notifications(
        p_unread_only,
        greatest(1,least(coalesce(p_limit,20),50)),
        greatest(coalesce(p_offset,0),0)
      ) n
    ),'[]'::jsonb),
    'unread_count',public.get_my_notification_unread_count()
  );
$$;
revoke all on function public.get_my_notification_page(boolean,integer,integer) from public,anon;
grant execute on function public.get_my_notification_page(boolean,integer,integer) to authenticated,service_role;

select 'STEP 59 FREE TIER RESOURCE OPTIMIZATION PASSED' as result;
