-- ============================================================
-- DOCBD.INFO — STEP 44
-- STRUCTURED REVIEW UI + SERVER AGGREGATION
-- Run after Step 43. Safe to re-run.
--
-- Reuses STEP 39 doctor_reviews/provider_reviews + private authorship tables.
-- No duplicate review table is created.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Stable semantic question configuration (public CMS setting)
-- Review rows keep q1..q5 numeric answers only; question text is NOT copied
-- into each review row.
-- ------------------------------------------------------------
insert into public.site_settings as current_setting(setting_key,setting_value,is_public,description)
values(
  'structured_review_questions',
  jsonb_build_object(
    'version',2,
    'doctor',jsonb_build_array(
      jsonb_build_object('key','doctor_time','score_key','q1','bn','ডাক্তার আপনাকে পর্যাপ্ত সময় দিয়েছেন কি?','en','Did the doctor give you enough time?'),
      jsonb_build_object('key','explanation','score_key','q2','bn','ডাক্তার আপনার সমস্যা ও চিকিৎসা সহজভাবে বুঝিয়ে বলেছেন কি?','en','Did the doctor explain your problem and treatment clearly?'),
      jsonb_build_object('key','environment','score_key','q3','bn','চেম্বারের পরিবেশ কেমন ছিল?','en','How was the chamber environment?'),
      jsonb_build_object('key','staff','score_key','q4','bn','স্টাফদের ব্যবহার ও সহযোগিতা কেমন ছিল?','en','How was the staff behavior and support?'),
      jsonb_build_object('key','treatment_satisfaction','score_key','q5','bn','চিকিৎসা নিয়ে আপনি কতটা সন্তুষ্ট?','en','How satisfied are you with the treatment?')
    ),
    'provider',jsonb_build_array(
      jsonb_build_object('key','care_time','score_key','q1','bn','আপনাকে পর্যাপ্ত সময় ও মনোযোগ দেওয়া হয়েছে কি?','en','Did you receive enough time and attention?'),
      jsonb_build_object('key','explanation','score_key','q2','bn','আপনার সমস্যা ও সেবা/চিকিৎসা সহজভাবে বুঝিয়ে বলা হয়েছে কি?','en','Was your care or service explained clearly?'),
      jsonb_build_object('key','environment','score_key','q3','bn','হাসপাতাল/চেম্বারের পরিবেশ কেমন ছিল?','en','How was the hospital or chamber environment?'),
      jsonb_build_object('key','staff','score_key','q4','bn','স্টাফদের ব্যবহার ও সহযোগিতা কেমন ছিল?','en','How was the staff behavior and support?'),
      jsonb_build_object('key','service_satisfaction','score_key','q5','bn','সামগ্রিক সেবা নিয়ে আপনি কতটা সন্তুষ্ট?','en','How satisfied are you with the overall service?')
    )
  ),
  true,
  'Five-question structured review questionnaire. Semantic keys remain stable; review rows store scores only.'
)
on conflict(setting_key) do update
set setting_value = excluded.setting_value,
    is_public = true,
    description = excluded.description,
    updated_at = now()
where coalesce((current_setting.setting_value->>'version')::integer,0) < 2;

-- Narrow public read helper. The existing site_settings table remains canonical.
create or replace function public.get_public_structured_review_questions()
returns jsonb
language sql
stable
security definer
set search_path=public
as $$
  select setting_value
  from public.site_settings
  where setting_key='structured_review_questions' and is_public=true
  limit 1;
$$;

revoke all on function public.get_public_structured_review_questions() from public;
grant execute on function public.get_public_structured_review_questions() to anon,authenticated,service_role;

-- ------------------------------------------------------------
-- 2) Aggregate indexes for profile summary reads
-- ------------------------------------------------------------
create index if not exists idx_doctor_reviews_structured_summary
  on public.doctor_reviews(doctor_id)
  include (rating,q1_score,q2_score,q3_score,q4_score,q5_score)
  where is_published=true;

create index if not exists idx_provider_reviews_structured_summary
  on public.provider_reviews(provider_id)
  include (structured_rating,q1_score,q2_score,q3_score,q4_score,q5_score)
  where review_source='patient' and is_published=true;

