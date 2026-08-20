-- ============================================================
-- DOCBD.INFO — PHASE 2 STEP 45
-- DOCTOR PUBLIC PROFILE REDESIGN — CONTENT READ/EDIT + SCHEDULE NOTE + DISTANCE
-- Run after Step 44. Safe to re-run.
--
-- Reuses:
--   doctors / profiles / doctor_specialties / specialties
--   providers / doctor_provider_links / chamber_schedules
--   doctor_slider_images / doctor_services / doctor_treatment_costs /
--   doctor_investigation_costs from Step 39
--   location_distance_km from existing location system
-- No duplicate Doctor profile/content/location tables are introduced.
-- ============================================================

-- Optional bilingual note belongs to the canonical chamber schedule row.
alter table public.chamber_schedules
  add column if not exists note jsonb not null default '{}'::jsonb;

-- Keep legacy Doctor profile bio edits compatible with the bilingual public fields.
create or replace function public.sync_doctor_legacy_bio_to_bn()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  if new.bio is distinct from old.bio
     and new.bio_bn is not distinct from old.bio_bn then
    new.bio_bn := new.bio;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_doctor_legacy_bio_to_bn on public.doctors;
create trigger trg_sync_doctor_legacy_bio_to_bn
before update of bio on public.doctors
for each row execute function public.sync_doctor_legacy_bio_to_bn();

-- Narrow Doctor-owned bilingual About update. Legacy bio mirrors Bangla for
-- existing screens/PDFs that still consume doctors.bio.
create or replace function public.update_my_doctor_public_content(
  p_bio_bn text default null,
  p_bio_en text default null
)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists(
    select 1 from public.profiles p
    where p.id=auth.uid() and p.role='doctor' and p.account_status='active'
  ) then raise exception 'Active doctor account required'; end if;

  update public.doctors
  set bio_bn=nullif(trim(coalesce(p_bio_bn,'')),''),
      bio_en=nullif(trim(coalesce(p_bio_en,'')),''),
      bio=nullif(trim(coalesce(p_bio_bn,'')),''),
      updated_at=now()
  where id=auth.uid();

  if not found then raise exception 'Doctor profile not found'; end if;
  return true;
end;
$$;

revoke all on function public.update_my_doctor_public_content(text,text) from public,anon;
grant execute on function public.update_my_doctor_public_content(text,text) to authenticated,service_role;

-- Doctor-owned private editor read. Existing RLS remains enabled on content
-- tables; this RPC is only a compact read model for the dashboard editor.
create or replace function public.get_my_doctor_public_content()
returns jsonb
language sql
stable
security definer
set search_path=public
as $$
  select jsonb_build_object(
    'bio_bn',d.bio_bn,
    'bio_en',d.bio_en,
    'slider_images',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.sort_order,x.id)
      from public.doctor_slider_images x where x.doctor_id=d.id
    ),'[]'::jsonb),
    'services',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.sort_order,x.id)
      from public.doctor_services x where x.doctor_id=d.id
    ),'[]'::jsonb),
    'treatment_costs',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.sort_order,x.id)
      from public.doctor_treatment_costs x where x.doctor_id=d.id
    ),'[]'::jsonb),
    'investigation_costs',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.sort_order,x.id)
      from public.doctor_investigation_costs x where x.doctor_id=d.id
    ),'[]'::jsonb)
  )
  from public.doctors d
  join public.profiles p on p.id=d.id
  where d.id=auth.uid() and p.role='doctor' and p.account_status='active';
$$;

revoke all on function public.get_my_doctor_public_content() from public,anon;
grant execute on function public.get_my_doctor_public_content() to authenticated,service_role;

-- Publication-safe public content read. Only active slider/services are shown;
-- all structured cost rows are public when the Doctor itself is listable.
create or replace function public.get_doctor_public_content(p_doctor_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=public
as $$
  select jsonb_build_object(
    'bio_bn',coalesce(d.bio_bn,d.bio),
    'bio_en',d.bio_en,
    'slider_images',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.sort_order,x.id)
      from public.doctor_slider_images x
      where x.doctor_id=d.id and x.is_active=true
    ),'[]'::jsonb),
    'services',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.sort_order,x.id)
      from public.doctor_services x
      where x.doctor_id=d.id and x.is_active=true
    ),'[]'::jsonb),
    'treatment_costs',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.sort_order,x.id)
      from public.doctor_treatment_costs x where x.doctor_id=d.id
    ),'[]'::jsonb),
    'investigation_costs',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.sort_order,x.id)
      from public.doctor_investigation_costs x where x.doctor_id=d.id
    ),'[]'::jsonb)
  )
  from public.doctors d
  where d.id=p_doctor_id
    and public.is_doctor_publicly_listable(d.id);
