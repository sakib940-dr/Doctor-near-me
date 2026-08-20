-- STEP 48 — Visitor language UX, lean search, rating-only Patient reviews
-- Preserves migrations 01–47. No new tables.

-- 1) Search is query/filter initiated and hard-capped at 20 rows per page.
create or replace function public.search_doctors_advanced(
  p_query text default null,
  p_district_id bigint default null,
  p_upazila_id bigint default null,
  p_specialty_ids bigint[] default null,
  p_degrees text[] default null,
  p_designations text[] default null,
  p_min_fee numeric default null,
  p_max_fee numeric default null,
  p_available_today boolean default false,
  p_sort text default 'name',
  p_limit integer default 20,
  p_offset integer default 0
)
returns table(
  doctor_id uuid,doctor_name text,avatar_url text,degree text,designation text,professional_title text,
  consultation_fee numeric,experience_years integer,district_id bigint,district_name_bn text,
  upazila_id bigint,upazila_name_bn text,specialties jsonb,available_today boolean,total_count bigint
)
language sql
stable
security definer
set search_path=public
as $$
  with matched as (
    select
      d.id as doctor_id,p.full_name as doctor_name,coalesce(d.profile_photo_url,p.avatar_url) as avatar_url,
      d.degree,d.designation,d.professional_title,d.consultation_fee,d.experience_years,
      p.district_id,dist.name_bn as district_name_bn,p.upazila_id,upz.name_bn as upazila_name_bn,d.created_at,
      public.doctor_public_rank_score(d.id) as rank_score,
      coalesce((select jsonb_agg(jsonb_build_object('id',sp.id,'name_bn',sp.name_bn,'name_en',sp.name_en,'slug',sp.slug,'is_primary',ds.is_primary)
                order by ds.is_primary desc,sp.sort_order,sp.id)
                from public.doctor_specialties ds join public.specialties sp on sp.id=ds.specialty_id
                where ds.doctor_id=d.id and sp.is_active),'[]'::jsonb) as specialties,
      exists(select 1 from public.chamber_schedules cs join public.providers pr on pr.id=cs.provider_id
             where cs.doctor_id=d.id and cs.is_active
               and cs.day_of_week=extract(dow from now() at time zone 'Asia/Dhaka')::smallint
               and pr.status='approved' and pr.verified) as available_today
    from public.doctors d
    join public.profiles p on p.id=d.id
    left join public.districts dist on dist.id=p.district_id
    left join public.upazilas upz on upz.id=p.upazila_id
    where public.is_doctor_publicly_listable(d.id)
      and p.account_status='active'
      and (
        nullif(trim(p_query),'') is not null
        or p_district_id is not null
        or p_upazila_id is not null
        or p_min_fee is not null
        or p_max_fee is not null
        or p_available_today
        or (p_specialty_ids is not null and cardinality(p_specialty_ids)>0)
        or (p_degrees is not null and cardinality(p_degrees)>0)
        or (p_designations is not null and cardinality(p_designations)>0)
      )
      and (p_district_id is null or p.district_id=p_district_id)
      and (p_upazila_id is null or p.upazila_id=p_upazila_id)
      and (p_min_fee is null or d.consultation_fee>=p_min_fee)
      and (p_max_fee is null or d.consultation_fee<=p_max_fee)
      and (p_specialty_ids is null or cardinality(p_specialty_ids)=0 or exists(
        select 1 from public.doctor_specialties ds where ds.doctor_id=d.id and ds.specialty_id=any(p_specialty_ids)))
      and (p_degrees is null or cardinality(p_degrees)=0 or public.degree_text_matches_requested(d.degree,p_degrees))
      -- Legacy designation filtering remains supported only so old URLs/clients do not break.
      and (p_designations is null or cardinality(p_designations)=0 or exists(
        select 1 from unnest(p_designations) requested_designation where d.designation ilike '%'||requested_designation||'%'))
      and (
        nullif(trim(p_query),'') is null
        or p.full_name ilike '%'||trim(p_query)||'%'
        or d.degree ilike '%'||trim(p_query)||'%'
        or d.designation ilike '%'||trim(p_query)||'%'
        or d.professional_title ilike '%'||trim(p_query)||'%'
        or dist.name_bn ilike '%'||trim(p_query)||'%' or dist.name_en ilike '%'||trim(p_query)||'%'
        or upz.name_bn ilike '%'||trim(p_query)||'%' or upz.name_en ilike '%'||trim(p_query)||'%'
        or exists(select 1 from public.doctor_specialties ds join public.specialties sp on sp.id=ds.specialty_id
                  where ds.doctor_id=d.id and (sp.name_bn ilike '%'||trim(p_query)||'%' or sp.name_en ilike '%'||trim(p_query)||'%'))
        or exists(select 1 from public.doctor_specialties ds
                  join public.discovery_topic_specialties dts on dts.specialty_id=ds.specialty_id
                  join public.discovery_topics dt on dt.id=dts.topic_id
                  where ds.doctor_id=d.id and dt.is_active and (
                    dt.name_bn ilike '%'||trim(p_query)||'%' or dt.name_en ilike '%'||trim(p_query)||'%'
                    or exists(select 1 from unnest(dt.search_keywords) keyword
                              where keyword ilike '%'||trim(p_query)||'%' or trim(p_query) ilike '%'||keyword||'%')))
      )
  ), filtered as (
    select * from matched where not p_available_today or available_today
  )
  select f.doctor_id,f.doctor_name,f.avatar_url,f.degree,f.designation,f.professional_title,
         f.consultation_fee,f.experience_years,f.district_id,f.district_name_bn,f.upazila_id,f.upazila_name_bn,
         f.specialties,f.available_today,count(*) over()
  from filtered f
  order by
    f.rank_score desc,
    case when p_sort='newest' then f.created_at end desc,
    case when p_sort='fee_low' then f.consultation_fee end asc nulls last,
    case when p_sort='fee_high' then f.consultation_fee end desc nulls last,
    f.doctor_name asc nulls last,
    f.doctor_id
  limit greatest(1,least(coalesce(p_limit,20),20)) offset greatest(coalesce(p_offset,0),0);
