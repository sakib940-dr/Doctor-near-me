-- ============================================================
-- STEP 41 — DEGREE CLASSIFICATION + GLOBAL DISCOVERY RANKING
-- Run after Step 40. Safe to re-run.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Degree normalization + admin-manageable master
-- Existing doctors.degree remains the canonical Doctor field.
-- ------------------------------------------------------------
create or replace function public.normalize_degree_text(p_value text)
returns text
language sql
immutable
as $$
  select trim(regexp_replace(
    regexp_replace(lower(coalesce(p_value,'')), '[.\-]', '', 'g'),
    '[^a-z0-9]+', ' ', 'g'
  ));
$$;

create table if not exists public.degree_master (
  id bigint generated always as identity primary key,
  name text not null,
  short_code text not null,
  normalized_code text generated always as (public.normalize_degree_text(short_code)) stored,
  qualification_level text not null check (qualification_level in ('basic','postgraduate')),
  classification text not null check (classification in ('general','specialist')),
  discipline text not null default 'other' check (discipline in ('medical','dental','public_health','other')),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(normalized_code)
);

create table if not exists public.degree_aliases (
  id bigint generated always as identity primary key,
  degree_id bigint not null references public.degree_master(id) on delete cascade,
  alias text not null,
  normalized_alias text generated always as (public.normalize_degree_text(alias)) stored,
  created_at timestamptz not null default now(),
  unique(normalized_alias)
);

create index if not exists idx_degree_master_active_order on public.degree_master(is_active,sort_order,id);
create index if not exists idx_degree_aliases_degree on public.degree_aliases(degree_id,id);

drop trigger if exists trg_degree_master_updated_at on public.degree_master;
create trigger trg_degree_master_updated_at before update on public.degree_master
for each row execute procedure public.set_updated_at();

alter table public.degree_master enable row level security;
alter table public.degree_aliases enable row level security;

drop policy if exists degree_master_select on public.degree_master;
create policy degree_master_select on public.degree_master for select using (
  is_active=true or public.is_admin_or_above()
);
drop policy if exists degree_aliases_select on public.degree_aliases;
create policy degree_aliases_select on public.degree_aliases for select using (
  exists(select 1 from public.degree_master dm where dm.id=degree_id and (dm.is_active=true or public.is_admin_or_above()))
);

revoke insert,update,delete on public.degree_master,public.degree_aliases from anon,authenticated;
grant select on public.degree_master,public.degree_aliases to anon,authenticated;
grant usage,select on sequence public.degree_master_id_seq,public.degree_aliases_id_seq to authenticated;

-- Seed only product-defined/common qualifications. Admin can extend this list.
insert into public.degree_master(name,short_code,qualification_level,classification,discipline,sort_order)
values
  ('Bachelor of Medicine and Bachelor of Surgery','MBBS','basic','general','medical',10),
  ('Bachelor of Dental Surgery','BDS','basic','general','dental',20),
  ('Fellowship of the College of Physicians and Surgeons','FCPS','postgraduate','specialist','medical',100),
  ('Master of Surgery','MS','postgraduate','specialist','medical',110),
  ('Doctor of Medicine','MD','postgraduate','specialist','medical',120),
  ('Master of Dental Surgery','MDS','postgraduate','specialist','dental',130),
  ('Doctor of Dental Surgery','DDS','postgraduate','specialist','dental',140),
  ('Master of Public Health','MPH','postgraduate','specialist','public_health',150),
  ('Membership of the Royal Colleges of Physicians','MRCP','postgraduate','specialist','medical',160),
  ('Fellowship of the Royal Colleges of Surgeons','FRCS','postgraduate','specialist','medical',170),
  ('Membership of the College of Physicians and Surgeons','MCPS','postgraduate','specialist','medical',180),
  ('Diploma in Orthopaedics','D-Ortho','postgraduate','specialist','medical',190),
  ('Postgraduate Diploma','PG Diploma','postgraduate','specialist','other',200)
on conflict (normalized_code) do update set
  name=excluded.name,
  qualification_level=excluded.qualification_level,
  classification=excluded.classification,
  discipline=excluded.discipline,
  sort_order=excluded.sort_order;

