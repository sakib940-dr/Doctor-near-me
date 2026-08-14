-- ============================================================
-- STEP 23 — PUBLIC PROVIDER DOCTORS (SCOPED)
-- Run after Step 22. Safe to re-run.
-- Replaces N+1 provider doctor discovery with one provider-scoped RPC.
-- ============================================================

create or replace function public.get_public_provider_doctors(p_provider_id uuid)
returns table(
  doctor_id uuid,
  doctor_name text,
  avatar_url text,
  degree text,
  designation text,
  professional_title text,
  bmdc_registration_no text,
  consultation_fee numeric,
  experience_years integer,
  district_id bigint,
  district_name_bn text,
  upazila_id bigint,
  upazila_name_bn text,
  specialties jsonb,
  available_today boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    d.id as doctor_id,
    p.full_name as doctor_name,
    coalesce(d.profile_photo_url, p.avatar_url) as avatar_url,
    d.degree,
    d.designation,
    d.professional_title,
    d.bmdc_registration_no,
    d.consultation_fee,
    d.experience_years,
    p.district_id,
    dist.name_bn as district_name_bn,
    p.upazila_id,
    upz.name_bn as upazila_name_bn,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'name_bn', s.name_bn,
          'name_en', s.name_en,
          'slug', s.slug,
          'is_primary', ds.is_primary
        )
        order by ds.is_primary desc, s.sort_order, s.name_bn
      )
      from public.doctor_specialties ds
      join public.specialties s
        on s.id = ds.specialty_id
       and s.is_active = true
      where ds.doctor_id = d.id
    ), '[]'::jsonb) as specialties,
    exists(
      select 1
      from public.chamber_schedules cs
      where cs.provider_id = pr.id
        and cs.doctor_id = d.id
        and cs.is_active = true
        and cs.day_of_week = extract(dow from current_date)::int
    ) as available_today
  from public.providers pr
  join public.doctor_provider_links l
    on l.provider_id = pr.id
   and l.status = 'approved'
  join public.doctors d
    on d.id = l.doctor_id
   and d.verification_status = 'approved'
  join public.profiles p
    on p.id = d.id
   and p.account_status = 'active'
  left join public.districts dist on dist.id = p.district_id
  left join public.upazilas upz on upz.id = p.upazila_id
  where pr.id = p_provider_id
    and pr.status = 'approved'
    and pr.verified = true
  order by p.full_name, d.id;
$$;

revoke all on function public.get_public_provider_doctors(uuid) from public;
grant execute on function public.get_public_provider_doctors(uuid) to anon, authenticated, service_role;