$$;

-- 2) Patient structured reviews are rating-only for now.
-- Keep the legacy p_comment argument only for backward-compatible callers; it is intentionally ignored.
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

  select review_id into result_id from public.doctor_review_authors
  where patient_id=auth.uid() and doctor_id=p_doctor_id;

  if result_id is null then
    is_new:=true;
    insert into public.doctor_reviews(
      doctor_id,reviewer_name,q1_score,q2_score,q3_score,q4_score,q5_score,comment,is_published,review_version
    ) values(
      p_doctor_id,coalesce(nullif(trim(display_name),''),'Patient'),p_q1_score,p_q2_score,p_q3_score,p_q4_score,p_q5_score,
      null,true,1
    ) returning id into result_id;
    insert into public.doctor_review_authors(review_id,patient_id,doctor_id)
    values(result_id,auth.uid(),p_doctor_id);
  else
    select * into previous from public.doctor_reviews where id=result_id for update;
    content_changed := previous.q1_score is distinct from p_q1_score
      or previous.q2_score is distinct from p_q2_score or previous.q3_score is distinct from p_q3_score
      or previous.q4_score is distinct from p_q4_score or previous.q5_score is distinct from p_q5_score;
    update public.doctor_reviews
    set reviewer_name=coalesce(nullif(trim(display_name),''),'Patient'),
        q1_score=p_q1_score,q2_score=p_q2_score,q3_score=p_q3_score,q4_score=p_q4_score,q5_score=p_q5_score,
        comment=null
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

  select review_id into result_id from public.provider_review_authors
  where patient_id=auth.uid() and provider_id=p_provider_id;

  if result_id is null then
    is_new:=true;
    insert into public.provider_reviews(
      provider_id,name,rating,comment,is_published,sort_order,review_source,q1_score,q2_score,q3_score,q4_score,q5_score,review_version
    ) values(
      p_provider_id,coalesce(nullif(trim(display_name),''),'Patient'),
      round((p_q1_score+p_q2_score+p_q3_score+p_q4_score+p_q5_score)::numeric/5)::smallint,
      null,true,0,'patient',p_q1_score,p_q2_score,p_q3_score,p_q4_score,p_q5_score,1
    ) returning id into result_id;
    insert into public.provider_review_authors(review_id,patient_id,provider_id)
    values(result_id,auth.uid(),p_provider_id);
  else
    select * into previous from public.provider_reviews where id=result_id for update;
    content_changed := previous.q1_score is distinct from p_q1_score
      or previous.q2_score is distinct from p_q2_score or previous.q3_score is distinct from p_q3_score
      or previous.q4_score is distinct from p_q4_score or previous.q5_score is distinct from p_q5_score;
    update public.provider_reviews
    set q1_score=p_q1_score,q2_score=p_q2_score,q3_score=p_q3_score,q4_score=p_q4_score,q5_score=p_q5_score,
        comment=null
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