-- ------------------------------------------------------------
-- 3) One server-side summary for Doctor OR Provider
-- Only valid, published structured Patient reviews are counted.
-- ------------------------------------------------------------
create or replace function public.get_public_structured_review_summary(
  p_doctor_id uuid default null,
  p_provider_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  result jsonb;
begin
  if ((p_doctor_id is not null)::int + (p_provider_id is not null)::int) <> 1 then
    raise exception 'Choose exactly one Doctor or Provider';
  end if;

  if p_doctor_id is not null then
    if not public.is_doctor_publicly_listable(p_doctor_id) then return null; end if;
    select jsonb_build_object(
      'target_type','doctor',
      'review_count',count(*),
      'overall_average',round(avg(r.rating),2),
      'q1_average',round(avg(r.q1_score::numeric),2),
      'q2_average',round(avg(r.q2_score::numeric),2),
      'q3_average',round(avg(r.q3_score::numeric),2),
      'q4_average',round(avg(r.q4_score::numeric),2),
      'q5_average',round(avg(r.q5_score::numeric),2)
    ) into result
    from public.doctor_reviews r
    join public.doctor_review_authors a on a.review_id=r.id and a.doctor_id=r.doctor_id
    where r.doctor_id=p_doctor_id and r.is_published=true
      and r.q1_score between 1 and 5 and r.q2_score between 1 and 5
      and r.q3_score between 1 and 5 and r.q4_score between 1 and 5 and r.q5_score between 1 and 5;
  else
    if not exists(
      select 1 from public.providers
      where id=p_provider_id and status='approved' and verified=true
    ) then return null; end if;
    select jsonb_build_object(
      'target_type','provider',
      'review_count',count(*),
      'overall_average',round(avg(coalesce(r.structured_rating,r.rating::numeric)),2),
      'q1_average',round(avg(r.q1_score::numeric),2),
      'q2_average',round(avg(r.q2_score::numeric),2),
      'q3_average',round(avg(r.q3_score::numeric),2),
      'q4_average',round(avg(r.q4_score::numeric),2),
      'q5_average',round(avg(r.q5_score::numeric),2)
    ) into result
    from public.provider_reviews r
    join public.provider_review_authors a on a.review_id=r.id
    where r.provider_id=p_provider_id
      and r.review_source='patient' and r.is_published=true
      and r.q1_score between 1 and 5 and r.q2_score between 1 and 5
      and r.q3_score between 1 and 5 and r.q4_score between 1 and 5 and r.q5_score between 1 and 5;
  end if;

  return result;
end;
$$;

revoke all on function public.get_public_structured_review_summary(uuid,uuid) from public;
grant execute on function public.get_public_structured_review_summary(uuid,uuid) to anon,authenticated,service_role;

-- ------------------------------------------------------------
-- 4) Track edits without changing authorship/security rules
-- ------------------------------------------------------------
create or replace function public.set_doctor_review_updated_at()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  new.updated_at=now();
  if old.q1_score is distinct from new.q1_score
     or old.q2_score is distinct from new.q2_score
     or old.q3_score is distinct from new.q3_score
     or old.q4_score is distinct from new.q4_score
     or old.q5_score is distinct from new.q5_score
     or old.comment is distinct from new.comment then
    new.edited_at=now();
    new.review_version=greatest(coalesce(old.review_version,1)+1,2);
  end if;
  return new;
end;
$$;

create or replace function public.guard_provider_review_changes()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  author_id uuid;
  patient_name text;
  owner_allowed boolean:=false;
  content_changed boolean:=false;