-- Useful punctuation/name aliases. Normalization also handles spaces/case.
insert into public.degree_aliases(degree_id,alias)
select dm.id,v.alias
from (values
  ('FCPS','F.C.P.S.'),('MS','M.S.'),('MD','M.D.'),('MDS','M.D.S.'),('DDS','D.D.S.'),
  ('MPH','M.P.H.'),('MRCP','M.R.C.P.'),('FRCS','F.R.C.S.'),('MCPS','M.C.P.S.'),
  ('D-Ortho','D Ortho'),('D-Ortho','D.Ortho'),('PG Diploma','Post Graduate Diploma'),('PG Diploma','Postgraduate Diploma'),('PG Diploma','Diploma')
) as v(code,alias)
join public.degree_master dm on dm.normalized_code=public.normalize_degree_text(v.code)
on conflict (normalized_alias) do nothing;

create or replace function public.degree_text_has_alias(p_degree_text text,p_alias text)
returns boolean
language sql
immutable
as $$
  select case
    when nullif(public.normalize_degree_text(p_alias),'') is null then false
    else position(
      ' '||public.normalize_degree_text(p_alias)||' '
      in ' '||public.normalize_degree_text(p_degree_text)||' '
    )>0
  end;
$$;

create or replace function public.classify_degree_text(p_degree_text text)
returns text
language sql
stable
security definer
set search_path=public
as $$
  with matched as (
    select distinct dm.id,dm.qualification_level,dm.classification,dm.discipline
    from public.degree_master dm
    where dm.is_active=true
      and (
        public.degree_text_has_alias(p_degree_text,dm.short_code)
        or public.degree_text_has_alias(p_degree_text,dm.name)
        or exists(
          select 1 from public.degree_aliases da
          where da.degree_id=dm.id and public.degree_text_has_alias(p_degree_text,da.alias)
        )
      )
  )
  select case
    when exists(select 1 from matched where classification='specialist') then 'specialist'
    when exists(select 1 from matched where classification='general' and discipline='dental') then 'general_dental'
    when exists(select 1 from matched where classification='general') then 'general'
    else 'unclassified'
  end;
$$;

create or replace function public.degree_text_matches_requested(p_degree_text text,p_requested text[])
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select coalesce(cardinality(p_requested),0)=0 or exists(
    select 1
    from unnest(p_requested) r(value)
    where exists(
      select 1
      from public.degree_master dm
      where dm.is_active=true
        and (
          dm.normalized_code=public.normalize_degree_text(r.value)
          or public.degree_text_has_alias(dm.name,r.value)
          or exists(select 1 from public.degree_aliases da where da.degree_id=dm.id and da.normalized_alias=public.normalize_degree_text(r.value))
        )
        and (
          public.degree_text_has_alias(p_degree_text,dm.short_code)
          or public.degree_text_has_alias(p_degree_text,dm.name)
          or exists(select 1 from public.degree_aliases da where da.degree_id=dm.id and public.degree_text_has_alias(p_degree_text,da.alias))
        )
    )
    or (
      not exists(
        select 1 from public.degree_master dm
        where dm.is_active=true and (
          dm.normalized_code=public.normalize_degree_text(r.value)
          or exists(select 1 from public.degree_aliases da where da.degree_id=dm.id and da.normalized_alias=public.normalize_degree_text(r.value))
        )
      )
      and public.degree_text_has_alias(p_degree_text,r.value)
    )
  );
$$;

create or replace function public.get_active_degree_master()
returns table(
  id bigint,name text,short_code text,qualification_level text,classification text,discipline text,aliases text[],sort_order integer
)
language sql
stable
security definer
set search_path=public
as $$
  select dm.id,dm.name,dm.short_code,dm.qualification_level,dm.classification,dm.discipline,
    coalesce((select array_agg(da.alias order by da.alias) from public.degree_aliases da where da.degree_id=dm.id),'{}'::text[]),
    dm.sort_order
  from public.degree_master dm
  where dm.is_active=true
  order by dm.sort_order,dm.short_code,dm.id;
$$;

create or replace function public.get_admin_degree_master()
returns table(
  id bigint,name text,short_code text,qualification_level text,classification text,discipline text,aliases text[],is_active boolean,sort_order integer
)
language plpgsql
stable
security definer
set search_path=public
as $$
begin
  if not public.is_admin_or_above() then raise exception 'Admin access required'; end if;
  return query
  select dm.id,dm.name,dm.short_code,dm.qualification_level,dm.classification,dm.discipline,
    coalesce((select array_agg(da.alias order by da.alias) from public.degree_aliases da where da.degree_id=dm.id),'{}'::text[]),
    dm.is_active,dm.sort_order
  from public.degree_master dm
  order by dm.sort_order,dm.short_code,dm.id;
