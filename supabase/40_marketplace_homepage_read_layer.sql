-- ============================================================
-- STEP 40 — MARKETPLACE HOMEPAGE READ LAYER
-- Depends on STEP 39. No existing table/search/distance system is replaced.
-- Adds only publication-safe batch/card RPCs for compact visitor browsing.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Batch public stats for visible Doctor / Provider cards
-- ------------------------------------------------------------
create or replace function public.get_public_profile_stats_batch(
  p_doctor_ids uuid[] default '{}'::uuid[],
  p_provider_ids uuid[] default '{}'::uuid[]
)
returns table(
  target_type text,
  target_id uuid,
  follower_count bigint,
  review_count bigint,
  average_rating numeric,
  is_following boolean,
  ranking_tier text,
  is_premium boolean
)
language sql
stable
security definer
set search_path=public
as $$
  with requested_doctors as (
    select distinct id
    from unnest(coalesce(p_doctor_ids,'{}'::uuid[])) as t(id)
    where public.is_doctor_publicly_listable(id)
  ),
  requested_providers as (
    select distinct t.id
    from unnest(coalesce(p_provider_ids,'{}'::uuid[])) as t(id)
    join public.providers p on p.id=t.id
    where p.status='approved' and p.verified=true
  )
  select
    'doctor'::text,
    d.id,
    (select count(*) from public.patient_follows f where f.doctor_id=d.id),
    (select count(*) from public.doctor_reviews r where r.doctor_id=d.id and r.is_published=true),
    (select round(avg(r.rating),2) from public.doctor_reviews r where r.doctor_id=d.id and r.is_published=true),
    case when auth.uid() is null then false else exists(
      select 1 from public.patient_follows f where f.patient_id=auth.uid() and f.doctor_id=d.id
    ) end,
    public.doctor_public_rank_tier(d.id),
    public.is_doctor_premium(d.id)
  from requested_doctors d

  union all

  select
    'provider'::text,
    p.id,
    (select count(*) from public.patient_follows f where f.provider_id=p.id),
    (select count(*)
       from public.provider_reviews r
       join public.provider_review_authors a on a.review_id=r.id
      where r.provider_id=p.id and r.review_source='patient' and r.is_published=true),
    (select round(avg(coalesce(r.structured_rating,r.rating::numeric)),2)
       from public.provider_reviews r
       join public.provider_review_authors a on a.review_id=r.id
      where r.provider_id=p.id and r.review_source='patient' and r.is_published=true),
    case when auth.uid() is null then false else exists(
      select 1 from public.patient_follows f where f.patient_id=auth.uid() and f.provider_id=p.id
    ) end,
    public.provider_public_rank_tier(p.id),
    public.is_provider_premium(p.id)
  from requested_providers p;
$$;

revoke all on function public.get_public_profile_stats_batch(uuid[],uuid[]) from public;
grant execute on function public.get_public_profile_stats_batch(uuid[],uuid[]) to anon,authenticated,service_role;

-- ------------------------------------------------------------
-- 2) Marketplace Doctor rows for Premium / New / Ranked sections
-- Existing directory/search RPC is deliberately left untouched.
-- ------------------------------------------------------------
create or replace function public.get_public_marketplace_doctors(
  p_district_id bigint default null,
  p_upazila_id bigint default null,
  p_mode text default 'ranked',
  p_limit integer default 10
)
returns table(
  doctor_id uuid,
  doctor_name text,
  avatar_url text,
  degree text,
  designation text,
  professional_title text,
  bmdc_registration_no text,
  medical_college text,
  present_job text,
  consultation_fee numeric,
  experience_years integer,
  district_id bigint,
  district_name_bn text,
  upazila_id bigint,
  upazila_name_bn text,
  specialties jsonb,
  verification_status text,
  nearest_provider_id uuid,
  nearest_provider_name text,
  nearest_provider_address text,
  is_premium boolean,
  ranking_tier text,
  created_at timestamptz,
  total_count bigint
)
language sql
stable
security definer
set search_path=public
as $$
  with eligible as (
    select
      d.id as doctor_id,
      p.full_name as doctor_name,
      coalesce(d.profile_photo_url,p.avatar_url) as avatar_url,
      d.degree,
      d.designation,
      d.professional_title,
      d.bmdc_registration_no,
      d.medical_college,
      d.present_job,
      d.consultation_fee,
      d.experience_years,
      p.district_id,
      di.name_bn as district_name_bn,
      p.upazila_id,
      up.name_bn as upazila_name_bn,
      coalesce(sp.items,'[]'::jsonb) as specialties,
      d.verification_status::text as verification_status,
      chamber.id as nearest_provider_id,
      chamber.name_bn as nearest_provider_name,
      chamber.address as nearest_provider_address,
      public.is_doctor_premium(d.id) as is_premium,
      public.doctor_public_rank_tier(d.id) as ranking_tier,
      d.created_at,
      public.doctor_public_rank_score(d.id) as rank_score
    from public.doctors d
    join public.profiles p on p.id=d.id
    left join public.districts di on di.id=p.district_id
    left join public.upazilas up on up.id=p.upazila_id
    left join lateral (
      select jsonb_agg(
        jsonb_build_object(
          'id',s.id,
          'name_bn',s.name_bn,
          'name_en',s.name_en,
          'slug',s.slug,
          'is_primary',ds.is_primary
        ) order by ds.is_primary desc,s.sort_order,s.name_bn
      ) as items
      from public.doctor_specialties ds
      join public.specialties s on s.id=ds.specialty_id and s.is_active=true
      where ds.doctor_id=d.id
    ) sp on true
    left join lateral (
      select pr.id,pr.name_bn,pr.address
      from public.doctor_provider_links dpl
      join public.providers pr on pr.id=dpl.provider_id
      where dpl.doctor_id=d.id
        and dpl.status='approved'
        and pr.status='approved'
        and pr.verified=true
      order by
        (pr.district_id is not distinct from p.district_id) desc,
        (pr.upazila_id is not distinct from p.upazila_id) desc,
        pr.name_bn,
        pr.id
      limit 1
    ) chamber on true
    where p.account_status='active'
      and public.is_doctor_publicly_listable(d.id)
      and (p_district_id is null or p.district_id=p_district_id)
      and (p_upazila_id is null or p.upazila_id=p_upazila_id)
      and (
        coalesce(p_mode,'ranked')='ranked'
        or (p_mode='premium' and public.is_doctor_premium(d.id))
        or (p_mode='new' and public.doctor_public_rank_tier(d.id)='new')
      )
  )
  select
    e.doctor_id,e.doctor_name,e.avatar_url,e.degree,e.designation,e.professional_title,
    e.bmdc_registration_no,e.medical_college,e.present_job,e.consultation_fee,e.experience_years,
    e.district_id,e.district_name_bn,e.upazila_id,e.upazila_name_bn,e.specialties,
    e.verification_status,e.nearest_provider_id,e.nearest_provider_name,e.nearest_provider_address,
    e.is_premium,e.ranking_tier,e.created_at,
    count(*) over() as total_count
  from eligible e
  order by
    case when p_mode='new' then e.created_at end desc,
    case when p_mode='premium' then e.rank_score end desc,
    case when coalesce(p_mode,'ranked')='ranked' then e.rank_score end desc,
    e.created_at desc,
    e.doctor_name,
    e.doctor_id
  limit greatest(1,least(coalesce(p_limit,10),24));
