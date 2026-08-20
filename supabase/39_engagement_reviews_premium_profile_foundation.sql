-- ============================================================
-- DOCBD.INFO — STEP 39
-- PATIENT ENGAGEMENT + STRUCTURED REVIEWS + PROFILE CONTENT
-- + INTERACTION ANALYTICS + PREMIUM/RANKING DATA FOUNDATION
-- Run after Step 38. Safe to re-run.
--
-- IMPORTANT:
-- - Reuses existing profiles/doctors/providers/doctor_provider_links/
--   chamber_schedules/provider website content/site_settings/referrals.
-- - Does NOT replace Doctor Public Profile, Provider Public Profile,
--   appointments, verification, Near Me, distance, or existing CMS.
-- - Provider website tables from Step 22 remain canonical for Hospital.
-- ============================================================

-- ------------------------------------------------------------
-- 1) BILINGUAL ABOUT FIELDS (legacy fields remain valid fallback)
-- ------------------------------------------------------------
alter table public.doctors
  add column if not exists bio_bn text,
  add column if not exists bio_en text;

update public.doctors
set bio_bn = bio
where bio_bn is null and nullif(trim(coalesce(bio,'')),'') is not null;

alter table public.providers
  add column if not exists about_bn text,
  add column if not exists about_en text;

update public.providers
set about_bn = short_description
where about_bn is null and nullif(trim(coalesce(short_description,'')),'') is not null;

-- Existing profiles.preferred_language is intentionally reused for signed-in
-- user language preference. No duplicate language-preference table is created.

-- ------------------------------------------------------------
-- 2) PUBLIC REVIEW QUESTIONNAIRE / RANKING SETTINGS
-- Existing site_settings CMS is reused.
-- ------------------------------------------------------------
insert into public.site_settings(setting_key,setting_value,is_public,description)
values(
  'structured_review_questions',
  jsonb_build_object(
    'version',1,
    'doctor',jsonb_build_array(
      jsonb_build_object('key','q1','bn','ব্যবহার ও পেশাদারিত্ব','en','Professionalism and behavior'),
      jsonb_build_object('key','q2','bn','রোগ ও চিকিৎসা বুঝিয়ে বলা','en','Explanation and communication'),
      jsonb_build_object('key','q3','bn','সময় ও মনোযোগ','en','Time and attention'),
      jsonb_build_object('key','q4','bn','চিকিৎসা অভিজ্ঞতায় আস্থা','en','Confidence in care'),
      jsonb_build_object('key','q5','bn','সামগ্রিক অভিজ্ঞতা','en','Overall experience')
    ),
    'provider',jsonb_build_array(
      jsonb_build_object('key','q1','bn','স্টাফের ব্যবহার','en','Staff behavior'),
      jsonb_build_object('key','q2','bn','পরিচ্ছন্নতা ও পরিবেশ','en','Cleanliness and environment'),
      jsonb_build_object('key','q3','bn','সেবার গতি ও ব্যবস্থাপনা','en','Service speed and management'),
      jsonb_build_object('key','q4','bn','সুবিধা ও সেবার মান','en','Facilities and quality'),
      jsonb_build_object('key','q5','bn','সামগ্রিক অভিজ্ঞতা','en','Overall experience')
    )
  ),
  true,
  'Five-question structured review questionnaire. Public read; Admin-managed later through existing CMS.'
)
on conflict(setting_key) do nothing;

insert into public.site_settings(setting_key,setting_value,is_public,description)
values(
  'directory_ranking_policy',
  jsonb_build_object('new_entity_days',30,'tiers',jsonb_build_array('premium','verified','new','unverified')),
  false,
  'Internal directory ranking defaults. Does not override publication/security eligibility.'
)
on conflict(setting_key) do nothing;

-- ------------------------------------------------------------
-- 3) PATIENT FOLLOW / SAVE
-- One table supports Doctor OR Hospital/Chamber without polymorphic FKs.
-- ------------------------------------------------------------
create table if not exists public.patient_follows (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.profiles(id) on delete cascade,
  doctor_id uuid references public.doctors(id) on delete cascade,
  provider_id uuid references public.providers(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint patient_follows_one_target check (
    (case when doctor_id is not null then 1 else 0 end) +
    (case when provider_id is not null then 1 else 0 end) = 1
  )
);

create unique index if not exists ux_patient_follows_doctor
  on public.patient_follows(patient_id,doctor_id)
  where doctor_id is not null;
create unique index if not exists ux_patient_follows_provider
  on public.patient_follows(patient_id,provider_id)
  where provider_id is not null;
create index if not exists idx_patient_follows_doctor
  on public.patient_follows(doctor_id,created_at desc)
  where doctor_id is not null;
create index if not exists idx_patient_follows_provider
  on public.patient_follows(provider_id,created_at desc)
  where provider_id is not null;

alter table public.patient_follows enable row level security;

drop policy if exists "patient_follows_read" on public.patient_follows;
create policy "patient_follows_read"
on public.patient_follows for select to authenticated
using (patient_id=auth.uid() or public.is_admin_or_above());

-- Mutation is intentionally RPC-only. This keeps target/publication checks
-- centralized and prevents a Doctor/Provider account from forging followers.
revoke insert,update,delete on table public.patient_follows
from public,anon,authenticated;
grant select on table public.patient_follows to authenticated;

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
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists(
    select 1 from public.profiles
    where id=auth.uid() and role='patient' and account_status='active'
  ) then raise exception 'Only an active Patient account can follow/save profiles'; end if;
  if ((p_doctor_id is not null)::int + (p_provider_id is not null)::int)<>1 then
    raise exception 'Choose exactly one Doctor or Provider';
  end if;

  if p_doctor_id is not null and not public.is_doctor_publicly_listable(p_doctor_id) then
    raise exception 'Doctor is not available for public follow/save';
  end if;
  if p_provider_id is not null and not exists(
    select 1 from public.providers
    where id=p_provider_id and status='approved' and verified=true
  ) then raise exception 'Hospital/Provider is not available for public follow/save'; end if;

  if coalesce(p_follow,true) then
    begin
      insert into public.patient_follows(patient_id,doctor_id,provider_id)
      values(auth.uid(),p_doctor_id,p_provider_id);
    exception when unique_violation then null;
    end;
  else
    delete from public.patient_follows
    where patient_id=auth.uid()
      and doctor_id is not distinct from p_doctor_id
      and provider_id is not distinct from p_provider_id;
  end if;

  if p_doctor_id is not null then
    select count(*) into total_followers from public.patient_follows where doctor_id=p_doctor_id;
  else
    select count(*) into total_followers from public.patient_follows where provider_id=p_provider_id;
  end if;

  return jsonb_build_object('following',coalesce(p_follow,true),'follower_count',total_followers);
end;
$$;

revoke all on function public.toggle_my_follow(uuid,uuid,boolean) from public,anon;
grant execute on function public.toggle_my_follow(uuid,uuid,boolean) to authenticated,service_role;

-- ------------------------------------------------------------
-- 4) DOCTOR STRUCTURED REVIEWS
-- Content and patient-authorship are separated so public rows never expose
-- the Patient account UUID. One Patient + one Doctor is unique in authorship.
-- ------------------------------------------------------------
create table if not exists public.doctor_reviews (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  reviewer_name text not null,
  q1_score smallint not null check(q1_score between 1 and 5),
  q2_score smallint not null check(q2_score between 1 and 5),
  q3_score smallint not null check(q3_score between 1 and 5),
  q4_score smallint not null check(q4_score between 1 and 5),
  q5_score smallint not null check(q5_score between 1 and 5),
  rating numeric(3,2) generated always as (
    round((q1_score+q2_score+q3_score+q4_score+q5_score)::numeric/5,2)
  ) stored,
  comment text,
  reply jsonb,
  replied_at timestamptz,
  is_published boolean not null default true,
  moderation_note text,
  review_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  edited_at timestamptz
);