end;
$$;

create or replace function public.save_admin_degree_master(
  p_id bigint,
  p_name text,
  p_short_code text,
  p_qualification_level text,
  p_classification text,
  p_discipline text,
  p_aliases text[] default '{}'::text[],
  p_is_active boolean default true,
  p_sort_order integer default 0
)
returns bigint
language plpgsql
security definer
set search_path=public
as $$
declare v_id bigint; v_alias text;
begin
  if not public.is_admin_or_above() then raise exception 'Admin access required'; end if;
  if nullif(trim(p_name),'') is null or nullif(trim(p_short_code),'') is null then raise exception 'Degree name and short code are required'; end if;
  if p_qualification_level not in ('basic','postgraduate') then raise exception 'Invalid qualification level'; end if;
  if p_classification not in ('general','specialist') then raise exception 'Invalid classification'; end if;
  if p_discipline not in ('medical','dental','public_health','other') then raise exception 'Invalid discipline'; end if;

  if p_id is null then
    insert into public.degree_master(name,short_code,qualification_level,classification,discipline,is_active,sort_order)
    values(trim(p_name),trim(p_short_code),p_qualification_level,p_classification,p_discipline,coalesce(p_is_active,true),coalesce(p_sort_order,0))
    returning id into v_id;
  else
    update public.degree_master
    set name=trim(p_name),short_code=trim(p_short_code),qualification_level=p_qualification_level,
        classification=p_classification,discipline=p_discipline,is_active=coalesce(p_is_active,true),sort_order=coalesce(p_sort_order,0)
    where id=p_id returning id into v_id;
    if v_id is null then raise exception 'Degree not found'; end if;
  end if;

  delete from public.degree_aliases where degree_id=v_id;
  foreach v_alias in array coalesce(p_aliases,'{}'::text[]) loop
    if nullif(trim(v_alias),'') is not null and public.normalize_degree_text(v_alias)<>public.normalize_degree_text(p_short_code) then
      insert into public.degree_aliases(degree_id,alias) values(v_id,trim(v_alias));
    end if;
  end loop;

  insert into public.admin_audit_logs(actor_id,action,target_type,target_id,metadata)
  values(auth.uid(),'degree_master_saved','degree_master',v_id::text,
    jsonb_build_object('short_code',trim(p_short_code),'classification',p_classification,'qualification_level',p_qualification_level,'active',coalesce(p_is_active,true)));
  return v_id;
end;
$$;

revoke all on function public.get_active_degree_master() from public;
grant execute on function public.get_active_degree_master() to anon,authenticated,service_role;
revoke all on function public.get_admin_degree_master() from public,anon;
grant execute on function public.get_admin_degree_master() to authenticated,service_role;
revoke all on function public.save_admin_degree_master(bigint,text,text,text,text,text,text[],boolean,integer) from public,anon;
grant execute on function public.save_admin_degree_master(bigint,text,text,text,text,text,text[],boolean,integer) to authenticated,service_role;
revoke all on function public.classify_degree_text(text),public.degree_text_matches_requested(text,text[]) from public,anon,authenticated;
grant execute on function public.classify_degree_text(text),public.degree_text_matches_requested(text,text[]) to service_role;

-- ------------------------------------------------------------
-- 2) Central ranking settings/helpers
-- STEP 39 already created directory_ranking_policy. Preserve it and add the
-- Near Me relevance band only when missing.
-- ------------------------------------------------------------
insert into public.site_settings(setting_key,setting_value,is_public,description)
values('directory_ranking_policy','{"new_entity_days":30,"near_me_distance_band_km":5}'::jsonb,false,
       'Central public discovery ranking policy')
on conflict (setting_key) do nothing;

update public.site_settings
set setting_value=jsonb_set(
      jsonb_set(coalesce(setting_value,'{}'::jsonb),'{new_entity_days}',coalesce(setting_value->'new_entity_days','30'::jsonb),true),
      '{near_me_distance_band_km}',coalesce(setting_value->'near_me_distance_band_km','5'::jsonb),true
    ),
    is_public=false