begin
  if tg_op='INSERT' then
    new.updated_at=now();
    if new.review_source='patient' then
      if new.q1_score is null or new.q2_score is null or new.q3_score is null
         or new.q4_score is null or new.q5_score is null then
        raise exception 'Patient review requires all five scores';
      end if;
      new.rating=round((new.q1_score+new.q2_score+new.q3_score+new.q4_score+new.q5_score)::numeric/5)::smallint;
    end if;
    return new;
  end if;

  new.updated_at=now();
  if old.review_source='patient' then
    select a.patient_id into author_id
    from public.provider_review_authors a where a.review_id=old.id;

    if public.is_admin_or_above() then
      null;
    elsif author_id is not null and auth.uid()=author_id then
      if new.provider_id is distinct from old.provider_id
         or new.review_source is distinct from old.review_source
         or new.is_published is distinct from old.is_published
         or new.reply is distinct from old.reply
         or new.replied_at is distinct from old.replied_at
         or new.sort_order is distinct from old.sort_order
         or new.moderation_note is distinct from old.moderation_note then
        raise exception 'Patient may edit only their review answers/comment';
      end if;
      select coalesce(nullif(trim(p.full_name),''),'Patient') into patient_name
      from public.profiles p where p.id=author_id;
      new.name=coalesce(patient_name,'Patient');
    else
      select exists(
        select 1 from public.providers p
        where p.id=old.provider_id and p.owner_user_id=auth.uid()
      ) into owner_allowed;
      if owner_allowed then
        if new.name is distinct from old.name
           or new.rating is distinct from old.rating
           or new.text is distinct from old.text
           or new.comment is distinct from old.comment
           or new.q1_score is distinct from old.q1_score
           or new.q2_score is distinct from old.q2_score
           or new.q3_score is distinct from old.q3_score
           or new.q4_score is distinct from old.q4_score
           or new.q5_score is distinct from old.q5_score
           or new.is_published is distinct from old.is_published
           or new.moderation_note is distinct from old.moderation_note then
          raise exception 'Provider cannot edit Patient review content';
        end if;
      else
        raise exception 'Not authorized to change this Patient review';
      end if;
    end if;

    if new.q1_score is null or new.q2_score is null or new.q3_score is null
       or new.q4_score is null or new.q5_score is null then
      raise exception 'Patient review requires all five scores';
    end if;
    new.rating=round((new.q1_score+new.q2_score+new.q3_score+new.q4_score+new.q5_score)::numeric/5)::smallint;
    content_changed := old.q1_score is distinct from new.q1_score
      or old.q2_score is distinct from new.q2_score
      or old.q3_score is distinct from new.q3_score
      or old.q4_score is distinct from new.q4_score
      or old.q5_score is distinct from new.q5_score
      or old.comment is distinct from new.comment;
    if content_changed then
      new.edited_at=now();
      new.review_version=greatest(coalesce(old.review_version,1)+1,2);
    end if;
  end if;
  return new;
end;
$$;

-- Existing trigger already points to guard_provider_review_changes().
-- Existing RLS/grants/upsert/moderation functions remain authoritative.

-- ------------------------------------------------------------
-- 5) Concurrency-safe Patient upserts
-- Locking the Patient profile row serializes submissions from multiple
-- devices/tabs for the same account. The existing unique authorship
-- constraints remain the final DB-level guarantee.
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
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select full_name into display_name
  from public.profiles
  where id=auth.uid() and role='patient' and account_status='active'
  for update;
  if not found then raise exception 'Only an active Patient account can review a Doctor'; end if;
  if not public.is_doctor_publicly_listable(p_doctor_id) then
    raise exception 'Doctor is not available for review';
  end if;
  if p_q1_score not between 1 and 5 or p_q2_score not between 1 and 5
     or p_q3_score not between 1 and 5 or p_q4_score not between 1 and 5
     or p_q5_score not between 1 and 5 then
    raise exception 'Every review score must be between 1 and 5';
  end if;
  if length(coalesce(p_comment,''))>2000 then raise exception 'Review comment is too long'; end if;

  select review_id into result_id
  from public.doctor_review_authors
  where patient_id=auth.uid() and doctor_id=p_doctor_id;

  if result_id is null then
    insert into public.doctor_reviews(
      doctor_id,reviewer_name,q1_score,q2_score,q3_score,q4_score,q5_score,
      comment,is_published,review_version
    ) values(
      p_doctor_id,coalesce(nullif(trim(display_name),''),'Patient'),
      p_q1_score,p_q2_score,p_q3_score,p_q4_score,p_q5_score,
      nullif(trim(p_comment),''),true,1
    ) returning id into result_id;

    insert into public.doctor_review_authors(review_id,patient_id,doctor_id)
    values(result_id,auth.uid(),p_doctor_id);
  else
    update public.doctor_reviews
    set reviewer_name=coalesce(nullif(trim(display_name),''),'Patient'),
        q1_score=p_q1_score,q2_score=p_q2_score,q3_score=p_q3_score,
        q4_score=p_q4_score,q5_score=p_q5_score,
        comment=nullif(trim(p_comment),'')
    where id=result_id;
  end if;

  return result_id;