create table if not exists public.doctor_review_authors (
  review_id uuid primary key references public.doctor_reviews(id) on delete cascade,
  patient_id uuid not null references public.profiles(id) on delete cascade,
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(patient_id,doctor_id)
);

create index if not exists idx_doctor_reviews_public
  on public.doctor_reviews(doctor_id,is_published,created_at desc);
create index if not exists idx_doctor_review_authors_patient
  on public.doctor_review_authors(patient_id,doctor_id);

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
  end if;
  return new;
end;
$$;

drop trigger if exists trg_doctor_reviews_updated_at on public.doctor_reviews;
create trigger trg_doctor_reviews_updated_at
before update on public.doctor_reviews
for each row execute function public.set_doctor_review_updated_at();

alter table public.doctor_reviews enable row level security;
alter table public.doctor_review_authors enable row level security;

drop policy if exists "doctor_reviews_public_read" on public.doctor_reviews;
create policy "doctor_reviews_public_read"
on public.doctor_reviews for select
using (
  public.is_admin_or_above()
  or (
    is_published=true
    and public.is_doctor_publicly_listable(doctor_id)
  )
  or exists(
    select 1 from public.doctor_review_authors a
    where a.review_id=id and a.patient_id=auth.uid()
  )
);

-- Doctor cannot update/delete Patient review content. Patient writes only by RPC.
drop policy if exists "doctor_reviews_admin_update" on public.doctor_reviews;
create policy "doctor_reviews_admin_update"
on public.doctor_reviews for update to authenticated
using (public.is_admin_or_above())
with check (public.is_admin_or_above());

-- No ordinary delete policy for structured Doctor reviews.

drop policy if exists "doctor_review_authors_read" on public.doctor_review_authors;
create policy "doctor_review_authors_read"
on public.doctor_review_authors for select to authenticated
using (patient_id=auth.uid() or public.is_admin_or_above());

revoke insert,update,delete on table public.doctor_reviews,public.doctor_review_authors
from public,anon,authenticated;
grant select on table public.doctor_reviews to anon,authenticated;
grant select on table public.doctor_review_authors to authenticated;

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
  where id=auth.uid() and role='patient' and account_status='active';
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
  where patient_id=auth.uid() and doctor_id=p_doctor_id
  for update;

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
exception when unique_violation then
  select review_id into result_id
  from public.doctor_review_authors
  where patient_id=auth.uid() and doctor_id=p_doctor_id;
  if result_id is null then raise; end if;
  return result_id;
end;
$$;

revoke all on function public.upsert_my_doctor_review(uuid,smallint,smallint,smallint,smallint,smallint,text)
from public,anon;
grant execute on function public.upsert_my_doctor_review(uuid,smallint,smallint,smallint,smallint,smallint,text)
to authenticated,service_role;

-- ------------------------------------------------------------
-- 5) REUSE / HARDEN EXISTING PROVIDER REVIEWS
-- Existing provider-created testimonials remain review_source='provider'.
-- New Patient reviews are review_source='patient' and have private authorship.
-- ------------------------------------------------------------
alter table public.provider_reviews
  add column if not exists review_source text not null default 'provider'
    check(review_source in ('provider','patient')),
  add column if not exists q1_score smallint check(q1_score between 1 and 5),
  add column if not exists q2_score smallint check(q2_score between 1 and 5),
  add column if not exists q3_score smallint check(q3_score between 1 and 5),
  add column if not exists q4_score smallint check(q4_score between 1 and 5),
  add column if not exists q5_score smallint check(q5_score between 1 and 5),
  add column if not exists structured_rating numeric(3,2) generated always as (
    case when q1_score is not null and q2_score is not null and q3_score is not null
              and q4_score is not null and q5_score is not null
      then round((q1_score+q2_score+q3_score+q4_score+q5_score)::numeric/5,2)
      else null end
  ) stored,
  add column if not exists moderation_note text,
  add column if not exists review_version integer not null default 1,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists edited_at timestamptz;