where setting_key='directory_ranking_policy';

create or replace function public.directory_new_entity_days()
returns integer
language sql
stable
security definer
set search_path=public
as $$
  select greatest(1,least(coalesce((
    select case when (setting_value->>'new_entity_days') ~ '^[0-9]+$' then (setting_value->>'new_entity_days')::integer end
    from public.site_settings where setting_key='directory_ranking_policy'
  ),30),365));
$$;

create or replace function public.directory_near_me_distance_band_km()
returns double precision
language sql
stable
security definer
set search_path=public
as $$
  select greatest(1::double precision,least(coalesce((
    select case when (setting_value->>'near_me_distance_band_km') ~ '^[0-9]+([.][0-9]+)?$' then (setting_value->>'near_me_distance_band_km')::double precision end
    from public.site_settings where setting_key='directory_ranking_policy'
  ),5::double precision),50::double precision));
$$;

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
    when d.created_at>=now()-make_interval(days => public.directory_new_entity_days()) then 'new'
    else 'unverified'
  end
  from public.doctors d where d.id=p_doctor_id;
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
    when p.created_at>=now()-make_interval(days => public.directory_new_entity_days()) then 'new'
    else 'unverified'
  end
  from public.providers p where p.id=p_provider_id;
$$;

create or replace function public.doctor_near_me_priority_score(p_doctor_id uuid,p_distance_km double precision)
returns double precision
language sql
stable
security definer
set search_path=public
as $$
  select public.doctor_public_rank_score(p_doctor_id)::double precision
       - floor(greatest(coalesce(p_distance_km,0),0)/public.directory_near_me_distance_band_km())*100.0;
$$;

revoke all on function public.directory_new_entity_days(),public.directory_near_me_distance_band_km(),public.doctor_near_me_priority_score(uuid,double precision) from public,anon,authenticated;
grant execute on function public.directory_new_entity_days(),public.directory_near_me_distance_band_km(),public.doctor_near_me_priority_score(uuid,double precision) to service_role;


create or replace function public.get_admin_directory_ranking_policy()
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
begin
  if not public.is_admin_or_above() then raise exception 'Admin access required'; end if;
  return jsonb_build_object(
    'new_entity_days',public.directory_new_entity_days(),
    'near_me_distance_band_km',public.directory_near_me_distance_band_km()
  );
end;
$$;

create or replace function public.save_admin_directory_ranking_policy(
  p_new_entity_days integer,
  p_near_me_distance_band_km double precision
)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare v_days integer; v_band double precision;
begin
  if not public.is_admin_or_above() then raise exception 'Admin access required'; end if;
  v_days:=greatest(1,least(coalesce(p_new_entity_days,30),365));
  v_band:=greatest(1::double precision,least(coalesce(p_near_me_distance_band_km,5),50::double precision));
  update public.site_settings
  set setting_value=jsonb_build_object('new_entity_days',v_days,'near_me_distance_band_km',v_band),
      is_public=false
  where setting_key='directory_ranking_policy';
  insert into public.admin_audit_logs(actor_id,action,target_type,target_id,metadata)
  values(auth.uid(),'directory_ranking_policy_saved','site_setting','directory_ranking_policy',
         jsonb_build_object('new_entity_days',v_days,'near_me_distance_band_km',v_band));
  return true;
end;
$$;

revoke all on function public.get_admin_directory_ranking_policy() from public,anon;
grant execute on function public.get_admin_directory_ranking_policy() to authenticated,service_role;
revoke all on function public.save_admin_directory_ranking_policy(integer,double precision) from public,anon;
grant execute on function public.save_admin_directory_ranking_policy(integer,double precision) to authenticated,service_role;

-- ------------------------------------------------------------
-- 3) Search: Degree filter is master-aware; designation argument remains only
-- for backward compatibility. Central rank tier always precedes local sorting.
-- ------------------------------------------------------------
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
  limit greatest(1,least(p_limit,100)) offset greatest(p_offset,0);
$$;

