-- ============================================================
-- STEP 30 — DOCTOR VISITING CARD
-- Reuses profiles/doctors/doctor_specialties. No duplicate card table.
-- Run after Step 29. Safe to re-run.
-- ============================================================

alter table public.doctors
  add column if not exists medical_college text,
  add column if not exists present_job text;

-- Keep the existing doctor self-profile RPC as the canonical owner read,
-- extending its JSON with the two Visiting Card fields added above.
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
      'bmdc_verified',d.bmdc_verified,'bio',d.bio,
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
    'chambers',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',pr.id,'name_bn',pr.name_bn,'provider_type',pr.provider_type,
        'address',pr.address,'phone',pr.phone,
        'link_status',l.status,'provider_status',pr.status,
        'verified',pr.verified,
        'schedules',coalesce((
          select jsonb_agg(jsonb_build_object(
            'id',cs.id,'day_of_week',cs.day_of_week,
            'start_time',cs.start_time,'end_time',cs.end_time,
            'fee',cs.fee,'is_active',cs.is_active
          ) order by cs.day_of_week,cs.start_time,cs.id)
          from public.chamber_schedules cs
          where cs.doctor_id=d.id and cs.provider_id=pr.id
        ),'[]'::jsonb)
      ) order by pr.name_bn,pr.id)
      from public.doctor_provider_links l
      join public.providers pr on pr.id=l.provider_id
      where l.doctor_id=d.id
    ),'[]'::jsonb)
  )
  from public.doctors d
  join public.profiles p on p.id=d.id
  where d.id=auth.uid() and p.role='doctor' and p.account_status='active';
$$;

-- Dedicated concise editor. It updates the same canonical rows used by the
-- full professional profile, rather than creating a Visiting Card table.
create or replace function public.update_my_doctor_visiting_card(
  p_full_name text,
  p_profile_photo_url text default null,
  p_professional_title text default null,
  p_degree text default null,
  p_designation text default null,
  p_bmdc_registration_no text default null,
  p_medical_college text default null,
  p_present_job text default null,
  p_specialty_ids bigint[] default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  old_doctor public.doctors%rowtype;
  credentials_changed boolean;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists(
    select 1 from public.profiles
    where id=auth.uid() and role='doctor' and account_status='active'
  ) then raise exception 'Active doctor account required'; end if;

  if length(trim(coalesce(p_full_name,'')))<2 then
    raise exception 'Full name is required';
  end if;
  if p_profile_photo_url is not null
     and p_profile_photo_url<>''
     and p_profile_photo_url not like auth.uid()::text||'/%' then
    raise exception 'Profile photo path must belong to the current user';
  end if;
  if p_specialty_ids is not null and exists(
    select 1 from unnest(p_specialty_ids) requested(id)
    left join public.specialties s on s.id=requested.id and s.is_active
    where s.id is null
  ) then raise exception 'One or more specialties are invalid'; end if;

  select * into old_doctor from public.doctors where id=auth.uid() for update;
  if not found then raise exception 'Doctor profile not found'; end if;

  -- Preserve the verification reset rule already used by Step 15.
  credentials_changed :=
    old_doctor.degree is distinct from nullif(trim(p_degree),'')
    or old_doctor.designation is distinct from nullif(trim(p_designation),'')
    or old_doctor.bmdc_registration_no is distinct from nullif(trim(p_bmdc_registration_no),'');

  update public.profiles
  set full_name=trim(p_full_name), profile_completed=true, updated_at=now()
  where id=auth.uid();

  update public.doctors
  set profile_photo_url=nullif(trim(p_profile_photo_url),''),
      professional_title=nullif(trim(p_professional_title),''),
      degree=nullif(trim(p_degree),''),
      designation=nullif(trim(p_designation),''),
      bmdc_registration_no=nullif(trim(p_bmdc_registration_no),''),
      medical_college=nullif(trim(p_medical_college),''),
      present_job=nullif(trim(p_present_job),''),
      verification_status=case
        when credentials_changed then 'pending'::public.verification_status
        else verification_status
      end,
      bmdc_verified=case when credentials_changed then false else bmdc_verified end,
      updated_at=now()
  where id=auth.uid();

  if p_specialty_ids is not null then
    delete from public.doctor_specialties where doctor_id=auth.uid();
    insert into public.doctor_specialties(doctor_id,specialty_id,is_primary)
    select auth.uid(),requested.id,(row_number() over(order by s.sort_order,s.id)=1)
    from unnest(p_specialty_ids) requested(id)
    join public.specialties s on s.id=requested.id and s.is_active
    order by s.sort_order,s.id;
  end if;

  return jsonb_build_object(
    'verification_status',case
      when credentials_changed then 'pending'
      else old_doctor.verification_status::text
    end,
    'credentials_changed',credentials_changed
  );
exception
  when unique_violation then
    raise exception 'This BMDC registration number is already in use';
end;
$$;

-- Existing public Doctor Details remains the single public profile endpoint;
-- it is only extended with Visiting Card fields.
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
      'medical_college', d.medical_college,
      'present_job', d.present_job,
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

-- Batch-safe public card hydration for search/home/provider cards. It exposes
-- only the same approved public professional fields, avoiding per-card reads
-- from private profile tables and avoiding duplicated stored data.
create or replace function public.get_public_doctor_visiting_cards(p_doctor_ids uuid[])
returns table(
  doctor_id uuid,
  doctor_name text,
  avatar_url text,
  degree text,
  professional_title text,
  designation text,
  bmdc_registration_no text,
  medical_college text,
  present_job text
)
language sql
stable
security definer
set search_path=public
as $$
  select d.id,p.full_name,coalesce(d.profile_photo_url,p.avatar_url),
         d.degree,d.professional_title,d.designation,d.bmdc_registration_no,
         d.medical_college,d.present_job
  from public.doctors d
  join public.profiles p on p.id=d.id
  where d.id=any(coalesce(p_doctor_ids,'{}'::uuid[]))
    and d.verification_status='approved'
    and p.account_status='active'
  order by p.full_name,d.id;
$$;

revoke all on function public.update_my_doctor_visiting_card(
  text,text,text,text,text,text,text,text,bigint[]
) from public,anon;
grant execute on function public.update_my_doctor_visiting_card(
  text,text,text,text,text,text,text,text,bigint[]
) to authenticated,service_role;

revoke all on function public.get_public_doctor_visiting_cards(uuid[]) from public;
grant execute on function public.get_public_doctor_visiting_cards(uuid[]) to anon,authenticated,service_role;

-- Reassert the existing public-profile grants after replacement.
revoke all on function public.get_doctor_public_profile(uuid) from public,anon;
grant execute on function public.get_doctor_public_profile(uuid) to anon,authenticated,service_role;

revoke all on function public.get_my_doctor_profile() from public,anon;
grant execute on function public.get_my_doctor_profile() to authenticated,service_role;