create table if not exists public.provider_review_authors (
  review_id uuid primary key references public.provider_reviews(id) on delete cascade,
  patient_id uuid not null references public.profiles(id) on delete cascade,
  provider_id uuid not null references public.providers(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(patient_id,provider_id)
);

create index if not exists idx_provider_review_authors_patient
  on public.provider_review_authors(patient_id,provider_id);
create index if not exists idx_provider_reviews_patient_source
  on public.provider_reviews(provider_id,review_source,is_published,created_at desc);

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
      -- Admin may moderate publication/note, but normal UI should not rewrite the Patient content.
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
        -- reply/replied_at/sort_order are allowed for owned Provider only.
      else
        raise exception 'Not authorized to change this Patient review';
      end if;
    end if;

    if new.q1_score is null or new.q2_score is null or new.q3_score is null
       or new.q4_score is null or new.q5_score is null then
      raise exception 'Patient review requires all five scores';
    end if;
    new.rating=round((new.q1_score+new.q2_score+new.q3_score+new.q4_score+new.q5_score)::numeric/5)::smallint;
    if old.q1_score is distinct from new.q1_score
       or old.q2_score is distinct from new.q2_score
       or old.q3_score is distinct from new.q3_score
       or old.q4_score is distinct from new.q4_score
       or old.q5_score is distinct from new.q5_score
       or old.comment is distinct from new.comment then
      new.edited_at=now();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_provider_reviews_guard on public.provider_reviews;
create trigger trg_provider_reviews_guard
before insert or update on public.provider_reviews
for each row execute function public.guard_provider_review_changes();

alter table public.provider_review_authors enable row level security;

drop policy if exists "provider_review_authors_read" on public.provider_review_authors;
create policy "provider_review_authors_read"
on public.provider_review_authors for select to authenticated
using (patient_id=auth.uid() or public.is_admin_or_above());

revoke insert,update,delete on table public.provider_review_authors
from public,anon,authenticated;
grant select on table public.provider_review_authors to authenticated;

-- Replace only provider_reviews policies; all other Step 22 provider content
-- policies remain unchanged.
drop policy if exists "provider_reviews_select" on public.provider_reviews;
drop policy if exists "provider_reviews_insert" on public.provider_reviews;
drop policy if exists "provider_reviews_update" on public.provider_reviews;
drop policy if exists "provider_reviews_delete" on public.provider_reviews;

alter table public.provider_reviews enable row level security;

create policy "provider_reviews_select"
on public.provider_reviews for select
using (
  public.is_admin_or_above()
  or exists(select 1 from public.providers p where p.id=provider_id and p.owner_user_id=auth.uid())
  or (
    is_published=true
    and exists(select 1 from public.providers p where p.id=provider_id and p.status='approved' and p.verified=true)
  )
  or exists(
    select 1 from public.provider_review_authors a
    where a.review_id=id and a.patient_id=auth.uid()
  )
);

create policy "provider_reviews_insert"
on public.provider_reviews for insert to authenticated
with check (
  public.is_admin_or_above()
  or (
    review_source='provider'
    and exists(select 1 from public.providers p where p.id=provider_id and p.owner_user_id=auth.uid())
  )
);

create policy "provider_reviews_update"
on public.provider_reviews for update to authenticated
using (
  public.is_admin_or_above()
  or exists(select 1 from public.providers p where p.id=provider_id and p.owner_user_id=auth.uid())
)
with check (
  public.is_admin_or_above()
  or exists(select 1 from public.providers p where p.id=provider_id and p.owner_user_id=auth.uid())
);

create policy "provider_reviews_delete"
on public.provider_reviews for delete to authenticated
using (
  review_source='provider'
  and (
    public.is_admin_or_above()
    or exists(select 1 from public.providers p where p.id=provider_id and p.owner_user_id=auth.uid())
  )
);

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
  where id=auth.uid() and role='patient' and account_status='active';
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
  where patient_id=auth.uid() and provider_id=p_provider_id
  for update;

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
exception when unique_violation then
  select review_id into result_id
  from public.provider_review_authors
  where patient_id=auth.uid() and provider_id=p_provider_id;
  if result_id is null then raise; end if;
  return result_id;
end;
$$;

revoke all on function public.upsert_my_provider_review(uuid,smallint,smallint,smallint,smallint,smallint,text)
from public,anon;
grant execute on function public.upsert_my_provider_review(uuid,smallint,smallint,smallint,smallint,smallint,text)
to authenticated,service_role;

create or replace function public.reply_to_my_provider_review(
  p_review_id uuid,
  p_reply_bn text default null,
  p_reply_en text default null
)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists(
    select 1 from public.provider_reviews r
    join public.providers p on p.id=r.provider_id
    join public.profiles me on me.id=auth.uid()
    where r.id=p_review_id and p.owner_user_id=auth.uid()
      and me.account_status='active' and me.role in ('hospital','chamber')
  ) then raise exception 'Review not found or Provider not owned by this account'; end if;

  update public.provider_reviews
  set reply=case
        when nullif(trim(coalesce(p_reply_bn,'')),'') is null
         and nullif(trim(coalesce(p_reply_en,'')),'') is null then null
        else jsonb_build_object('bn',nullif(trim(p_reply_bn),''),'en',nullif(trim(p_reply_en),''))
      end,
      replied_at=case
        when nullif(trim(coalesce(p_reply_bn,'')),'') is null
         and nullif(trim(coalesce(p_reply_en,'')),'') is null then null
        else now()
      end
  where id=p_review_id;
  return true;
end;
$$;

revoke all on function public.reply_to_my_provider_review(uuid,text,text) from public,anon;
grant execute on function public.reply_to_my_provider_review(uuid,text,text) to authenticated,service_role;

-- ------------------------------------------------------------
-- 6) REVIEW READ / EDIT STATE / ADMIN MODERATION RPCs
-- ------------------------------------------------------------
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
      'rating',r.rating,'comment',r.comment,'is_published',r.is_published,
      'created_at',r.created_at,'edited_at',r.edited_at
    ) into result
    from public.doctor_review_authors a
    join public.doctor_reviews r on r.id=a.review_id
    where a.patient_id=auth.uid() and a.doctor_id=p_doctor_id;
  else
    select jsonb_build_object(
      'review_id',r.id,'target_type','provider','q1_score',r.q1_score,'q2_score',r.q2_score,
      'q3_score',r.q3_score,'q4_score',r.q4_score,'q5_score',r.q5_score,
      'rating',coalesce(r.structured_rating,r.rating::numeric),'comment',r.comment,
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
         r.rating,r.comment,r.reply,r.replied_at,r.created_at,r.edited_at,count(*) over()
  from public.doctor_reviews r
  where r.doctor_id=p_doctor_id
    and r.is_published=true
    and public.is_doctor_publicly_listable(r.doctor_id)
  order by r.created_at desc,r.id
  limit greatest(1,least(p_limit,100)) offset greatest(p_offset,0);
$$;

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
         coalesce(r.structured_rating,r.rating::numeric),r.comment,r.reply,r.replied_at,
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

revoke all on function public.get_public_doctor_reviews(uuid,integer,integer) from public;
grant execute on function public.get_public_doctor_reviews(uuid,integer,integer) to anon,authenticated,service_role;
revoke all on function public.get_public_provider_structured_reviews(uuid,integer,integer) from public;
grant execute on function public.get_public_provider_structured_reviews(uuid,integer,integer) to anon,authenticated,service_role;

create or replace function public.moderate_structured_review(
  p_entity_type text,
  p_review_id uuid,
  p_is_published boolean,
  p_note text default null
)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
begin
  if not public.is_admin_or_above() then raise exception 'Admin access required'; end if;
  if p_entity_type='doctor' then
    update public.doctor_reviews
    set is_published=coalesce(p_is_published,false),moderation_note=nullif(trim(p_note),'')
    where id=p_review_id;
  elsif p_entity_type in ('provider','hospital','chamber') then
    update public.provider_reviews
    set is_published=coalesce(p_is_published,false),moderation_note=nullif(trim(p_note),'')
    where id=p_review_id;
  else
    raise exception 'Unsupported review entity type';
  end if;
  if not found then raise exception 'Review not found'; end if;

  insert into public.admin_audit_logs(actor_id,action,target_type,target_id,metadata)
  values(auth.uid(),'structured_review_moderated',p_entity_type,p_review_id::text,
    jsonb_build_object('is_published',p_is_published,'note',nullif(trim(p_note),'')));
  return true;
end;
$$;

revoke all on function public.moderate_structured_review(text,uuid,boolean,text) from public,anon;
grant execute on function public.moderate_structured_review(text,uuid,boolean,text) to authenticated,service_role;

-- ------------------------------------------------------------
-- 7) DOCTOR PROFILE SLIDER (MAXIMUM 4)
-- Existing public-images storage bucket is reused. Path ownership remains
-- governed by existing storage policies: first folder segment = auth.uid().
-- ------------------------------------------------------------
create table if not exists public.doctor_slider_images (
  id bigint generated always as identity primary key,
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  image text not null,
  caption jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_doctor_slider_images
  on public.doctor_slider_images(doctor_id,sort_order,id);

create or replace function public.enforce_doctor_slider_limit()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  -- Serialize slider mutations per Doctor so concurrent uploads cannot race past
  -- the four-image limit.
  perform 1 from public.doctors where id=new.doctor_id for update;
  if tg_op='INSERT' then
    if (select count(*) from public.doctor_slider_images where doctor_id=new.doctor_id)>=4 then
      raise exception 'A Doctor profile can contain at most 4 slider images';
    end if;
  elsif old.doctor_id is distinct from new.doctor_id then
    if (select count(*) from public.doctor_slider_images where doctor_id=new.doctor_id)>=4 then
      raise exception 'A Doctor profile can contain at most 4 slider images';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_doctor_slider_limit on public.doctor_slider_images;
create trigger trg_doctor_slider_limit
before insert or update of doctor_id on public.doctor_slider_images
for each row execute function public.enforce_doctor_slider_limit();

drop trigger if exists trg_doctor_slider_updated_at on public.doctor_slider_images;
create trigger trg_doctor_slider_updated_at
before update on public.doctor_slider_images
for each row execute function public.set_updated_at();

alter table public.doctor_slider_images enable row level security;

drop policy if exists "doctor_slider_read" on public.doctor_slider_images;
create policy "doctor_slider_read"
on public.doctor_slider_images for select
using (
  public.is_admin_or_above()
  or doctor_id=auth.uid()
  or (is_active=true and public.is_doctor_publicly_listable(doctor_id))
);

drop policy if exists "doctor_slider_insert" on public.doctor_slider_images;
create policy "doctor_slider_insert"
on public.doctor_slider_images for insert to authenticated
with check (
  (
    doctor_id=auth.uid()
    and image like auth.uid()::text||'/%'
    and exists(select 1 from public.profiles where id=auth.uid() and role='doctor' and account_status='active')
  )
  or public.is_admin_or_above()
);

drop policy if exists "doctor_slider_update" on public.doctor_slider_images;
create policy "doctor_slider_update"
on public.doctor_slider_images for update to authenticated
using (doctor_id=auth.uid() or public.is_admin_or_above())
with check (
  (doctor_id=auth.uid() and image like auth.uid()::text||'/%')
  or public.is_admin_or_above()
);

drop policy if exists "doctor_slider_delete" on public.doctor_slider_images;
create policy "doctor_slider_delete"
on public.doctor_slider_images for delete to authenticated
using (doctor_id=auth.uid() or public.is_admin_or_above());

grant select on table public.doctor_slider_images to anon,authenticated;
grant insert,update,delete on table public.doctor_slider_images to authenticated;
grant usage,select on sequence public.doctor_slider_images_id_seq to authenticated;

-- ------------------------------------------------------------
-- 8) DOCTOR SERVICES / TREATMENT COSTS / INVESTIGATION COSTS
-- Mirrors the already-existing Provider content shape; no Provider duplicate.
-- ------------------------------------------------------------
create table if not exists public.doctor_services (
  id bigint generated always as identity primary key,
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  name jsonb not null,
  description jsonb,
  icon text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.doctor_treatment_costs (
  id bigint generated always as identity primary key,
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  name jsonb not null,
  cost jsonb not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.doctor_investigation_costs (
  id bigint generated always as identity primary key,
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  name jsonb not null,
  cost jsonb not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_doctor_services on public.doctor_services(doctor_id,sort_order,id);
create index if not exists idx_doctor_treatment_costs on public.doctor_treatment_costs(doctor_id,sort_order,id);
create index if not exists idx_doctor_investigation_costs on public.doctor_investigation_costs(doctor_id,sort_order,id);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['doctor_services','doctor_treatment_costs','doctor_investigation_costs'] LOOP
    EXECUTE format('alter table public.%I enable row level security',t);
    EXECUTE format('drop policy if exists %I on public.%I',t||'_read',t);
    EXECUTE format('drop policy if exists %I on public.%I',t||'_insert',t);
    EXECUTE format('drop policy if exists %I on public.%I',t||'_update',t);
    EXECUTE format('drop policy if exists %I on public.%I',t||'_delete',t);
    EXECUTE format($p$create policy %I on public.%I for select using (
      public.is_admin_or_above() or doctor_id=auth.uid()
      or public.is_doctor_publicly_listable(doctor_id)
    )$p$,t||'_read',t);
    EXECUTE format($p$create policy %I on public.%I for insert to authenticated with check (
      public.is_admin_or_above()
      or (doctor_id=auth.uid() and exists(
        select 1 from public.profiles p where p.id=auth.uid() and p.role='doctor' and p.account_status='active'
      ))
    )$p$,t||'_insert',t);
    EXECUTE format($p$create policy %I on public.%I for update to authenticated using (
      public.is_admin_or_above() or doctor_id=auth.uid()
    ) with check (
      public.is_admin_or_above() or doctor_id=auth.uid()
    )$p$,t||'_update',t);
    EXECUTE format($p$create policy %I on public.%I for delete to authenticated using (
      public.is_admin_or_above() or doctor_id=auth.uid()
    )$p$,t||'_delete',t);
  END LOOP;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['doctor_services','doctor_treatment_costs','doctor_investigation_costs'] LOOP
    EXECUTE format('drop trigger if exists %I on public.%I','trg_'||t||'_updated_at',t);
    EXECUTE format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()','trg_'||t||'_updated_at',t);
  END LOOP;
END $$;

grant select on table public.doctor_services,public.doctor_treatment_costs,public.doctor_investigation_costs
to anon,authenticated;
grant insert,update,delete on table public.doctor_services,public.doctor_treatment_costs,public.doctor_investigation_costs
to authenticated;
grant usage,select on sequence public.doctor_services_id_seq,public.doctor_treatment_costs_id_seq,public.doctor_investigation_costs_id_seq
to authenticated;

-- ------------------------------------------------------------
-- 9) STRUCTURED PROVIDER OPENING HOURS
-- Doctor chamber visiting hours continue to use chamber_schedules.
-- ------------------------------------------------------------
create table if not exists public.provider_opening_hours (
  id bigint generated always as identity primary key,
  provider_id uuid not null references public.providers(id) on delete cascade,
  day_of_week smallint not null check(day_of_week between 0 and 6),
  open_time time,
  close_time time,
  is_closed boolean not null default false,
  is_24_hours boolean not null default false,
  note jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider_id,day_of_week),
  constraint provider_opening_hours_valid_time check(
    (is_closed=true and is_24_hours=false and open_time is null and close_time is null)
    or (is_closed=false and is_24_hours=true and open_time is null and close_time is null)
    or (is_closed=false and is_24_hours=false and open_time is not null and close_time is not null and open_time<>close_time)
  )
);

create index if not exists idx_provider_opening_hours
  on public.provider_opening_hours(provider_id,day_of_week);

drop trigger if exists trg_provider_opening_hours_updated_at on public.provider_opening_hours;
create trigger trg_provider_opening_hours_updated_at
before update on public.provider_opening_hours
for each row execute function public.set_updated_at();

alter table public.provider_opening_hours enable row level security;

drop policy if exists "provider_opening_hours_read" on public.provider_opening_hours;
create policy "provider_opening_hours_read"
on public.provider_opening_hours for select
using (
  public.is_admin_or_above()
  or exists(select 1 from public.providers p where p.id=provider_id and p.owner_user_id=auth.uid())
  or exists(select 1 from public.providers p where p.id=provider_id and p.status='approved' and p.verified=true)
);

drop policy if exists "provider_opening_hours_insert" on public.provider_opening_hours;
create policy "provider_opening_hours_insert"
on public.provider_opening_hours for insert to authenticated
with check (
  public.is_admin_or_above()
  or exists(select 1 from public.providers p where p.id=provider_id and p.owner_user_id=auth.uid())
);

drop policy if exists "provider_opening_hours_update" on public.provider_opening_hours;
create policy "provider_opening_hours_update"
on public.provider_opening_hours for update to authenticated
using (
  public.is_admin_or_above()
  or exists(select 1 from public.providers p where p.id=provider_id and p.owner_user_id=auth.uid())
)
with check (
  public.is_admin_or_above()
  or exists(select 1 from public.providers p where p.id=provider_id and p.owner_user_id=auth.uid())
);

drop policy if exists "provider_opening_hours_delete" on public.provider_opening_hours;
create policy "provider_opening_hours_delete"
on public.provider_opening_hours for delete to authenticated
using (
  public.is_admin_or_above()
  or exists(select 1 from public.providers p where p.id=provider_id and p.owner_user_id=auth.uid())
);

grant select on table public.provider_opening_hours to anon,authenticated;
grant insert,update,delete on table public.provider_opening_hours to authenticated;
grant usage,select on sequence public.provider_opening_hours_id_seq to authenticated;

-- ------------------------------------------------------------
-- 10) PUBLIC PROFILE INTERACTION ANALYTICS
-- Raw rows are not exposed to Doctors/Providers. Only aggregate RPCs are.
-- No IP address/device identifier is stored.
-- ------------------------------------------------------------
create table if not exists public.profile_interactions (
  id bigint generated always as identity primary key,
  doctor_id uuid references public.doctors(id) on delete cascade,
  provider_id uuid references public.providers(id) on delete cascade,
  actor_user_id uuid references public.profiles(id) on delete set null,
  event_type text not null check(event_type in (
    'profile_view','call_click','whatsapp_click','appointment_click','map_click'
  )),
  source text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint profile_interactions_one_target check(
    (case when doctor_id is not null then 1 else 0 end) +
    (case when provider_id is not null then 1 else 0 end) = 1
  )
);