end;
$$;

revoke all on function public.upsert_my_doctor_review(uuid,smallint,smallint,smallint,smallint,smallint,text)
from public,anon;
grant execute on function public.upsert_my_doctor_review(uuid,smallint,smallint,smallint,smallint,smallint,text)
to authenticated,service_role;

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
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select full_name into display_name
  from public.profiles
  where id=auth.uid() and role='patient' and account_status='active'
  for update;
  if not found then raise exception 'Only an active Patient account can review a Hospital/Provider'; end if;
  if not exists(
    select 1 from public.providers
    where id=p_provider_id and status='approved' and verified=true
  ) then raise exception 'Hospital/Provider is not available for review'; end if;
  if p_q1_score not between 1 and 5 or p_q2_score not between 1 and 5
     or p_q3_score not between 1 and 5 or p_q4_score not between 1 and 5
     or p_q5_score not between 1 and 5 then
    raise exception 'Every review score must be between 1 and 5';
  end if;
  if length(coalesce(p_comment,''))>2000 then raise exception 'Review comment is too long'; end if;

  select review_id into result_id
  from public.provider_review_authors
  where patient_id=auth.uid() and provider_id=p_provider_id;

  if result_id is null then
    insert into public.provider_reviews(
      provider_id,name,rating,comment,is_published,sort_order,review_source,
      q1_score,q2_score,q3_score,q4_score,q5_score,review_version
    ) values(
      p_provider_id,coalesce(nullif(trim(display_name),''),'Patient'),
      round((p_q1_score+p_q2_score+p_q3_score+p_q4_score+p_q5_score)::numeric/5)::smallint,
      nullif(trim(p_comment),''),true,0,'patient',
      p_q1_score,p_q2_score,p_q3_score,p_q4_score,p_q5_score,1
    ) returning id into result_id;

    insert into public.provider_review_authors(review_id,patient_id,provider_id)
    values(result_id,auth.uid(),p_provider_id);
  else
    update public.provider_reviews
    set q1_score=p_q1_score,q2_score=p_q2_score,q3_score=p_q3_score,
        q4_score=p_q4_score,q5_score=p_q5_score,
        comment=nullif(trim(p_comment),'')
    where id=result_id;
  end if;

  return result_id;
end;
$$;

revoke all on function public.upsert_my_provider_review(uuid,smallint,smallint,smallint,smallint,smallint,text)
from public,anon;
grant execute on function public.upsert_my_provider_review(uuid,smallint,smallint,smallint,smallint,smallint,text)
to authenticated,service_role;

-- ------------------------------------------------------------
-- 6) Keep public review counts/lists aligned with "valid structured review"
-- A Doctor review must have its private Patient authorship row to count.
-- Provider stats already followed this rule; definitions are kept symmetric.
-- ------------------------------------------------------------
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
         r.rating,r.comment,r.reply,r.replied_at,r.created_at,r.edited_at,count(*) over()
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