-- 3) Do not expose historical Patient free-text comments while rating-only mode is active.
create or replace function public.get_my_structured_review(
  p_doctor_id uuid default null,
  p_provider_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare result jsonb;
begin
  if auth.uid() is null then return null; end if;
  if not exists(select 1 from public.profiles where id=auth.uid() and role='patient' and account_status='active') then
    return null;
  end if;
  if ((p_doctor_id is not null)::int + (p_provider_id is not null)::int)<>1 then
    raise exception 'Choose exactly one Doctor or Provider';
  end if;

  if p_doctor_id is not null then
    select jsonb_build_object(
      'review_id',r.id,'target_type','doctor','q1_score',r.q1_score,'q2_score',r.q2_score,
      'q3_score',r.q3_score,'q4_score',r.q4_score,'q5_score',r.q5_score,
      'rating',r.rating,'comment',null,'is_published',r.is_published,
      'created_at',r.created_at,'edited_at',r.edited_at
    ) into result
    from public.doctor_review_authors a
    join public.doctor_reviews r on r.id=a.review_id
    where a.patient_id=auth.uid() and a.doctor_id=p_doctor_id;
  else
    select jsonb_build_object(
      'review_id',r.id,'target_type','provider','q1_score',r.q1_score,'q2_score',r.q2_score,
      'q3_score',r.q3_score,'q4_score',r.q4_score,'q5_score',r.q5_score,
      'rating',coalesce(r.structured_rating,r.rating::numeric),'comment',null,
      'is_published',r.is_published,'created_at',r.created_at,'edited_at',r.edited_at
    ) into result
    from public.provider_review_authors a
    join public.provider_reviews r on r.id=a.review_id
    where a.patient_id=auth.uid() and a.provider_id=p_provider_id;
  end if;
  return result;
end;
$$;

revoke all on function public.get_my_structured_review(uuid,uuid) from public,anon;
grant execute on function public.get_my_structured_review(uuid,uuid) to authenticated,service_role;

create or replace function public.get_public_doctor_reviews(
  p_doctor_id uuid,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table(
  review_id uuid,reviewer_name text,q1_score smallint,q2_score smallint,q3_score smallint,
  q4_score smallint,q5_score smallint,rating numeric,comment text,reply jsonb,replied_at timestamptz,
  created_at timestamptz,edited_at timestamptz,total_count bigint
)
language sql
stable
security definer
set search_path=public
as $$
  select r.id,r.reviewer_name,r.q1_score,r.q2_score,r.q3_score,r.q4_score,r.q5_score,
         r.rating,null::text,r.reply,r.replied_at,r.created_at,r.edited_at,count(*) over()
  from public.doctor_reviews r
  join public.doctor_review_authors a on a.review_id=r.id and a.doctor_id=r.doctor_id
  where r.doctor_id=p_doctor_id
    and r.is_published=true
    and public.is_doctor_publicly_listable(r.doctor_id)
  order by r.created_at desc,r.id
  limit greatest(1,least(p_limit,100)) offset greatest(p_offset,0);
$$;

revoke all on function public.get_public_doctor_reviews(uuid,integer,integer) from public;
grant execute on function public.get_public_doctor_reviews(uuid,integer,integer) to anon,authenticated,service_role;

create or replace function public.get_public_provider_structured_reviews(
  p_provider_id uuid,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table(
  review_id uuid,reviewer_name text,q1_score smallint,q2_score smallint,q3_score smallint,
  q4_score smallint,q5_score smallint,rating numeric,comment text,reply jsonb,replied_at timestamptz,
  created_at timestamptz,edited_at timestamptz,total_count bigint
)
language sql
stable
security definer
set search_path=public
as $$
  select r.id,r.name,r.q1_score,r.q2_score,r.q3_score,r.q4_score,r.q5_score,
         coalesce(r.structured_rating,r.rating::numeric),null::text,r.reply,r.replied_at,
         r.created_at,r.edited_at,count(*) over()
  from public.provider_reviews r
  join public.provider_review_authors a on a.review_id=r.id
  join public.providers p on p.id=r.provider_id
  where r.provider_id=p_provider_id
    and r.review_source='patient'
    and r.is_published=true
    and p.status='approved' and p.verified=true
  order by r.created_at desc,r.id
  limit greatest(1,least(p_limit,100)) offset greatest(p_offset,0);
$$;

revoke all on function public.get_public_provider_structured_reviews(uuid,integer,integer) from public;
grant execute on function public.get_public_provider_structured_reviews(uuid,integer,integer) to anon,authenticated,service_role;