create index if not exists idx_profile_interactions_doctor
  on public.profile_interactions(doctor_id,occurred_at desc)
  where doctor_id is not null;
create index if not exists idx_profile_interactions_provider
  on public.profile_interactions(provider_id,occurred_at desc)
  where provider_id is not null;
create index if not exists idx_profile_interactions_event_time
  on public.profile_interactions(event_type,occurred_at desc);

alter table public.profile_interactions enable row level security;

drop policy if exists "profile_interactions_admin_read" on public.profile_interactions;
create policy "profile_interactions_admin_read"
on public.profile_interactions for select to authenticated
using (public.is_admin_or_above());

revoke select,insert,update,delete on table public.profile_interactions
from public,anon,authenticated;

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
declare actor uuid:=null;
begin
  if ((p_doctor_id is not null)::int + (p_provider_id is not null)::int)<>1 then
    raise exception 'Choose exactly one Doctor or Provider';
  end if;
  if p_event_type not in ('profile_view','call_click','whatsapp_click','appointment_click','map_click') then
    raise exception 'Unsupported interaction type';
  end if;
  if length(coalesce(p_source,''))>80 then raise exception 'Interaction source is too long'; end if;
  if pg_column_size(coalesce(p_metadata,'{}'::jsonb))>2048 then raise exception 'Interaction metadata is too large'; end if;

  if p_doctor_id is not null and not public.is_doctor_publicly_listable(p_doctor_id) then
    return false;
  end if;
  if p_provider_id is not null and not exists(
    select 1 from public.providers where id=p_provider_id and status='approved' and verified=true
  ) then return false; end if;

  if auth.uid() is not null and exists(
    select 1 from public.profiles where id=auth.uid() and account_status='active'
  ) then actor:=auth.uid(); end if;

  insert into public.profile_interactions(doctor_id,provider_id,actor_user_id,event_type,source,metadata)
  values(p_doctor_id,p_provider_id,actor,p_event_type,nullif(trim(p_source),''),coalesce(p_metadata,'{}'::jsonb));
  return true;
