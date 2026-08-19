-- ============================================================
-- STEP 35 — PRESCRIPTION HEADER SNAPSHOT + FINAL INTEGRATION
-- Run after Step 34. Safe to re-run.
--
-- Keeps Visiting Card and Chamber Details as canonical sources,
-- while storing the doctor's per-prescription printable header edits
-- as immutable-at-save snapshots on the existing prescription row.
-- No duplicate profile/chamber/prescription table is created.
-- ============================================================

alter table public.doctor_prescriptions
  add column if not exists doctor_header_text text,
  add column if not exists chamber_header_text text;

comment on column public.doctor_prescriptions.doctor_header_text is
  'Per-prescription printable doctor header snapshot; defaulted in UI from Visiting Card. Does not mutate canonical doctor profile.';
comment on column public.doctor_prescriptions.chamber_header_text is
  'Per-prescription printable chamber header snapshot; defaulted in UI from Chamber Details. Does not mutate canonical provider/chamber data.';

create or replace function public.save_my_prescription(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_id uuid;
  v_appointment_id uuid;
  v_patient_id uuid;
  v_appointment_provider_id uuid;
  v_requested_provider_id uuid;
  v_provider_id uuid;
  v_doctor_header text;
  v_chamber_header text;
  v_item jsonb;
  v_text text;
  v_category text;
  v_drug_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists(
    select 1 from public.profiles
    where id=auth.uid() and role='doctor' and account_status='active'
  ) then
    raise exception 'Active doctor account required';
  end if;

  v_appointment_id:=nullif(p_payload->>'appointment_id','')::uuid;
  v_requested_provider_id:=nullif(p_payload->>'provider_id','')::uuid;
  v_doctor_header:=nullif(btrim(coalesce(p_payload->>'doctor_header_text','')),'');
  v_chamber_header:=nullif(btrim(coalesce(p_payload->>'chamber_header_text','')),'');

  if char_length(coalesce(v_doctor_header,''))>800 then
    raise exception 'Doctor prescription header must be 800 characters or fewer';
  end if;
  if char_length(coalesce(v_chamber_header,''))>800 then
    raise exception 'Chamber prescription header must be 800 characters or fewer';
  end if;

  if v_appointment_id is not null then
    select a.patient_id,a.provider_id
      into v_patient_id,v_appointment_provider_id
    from public.appointments a
    where a.id=v_appointment_id and a.doctor_id=auth.uid();
    if not found then raise exception 'Appointment not found for this doctor'; end if;
  end if;

  -- Selected Chamber Details provider may be saved even without an appointment,
  -- but it must belong to / be approved-linked to the current doctor. The provider
  -- attached to this doctor's appointment remains a valid context even if a link
  -- was later changed, preserving the existing appointment workflow.
  if v_requested_provider_id is not null then
    if v_appointment_provider_id is distinct from v_requested_provider_id then
      if not exists(
        select 1
        from public.doctor_provider_links l
        join public.providers pr on pr.id=l.provider_id
        where l.doctor_id=auth.uid()
          and l.provider_id=v_requested_provider_id
          and l.status='approved'
          and pr.status in ('pending','approved')
      ) then
        raise exception 'Selected chamber/provider is not available to this doctor';
      end if;
    end if;
    v_provider_id:=v_requested_provider_id;
  else
    v_provider_id:=v_appointment_provider_id;
  end if;

  if btrim(coalesce(p_payload->>'patient_name',''))='' then
    raise exception 'Patient name is required';
  end if;

  insert into public.doctor_prescriptions(
    doctor_id,patient_id,appointment_id,provider_id,
    doctor_header_text,chamber_header_text,
    patient_name,patient_age,patient_address,patient_mobile,patient_gender,
    chief_complaint,history,on_examination,investigation,treatment_plan,medicines,advice,note
  ) values(
    auth.uid(),v_patient_id,v_appointment_id,v_provider_id,
    v_doctor_header,v_chamber_header,
    btrim(p_payload->>'patient_name'),nullif(btrim(p_payload->>'patient_age'),''),
    nullif(btrim(p_payload->>'patient_address'),''),nullif(btrim(p_payload->>'patient_mobile'),''),
    nullif(btrim(p_payload->>'patient_gender'),''),
    coalesce(p_payload->'chief_complaint','[]'::jsonb),coalesce(p_payload->'history','[]'::jsonb),
    coalesce(p_payload->'on_examination','[]'::jsonb),coalesce(p_payload->'investigation','[]'::jsonb),
    coalesce(p_payload->'treatment_plan','[]'::jsonb),coalesce(p_payload->'medicines','[]'::jsonb),
    coalesce(p_payload->'advice','[]'::jsonb),nullif(btrim(p_payload->>'note'),'')
  ) returning id into v_id;

  -- Preserve the existing learned clinical suggestions workflow.
  foreach v_category in array array['chief_complaint','history','on_examination','investigation','treatment_plan'] loop
    for v_text in select btrim(value #>> '{}') from jsonb_array_elements(coalesce(p_payload->v_category,'[]'::jsonb))
    loop
      if v_text<>'' then
        update public.prescription_clinical_suggestions
        set usage_count=usage_count+1,last_used_at=now(),updated_at=now()
        where doctor_id=auth.uid() and category=v_category and lower(text)=lower(v_text);

        if not found then
          insert into public.prescription_clinical_suggestions(doctor_id,category,text,usage_count,last_used_at)
          values(auth.uid(),v_category,v_text,1,now());
        end if;
      end if;
    end loop;
  end loop;

  -- Preserve recent medicine, dose and meal-instruction learning.
  for v_item in select value from jsonb_array_elements(coalesce(p_payload->'medicines','[]'::jsonb))
  loop
    v_text:=btrim(coalesce(v_item->>'name',''));
    v_drug_id:=nullif(v_item->>'drug_master_id','')::uuid;
    if v_text<>'' then
      insert into public.doctor_medicine_usage(doctor_id,display_name,drug_master_id,use_count,last_used_at)
      values(auth.uid(),v_text,v_drug_id,1,now())
      on conflict(doctor_id,display_name) do update set
        drug_master_id=coalesce(excluded.drug_master_id,public.doctor_medicine_usage.drug_master_id),
        use_count=public.doctor_medicine_usage.use_count+1,last_used_at=now();
    end if;

    v_text:=btrim(coalesce(v_item->>'dose',''));
    if v_text<>'' then
      insert into public.prescription_text_suggestions(doctor_id,category,text,usage_count,last_used_at)
      values(auth.uid(),'dose',v_text,1,now())
      on conflict(doctor_id,category,text) do update set
        usage_count=public.prescription_text_suggestions.usage_count+1,last_used_at=now();
    end if;

    v_text:=btrim(coalesce(v_item->>'meal_instruction',''));
    if v_text<>'' then
      insert into public.prescription_text_suggestions(doctor_id,category,text,usage_count,last_used_at)
      values(auth.uid(),'meal_instruction',v_text,1,now())
      on conflict(doctor_id,category,text) do update set
        usage_count=public.prescription_text_suggestions.usage_count+1,last_used_at=now();
    end if;
  end loop;

  return v_id;
end;
$$;

revoke all on function public.save_my_prescription(jsonb) from public,anon;
grant execute on function public.save_my_prescription(jsonb) to authenticated,service_role;

-- Existing direct table access remains closed; doctor reads/writes stay RPC-only.
revoke all on table public.doctor_prescriptions from public,anon,authenticated;

do $assert$
begin
  if has_function_privilege('anon','public.save_my_prescription(jsonb)','EXECUTE') then
    raise exception 'Step 35 failed: anonymous prescription save remains';
  end if;
  if has_table_privilege('authenticated','public.doctor_prescriptions','UPDATE') then
    raise exception 'Step 35 failed: direct authenticated prescription UPDATE remains';
  end if;
end;
$assert$;

select 'STEP 35 PRESCRIPTION HEADER SNAPSHOT + FINAL INTEGRATION PASSED' as result;