$$;

revoke all on function public.get_doctor_public_content(uuid) from public;
grant execute on function public.get_doctor_public_content(uuid) to anon,authenticated,service_role;

-- Notes are saved independently so the existing save_my_chamber_schedule RPC
-- signature remains backward-compatible for every previous client.
create or replace function public.update_my_chamber_schedule_note(
  p_schedule_id uuid,
  p_note_bn text default null,
  p_note_en text default null
)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists(
    select 1 from public.profiles p
    where p.id=auth.uid() and p.role='doctor' and p.account_status='active'
  ) then raise exception 'Active doctor account required'; end if;

  update public.chamber_schedules
  set note=jsonb_strip_nulls(jsonb_build_object(
    'bn',nullif(trim(coalesce(p_note_bn,'')),''),
    'en',nullif(trim(coalesce(p_note_en,'')),'')
  ))
  where id=p_schedule_id and doctor_id=auth.uid();

  if not found then raise exception 'Schedule not found'; end if;
  return true;
end;
$$;

revoke all on function public.update_my_chamber_schedule_note(uuid,text,text) from public,anon;
grant execute on function public.update_my_chamber_schedule_note(uuid,text,text) to authenticated,service_role;

-- Exact Doctor profile distance uses the existing authoritative Haversine SQL.
-- Visitor coordinates are used only for this query and are never persisted.
create or replace function public.get_public_doctor_chamber_distances(
  p_doctor_id uuid,
  p_lat double precision,
  p_lon double precision
)
returns table(provider_id uuid,distance_km numeric)
language plpgsql
stable
security definer
set search_path=public
as $$
begin
  if p_lat is null or p_lon is null
     or p_lat < -90 or p_lat > 90
     or p_lon < -180 or p_lon > 180 then
    raise exception 'Invalid coordinates';
  end if;

  if not public.is_doctor_publicly_listable(p_doctor_id) then return; end if;

  return query
  select pr.id,
         round(public.location_distance_km(p_lat,p_lon,pr.latitude,pr.longitude)::numeric,2)
  from public.doctor_provider_links l
  join public.providers pr on pr.id=l.provider_id
  where l.doctor_id=p_doctor_id
    and l.status='approved'
    and pr.status='approved' and pr.verified=true
    and pr.latitude is not null and pr.longitude is not null
  order by public.location_distance_km(p_lat,p_lon,pr.latitude,pr.longitude),pr.id;
end;
$$;

revoke all on function public.get_public_doctor_chamber_distances(uuid,double precision,double precision) from public;
grant execute on function public.get_public_doctor_chamber_distances(uuid,double precision,double precision)
to anon,authenticated,service_role;

-- Keep canonical Doctor owner read backward-compatible while exposing bilingual
-- About and schedule note to the new editor.
create or replace function public.get_my_doctor_profile()
returns jsonb
language sql
stable
security definer
set search_path=public
as $$
  select jsonb_build_object(
    'doctor',jsonb_build_object(
      'id',d.id,'full_name',p.full_name,'email',p.email,'phone',p.phone,
      'district_id',p.district_id,'upazila_id',p.upazila_id,
      'professional_title',d.professional_title,'degree',d.degree,
      'designation',d.designation,'bmdc_registration_no',d.bmdc_registration_no,
      'medical_college',d.medical_college,'present_job',d.present_job,
      'bmdc_verified',d.bmdc_verified,'bio',d.bio,'bio_bn',d.bio_bn,'bio_en',d.bio_en,
      'consultation_fee',d.consultation_fee,
      'experience_years',d.experience_years,
      'verification_status',d.verification_status,
      'profile_headline',d.profile_headline,
      'profile_photo_url',coalesce(d.profile_photo_url,p.avatar_url),
      'consultation_note',d.consultation_note,'languages',d.languages,
      'accepting_appointments',d.accepting_appointments
    ),
    'specialty_ids',coalesce((
      select jsonb_agg(ds.specialty_id order by ds.is_primary desc,s.sort_order,s.id)
      from public.doctor_specialties ds
      join public.specialties s on s.id=ds.specialty_id
      where ds.doctor_id=d.id and s.is_active
    ),'[]'::jsonb),
    'specialties',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',s.id,'name_bn',s.name_bn,'name_en',s.name_en
      ) order by ds.is_primary desc,s.sort_order,s.id)
      from public.doctor_specialties ds
      join public.specialties s on s.id=ds.specialty_id
      where ds.doctor_id=d.id and s.is_active
    ),'[]'::jsonb),
    'chambers',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',pr.id,'name_bn',pr.name_bn,'provider_type',pr.provider_type,
        'address',pr.address,'phone',pr.phone,'whatsapp',pr.whatsapp,
        'district_id',pr.district_id,'upazila_id',pr.upazila_id,
        'latitude',pr.latitude,'longitude',pr.longitude,
        'map_url',coalesce(pr.google_maps_url,pr.map_url),
        'owned_by_doctor',(pr.owner_user_id=d.id and pr.provider_type='chamber'),
        'link_status',l.status,'provider_status',pr.status,
        'verified',pr.verified,
        'schedules',coalesce((
          select jsonb_agg(jsonb_build_object(
            'id',cs.id,'day_of_week',cs.day_of_week,
            'start_time',cs.start_time,'end_time',cs.end_time,
            'fee',cs.fee,'note',cs.note,'is_active',cs.is_active
          ) order by cs.day_of_week,cs.start_time,cs.id)
          from public.chamber_schedules cs
          where cs.doctor_id=d.id and cs.provider_id=pr.id
        ),'[]'::jsonb)
      ) order by (pr.owner_user_id=d.id) desc,pr.name_bn,pr.id)
      from public.doctor_provider_links l
      join public.providers pr on pr.id=l.provider_id
      where l.doctor_id=d.id
    ),'[]'::jsonb)
  )
  from public.doctors d
  join public.profiles p on p.id=d.id
  where d.id=auth.uid() and p.role='doctor' and p.account_status='active';