end;
$$;

revoke all on function public.record_public_profile_interaction(uuid,uuid,text,text,jsonb) from public;
grant execute on function public.record_public_profile_interaction(uuid,uuid,text,text,jsonb)
to anon,authenticated,service_role;

-- ------------------------------------------------------------
-- 11) PREMIUM MEMBERSHIP FOUNDATION
-- Membership never bypasses account/verification/publication safety rules.
-- ------------------------------------------------------------
create table if not exists public.premium_memberships (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid references public.doctors(id) on delete cascade,
  provider_id uuid references public.providers(id) on delete cascade,
  plan_code text not null default 'premium',
  status text not null default 'pending' check(status in ('pending','active','expired','cancelled')),
  starts_at timestamptz,
  expires_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint premium_memberships_one_target check(
    (case when doctor_id is not null then 1 else 0 end) +
    (case when provider_id is not null then 1 else 0 end) = 1
  ),
  constraint premium_memberships_dates check(expires_at is null or starts_at is null or expires_at>starts_at)
);

create unique index if not exists ux_active_premium_doctor
  on public.premium_memberships(doctor_id)
  where doctor_id is not null and status='active';
create unique index if not exists ux_active_premium_provider
  on public.premium_memberships(provider_id)
  where provider_id is not null and status='active';
