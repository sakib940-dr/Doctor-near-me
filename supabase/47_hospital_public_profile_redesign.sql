-- ============================================================
-- STEP 47 — HOSPITAL / PROVIDER PUBLIC PROFILE REDESIGN
-- Run after Step 46. Safe to re-run.
-- Reuses providers, provider_* website content, provider_opening_hours,
-- doctor_provider_links, chamber_schedules, profile_interactions and reviews.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Provider slider: maximum four rows per Provider.
-- Existing rows are not destructively deleted; future inserts are constrained.
-- The owner row lock prevents concurrent uploads from bypassing the limit.
-- ------------------------------------------------------------
create or replace function public.enforce_provider_slider_image_limit()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  existing_count integer;
begin
  perform 1 from public.providers where id=new.provider_id for update;
  select count(*)::integer into existing_count
  from public.provider_slider_images s
  where s.provider_id=new.provider_id
    and (tg_op='INSERT' or s.id<>new.id);

  if existing_count >= 4 then
    raise exception 'A Provider can have at most 4 slider images';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_provider_slider_max_four on public.provider_slider_images;
create trigger trg_provider_slider_max_four
before insert or update of provider_id on public.provider_slider_images
for each row execute function public.enforce_provider_slider_image_limit();

-- ------------------------------------------------------------
-- 2) Reuse STEP39 bilingual Provider About fields in the public directory.
-- Existing view columns remain in the same order; new columns are appended.
-- ------------------------------------------------------------
create or replace view public.public_provider_directory with (security_invoker=true) as
select
  id,
  provider_type,
  name_bn,
  name_en,
  slug,
  logo_url,
  banner_url,
  phone,
  address,
  district_id,
  upazila_id,
  latitude,
  longitude,
  coalesce(google_maps_url, map_url) as map_url,
  verified,
  short_description,
  whatsapp,
  email,
  facebook_url,
  website_url,
  opening_note,
  emergency_available,
  about_bn,
  about_en
from public.providers
where status='approved' and verified=true;

grant select on public.public_provider_directory to anon,authenticated;

-- Owner-only About update. Keep old save_my_provider_profile signature intact.
create or replace function public.update_my_provider_about(
  p_provider_id uuid,
  p_about_bn text default null,
  p_about_en text default null
)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if length(coalesce(p_about_bn,''))>4000 or length(coalesce(p_about_en,''))>4000 then
    raise exception 'About content must be 4000 characters or fewer per language';
  end if;
  update public.providers p
  set about_bn=nullif(trim(p_about_bn),''),
      about_en=nullif(trim(p_about_en),''),
      short_description=coalesce(nullif(trim(p_about_bn),''),p.short_description),
      updated_at=now()
  where p.id=p_provider_id
    and p.owner_user_id=auth.uid()
    and exists(
      select 1 from public.profiles me
      where me.id=auth.uid() and me.role in ('hospital','chamber') and me.account_status='active'
    );
  if not found then raise exception 'Provider not found or not owned by this account'; end if;
  return true;
end;
$$;

revoke all on function public.update_my_provider_about(uuid,text,text) from public,anon;
grant execute on function public.update_my_provider_about(uuid,text,text) to authenticated,service_role;