-- Area listing uses the same rank helper.
create or replace function public.doctors_by_area(
  p_district_id bigint default null,p_upazila_id bigint default null,p_limit integer default 20,p_offset integer default 0
)
returns table(doctor_id uuid,doctor_name text,avatar_url text,degree text,designation text,consultation_fee numeric,district_id bigint,upazila_id bigint)
language sql stable security definer set search_path=public
as $$
  select d.id,p.full_name,coalesce(d.profile_photo_url,p.avatar_url),d.degree,d.designation,d.consultation_fee,p.district_id,p.upazila_id
  from public.doctors d join public.profiles p on p.id=d.id
  where public.is_doctor_publicly_listable(d.id) and p.account_status='active'
    and (p_district_id is null or p.district_id=p_district_id)
    and (p_upazila_id is null or p.upazila_id=p_upazila_id)
  order by public.doctor_public_rank_score(d.id) desc,d.created_at desc,p.full_name,d.id
  limit greatest(1,least(p_limit,100)) offset greatest(p_offset,0);
$$;

-- ------------------------------------------------------------
-- 4) Marketplace modes now include derived degree classifications.
-- ------------------------------------------------------------
create or replace function public.get_public_marketplace_doctors(
  p_district_id bigint default null,p_upazila_id bigint default null,p_mode text default 'ranked',p_limit integer default 10
)
returns table(
  doctor_id uuid,doctor_name text,avatar_url text,degree text,designation text,professional_title text,
  bmdc_registration_no text,medical_college text,present_job text,consultation_fee numeric,experience_years integer,
  district_id bigint,district_name_bn text,upazila_id bigint,upazila_name_bn text,specialties jsonb,
  verification_status text,nearest_provider_id uuid,nearest_provider_name text,nearest_provider_address text,
  is_premium boolean,ranking_tier text,created_at timestamptz,total_count bigint
)
language sql stable security definer set search_path=public
as $$
  with eligible as (
    select d.id as doctor_id,p.full_name as doctor_name,coalesce(d.profile_photo_url,p.avatar_url) as avatar_url,
      d.degree,d.designation,d.professional_title,d.bmdc_registration_no,d.medical_college,d.present_job,
      d.consultation_fee,d.experience_years,p.district_id,di.name_bn as district_name_bn,p.upazila_id,up.name_bn as upazila_name_bn,
      coalesce(sp.items,'[]'::jsonb) as specialties,d.verification_status::text as verification_status,
      chamber.id as nearest_provider_id,chamber.name_bn as nearest_provider_name,chamber.address as nearest_provider_address,
      public.is_doctor_premium(d.id) as is_premium,public.doctor_public_rank_tier(d.id) as ranking_tier,d.created_at,
      public.doctor_public_rank_score(d.id) as rank_score,public.classify_degree_text(d.degree) as degree_classification
    from public.doctors d join public.profiles p on p.id=d.id
    left join public.districts di on di.id=p.district_id left join public.upazilas up on up.id=p.upazila_id
    left join lateral (
      select jsonb_agg(jsonb_build_object('id',s.id,'name_bn',s.name_bn,'name_en',s.name_en,'slug',s.slug,'is_primary',ds.is_primary)
             order by ds.is_primary desc,s.sort_order,s.name_bn) as items
      from public.doctor_specialties ds join public.specialties s on s.id=ds.specialty_id and s.is_active=true where ds.doctor_id=d.id
    ) sp on true
    left join lateral (
      select pr.id,pr.name_bn,pr.address from public.doctor_provider_links dpl join public.providers pr on pr.id=dpl.provider_id
      where dpl.doctor_id=d.id and dpl.status='approved' and pr.status='approved' and pr.verified=true
      order by (pr.district_id is not distinct from p.district_id) desc,(pr.upazila_id is not distinct from p.upazila_id) desc,pr.name_bn,pr.id limit 1
    ) chamber on true
    where p.account_status='active' and public.is_doctor_publicly_listable(d.id)
      and (p_district_id is null or p.district_id=p_district_id)
      and (p_upazila_id is null or p.upazila_id=p_upazila_id)
  )
  select e.doctor_id,e.doctor_name,e.avatar_url,e.degree,e.designation,e.professional_title,e.bmdc_registration_no,e.medical_college,e.present_job,
    e.consultation_fee,e.experience_years,e.district_id,e.district_name_bn,e.upazila_id,e.upazila_name_bn,e.specialties,e.verification_status,
    e.nearest_provider_id,e.nearest_provider_name,e.nearest_provider_address,e.is_premium,e.ranking_tier,e.created_at,count(*) over()
  from eligible e
  where coalesce(p_mode,'ranked')='ranked'
     or (p_mode='premium' and e.is_premium)
     or (p_mode='new' and e.ranking_tier='new')
     or (p_mode='general' and e.degree_classification='general')
     or (p_mode='general_dental' and e.degree_classification='general_dental')
     or (p_mode='specialist' and e.degree_classification='specialist')
  order by e.rank_score desc,
    case when p_mode='new' then e.created_at end desc,
    e.created_at desc,e.doctor_name,e.doctor_id
  limit greatest(1,least(coalesce(p_limit,10),24));