$$;

revoke all on function public.get_my_doctor_profile() from public,anon;
grant execute on function public.get_my_doctor_profile() to authenticated,service_role;

-- Preserve the existing public Doctor profile route/read model; add only the
-- bilingual About fields and schedule note required by the redesigned page.
create or replace function public.get_doctor_public_profile(p_doctor_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=public
as $$
  select jsonb_build_object(
    'doctor', jsonb_build_object(
      'id', d.id,
      'name', p.full_name,
      'avatar_url', coalesce(d.profile_photo_url,p.avatar_url),
      'degree', d.degree,
      'designation', d.designation,
      'professional_title', d.professional_title,
      'bmdc_registration_no', d.bmdc_registration_no,
      'verification_status', d.verification_status::text,
      'medical_college', d.medical_college,
      'present_job', d.present_job,
      'experience_years', d.experience_years,
      'consultation_fee', d.consultation_fee,
      'headline', d.profile_headline,
      'bio', d.bio,
      'bio_bn', coalesce(d.bio_bn,d.bio),
      'bio_en', d.bio_en,
      'languages', d.languages,
      'accepting_appointments', d.accepting_appointments
    ),
    'specialties', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',s.id,'name_bn',s.name_bn,'name_en',s.name_en,'icon_url',s.icon_url
      ) order by ds.is_primary desc,s.sort_order,s.name_bn)
      from public.doctor_specialties ds
      join public.specialties s on s.id=ds.specialty_id
      where ds.doctor_id=d.id and s.is_active=true
    ), '[]'::jsonb),
    'chambers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',pr.id,
        'type',pr.provider_type,
        'name_bn',pr.name_bn,
        'name_en',pr.name_en,
        'address',pr.address,
        'district_id',pr.district_id,
        'upazila_id',pr.upazila_id,
        'latitude',pr.latitude,
        'longitude',pr.longitude,
        'map_url',coalesce(pr.google_maps_url,pr.map_url),
        'phone',pr.phone,
        'whatsapp',pr.whatsapp,
        'emergency_available',pr.emergency_available,
        'schedules',coalesce((
          select jsonb_agg(jsonb_build_object(
            'day_of_week',cs.day_of_week,
            'start_time',cs.start_time,
            'end_time',cs.end_time,
            'fee',cs.fee,
            'note',cs.note
          ) order by cs.day_of_week,cs.start_time)
          from public.chamber_schedules cs
          where cs.doctor_id=d.id and cs.provider_id=pr.id and cs.is_active=true
        ),'[]'::jsonb)
      ) order by pr.name_bn)
      from public.doctor_provider_links dl
      join public.providers pr on pr.id=dl.provider_id
      where dl.doctor_id=d.id and dl.status='approved'
        and pr.status='approved' and pr.verified=true
    ), '[]'::jsonb)
  )
  from public.doctors d
  join public.profiles p on p.id=d.id
  where d.id=p_doctor_id
    and public.is_doctor_publicly_listable(d.id)
    and p.account_status='active';
$$;

revoke all on function public.get_doctor_public_profile(uuid) from public;
grant execute on function public.get_doctor_public_profile(uuid) to anon,authenticated,service_role;