-- ------------------------------------------------------------
-- 3) Extend owner dashboard read model, without adding Provider tables.
-- ------------------------------------------------------------
create or replace function public.get_my_provider_dashboard()
returns jsonb
language sql
stable
security definer
set search_path=public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',pr.id,'provider_type',pr.provider_type,'name_bn',pr.name_bn,
    'name_en',pr.name_en,'short_description',pr.short_description,
    'about_bn',pr.about_bn,'about_en',pr.about_en,
    'logo_url',pr.logo_url,'banner_url',pr.banner_url,'phone',pr.phone,
    'whatsapp',pr.whatsapp,'email',pr.email,'facebook_url',pr.facebook_url,
    'website_url',pr.website_url,'address',pr.address,
    'district_id',pr.district_id,'upazila_id',pr.upazila_id,
    'latitude',pr.latitude,'longitude',pr.longitude,
    'google_maps_url',coalesce(pr.google_maps_url,pr.map_url),
    'opening_note',pr.opening_note,
    'emergency_available',pr.emergency_available,
    'departments',pr.departments,'services',pr.services,
    'gallery_paths',pr.gallery_paths,'status',pr.status,'verified',pr.verified,
    'doctor_links',coalesce((
      select jsonb_agg(jsonb_build_object(
        'doctor_id',d.id,'doctor_name',dp.full_name,
        'avatar_url',coalesce(d.profile_photo_url,dp.avatar_url),
        'degree',d.degree,'designation',d.designation,
        'professional_title',d.professional_title,
        'verification_status',d.verification_status,
        'link_status',l.status,'created_at',l.created_at,
        'schedules',coalesce((
          select jsonb_agg(jsonb_build_object(
            'id',cs.id,'day_of_week',cs.day_of_week,
            'start_time',cs.start_time,'end_time',cs.end_time,
            'fee',cs.fee,'note',cs.note,'is_active',cs.is_active
          ) order by cs.day_of_week,cs.start_time,cs.id)
          from public.chamber_schedules cs
          where cs.provider_id=pr.id and cs.doctor_id=d.id
        ),'[]'::jsonb)
      ) order by l.created_at desc,d.id)
      from public.doctor_provider_links l
      join public.doctors d on d.id=l.doctor_id
      join public.profiles dp on dp.id=d.id
      where l.provider_id=pr.id
    ),'[]'::jsonb)
  ) order by pr.created_at,pr.id),'[]'::jsonb)
  from public.providers pr
  join public.profiles owner on owner.id=pr.owner_user_id
  where pr.owner_user_id=auth.uid()
    and owner.role in ('hospital','chamber')
    and owner.account_status='active';
$$;

revoke all on function public.get_my_provider_dashboard() from public,anon;
grant execute on function public.get_my_provider_dashboard() to authenticated,service_role;

-- ------------------------------------------------------------
-- 4) Publication-safe compact content read model for the redesigned page.
-- ------------------------------------------------------------
create or replace function public.get_public_provider_page_content(p_provider_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=public
as $$
  select jsonb_build_object(
    'provider_id',p.id,
    'about_bn',p.about_bn,
    'about_en',p.about_en,
    'slider_images',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',s.id,'image',s.image,'caption',s.caption,'sort_order',s.sort_order
      ) order by s.sort_order,s.id)
      from (
        select * from public.provider_slider_images
        where provider_id=p.id and is_active=true
        order by sort_order,id limit 4
      ) s
    ),'[]'::jsonb),
    'opening_hours',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',h.id,'day_of_week',h.day_of_week,'open_time',h.open_time,
        'close_time',h.close_time,'is_closed',h.is_closed,
        'is_24_hours',h.is_24_hours,'note',h.note
      ) order by h.day_of_week)
      from public.provider_opening_hours h where h.provider_id=p.id
    ),'[]'::jsonb),
    'services',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',s.id,'name',s.name,'description',s.description,'icon',s.icon,'image',s.image,'sort_order',s.sort_order
      ) order by s.sort_order,s.id)
      from public.provider_services s where s.provider_id=p.id and s.is_active=true
    ),'[]'::jsonb),
    'treatment_costs',coalesce((
      select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'cost',c.cost,'sort_order',c.sort_order) order by c.sort_order,c.id)
      from public.provider_treatment_costs c where c.provider_id=p.id
    ),'[]'::jsonb),
    'investigation_costs',coalesce((
      select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'cost',c.cost,'sort_order',c.sort_order) order by c.sort_order,c.id)
      from public.provider_investigation_costs c where c.provider_id=p.id
    ),'[]'::jsonb)
  )
  from public.providers p
  where p.id=p_provider_id and p.status='approved' and p.verified=true;
$$;

revoke all on function public.get_public_provider_page_content(uuid) from public;
grant execute on function public.get_public_provider_page_content(uuid) to anon,authenticated,service_role;

