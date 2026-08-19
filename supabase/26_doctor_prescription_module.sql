-- ============================================================
-- STEP 26 — DOCTOR PRESCRIPTION MODULE + VERIFIED DRUG CATALOG
-- Depends on Steps 01–25.
-- Safe to re-run.
--
-- After running this migration, import:
--   supabase/data/dgda_drug_master_import.csv
-- into public.drug_master from Supabase Table Editor.
-- ============================================================

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- ------------------------------------------------------------
-- VERIFIED MEDICINE CATALOG (metadata only)
-- ------------------------------------------------------------
create table if not exists public.drug_master (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  brand_name text,
  generic_name text,
  dosage_form text,
  strength text,
  company_name text,
  registration_no text,
  source_reference text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists drug_master_display_trgm_idx
  on public.drug_master using gin (lower(display_name) gin_trgm_ops);
create index if not exists drug_master_brand_trgm_idx
  on public.drug_master using gin (lower(coalesce(brand_name,'')) gin_trgm_ops);
create index if not exists drug_master_generic_trgm_idx
  on public.drug_master using gin (lower(coalesce(generic_name,'')) gin_trgm_ops);
create index if not exists drug_master_company_trgm_idx
  on public.drug_master using gin (lower(coalesce(company_name,'')) gin_trgm_ops);
create index if not exists drug_master_registration_idx
  on public.drug_master(registration_no) where registration_no is not null;

alter table public.drug_master enable row level security;
revoke all on table public.drug_master from public,anon,authenticated;

-- ------------------------------------------------------------
-- PRESCRIPTIONS
-- ------------------------------------------------------------
create table if not exists public.doctor_prescriptions (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  patient_id uuid references public.profiles(id) on delete set null,
  appointment_id uuid references public.appointments(id) on delete set null,
  provider_id uuid references public.providers(id) on delete set null,
  patient_name text not null,
  patient_age text,
  patient_address text,
  patient_mobile text,
  patient_gender text,
  chief_complaint jsonb not null default '[]'::jsonb,
  history jsonb not null default '[]'::jsonb,
  on_examination jsonb not null default '[]'::jsonb,
  investigation jsonb not null default '[]'::jsonb,
  treatment_plan jsonb not null default '[]'::jsonb,
  medicines jsonb not null default '[]'::jsonb,
  advice jsonb not null default '[]'::jsonb,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists doctor_prescriptions_doctor_recent_idx
  on public.doctor_prescriptions(doctor_id,created_at desc);
create index if not exists doctor_prescriptions_patient_recent_idx
  on public.doctor_prescriptions(patient_id,created_at desc)
  where patient_id is not null;
create index if not exists doctor_prescriptions_appointment_idx
  on public.doctor_prescriptions(appointment_id)
  where appointment_id is not null;

alter table public.doctor_prescriptions enable row level security;
revoke all on table public.doctor_prescriptions from public,anon,authenticated;

-- ------------------------------------------------------------
-- DOCTOR-SPECIFIC RECENT MEDICINES + TEXT SUGGESTIONS
-- ------------------------------------------------------------
create table if not exists public.doctor_medicine_usage (
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  display_name text not null,
  drug_master_id uuid references public.drug_master(id) on delete set null,
  use_count integer not null default 1 check(use_count > 0),
  last_used_at timestamptz not null default now(),
  primary key(doctor_id,display_name)
);

create index if not exists doctor_medicine_usage_recent_idx
  on public.doctor_medicine_usage(doctor_id,last_used_at desc,use_count desc);
alter table public.doctor_medicine_usage enable row level security;
revoke all on table public.doctor_medicine_usage from public,anon,authenticated;

create table if not exists public.prescription_text_suggestions (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  category text not null check(category in ('dose','meal_instruction')),
  text text not null check(length(btrim(text)) > 0),
  usage_count integer not null default 1 check(usage_count > 0),
  last_used_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(doctor_id,category,text)
);

create index if not exists prescription_text_suggestions_recent_idx
  on public.prescription_text_suggestions(doctor_id,category,last_used_at desc,usage_count desc);
alter table public.prescription_text_suggestions enable row level security;
revoke all on table public.prescription_text_suggestions from public,anon,authenticated;

-- ------------------------------------------------------------
-- CLINICAL AUTOCOMPLETE (global common + doctor-learned)
-- ------------------------------------------------------------
create table if not exists public.prescription_clinical_suggestions (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid references public.doctors(id) on delete cascade,
  category text not null check(category in ('chief_complaint','history','on_examination','investigation','treatment_plan','advice')),
  text text not null check(length(btrim(text)) > 0),
  usage_count integer not null default 1 check(usage_count > 0),
  last_used_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists prescription_clinical_global_unique
  on public.prescription_clinical_suggestions(category,lower(text)) where doctor_id is null;
create unique index if not exists prescription_clinical_doctor_unique
  on public.prescription_clinical_suggestions(doctor_id,category,lower(text)) where doctor_id is not null;
create index if not exists prescription_clinical_search_trgm_idx
  on public.prescription_clinical_suggestions using gin(lower(text) gin_trgm_ops);
create index if not exists prescription_clinical_recent_idx
  on public.prescription_clinical_suggestions(doctor_id,category,last_used_at desc,usage_count desc);
alter table public.prescription_clinical_suggestions enable row level security;
revoke all on table public.prescription_clinical_suggestions from public,anon,authenticated;

-- 20 dentist-focused starter phrases per requested clinical section.
insert into public.prescription_clinical_suggestions(category,text,usage_count)
values
('chief_complaint','Pain in tooth',100),
('chief_complaint','Sensitivity to hot/cold',100),
('chief_complaint','Swelling in gum/face',100),
('chief_complaint','Bleeding from gums',100),
('chief_complaint','Food impaction between teeth',100),
('chief_complaint','Pain on biting or chewing',100),
('chief_complaint','Broken or chipped tooth',100),
('chief_complaint','Loose or mobile tooth',100),
('chief_complaint','Persistent bad breath',100),
('chief_complaint','Gum pain or tenderness',100),
('chief_complaint','Discharge from gum',100),
('chief_complaint','Difficulty opening mouth',100),
('chief_complaint','Difficulty chewing',100),
('chief_complaint','Missing tooth / wants replacement',100),
('chief_complaint','Discolored tooth',100),
('chief_complaint','Ulcer or sore in mouth',100),
('chief_complaint','Pain after previous dental treatment',100),
('chief_complaint','Sensitivity to sweet foods',100),
('chief_complaint','Jaw joint pain or clicking',100),
('chief_complaint','Denture discomfort or looseness',100),
('history','Spontaneous or nocturnal pain',100),
('history','Pain aggravated by hot or cold',100),
('history','Pain on biting or chewing',100),
('history','History of swelling or discharge',100),
('history','Previous treatment/restoration in the same tooth',100),
('history','History of trauma to the tooth',100),
('history','Pain started suddenly',100),
('history','Intermittent episodes of pain',100),
('history','Continuous pain',100),
('history','Radiating pain',100),
('history','Pain wakes patient from sleep',100),
('history','History of recurrent swelling',100),
('history','Previous root canal treatment in the same tooth',100),
('history','Previous extraction in the same region',100),
('history','History of food impaction',100),
('history','History of gum bleeding during brushing',100),
('history','History of tooth mobility',100),
('history','History of sensitivity to sweets',100),
('history','History of clenching or grinding',100),
('history','History of denture use or discomfort',100),
('on_examination','Dental caries present',100),
('on_examination','Tenderness on percussion',100),
('on_examination','Tenderness on palpation',100),
('on_examination','Localized gingival swelling',100),
('on_examination','Plaque and calculus present',100),
('on_examination','Tooth mobility present',100),
('on_examination','Gingival bleeding on probing',100),
('on_examination','Periodontal pocketing present',100),
('on_examination','Gingival recession present',100),
('on_examination','Fractured or chipped tooth present',100),
('on_examination','Discolored tooth present',100),
('on_examination','Missing tooth / teeth',100),
('on_examination','Existing restoration present',100),
('on_examination','Defective restoration present',100),
('on_examination','Sinus tract or discharge present',100),
('on_examination','Facial swelling present',100),
('on_examination','Limited mouth opening',100),
('on_examination','Oral ulcer or soft-tissue lesion present',100),
('on_examination','Food impaction area present',100),
('on_examination','TMJ clicking or tenderness present',100),
('investigation','IOPA radiograph',100),
('investigation','Bitewing radiograph',100),
('investigation','Panoramic radiograph (OPG)',100),
('investigation','Occlusal radiograph',100),
('investigation','CBCT if clinically indicated',100),
('investigation','Pulp sensibility testing',100),
('investigation','Cold test',100),
('investigation','Electric pulp test',100),
('investigation','Percussion test',100),
('investigation','Palpation test',100),
('investigation','Periodontal charting / probing',100),
('investigation','Tooth mobility assessment',100),
('investigation','Bite test',100),
('investigation','Transillumination test',100),
('investigation','Crack assessment',100),
('investigation','Occlusal assessment',100),
('investigation','Intraoral photographic documentation',100),
('investigation','Study cast / digital intraoral scan',100),
('investigation','Caries risk assessment',100),
('investigation','Further investigation / specialist assessment if indicated',100),
('treatment_plan','Oral hygiene instruction and review',100),
('treatment_plan','Scaling and polishing',100),
('treatment_plan','Periodontal therapy and review',100),
('treatment_plan','Restorative treatment',100),
('treatment_plan','Temporary restoration and reassessment',100),
('treatment_plan','Definitive restoration as indicated',100),
('treatment_plan','Endodontic assessment / treatment',100),
('treatment_plan','Extraction assessment',100),
('treatment_plan','Surgical extraction referral if required',100),
('treatment_plan','Replacement of missing tooth / prosthodontic assessment',100),
('treatment_plan','Crown or onlay assessment',100),
('treatment_plan','Repair or replacement of defective restoration',100),
('treatment_plan','Periodontal maintenance and recall',100),
('treatment_plan','Management of dentin sensitivity and review',100),
('treatment_plan','Occlusal assessment / adjustment if indicated',100),
('treatment_plan','Occlusal splint assessment for clenching or grinding',100),
('treatment_plan','Management of pericoronal inflammation and review',100),
('treatment_plan','Specialist referral if required',100),
('treatment_plan','Follow-up and reassessment',100),
('treatment_plan','Preventive care and recall planning',100)
on conflict do nothing;

-- ------------------------------------------------------------
-- SEARCH RPCs
-- ------------------------------------------------------------
create or replace function public.search_drug_master(p_search_term text,p_limit integer default 12)
returns table(
  id uuid,display_name text,brand_name text,generic_name text,dosage_form text,
  strength text,company_name text,registration_no text
)
language sql stable security definer set search_path=public
as $$
  with p as (select lower(btrim(coalesce(p_search_term,''))) q), ranked as (
    select d.*,
      row_number() over(partition by lower(d.display_name),lower(coalesce(d.generic_name,'')),lower(coalesce(d.company_name,'')) order by d.registration_no nulls last,d.id) dup_rank,
      case
        when lower(coalesce(d.brand_name,''))=p.q then 0
        when lower(coalesce(d.brand_name,'')) like p.q||'%' then 1
        when lower(d.display_name) like p.q||'%' then 2
        when lower(coalesce(d.generic_name,'')) like p.q||'%' then 3
        when lower(coalesce(d.brand_name,'')) like '%'||p.q||'%' then 4
        when lower(d.display_name) like '%'||p.q||'%' then 5
        when lower(coalesce(d.generic_name,'')) like '%'||p.q||'%' then 6
        else 7 end match_rank,
      case
        when lower(coalesce(d.dosage_form,'')) like '%tablet%' then 0
        when lower(coalesce(d.dosage_form,'')) like '%capsule%' then 1
        when lower(coalesce(d.dosage_form,'')) in ('syrup','suspension','powder for suspension') then 2
        when lower(coalesce(d.dosage_form,'')) like '%drops%' then 3
        when lower(coalesce(d.dosage_form,'')) like '%injection%' then 4
        else 5 end form_rank
    from public.drug_master d cross join p
    where exists(select 1 from public.profiles me where me.id=auth.uid() and me.role='doctor' and me.account_status='active')
      and d.is_active and p.q<>'' and (
      lower(d.display_name) like '%'||p.q||'%' or
      lower(coalesce(d.brand_name,'')) like '%'||p.q||'%' or
      lower(coalesce(d.generic_name,'')) like '%'||p.q||'%' or
      lower(coalesce(d.company_name,'')) like '%'||p.q||'%'
    )
  )
  select id,display_name,brand_name,generic_name,dosage_form,strength,company_name,registration_no
  from ranked where dup_rank=1
  order by match_rank,form_rank,lower(coalesce(brand_name,'')),lower(display_name),lower(coalesce(company_name,''))
  limit greatest(1,least(coalesce(p_limit,12),25));
$$;

create or replace function public.search_recent_prescription_medicines(p_search_term text default '',p_limit integer default 6)
returns table(id uuid,display_name text,generic_name text,company_name text,last_used_at timestamptz,use_count integer)
language sql stable security definer set search_path=public
as $$
  select d.id,u.display_name,d.generic_name,d.company_name,u.last_used_at,u.use_count
  from public.doctor_medicine_usage u
  left join public.drug_master d on d.id=u.drug_master_id and d.is_active
  where u.doctor_id=auth.uid() and (
    btrim(coalesce(p_search_term,''))='' or u.display_name ilike '%'||btrim(p_search_term)||'%'
  )
  order by u.last_used_at desc,u.use_count desc,u.display_name
  limit greatest(1,least(coalesce(p_limit,6),20));
$$;

create or replace function public.search_prescription_text_suggestions(p_category text,p_search_term text default '',p_limit integer default 10)
returns table(id uuid,text text,usage_count integer,last_used_at timestamptz)
language sql stable security definer set search_path=public
as $$
  select s.id,s.text,s.usage_count,s.last_used_at
  from public.prescription_text_suggestions s
  where s.doctor_id=auth.uid() and s.category=p_category
    and (btrim(coalesce(p_search_term,''))='' or s.text ilike '%'||btrim(p_search_term)||'%')
  order by s.last_used_at desc,s.usage_count desc,s.text
  limit greatest(1,least(coalesce(p_limit,10),30));
$$;

create or replace function public.search_clinical_suggestions(p_category text,p_search_term text default '',p_limit integer default 20)
returns table(id uuid,text text,source text,usage_count integer,last_used_at timestamptz)
language sql stable security definer set search_path=public
as $$
  with q as (select lower(btrim(coalesce(p_search_term,''))) value),
  tokens as (
    select t.token from q cross join lateral unnest(regexp_split_to_array(q.value,E'\\s+')) t(token)
    where t.token<>''
  )
  select s.id,s.text,
    case when s.doctor_id=auth.uid() then 'recent' else 'common' end,
    s.usage_count,s.last_used_at
  from public.prescription_clinical_suggestions s cross join q
  where exists(select 1 from public.profiles me where me.id=auth.uid() and me.role='doctor' and me.account_status='active')
    and s.is_active and s.category=p_category
    and (s.doctor_id is null or s.doctor_id=auth.uid())
    and (q.value='' or exists(select 1 from tokens where lower(s.text) like '%'||tokens.token||'%'))
  order by
    case when s.doctor_id=auth.uid() then 0 else 1 end,
    case when q.value<>'' and lower(s.text)=q.value then 0 else 1 end,
    case when q.value<>'' and lower(s.text) like q.value||'%' then 0 else 1 end,
    (select count(*) from tokens where lower(s.text) like '%'||tokens.token||'%') desc,
    s.last_used_at desc nulls last,s.usage_count desc,s.text
  limit greatest(1,least(coalesce(p_limit,20),20));
$$;

-- ------------------------------------------------------------
-- APPOINTMENT -> PRESCRIPTION CONTEXT
-- ------------------------------------------------------------
create or replace function public.get_prescription_appointment_context(p_appointment_id uuid)
returns jsonb
language sql stable security definer set search_path=public
as $$
  select jsonb_build_object(
    'appointment_id',a.id,
    'patient_id',a.patient_id,
    'patient_name',pp.full_name,
    'patient_mobile',pp.phone,
    'patient_date_of_birth',pp.date_of_birth,
    'patient_gender',pp.gender,
    'patient_address',pp.address_line,
    'appointment_date',a.appointment_date,
    'provider_id',a.provider_id,
    'provider_name',pr.name_bn,
    'provider_address',pr.address,
    'provider_phone',pr.phone
  )
  from public.appointments a
  join public.profiles pp on pp.id=a.patient_id
  left join public.providers pr on pr.id=a.provider_id
  where a.id=p_appointment_id and a.doctor_id=auth.uid()
    and exists(select 1 from public.profiles me where me.id=auth.uid() and me.role='doctor' and me.account_status='active');
$$;

-- ------------------------------------------------------------
-- SAVE PRESCRIPTION + LEARN DOCTOR'S OWN RECENT TEXT
-- ------------------------------------------------------------
create or replace function public.save_my_prescription(p_payload jsonb)
returns uuid
language plpgsql security definer set search_path=public
as $$
declare
  v_id uuid;
  v_appointment_id uuid;
  v_patient_id uuid;
  v_provider_id uuid;
  v_item jsonb;
  v_text text;
  v_category text;
  v_drug_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists(select 1 from public.profiles where id=auth.uid() and role='doctor' and account_status='active') then
    raise exception 'Active doctor account required';
  end if;

  v_appointment_id:=nullif(p_payload->>'appointment_id','')::uuid;
  if v_appointment_id is not null then
    select a.patient_id,a.provider_id into v_patient_id,v_provider_id
    from public.appointments a where a.id=v_appointment_id and a.doctor_id=auth.uid();
    if not found then raise exception 'Appointment not found for this doctor'; end if;
  end if;

  if btrim(coalesce(p_payload->>'patient_name',''))='' then raise exception 'Patient name is required'; end if;

  insert into public.doctor_prescriptions(
    doctor_id,patient_id,appointment_id,provider_id,patient_name,patient_age,patient_address,patient_mobile,patient_gender,
    chief_complaint,history,on_examination,investigation,treatment_plan,medicines,advice,note
  ) values(
    auth.uid(),v_patient_id,v_appointment_id,v_provider_id,btrim(p_payload->>'patient_name'),nullif(btrim(p_payload->>'patient_age'),''),
    nullif(btrim(p_payload->>'patient_address'),''),nullif(btrim(p_payload->>'patient_mobile'),''),nullif(btrim(p_payload->>'patient_gender'),''),
    coalesce(p_payload->'chief_complaint','[]'::jsonb),coalesce(p_payload->'history','[]'::jsonb),
    coalesce(p_payload->'on_examination','[]'::jsonb),coalesce(p_payload->'investigation','[]'::jsonb),
    coalesce(p_payload->'treatment_plan','[]'::jsonb),coalesce(p_payload->'medicines','[]'::jsonb),
    coalesce(p_payload->'advice','[]'::jsonb),nullif(btrim(p_payload->>'note'),'')
  ) returning id into v_id;

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
      on conflict(doctor_id,category,text) do update set usage_count=public.prescription_text_suggestions.usage_count+1,last_used_at=now();
    end if;

    v_text:=btrim(coalesce(v_item->>'meal_instruction',''));
    if v_text<>'' then
      insert into public.prescription_text_suggestions(doctor_id,category,text,usage_count,last_used_at)
      values(auth.uid(),'meal_instruction',v_text,1,now())
      on conflict(doctor_id,category,text) do update set usage_count=public.prescription_text_suggestions.usage_count+1,last_used_at=now();
    end if;
  end loop;

  return v_id;
end;
$$;

create or replace function public.get_my_prescriptions(p_limit integer default 30,p_offset integer default 0)
returns table(
  id uuid,patient_name text,patient_mobile text,appointment_id uuid,provider_id uuid,
  medicines_count integer,created_at timestamptz
)
language sql stable security definer set search_path=public
as $$
  select p.id,p.patient_name,p.patient_mobile,p.appointment_id,p.provider_id,
    jsonb_array_length(coalesce(p.medicines,'[]'::jsonb)),p.created_at
  from public.doctor_prescriptions p
  where p.doctor_id=auth.uid()
  order by p.created_at desc
  limit greatest(1,least(coalesce(p_limit,30),100)) offset greatest(coalesce(p_offset,0),0);
$$;

create or replace function public.get_my_prescription(p_prescription_id uuid)
returns jsonb
language sql stable security definer set search_path=public
as $$
  select to_jsonb(p) from public.doctor_prescriptions p where p.id=p_prescription_id and p.doctor_id=auth.uid();
$$;

-- RPC permissions only.
revoke all on function public.search_drug_master(text,integer) from public,anon;
revoke all on function public.search_recent_prescription_medicines(text,integer) from public,anon;
revoke all on function public.search_prescription_text_suggestions(text,text,integer) from public,anon;
revoke all on function public.search_clinical_suggestions(text,text,integer) from public,anon;
revoke all on function public.get_prescription_appointment_context(uuid) from public,anon;
revoke all on function public.save_my_prescription(jsonb) from public,anon;
revoke all on function public.get_my_prescriptions(integer,integer) from public,anon;
revoke all on function public.get_my_prescription(uuid) from public,anon;

grant execute on function public.search_drug_master(text,integer) to authenticated,service_role;
grant execute on function public.search_recent_prescription_medicines(text,integer) to authenticated,service_role;
grant execute on function public.search_prescription_text_suggestions(text,text,integer) to authenticated,service_role;
grant execute on function public.search_clinical_suggestions(text,text,integer) to authenticated,service_role;
grant execute on function public.get_prescription_appointment_context(uuid) to authenticated,service_role;
grant execute on function public.save_my_prescription(jsonb) to authenticated,service_role;
grant execute on function public.get_my_prescriptions(integer,integer) to authenticated,service_role;
grant execute on function public.get_my_prescription(uuid) to authenticated,service_role;

select 'STEP 26 DOCTOR PRESCRIPTION MODULE READY' as result;
