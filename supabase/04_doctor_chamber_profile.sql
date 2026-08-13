-- ============================================================
-- STEP 4 — PRODUCTION DOCTOR + CHAMBER PROFILE LAYER
-- Depends on Steps 1–3.
-- Safe to re-run.
-- ============================================================

-- ---------- Doctor profile extensions ----------
alter table public.doctors
  add column if not exists profile_headline text,
  add column if not exists profile_slug text,
  add column if not exists profile_photo_url text,
  add column if not exists consultation_note text,
  add column if not exists languages text[],
  add column if not exists accepting_appointments boolean not null default true;

create unique index if not exists ux_doctor_profile_slug
  on public.doctors(profile_slug)
  where profile_slug is not null and profile_slug <> '';

-- ---------- Provider/chamber extensions ----------
alter table public.providers
  add column if not exists short_description text,
  add column if not exists website_url text,
  add column if not exists google_maps_url text,
  add column if not exists opening_note text,
  add column if not exists emergency_available boolean not null default false;

-- ---------- Doctor public profile RPC ----------
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
      'experience_years', d.experience_years,
      'consultation_fee', d.consultation_fee,
      'headline', d.profile_headline,
      'bio', d.bio,
      'languages', d.languages,
      'accepting_appointments', d.accepting_appointments
    ),
    'specialties', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',s.id,'name_bn',s.name_bn,'name_en',s.name_en,'icon_url',s.icon_url
      ) order by s.sort_order,s.name_bn)
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
        'emergency_available',pr.emergency_available,
        'schedules',coalesce((
          select jsonb_agg(jsonb_build_object(
            'day_of_week',cs.day_of_week,
            'start_time',cs.start_time,
            'end_time',cs.end_time,
            'fee',cs.fee
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
    and d.verification_status='approved'
    and p.account_status='active';
$$;

revoke all on function public.get_doctor_public_profile(uuid)
  from public,anon;
grant execute on function public.get_doctor_public_profile(uuid)
  to anon,authenticated,service_role;

revoke select on table public.profiles from public,anon;
grant select on table public.profiles to authenticated,service_role;

-- ---------- Provider doctor list ----------
create or replace function public.get_provider_doctors(p_provider_id uuid)
returns table(
  doctor_id uuid,
  doctor_name text,
  avatar_url text,
  degree text,
  designation text,
  bmdc_registration_no text,
  consultation_fee numeric,
  specialty_names_bn text[]
)
language sql
stable
security invoker
set search_path=public
as $$
  select d.id,
         p.full_name,
         coalesce(d.profile_photo_url,p.avatar_url),
         d.degree,
         d.designation,
         d.bmdc_registration_no,
         d.consultation_fee,
         coalesce(array_agg(s.name_bn order by s.sort_order,s.name_bn)
           filter(where s.id is not null),'{}'::text[])
  from public.doctor_provider_links l
  join public.doctors d on d.id=l.doctor_id
  join public.profiles p on p.id=d.id
  left join public.doctor_specialties ds on ds.doctor_id=d.id
  left join public.specialties s on s.id=ds.specialty_id and s.is_active=true
  where l.provider_id=p_provider_id
    and l.status='approved'
    and d.verification_status='approved'
    and p.account_status='active'
  group by d.id,p.full_name,d.profile_photo_url,p.avatar_url,d.degree,
           d.designation,d.bmdc_registration_no,d.consultation_fee;
$$;

-- ---------- Appointment creation guard ----------
create or replace function public.validate_appointment_participants()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  if not exists(
    select 1 from public.doctors
    where id=new.doctor_id and verification_status='approved'
  ) then
    raise exception 'Doctor is not approved';
  end if;

  if new.provider_id is not null and not exists(
    select 1 from public.doctor_provider_links
    where doctor_id=new.doctor_id
      and provider_id=new.provider_id
      and status='approved'
  ) then
    raise exception 'Doctor is not linked to this chamber/hospital';
  end if;

  if new.appointment_date < current_date then
    raise exception 'Appointment date cannot be in the past';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_appointment on public.appointments;
create trigger trg_validate_appointment
before insert or update on public.appointments
for each row execute procedure public.validate_appointment_participants();

-- ---------- Appointment availability ----------
create or replace function public.get_doctor_schedule(
  p_doctor_id uuid,
  p_provider_id uuid default null
)
returns table(
  provider_id uuid,
  provider_name text,
  day_of_week smallint,
  start_time time,
  end_time time,
  fee numeric
)
language sql
stable
security invoker
set search_path=public
as $$
  select cs.provider_id,p.name_bn,cs.day_of_week,cs.start_time,cs.end_time,cs.fee
  from public.chamber_schedules cs
  join public.providers p on p.id=cs.provider_id
  where cs.doctor_id=p_doctor_id
    and (p_provider_id is null or cs.provider_id=p_provider_id)
    and cs.is_active=true
    and p.status='approved'
    and p.verified=true
  order by p.name_bn,cs.day_of_week,cs.start_time;
$$;

-- ---------- Public appointment list for a patient ----------
create index if not exists idx_appointments_status_date
  on public.appointments(status,appointment_date);

-- ---------- Secure role transition: Super Admin only ----------
create or replace function public.super_admin_change_role(
  p_user_id uuid,
  p_new_role public.user_role
)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare
  old_role public.user_role;
begin
  if not public.is_super_admin() then
    raise exception 'Only Super Admin can change user roles';
  end if;

  select role into old_role from public.profiles where id=p_user_id for update;

  if old_role is null then
    raise exception 'User profile not found';
  end if;

  if old_role = p_new_role then
    return true;
  end if;

  update public.profiles
  set role=p_new_role, updated_at=now()
  where id=p_user_id;

  insert into public.admin_audit_logs(
    actor_id,action,target_user_id,target_type,target_id,metadata
  )
  values(
    auth.uid(),'role_changed',p_user_id,'profile',p_user_id::text,
    jsonb_build_object('old_role',old_role,'new_role',p_new_role)
  );

  return true;
end;
$$;

-- Super Admin can suspend/activate accounts; admins cannot alter roles.
create or replace function public.super_admin_set_account_status(
  p_user_id uuid,
  p_status public.account_status
)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Only Super Admin can change account status';
  end if;

  update public.profiles
  set account_status=p_status,updated_at=now()
  where id=p_user_id;

  if not found then raise exception 'User profile not found'; end if;

  insert into public.admin_audit_logs(
    actor_id,action,target_user_id,target_type,target_id,metadata
  )
  values(
    auth.uid(),'account_status_changed',p_user_id,'profile',p_user_id::text,
    jsonb_build_object('status',p_status)
  );

  return true;
end;
$$;

-- ---------- Provider owner management ----------
create or replace function public.provider_add_doctor(
  p_provider_id uuid,
  p_doctor_id uuid
)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
begin
  if not (
    public.is_admin_or_above()
    or exists(select 1 from public.providers where id=p_provider_id and owner_user_id=auth.uid())
  ) then
    raise exception 'Not authorized to manage this chamber/hospital';
  end if;

  if not exists(select 1 from public.doctors where id=p_doctor_id and verification_status='approved') then
    raise exception 'Doctor is not approved';
  end if;

  insert into public.doctor_provider_links(doctor_id,provider_id,status,invited_by)
  values(p_doctor_id,p_provider_id,'approved',auth.uid())
  on conflict(doctor_id,provider_id) do update
    set status='approved',invited_by=excluded.invited_by;

  return true;
end;
$$;

-- ============================================================
-- END STEP 4
-- ============================================================