create or replace function public.get_public_profile_stats(
  p_doctor_id uuid default null,
  p_provider_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  followers bigint:=0;
  reviews bigint:=0;
  avg_rating numeric:=null;
  following boolean:=false;
  tier text:=null;
  premium boolean:=false;
begin
  if ((p_doctor_id is not null)::int + (p_provider_id is not null)::int)<>1 then
    raise exception 'Choose exactly one Doctor or Provider';
  end if;

  if p_doctor_id is not null then
    if not public.is_doctor_publicly_listable(p_doctor_id) then return null; end if;
    select count(*) into followers from public.patient_follows where doctor_id=p_doctor_id;
    select count(*),round(avg(r.rating),2) into reviews,avg_rating
    from public.doctor_reviews r
    join public.doctor_review_authors a on a.review_id=r.id and a.doctor_id=r.doctor_id
    where r.doctor_id=p_doctor_id and r.is_published=true;
    tier:=public.doctor_public_rank_tier(p_doctor_id);
    premium:=public.is_doctor_premium(p_doctor_id);
    if auth.uid() is not null then
      select exists(select 1 from public.patient_follows where patient_id=auth.uid() and doctor_id=p_doctor_id)
      into following;
    end if;
  else
    if not exists(select 1 from public.providers where id=p_provider_id and status='approved' and verified=true) then return null; end if;
    select count(*) into followers from public.patient_follows where provider_id=p_provider_id;
    select count(*),round(avg(coalesce(r.structured_rating,r.rating::numeric)),2) into reviews,avg_rating
    from public.provider_reviews r
    join public.provider_review_authors a on a.review_id=r.id
    where r.provider_id=p_provider_id and r.review_source='patient' and r.is_published=true;
    tier:=public.provider_public_rank_tier(p_provider_id);
    premium:=public.is_provider_premium(p_provider_id);
    if auth.uid() is not null then
      select exists(select 1 from public.patient_follows where patient_id=auth.uid() and provider_id=p_provider_id)
      into following;
    end if;
  end if;

  return jsonb_build_object(
    'follower_count',followers,
    'review_count',reviews,
    'average_rating',avg_rating,
    'is_following',following,
    'ranking_tier',tier,
    'is_premium',premium
  );
end;
$$;

revoke all on function public.get_public_profile_stats(uuid,uuid) from public;
grant execute on function public.get_public_profile_stats(uuid,uuid) to anon,authenticated,service_role;

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
    (select count(*)
       from public.doctor_reviews r
       join public.doctor_review_authors a on a.review_id=r.id and a.doctor_id=r.doctor_id
      where r.doctor_id=d.id and r.is_published=true),
    (select round(avg(r.rating),2)
       from public.doctor_reviews r
       join public.doctor_review_authors a on a.review_id=r.id and a.doctor_id=r.doctor_id
      where r.doctor_id=d.id and r.is_published=true),
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
-- 7) Deployment assertions
-- ------------------------------------------------------------
do $$
begin
  if not exists(
    select 1
    from pg_constraint c
    join pg_class t on t.oid=c.conrelid
    join pg_namespace n on n.oid=t.relnamespace
    where n.nspname='public' and t.relname='doctor_review_authors' and c.contype='u'
      and pg_get_constraintdef(c.oid) ilike '%patient_id%doctor_id%'
  ) then raise exception 'STEP 44 failed: one Patient + one Doctor review uniqueness is missing'; end if;

  if not exists(
    select 1
    from pg_constraint c
    join pg_class t on t.oid=c.conrelid
    join pg_namespace n on n.oid=t.relnamespace
    where n.nspname='public' and t.relname='provider_review_authors' and c.contype='u'
      and pg_get_constraintdef(c.oid) ilike '%patient_id%provider_id%'
  ) then raise exception 'STEP 44 failed: one Patient + one Provider review uniqueness is missing'; end if;

  if has_function_privilege('anon','public.upsert_my_doctor_review(uuid,smallint,smallint,smallint,smallint,smallint,text)','EXECUTE')
     or has_function_privilege('anon','public.upsert_my_provider_review(uuid,smallint,smallint,smallint,smallint,smallint,text)','EXECUTE') then
    raise exception 'STEP 44 failed: anonymous review mutation must stay revoked';
  end if;

  if not has_function_privilege('authenticated','public.upsert_my_doctor_review(uuid,smallint,smallint,smallint,smallint,smallint,text)','EXECUTE')
     or not has_function_privilege('authenticated','public.upsert_my_provider_review(uuid,smallint,smallint,smallint,smallint,smallint,text)','EXECUTE') then
    raise exception 'STEP 44 failed: authenticated review upsert grant missing';
  end if;

  if not has_function_privilege('anon','public.get_public_structured_review_summary(uuid,uuid)','EXECUTE')
     or not has_function_privilege('anon','public.get_public_structured_review_questions()','EXECUTE') then
    raise exception 'STEP 44 failed: public review read RPC grant missing';
  end if;

  if has_table_privilege('authenticated','public.doctor_reviews','INSERT')
     or has_table_privilege('authenticated','public.doctor_reviews','DELETE') then
    raise exception 'STEP 44 failed: direct Doctor review mutation must stay revoked';
  end if;
end $$;