$$;

revoke all on function public.get_public_marketplace_doctors(bigint,bigint,text,integer) from public;
grant execute on function public.get_public_marketplace_doctors(bigint,bigint,text,integer) to anon,authenticated,service_role;

-- ------------------------------------------------------------
-- 3) Patient saved list read model for the mobile Saved shortcut
-- Canonical follow rows remain patient_follows; no duplicate save table.
-- ------------------------------------------------------------
create or replace function public.get_my_saved_profile_cards()
returns table(
  target_type text,
  target_id uuid,
  title text,
  subtitle text,
  image_url text,
  verification_status text,
  provider_type text,
  saved_at timestamptz
)
language sql
stable
security definer
set search_path=public
as $$
  select
    saved.target_type,
    saved.target_id,
    saved.title,
    saved.subtitle,
    saved.image_url,
    saved.verification_status,
    saved.provider_type,
    saved.saved_at
  from (
    select
      'doctor'::text as target_type,
      f.doctor_id as target_id,
      p.full_name as title,
      coalesce(
        (select s.name_bn
           from public.doctor_specialties ds
           join public.specialties s on s.id=ds.specialty_id
          where ds.doctor_id=f.doctor_id and s.is_active=true
          order by ds.is_primary desc,s.sort_order,s.name_bn
          limit 1),
        d.professional_title,
        d.degree,
        'ডাক্তার'
      ) as subtitle,
      coalesce(d.profile_photo_url,p.avatar_url) as image_url,
      d.verification_status::text as verification_status,
      null::text as provider_type,
      f.created_at as saved_at
    from public.patient_follows f
    join public.doctors d on d.id=f.doctor_id
    join public.profiles p on p.id=d.id
    where f.patient_id=auth.uid()
      and f.doctor_id is not null
      and public.is_doctor_publicly_listable(f.doctor_id)

    union all

    select
      'provider'::text as target_type,
      f.provider_id as target_id,
      pr.name_bn as title,
      case when pr.provider_type='hospital' then 'হাসপাতাল' else 'চেম্বার' end as subtitle,
      pr.logo_url as image_url,
      case when pr.verified then 'approved' else 'pending' end as verification_status,
      pr.provider_type::text as provider_type,
      f.created_at as saved_at
    from public.patient_follows f
    join public.providers pr on pr.id=f.provider_id
    where f.patient_id=auth.uid()
      and f.provider_id is not null
      and pr.status='approved'
      and pr.verified=true
  ) as saved
  order by saved.saved_at desc, saved.target_type, saved.target_id;
$$;

revoke all on function public.get_my_saved_profile_cards() from public,anon;
grant execute on function public.get_my_saved_profile_cards() to authenticated,service_role;

-- ------------------------------------------------------------
-- 4) Deployment assertions
-- ------------------------------------------------------------
do $$
begin
  if not has_function_privilege('anon','public.get_public_profile_stats_batch(uuid[],uuid[])','EXECUTE') then
    raise exception 'STEP 40 failed: public stats batch anon grant missing';
  end if;
  if not has_function_privilege('anon','public.get_public_marketplace_doctors(bigint,bigint,text,integer)','EXECUTE') then
    raise exception 'STEP 40 failed: marketplace doctor anon grant missing';
  end if;
  if has_function_privilege('anon','public.get_my_saved_profile_cards()','EXECUTE') then
    raise exception 'STEP 40 failed: saved profile cards exposed to anon';
  end if;
end $$;