$$;

-- ------------------------------------------------------------
-- 5) Near Me = nearest chamber per Doctor, then central status + distance.
-- A 5km (admin-configurable) relevance band prevents a distant Premium profile
-- from jumping ahead of materially closer Doctors, while ranking within nearby cohorts.
-- ------------------------------------------------------------
create or replace function public.nearest_doctors(
  p_lat double precision,p_lon double precision,p_radius_km double precision default 50,
  p_district_id bigint default null,p_upazila_id bigint default null,p_limit integer default 20,p_offset integer default 0
)
returns table(
  doctor_id uuid,provider_id uuid,doctor_name text,degree text,designation text,consultation_fee numeric,
  provider_name text,provider_type text,address text,district_id bigint,upazila_id bigint,
  latitude double precision,longitude double precision,distance_km double precision
)
language sql stable security definer set search_path=public
as $$
  with candidates as (
    select d.id as doctor_id,p.id as provider_id,pr.full_name as doctor_name,d.degree,d.designation,d.consultation_fee,
      p.name_bn as provider_name,p.provider_type,p.address,p.district_id,p.upazila_id,p.latitude,p.longitude,
      public.location_distance_km(p_lat,p_lon,p.latitude,p.longitude) as raw_distance,
      row_number() over(partition by d.id order by public.location_distance_km(p_lat,p_lon,p.latitude,p.longitude),p.id) as chamber_rank
    from public.doctors d join public.profiles pr on pr.id=d.id
    join public.doctor_provider_links l on l.doctor_id=d.id and l.status='approved'
    join public.providers p on p.id=l.provider_id and p.status='approved' and p.verified=true
    where public.is_doctor_publicly_listable(d.id) and pr.account_status='active'
      and p.latitude is not null and p.longitude is not null
      and public.location_distance_km(p_lat,p_lon,p.latitude,p.longitude)<=greatest(p_radius_km,0)
      and (p_district_id is null or p.district_id=p_district_id)
      and (p_upazila_id is null or p.upazila_id=p_upazila_id)
  ), nearest as (
    select * from candidates where chamber_rank=1
  )
  select n.doctor_id,n.provider_id,n.doctor_name,n.degree,n.designation,n.consultation_fee,n.provider_name,n.provider_type,n.address,
    n.district_id,n.upazila_id,n.latitude,n.longitude,round(n.raw_distance::numeric,2)::double precision
  from nearest n
  order by public.doctor_near_me_priority_score(n.doctor_id,n.raw_distance) desc,n.raw_distance,n.doctor_name,n.doctor_id
  limit greatest(1,least(p_limit,100)) offset greatest(p_offset,0);
$$;

-- Provider Doctor list also uses the same Doctor priority.
create or replace function public.get_public_provider_doctors(p_provider_id uuid)
returns table(
  doctor_id uuid,doctor_name text,avatar_url text,degree text,designation text,professional_title text,
  bmdc_registration_no text,consultation_fee numeric,experience_years integer,district_id bigint,district_name_bn text,
  upazila_id bigint,upazila_name_bn text,specialties jsonb,available_today boolean
)
language sql stable security definer set search_path=public
as $$
  select d.id,p.full_name,coalesce(d.profile_photo_url,p.avatar_url),d.degree,d.designation,d.professional_title,d.bmdc_registration_no,
    d.consultation_fee,d.experience_years,p.district_id,dist.name_bn,p.upazila_id,upz.name_bn,
    coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name_bn',s.name_bn,'name_en',s.name_en,'slug',s.slug,'is_primary',ds.is_primary)
              order by ds.is_primary desc,s.sort_order,s.name_bn)
              from public.doctor_specialties ds join public.specialties s on s.id=ds.specialty_id and s.is_active=true where ds.doctor_id=d.id),'[]'::jsonb),
    exists(select 1 from public.chamber_schedules cs where cs.provider_id=pr.id and cs.doctor_id=d.id and cs.is_active=true
           and cs.day_of_week=extract(dow from current_date)::int)
  from public.providers pr
  join public.doctor_provider_links l on l.provider_id=pr.id and l.status='approved'
  join public.doctors d on d.id=l.doctor_id and public.is_doctor_publicly_listable(d.id)
  join public.profiles p on p.id=d.id and p.account_status='active'
  left join public.districts dist on dist.id=p.district_id left join public.upazilas upz on upz.id=p.upazila_id
  where pr.id=p_provider_id and pr.status='approved' and pr.verified=true
  order by public.doctor_public_rank_score(d.id) desc,d.created_at desc,p.full_name,d.id;