create index if not exists idx_premium_memberships_status_expiry
  on public.premium_memberships(status,expires_at);

drop trigger if exists trg_premium_memberships_updated_at on public.premium_memberships;
create trigger trg_premium_memberships_updated_at
before update on public.premium_memberships
for each row execute function public.set_updated_at();

alter table public.premium_memberships enable row level security;

drop policy if exists "premium_memberships_read" on public.premium_memberships;
create policy "premium_memberships_read"
on public.premium_memberships for select to authenticated
using (
  public.is_admin_or_above()
  or doctor_id=auth.uid()
  or exists(select 1 from public.providers p where p.id=provider_id and p.owner_user_id=auth.uid())
);

revoke insert,update,delete on table public.premium_memberships
from public,anon,authenticated;
grant select on table public.premium_memberships to authenticated;

create or replace function public.is_doctor_premium(p_doctor_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select exists(
    select 1 from public.premium_memberships m
    where m.doctor_id=p_doctor_id and m.status='active'
      and (m.starts_at is null or m.starts_at<=now())
      and (m.expires_at is null or m.expires_at>now())
  );
$$;

create or replace function public.is_provider_premium(p_provider_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select exists(
    select 1 from public.premium_memberships m
    where m.provider_id=p_provider_id and m.status='active'
      and (m.starts_at is null or m.starts_at<=now())
      and (m.expires_at is null or m.expires_at>now())
  );
$$;

create or replace function public.admin_set_premium_membership(
  p_doctor_id uuid default null,
  p_provider_id uuid default null,
  p_plan_code text default 'premium',
  p_status text default 'active',
  p_starts_at timestamptz default now(),
  p_expires_at timestamptz default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare result_id uuid;
begin
  if not public.is_admin_or_above() then raise exception 'Admin access required'; end if;
  if ((p_doctor_id is not null)::int + (p_provider_id is not null)::int)<>1 then
    raise exception 'Choose exactly one Doctor or Provider';
  end if;
  if p_status not in ('pending','active','expired','cancelled') then raise exception 'Invalid membership status'; end if;
  if length(trim(coalesce(p_plan_code,'')))<2 then raise exception 'Plan code is required'; end if;
  if p_expires_at is not null and p_starts_at is not null and p_expires_at<=p_starts_at then
    raise exception 'Membership expiry must be after start';
  end if;
  if p_doctor_id is not null and not exists(select 1 from public.doctors where id=p_doctor_id) then
    raise exception 'Doctor not found';
  end if;
  if p_provider_id is not null and not exists(select 1 from public.providers where id=p_provider_id) then
    raise exception 'Provider not found';
  end if;

  if p_status='active' then
    update public.premium_memberships
    set status='cancelled',updated_at=now()
    where status='active'
      and doctor_id is not distinct from p_doctor_id
      and provider_id is not distinct from p_provider_id;
  end if;

  insert into public.premium_memberships(
    doctor_id,provider_id,plan_code,status,starts_at,expires_at,created_by,note
  ) values(
    p_doctor_id,p_provider_id,trim(p_plan_code),p_status,p_starts_at,p_expires_at,auth.uid(),nullif(trim(p_note),'')
  ) returning id into result_id;

  insert into public.admin_audit_logs(actor_id,action,target_type,target_id,metadata)
  values(auth.uid(),'premium_membership_set',case when p_doctor_id is not null then 'doctor' else 'provider' end,
    coalesce(p_doctor_id,p_provider_id)::text,
    jsonb_build_object('membership_id',result_id,'plan_code',p_plan_code,'status',p_status,'starts_at',p_starts_at,'expires_at',p_expires_at));
  return result_id;
end;
$$;

-- Premium helpers are internal building blocks. Public clients receive only
-- publication-safe premium/rank output through get_public_profile_stats().
revoke all on function public.is_doctor_premium(uuid) from public,anon,authenticated;
grant execute on function public.is_doctor_premium(uuid) to service_role;
revoke all on function public.is_provider_premium(uuid) from public,anon,authenticated;
grant execute on function public.is_provider_premium(uuid) to service_role;
revoke all on function public.admin_set_premium_membership(uuid,uuid,text,text,timestamptz,timestamptz,text)
from public,anon;
grant execute on function public.admin_set_premium_membership(uuid,uuid,text,text,timestamptz,timestamptz,text)
to authenticated,service_role;

-- ------------------------------------------------------------
-- 12) PUBLIC RANKING / COUNTS FOUNDATION
-- Tier order: Premium > Verified > New > Unverified.
-- This score is NEVER a publication permission check.
-- ------------------------------------------------------------
create or replace function public.doctor_public_rank_tier(p_doctor_id uuid)
returns text
language sql
stable
security definer
set search_path=public
as $$
  select case
    when public.is_doctor_premium(d.id) then 'premium'
    when d.verification_status='approved' then 'verified'
    when d.created_at>=now()-make_interval(days => greatest(1,least(coalesce((
      select case when (s.setting_value->>'new_entity_days') ~ '^[0-9]+$'
                  then (s.setting_value->>'new_entity_days')::integer else 30 end
      from public.site_settings s where s.setting_key='directory_ranking_policy'
    ),30),365))) then 'new'
    else 'unverified'
  end
  from public.doctors d where d.id=p_doctor_id;
$$;

create or replace function public.doctor_public_rank_score(p_doctor_id uuid)
returns integer
language sql
stable
security definer
set search_path=public
as $$
  select case public.doctor_public_rank_tier(p_doctor_id)
    when 'premium' then 400
    when 'verified' then 300
    when 'new' then 200
    when 'unverified' then 100
    else 0 end;
$$;

create or replace function public.provider_public_rank_tier(p_provider_id uuid)
returns text
language sql
stable
security definer
set search_path=public
as $$
  select case
    when public.is_provider_premium(p.id) then 'premium'
    when p.verified=true and p.status='approved' then 'verified'
    when p.created_at>=now()-make_interval(days => greatest(1,least(coalesce((
      select case when (s.setting_value->>'new_entity_days') ~ '^[0-9]+$'
                  then (s.setting_value->>'new_entity_days')::integer else 30 end
      from public.site_settings s where s.setting_key='directory_ranking_policy'
    ),30),365))) then 'new'
    else 'unverified'
  end
  from public.providers p where p.id=p_provider_id;
$$;

create or replace function public.provider_public_rank_score(p_provider_id uuid)
returns integer
language sql
stable
security definer
set search_path=public
as $$
  select case public.provider_public_rank_tier(p_provider_id)
    when 'premium' then 400
    when 'verified' then 300
    when 'new' then 200
    when 'unverified' then 100
    else 0 end;
$$;

-- Rank helpers are internal so unpublished entity UUIDs cannot be probed through
-- these helper functions. Public rank output is gated by get_public_profile_stats().
revoke all on function public.doctor_public_rank_tier(uuid) from public,anon,authenticated;
revoke all on function public.doctor_public_rank_score(uuid) from public,anon,authenticated;
revoke all on function public.provider_public_rank_tier(uuid) from public,anon,authenticated;
revoke all on function public.provider_public_rank_score(uuid) from public,anon,authenticated;
grant execute on function public.doctor_public_rank_tier(uuid),public.doctor_public_rank_score(uuid),
  public.provider_public_rank_tier(uuid),public.provider_public_rank_score(uuid)
to service_role;

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
    from public.doctor_reviews r where r.doctor_id=p_doctor_id and r.is_published=true;
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

-- ------------------------------------------------------------
-- 13) OWNER ANALYTICS AGGREGATES
-- Existing appointment analytics remains unchanged; next UI phase can merge
-- these engagement metrics with current appointment metrics.
-- ------------------------------------------------------------
create or replace function public.get_my_doctor_interaction_summary(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare days_back integer:=greatest(1,least(coalesce(p_days,30),365));
begin
  if not exists(select 1 from public.profiles where id=auth.uid() and role='doctor' and account_status='active') then
    raise exception 'Active Doctor account required';
  end if;
  return jsonb_build_object(
    'profile_views',(select count(*) from public.profile_interactions where doctor_id=auth.uid() and event_type='profile_view' and occurred_at>=now()-(days_back||' days')::interval),
    'call_clicks',(select count(*) from public.profile_interactions where doctor_id=auth.uid() and event_type='call_click' and occurred_at>=now()-(days_back||' days')::interval),
    'whatsapp_clicks',(select count(*) from public.profile_interactions where doctor_id=auth.uid() and event_type='whatsapp_click' and occurred_at>=now()-(days_back||' days')::interval),
    'appointment_clicks',(select count(*) from public.profile_interactions where doctor_id=auth.uid() and event_type='appointment_click' and occurred_at>=now()-(days_back||' days')::interval),
    'map_clicks',(select count(*) from public.profile_interactions where doctor_id=auth.uid() and event_type='map_click' and occurred_at>=now()-(days_back||' days')::interval),
    'followers',(select count(*) from public.patient_follows where doctor_id=auth.uid()),
    'reviews',(select count(*) from public.doctor_reviews where doctor_id=auth.uid() and is_published=true),
    'average_rating',(select round(avg(rating),2) from public.doctor_reviews where doctor_id=auth.uid() and is_published=true),
    'days',days_back
  );
end;
$$;

create or replace function public.get_my_provider_interaction_summary(
  p_provider_id uuid,
  p_days integer default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare days_back integer:=greatest(1,least(coalesce(p_days,30),365));
begin
  if not exists(
    select 1 from public.providers p
    join public.profiles me on me.id=auth.uid()
    where p.id=p_provider_id and p.owner_user_id=auth.uid()
      and me.account_status='active' and me.role in ('hospital','chamber')
  ) then raise exception 'Owned active Hospital/Provider required'; end if;

  return jsonb_build_object(
    'profile_views',(select count(*) from public.profile_interactions where provider_id=p_provider_id and event_type='profile_view' and occurred_at>=now()-(days_back||' days')::interval),
    'call_clicks',(select count(*) from public.profile_interactions where provider_id=p_provider_id and event_type='call_click' and occurred_at>=now()-(days_back||' days')::interval),
    'whatsapp_clicks',(select count(*) from public.profile_interactions where provider_id=p_provider_id and event_type='whatsapp_click' and occurred_at>=now()-(days_back||' days')::interval),
    'appointment_clicks',(select count(*) from public.profile_interactions where provider_id=p_provider_id and event_type='appointment_click' and occurred_at>=now()-(days_back||' days')::interval),
    'map_clicks',(select count(*) from public.profile_interactions where provider_id=p_provider_id and event_type='map_click' and occurred_at>=now()-(days_back||' days')::interval),
    'followers',(select count(*) from public.patient_follows where provider_id=p_provider_id),
    'reviews',(select count(*) from public.provider_reviews r join public.provider_review_authors a on a.review_id=r.id where r.provider_id=p_provider_id and r.is_published=true),
    'average_rating',(select round(avg(coalesce(r.structured_rating,r.rating::numeric)),2) from public.provider_reviews r join public.provider_review_authors a on a.review_id=r.id where r.provider_id=p_provider_id and r.is_published=true),
    'days',days_back
  );
end;
$$;

revoke all on function public.get_my_doctor_interaction_summary(integer) from public,anon;
grant execute on function public.get_my_doctor_interaction_summary(integer) to authenticated,service_role;
revoke all on function public.get_my_provider_interaction_summary(uuid,integer) from public,anon;
grant execute on function public.get_my_provider_interaction_summary(uuid,integer) to authenticated,service_role;

-- ------------------------------------------------------------
-- 14) DEGREE SEARCH FOUNDATION
-- Existing doctors.degree remains the source of truth. No duplicate degree
-- profile table is created. Trigram index improves the existing degree filter.
-- Designation parameter is intentionally kept in the existing RPC only for
-- backward compatibility; next UI phase will stop exposing/sending it.
-- ------------------------------------------------------------
create extension if not exists pg_trgm;
create index if not exists idx_doctors_degree_trgm
  on public.doctors using gin (degree gin_trgm_ops);

-- ------------------------------------------------------------
-- 15) SELF-CHECKS
-- ------------------------------------------------------------
do $assert$
begin
  if exists(
    select 1 from pg_policies
    where schemaname='public' and tablename='doctor_reviews'
      and cmd in ('INSERT','DELETE') and roles::text like '%authenticated%'
  ) then
    raise exception 'Step 39 failed: Doctor review direct INSERT/DELETE policy should not exist';
  end if;

  if has_table_privilege('authenticated','public.patient_follows','INSERT') then
    raise exception 'Step 39 failed: Patient follow direct INSERT grant remains';
  end if;

  if has_table_privilege('authenticated','public.profile_interactions','SELECT') then
    raise exception 'Step 39 failed: raw interaction rows are directly readable';
  end if;

  if not has_function_privilege('authenticated','public.toggle_my_follow(uuid,uuid,boolean)','EXECUTE') then
    raise exception 'Step 39 failed: follow RPC grant missing';
  end if;

  if not has_function_privilege('authenticated','public.upsert_my_doctor_review(uuid,smallint,smallint,smallint,smallint,smallint,text)','EXECUTE') then
    raise exception 'Step 39 failed: Doctor review RPC grant missing';
  end if;

  if has_function_privilege('anon','public.moderate_structured_review(text,uuid,boolean,text)','EXECUTE') then
    raise exception 'Step 39 failed: anonymous review moderation access remains';
  end if;

  if not exists(
    select 1 from pg_indexes
    where schemaname='public' and indexname='ux_patient_follows_doctor'
  ) then raise exception 'Step 39 failed: Doctor follow unique index missing'; end if;

  if not exists(
    select 1 from pg_indexes
    where schemaname='public' and indexname='ux_patient_follows_provider'
  ) then raise exception 'Step 39 failed: Provider follow unique index missing'; end if;

  if not exists(
    select 1 from pg_constraint c
    join pg_class t on t.oid=c.conrelid
    join pg_namespace n on n.oid=t.relnamespace
    where n.nspname='public' and t.relname='doctor_review_authors' and c.contype='u'
  ) then raise exception 'Step 39 failed: Doctor review author unique constraint missing'; end if;

  if not exists(
    select 1 from pg_constraint c
    join pg_class t on t.oid=c.conrelid
    join pg_namespace n on n.oid=t.relnamespace
    where n.nspname='public' and t.relname='provider_review_authors' and c.contype='u'
  ) then raise exception 'Step 39 failed: Provider review author unique constraint missing'; end if;
end;
$assert$;

select 'STEP 39 ENGAGEMENT / REVIEW / PROFILE / PREMIUM FOUNDATION PASSED' as result;