-- Existing Haversine helper is the only distance calculation source.
create or replace function public.get_public_provider_distance(
  p_provider_id uuid,
  p_lat double precision,
  p_lon double precision
)
returns double precision
language sql
stable
security definer
set search_path=public
as $$
  select round(public.location_distance_km(p_lat,p_lon,p.latitude,p.longitude)::numeric,2)::double precision
  from public.providers p
  where p.id=p_provider_id and p.status='approved' and p.verified=true
    and p.latitude is not null and p.longitude is not null
    and p_lat between -90 and 90 and p_lon between -180 and 180;
$$;

revoke all on function public.get_public_provider_distance(uuid,double precision,double precision) from public;
grant execute on function public.get_public_provider_distance(uuid,double precision,double precision) to anon,authenticated,service_role;

-- ------------------------------------------------------------
-- 5) Public linked Doctor cards with this Provider's visiting schedule.
-- This is an association read model only: no arbitrary manual Doctor roster.
-- ------------------------------------------------------------
create or replace function public.get_public_provider_doctors_v2(p_provider_id uuid)
returns table(
  doctor_id uuid,doctor_name text,avatar_url text,degree text,designation text,professional_title text,
  bmdc_registration_no text,consultation_fee numeric,experience_years integer,district_id bigint,district_name_bn text,
  upazila_id bigint,upazila_name_bn text,specialties jsonb,available_today boolean,schedules jsonb,total_count bigint
)
language sql
stable
security definer
set search_path=public
as $$
  select d.id,p.full_name,coalesce(d.profile_photo_url,p.avatar_url),d.degree,d.designation,d.professional_title,d.bmdc_registration_no,
    d.consultation_fee,d.experience_years,p.district_id,dist.name_bn,p.upazila_id,upz.name_bn,
    coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name_bn',s.name_bn,'name_en',s.name_en,'slug',s.slug,'is_primary',ds.is_primary)
              order by ds.is_primary desc,s.sort_order,s.name_bn)
              from public.doctor_specialties ds join public.specialties s on s.id=ds.specialty_id and s.is_active=true where ds.doctor_id=d.id),'[]'::jsonb),
    exists(select 1 from public.chamber_schedules cs where cs.provider_id=pr.id and cs.doctor_id=d.id and cs.is_active=true
           and cs.day_of_week=extract(dow from current_date)::int),
    coalesce((select jsonb_agg(jsonb_build_object(
      'day_of_week',cs.day_of_week,'start_time',cs.start_time,'end_time',cs.end_time,'fee',cs.fee,'note',cs.note
    ) order by cs.day_of_week,cs.start_time,cs.id)
    from public.chamber_schedules cs
    where cs.provider_id=pr.id and cs.doctor_id=d.id and cs.is_active=true),'[]'::jsonb),
    count(*) over()
  from public.providers pr
  join public.doctor_provider_links l on l.provider_id=pr.id and l.status='approved'
  join public.doctors d on d.id=l.doctor_id and public.is_doctor_publicly_listable(d.id)
  join public.profiles p on p.id=d.id and p.account_status='active'
  left join public.districts dist on dist.id=p.district_id
  left join public.upazilas upz on upz.id=p.upazila_id
  where pr.id=p_provider_id and pr.status='approved' and pr.verified=true
  order by public.doctor_public_rank_score(d.id) desc,d.created_at desc,p.full_name,d.id;
$$;

revoke all on function public.get_public_provider_doctors_v2(uuid) from public;
grant execute on function public.get_public_provider_doctors_v2(uuid) to anon,authenticated,service_role;

-- ------------------------------------------------------------
-- 6) Security assertions.
-- ------------------------------------------------------------
do $assert$
begin
  if not has_function_privilege('anon','public.get_public_provider_page_content(uuid)','EXECUTE') then
    raise exception 'Step47: public Provider content read grant missing';
  end if;
  if has_function_privilege('anon','public.update_my_provider_about(uuid,text,text)','EXECUTE') then
    raise exception 'Step47: anonymous Provider About mutation must be blocked';
  end if;
  if not has_function_privilege('authenticated','public.update_my_provider_about(uuid,text,text)','EXECUTE') then
    raise exception 'Step47: owner Provider About mutation grant missing';
  end if;
end;
$assert$;

select 'STEP 47 HOSPITAL PUBLIC PROFILE REDESIGN PASSED' as result;
