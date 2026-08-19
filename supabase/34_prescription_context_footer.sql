-- ============================================================
-- STEP 34 — PRESCRIPTION CONTEXT + ADMIN FOOTER
-- Reuses Visiting Card (profiles/doctors/doctor_specialties),
-- Chamber Details (providers/doctor_provider_links/chamber_schedules),
-- and the existing site_settings CMS table.
-- No duplicate prescription/profile/chamber/CMS tables are created.
-- Run after Step 33. Safe to re-run.
-- ============================================================

-- Existing CMS setting; private to signed-in app users through a narrow RPC.
insert into public.site_settings(setting_key,setting_value,is_public,description)
values(
  'prescription_footer',
  jsonb_build_object('text','Generated from docbd.info • Please follow the doctor''s instructions.'),
  false,
  'Admin-controlled footer printed on Doctor prescription PDFs'
)
on conflict(setting_key) do nothing;

-- Keep get_my_doctor_profile as the canonical owner read and add specialty
-- labels needed by Prescription. Existing keys remain backward-compatible.
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
        'address',pr.address,'phone',pr.phone,
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
            'fee',cs.fee,'is_active',cs.is_active
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

-- Narrow read: signed-in active users may read only the prescription footer text.
create or replace function public.get_prescription_footer()
returns text
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  result_text text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists(
    select 1 from public.profiles p
    where p.id=auth.uid() and p.account_status='active'
  ) then raise exception 'Active account required'; end if;

  select s.setting_value->>'text' into result_text
  from public.site_settings s
  where s.setting_key='prescription_footer';

  if result_text is null then
    return 'Generated from docbd.info • Please follow the doctor''s instructions.';
  end if;
  return result_text;
end;
$$;

-- Admin-only write. Doctors can execute the read RPC but cannot change the setting.
create or replace function public.save_admin_prescription_footer(p_text text)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare
  normalized_text text:=coalesce(p_text,'');
begin
  if not public.is_admin_or_above() then raise exception 'Admin access required'; end if;
  if length(normalized_text)>500 then raise exception 'Prescription footer must be 500 characters or fewer'; end if;

  insert into public.site_settings(setting_key,setting_value,is_public,description,updated_by)
  values(
    'prescription_footer',jsonb_build_object('text',normalized_text),false,
    'Admin-controlled footer printed on Doctor prescription PDFs',auth.uid()
  )
  on conflict(setting_key) do update set
    setting_value=excluded.setting_value,
    is_public=false,
    description=excluded.description,
    updated_by=auth.uid(),
    updated_at=now();

  insert into public.admin_audit_logs(actor_id,action,target_type,target_id,metadata)
  values(
    auth.uid(),'prescription_footer_saved','site_setting','prescription_footer',
    jsonb_build_object('length',length(normalized_text))
  );
  return true;
end;
$$;

-- Keep direct CMS mutation closed and expose only the narrow RPCs.
revoke insert,update,delete on table public.site_settings from public,anon,authenticated;

revoke all on function public.get_prescription_footer() from public,anon;
grant execute on function public.get_prescription_footer() to authenticated,service_role;

revoke all on function public.save_admin_prescription_footer(text) from public,anon;
grant execute on function public.save_admin_prescription_footer(text) to authenticated,service_role;

-- get_my_doctor_profile was already an authenticated owner RPC; reassert no anon access.
revoke all on function public.get_my_doctor_profile() from public,anon;
grant execute on function public.get_my_doctor_profile() to authenticated,service_role;

do $assert$
begin
  if has_function_privilege('anon','public.get_prescription_footer()','EXECUTE') then
    raise exception 'Step 34 failed: anonymous prescription footer read remains';
  end if;
  if has_function_privilege('anon','public.save_admin_prescription_footer(text)','EXECUTE') then
    raise exception 'Step 34 failed: anonymous prescription footer write remains';
  end if;
  if has_table_privilege('authenticated','public.site_settings','UPDATE') then
    raise exception 'Step 34 failed: direct authenticated site_settings UPDATE remains';
  end if;
end;
$assert$;

select 'STEP 34 PRESCRIPTION CONTEXT + FOOTER PASSED' as result;