$$;

-- ------------------------------------------------------------
-- 6) Ranked Provider/Hospital directory. Existing provider publication policy
-- remains approved + verified; Premium can rank above other published providers.
-- ------------------------------------------------------------
create or replace function public.get_public_ranked_providers(
  p_district_id bigint default null,p_upazila_id bigint default null,p_limit integer default 20,p_offset integer default 0
)
returns table(
  id uuid,provider_type text,name_bn text,name_en text,slug text,logo_url text,banner_url text,phone text,address text,
  district_id bigint,upazila_id bigint,latitude double precision,longitude double precision,map_url text,verified boolean,
  short_description text,whatsapp text,email text,facebook_url text,website_url text,opening_note text,emergency_available boolean,
  ranking_tier text,is_premium boolean,total_count bigint
)
language sql stable security definer set search_path=public
as $$
  select p.id,p.provider_type,p.name_bn,p.name_en,p.slug,p.logo_url,p.banner_url,p.phone,p.address,p.district_id,p.upazila_id,
    p.latitude,p.longitude,coalesce(p.google_maps_url,p.map_url),p.verified,p.short_description,p.whatsapp,p.email,p.facebook_url,p.website_url,
    p.opening_note,p.emergency_available,public.provider_public_rank_tier(p.id),public.is_provider_premium(p.id),count(*) over()
  from public.providers p
  where p.status='approved' and p.verified=true
    and (p_district_id is null or p.district_id=p_district_id)
    and (p_upazila_id is null or p.upazila_id=p_upazila_id)
  order by public.provider_public_rank_score(p.id) desc,p.created_at desc,p.name_bn,p.id
  limit greatest(1,least(coalesce(p_limit,20),100)) offset greatest(coalesce(p_offset,0),0);
$$;

revoke all on function public.get_public_ranked_providers(bigint,bigint,integer,integer) from public;
grant execute on function public.get_public_ranked_providers(bigint,bigint,integer,integer) to anon,authenticated,service_role;

-- Reassert grants for replaced public Doctor RPCs.
revoke all on function public.search_doctors_advanced(text,bigint,bigint,bigint[],text[],text[],numeric,numeric,boolean,text,integer,integer) from public;
grant execute on function public.search_doctors_advanced(text,bigint,bigint,bigint[],text[],text[],numeric,numeric,boolean,text,integer,integer) to anon,authenticated,service_role;
revoke all on function public.doctors_by_area(bigint,bigint,integer,integer) from public;
grant execute on function public.doctors_by_area(bigint,bigint,integer,integer) to anon,authenticated,service_role;
revoke all on function public.get_public_marketplace_doctors(bigint,bigint,text,integer) from public;
grant execute on function public.get_public_marketplace_doctors(bigint,bigint,text,integer) to anon,authenticated,service_role;
revoke all on function public.nearest_doctors(double precision,double precision,double precision,bigint,bigint,integer,integer) from public;
grant execute on function public.nearest_doctors(double precision,double precision,double precision,bigint,bigint,integer,integer) to anon,authenticated,service_role;
revoke all on function public.get_public_provider_doctors(uuid) from public;
grant execute on function public.get_public_provider_doctors(uuid) to anon,authenticated,service_role;

-- Guardrails
DO $$
begin
  if not exists(select 1 from public.degree_master where normalized_code='mbbs' and classification='general') then
    raise exception 'STEP 41 failed: MBBS degree seed missing';
  end if;
  if not exists(select 1 from public.degree_master where normalized_code='fcps' and classification='specialist') then
    raise exception 'STEP 41 failed: FCPS degree seed missing';
  end if;
end $$;
