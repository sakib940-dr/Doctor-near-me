-- ============================================================
-- STEP 18 — VERIFICATION OFFICER DASHBOARD + EVIDENCE
-- Run after Step 17. Safe to re-run.
-- ============================================================

alter table public.doctors
  add column if not exists verification_note text,
  add column if not exists verified_by uuid references public.profiles(id) on delete set null,
  add column if not exists verified_at timestamptz;

alter table public.providers
  add column if not exists verification_note text,
  add column if not exists verified_by uuid references public.profiles(id) on delete set null,
  add column if not exists verified_at timestamptz;

create or replace function public.clear_doctor_verification_review_on_resubmit()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.verification_status='pending' and old.verification_status is distinct from new.verification_status then
    new.verification_note:=null; new.verified_by:=null; new.verified_at:=null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_doctor_clear_review_on_resubmit on public.doctors;
create trigger trg_doctor_clear_review_on_resubmit
before update on public.doctors for each row
execute function public.clear_doctor_verification_review_on_resubmit();

create or replace function public.clear_provider_verification_review_on_resubmit()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.status='pending' and old.status is distinct from new.status then
    new.verification_note:=null; new.verified_by:=null; new.verified_at:=null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_provider_clear_review_on_resubmit on public.providers;
create trigger trg_provider_clear_review_on_resubmit
before update on public.providers for each row
execute function public.clear_provider_verification_review_on_resubmit();

revoke all on function public.clear_doctor_verification_review_on_resubmit()
from public,anon,authenticated;
revoke all on function public.clear_provider_verification_review_on_resubmit()
from public,anon,authenticated;

create table if not exists public.entity_verification_documents(
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check(entity_type in ('doctor','provider')),
  entity_id uuid not null,
  document_type text not null check(document_type in (
    'bmdc_certificate','medical_degree','national_id','trade_license',
    'organization_document','facility_photo','other'
  )),
  storage_path text not null,
  uploaded_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(entity_type,entity_id,document_type,storage_path)
);

create index if not exists idx_entity_verification_documents_entity
on public.entity_verification_documents(entity_type,entity_id,created_at desc);

alter table public.entity_verification_documents enable row level security;
revoke all on table public.entity_verification_documents from public,anon,authenticated;

create or replace function public.is_entity_verification_owner(
  p_entity_type text,p_entity_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select case p_entity_type
    when 'doctor' then exists(
      select 1 from public.profiles p
      where p.id=p_entity_id and p.id=auth.uid()
        and p.role='doctor' and p.account_status='active'
    )
    when 'provider' then exists(
      select 1 from public.providers pr
      join public.profiles p on p.id=pr.owner_user_id
      where pr.id=p_entity_id and pr.owner_user_id=auth.uid()
        and p.role in ('hospital','chamber') and p.account_status='active'
    )
    else false
  end;
$$;

create or replace function public.can_write_entity_verification(
  p_entity_type text,p_entity_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select public.is_entity_verification_owner(p_entity_type,p_entity_id)
    and case p_entity_type
      when 'doctor' then exists(
        select 1 from public.doctors d where d.id=p_entity_id
          and d.verification_status in ('pending','rejected')
      )
      when 'provider' then exists(
        select 1 from public.providers p where p.id=p_entity_id
          and p.status in ('pending','rejected')
      )
      else false
    end;
$$;

create or replace function public.can_access_verification_object(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path=public,storage
as $$
declare parts text[]; entity_uuid uuid;
begin
  if public.is_verification_staff() then return true; end if;
  parts:=storage.foldername(p_name);
  if coalesce(array_length(parts,1),0)<2 then return false; end if;
  entity_uuid:=parts[2]::uuid;
  if parts[1]='ambulances' then return public.is_ambulance_owner(entity_uuid); end if;
  if parts[1]='doctors' then return public.is_entity_verification_owner('doctor',entity_uuid); end if;
  if parts[1]='providers' then return public.is_entity_verification_owner('provider',entity_uuid); end if;
  return false;
exception when invalid_text_representation then return false;
end;
$$;

create or replace function public.can_write_verification_object(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path=public,storage
as $$
declare parts text[]; entity_uuid uuid;
begin
  parts:=storage.foldername(p_name);
  if coalesce(array_length(parts,1),0)<2 then return false; end if;
  entity_uuid:=parts[2]::uuid;
  if parts[1]='ambulances' then return public.can_write_ambulance_verification_object(p_name); end if;
  if parts[1]='doctors' then return public.can_write_entity_verification('doctor',entity_uuid); end if;
  if parts[1]='providers' then return public.can_write_entity_verification('provider',entity_uuid); end if;
  return false;
exception when invalid_text_representation then return false;
end;
$$;

revoke all on function public.is_entity_verification_owner(text,uuid) from public,anon;
grant execute on function public.is_entity_verification_owner(text,uuid) to authenticated,service_role;
revoke all on function public.can_write_entity_verification(text,uuid) from public,anon;
grant execute on function public.can_write_entity_verification(text,uuid) to authenticated,service_role;
revoke all on function public.can_access_verification_object(text) from public,anon;
grant execute on function public.can_access_verification_object(text) to authenticated,service_role;
revoke all on function public.can_write_verification_object(text) from public,anon;
grant execute on function public.can_write_verification_object(text) to authenticated,service_role;

drop policy if exists "verification_documents_read" on storage.objects;
create policy "verification_documents_read"
on storage.objects for select to authenticated
using(bucket_id='verification-documents' and public.can_access_verification_object(name));

drop policy if exists "verification_documents_insert" on storage.objects;
create policy "verification_documents_insert"
on storage.objects for insert to authenticated
with check(bucket_id='verification-documents' and public.can_write_verification_object(name));

drop policy if exists "verification_documents_delete" on storage.objects;
create policy "verification_documents_delete"
on storage.objects for delete to authenticated
using(
  bucket_id='verification-documents' and owner_id=auth.uid()::text
  and public.can_write_verification_object(name)
);

create or replace function public.get_my_entity_verification_evidence(
  p_entity_type text,p_entity_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare result jsonb;
begin
  if not public.is_entity_verification_owner(p_entity_type,p_entity_id) then
    raise exception 'Entity not found or access denied';
  end if;
  if p_entity_type='doctor' then
    select jsonb_build_object(
      'entity_type','doctor','entity_id',d.id,
      'status',d.verification_status,'note',d.verification_note,
      'verified_at',d.verified_at,
      'documents',coalesce((select jsonb_agg(jsonb_build_object(
        'document_id',x.id,'document_type',x.document_type,
        'storage_path',x.storage_path,'created_at',x.created_at
      ) order by x.created_at desc) from public.entity_verification_documents x
        where x.entity_type='doctor' and x.entity_id=d.id),'[]'::jsonb)
    ) into result from public.doctors d where d.id=p_entity_id;
  elsif p_entity_type='provider' then
    select jsonb_build_object(
      'entity_type','provider','entity_id',p.id,
      'status',p.status,'note',p.verification_note,
      'verified_at',p.verified_at,
      'documents',coalesce((select jsonb_agg(jsonb_build_object(
        'document_id',x.id,'document_type',x.document_type,
        'storage_path',x.storage_path,'created_at',x.created_at
      ) order by x.created_at desc) from public.entity_verification_documents x
        where x.entity_type='provider' and x.entity_id=p.id),'[]'::jsonb)
    ) into result from public.providers p where p.id=p_entity_id;
  else raise exception 'Invalid entity type';
  end if;
  return result;
end;
$$;

create or replace function public.add_my_entity_verification_document(
  p_entity_type text,p_entity_id uuid,p_document_type text,p_storage_path text
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare result_id uuid; expected_folder text;
begin
  if p_entity_type not in ('doctor','provider') then raise exception 'Invalid entity type'; end if;
  if p_document_type not in ('bmdc_certificate','medical_degree','national_id','trade_license','organization_document','facility_photo','other') then
    raise exception 'Invalid document type';
  end if;
  expected_folder:=case when p_entity_type='doctor' then 'doctors/' else 'providers/' end;
  if p_storage_path not like expected_folder||p_entity_id::text||'/%' then
    raise exception 'Invalid document storage path';
  end if;
  if not public.can_write_entity_verification(p_entity_type,p_entity_id) then
    raise exception 'Evidence can be changed only while pending or rejected';
  end if;
  insert into public.entity_verification_documents(
    entity_type,entity_id,document_type,storage_path,uploaded_by
  ) values(p_entity_type,p_entity_id,p_document_type,p_storage_path,auth.uid())
  returning id into result_id;
  if p_entity_type='doctor' then
    update public.doctors set verification_status='pending',bmdc_verified=false,
      verification_note=null,verified_by=null,verified_at=null,updated_at=now()
    where id=p_entity_id;
  else
    update public.providers set status='pending',verified=false,
      verification_note=null,verified_by=null,verified_at=null,updated_at=now()
    where id=p_entity_id;
  end if;
  return result_id;
end;
$$;

create or replace function public.delete_my_entity_verification_document(p_document_id uuid)
returns text
language plpgsql
security definer
set search_path=public
as $$
declare result_path text;
begin
  delete from public.entity_verification_documents d
  where d.id=p_document_id
    and d.uploaded_by=auth.uid()
    and public.can_write_entity_verification(d.entity_type,d.entity_id)
  returning d.storage_path into result_path;
  if result_path is null then raise exception 'Document not found or cannot be deleted'; end if;
  return result_path;
end;
$$;

create or replace function public.get_verification_review_queue(
  p_entity_type text default null,p_status text default 'pending',
  p_limit integer default 50,p_offset integer default 0
)
returns table(
  entity_type text,entity_id uuid,display_name text,subtitle text,
  district_id bigint,upazila_id bigint,status text,evidence_count bigint,
  submitted_at timestamptz
)
language plpgsql
stable
security definer
set search_path=public
as $$
begin
  if not public.is_verification_staff() then raise exception 'Verification staff access required'; end if;
  if p_entity_type is not null and p_entity_type not in ('doctor','provider','ambulance') then raise exception 'Invalid entity type'; end if;
  if p_status is not null and p_status not in ('pending','approved','rejected','suspended','expired') then raise exception 'Invalid status'; end if;
  return query
  select q.entity_type,q.entity_id,q.display_name,q.subtitle,q.district_id,
    q.upazila_id,q.status,q.evidence_count,q.submitted_at
  from (
    select 'doctor'::text entity_type,d.id entity_id,p.full_name display_name,
      coalesce(d.bmdc_registration_no,d.degree,d.designation) subtitle,
      p.district_id,p.upazila_id,d.verification_status::text status,
      (select count(*) from public.entity_verification_documents x
        where x.entity_type='doctor' and x.entity_id=d.id) evidence_count,
      d.updated_at submitted_at
    from public.doctors d join public.profiles p on p.id=d.id
    where p.account_status='active'
    union all
    select 'provider',pr.id,pr.name_bn,pr.provider_type,pr.district_id,pr.upazila_id,
      pr.status::text,(select count(*) from public.entity_verification_documents x
        where x.entity_type='provider' and x.entity_id=pr.id),pr.updated_at
    from public.providers pr join public.profiles owner on owner.id=pr.owner_user_id
    where owner.account_status='active'
    union all
    select 'ambulance',a.id,a.operator_name,a.vehicle_registration_no,
      a.district_id,a.upazila_id,a.status::text,
      (select count(*) from public.ambulance_verification_documents x
        where x.ambulance_id=a.id),a.updated_at
    from public.ambulance_services a join public.profiles owner on owner.id=a.owner_user_id
    where owner.account_status='active'
  ) q
  where (p_entity_type is null or q.entity_type=p_entity_type)
    and (p_status is null or q.status=p_status)
  order by q.submitted_at,q.entity_type,q.entity_id
  limit greatest(1,least(p_limit,100)) offset greatest(p_offset,0);
end;
$$;

create or replace function public.get_verification_review_detail(
  p_entity_type text,p_entity_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare result jsonb;
begin
  if not public.is_verification_staff() then raise exception 'Verification staff access required'; end if;
  if p_entity_type='doctor' then
    select jsonb_build_object(
      'entity_type','doctor','entity_id',d.id,'owner_id',d.id,
      'status',d.verification_status,'note',d.verification_note,
      'verified_at',d.verified_at,'data',jsonb_build_object(
        'full_name',p.full_name,'email',p.email,'phone',p.phone,
        'district_id',p.district_id,'upazila_id',p.upazila_id,
        'degree',d.degree,'designation',d.designation,
        'professional_title',d.professional_title,
        'bmdc_registration_no',d.bmdc_registration_no,
        'experience_years',d.experience_years,
        'profile_photo_url',coalesce(d.profile_photo_url,p.avatar_url),
        'specialties',coalesce((select jsonb_agg(s.name_bn order by s.sort_order,s.id)
          from public.doctor_specialties ds join public.specialties s on s.id=ds.specialty_id
          where ds.doctor_id=d.id),'[]'::jsonb)
      ),'documents',coalesce((select jsonb_agg(jsonb_build_object(
        'document_id',x.id,'document_type',x.document_type,
        'storage_path',x.storage_path,'created_at',x.created_at
      ) order by x.created_at desc) from public.entity_verification_documents x
        where x.entity_type='doctor' and x.entity_id=d.id),'[]'::jsonb)
    ) into result from public.doctors d join public.profiles p on p.id=d.id
    where d.id=p_entity_id;
  elsif p_entity_type='provider' then
    select jsonb_build_object(
      'entity_type','provider','entity_id',pr.id,'owner_id',pr.owner_user_id,
      'status',pr.status,'note',pr.verification_note,'verified_at',pr.verified_at,
      'data',jsonb_build_object(
        'provider_type',pr.provider_type,'name_bn',pr.name_bn,'name_en',pr.name_en,
        'phone',pr.phone,'email',pr.email,'address',pr.address,
        'district_id',pr.district_id,'upazila_id',pr.upazila_id,
        'short_description',pr.short_description,'website_url',pr.website_url,
        'logo_url',pr.logo_url,'banner_url',pr.banner_url,
        'departments',pr.departments,'services',pr.services,
        'gallery_paths',pr.gallery_paths
      ),'documents',coalesce((select jsonb_agg(jsonb_build_object(
        'document_id',x.id,'document_type',x.document_type,
        'storage_path',x.storage_path,'created_at',x.created_at
      ) order by x.created_at desc) from public.entity_verification_documents x
        where x.entity_type='provider' and x.entity_id=pr.id),'[]'::jsonb)
    ) into result from public.providers pr where pr.id=p_entity_id;
  elsif p_entity_type='ambulance' then
    select jsonb_build_object(
      'entity_type','ambulance','entity_id',a.id,'owner_id',a.owner_user_id,
      'status',a.status,'note',a.admin_note,'verified_at',a.verified_at,
      'data',jsonb_build_object(
        'operator_name',a.operator_name,'driver_name',a.driver_name,
        'phone',a.phone,'secondary_phone',a.secondary_phone,
        'vehicle_registration_no',a.vehicle_registration_no,
        'vehicle_type',a.vehicle_type,'capabilities',a.capabilities,
        'service_area',a.service_area,'address',a.address,
        'district_id',a.district_id,'upazila_id',a.upazila_id,
        'latitude',a.latitude,'longitude',a.longitude,
        'operates_24_hours',a.operates_24_hours
      ),'documents',coalesce((select jsonb_agg(jsonb_build_object(
        'document_id',x.id,'document_type',x.document_type,
        'storage_path',x.storage_path,'created_at',x.created_at
      ) order by x.created_at desc) from public.ambulance_verification_documents x
        where x.ambulance_id=a.id),'[]'::jsonb)
    ) into result from public.ambulance_services a where a.id=p_entity_id;
  else raise exception 'Invalid entity type';
  end if;
  if result is null then raise exception 'Review item not found'; end if;
  return result;
end;
$$;

create or replace function public.decide_verification_review(
  p_entity_type text,p_entity_id uuid,p_status text,p_review_note text default null
)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare target_owner uuid; target_name text;
begin
  if not public.is_verification_staff() then raise exception 'Verification staff access required'; end if;
  if p_status not in ('approved','rejected') then raise exception 'Decision must be approved or rejected'; end if;
  if p_status='rejected' and length(trim(coalesce(p_review_note,'')))<3 then
    raise exception 'A rejection reason is required';
  end if;
  if p_entity_type='doctor' then
    update public.doctors d set verification_status=p_status::public.verification_status,
      bmdc_verified=(p_status='approved'),verification_note=nullif(trim(p_review_note),''),
      verified_by=auth.uid(),verified_at=now(),updated_at=now()
    from public.profiles p where d.id=p_entity_id and p.id=d.id
    returning d.id,p.full_name into target_owner,target_name;
  elsif p_entity_type='provider' then
    update public.providers set status=p_status::public.provider_status,
      verified=(p_status='approved'),verification_note=nullif(trim(p_review_note),''),
      verified_by=auth.uid(),verified_at=now(),updated_at=now()
    where id=p_entity_id returning owner_user_id,name_bn into target_owner,target_name;
  elsif p_entity_type='ambulance' then
    update public.ambulance_services set status=p_status::public.provider_status,
      verified=(p_status='approved'),admin_note=nullif(trim(p_review_note),''),
      verified_by=auth.uid(),verified_at=now(),updated_at=now()
    where id=p_entity_id returning owner_user_id,operator_name into target_owner,target_name;
    if p_status='rejected' then
      update public.ambulance_availability set is_available=false,last_seen_at=now()
      where ambulance_id=p_entity_id;
    end if;
  else raise exception 'Invalid entity type';
  end if;
  if target_owner is null then raise exception 'Review item not found'; end if;
  insert into public.notifications(recipient_id,sender_id,type,title_bn,body_bn,data)
  values(target_owner,auth.uid(),'verification_decision','ভেরিফিকেশন আপডেট',
    case when p_status='approved' then 'আপনার আবেদন অনুমোদিত হয়েছে।'
      else 'আপনার আবেদন অনুমোদিত হয়নি। Review note দেখে তথ্য সংশোধন করুন।' end,
    jsonb_build_object('entity_type',p_entity_type,'entity_id',p_entity_id,
      'status',p_status,'review_note',nullif(trim(p_review_note),'')));
  insert into public.admin_audit_logs(
    actor_id,action,target_user_id,target_type,target_id,metadata
  ) values(auth.uid(),'verification_decision',target_owner,p_entity_type,p_entity_id::text,
    jsonb_build_object('status',p_status,'review_note',nullif(trim(p_review_note),''),
      'display_name',target_name));
  return true;
end;
$$;

revoke all on function public.get_my_entity_verification_evidence(text,uuid) from public,anon;
grant execute on function public.get_my_entity_verification_evidence(text,uuid) to authenticated,service_role;
revoke all on function public.add_my_entity_verification_document(text,uuid,text,text) from public,anon;
grant execute on function public.add_my_entity_verification_document(text,uuid,text,text) to authenticated,service_role;
revoke all on function public.delete_my_entity_verification_document(uuid) from public,anon;
grant execute on function public.delete_my_entity_verification_document(uuid) to authenticated,service_role;
revoke all on function public.get_verification_review_queue(text,text,integer,integer) from public,anon;
grant execute on function public.get_verification_review_queue(text,text,integer,integer) to authenticated,service_role;
revoke all on function public.get_verification_review_detail(text,uuid) from public,anon;
grant execute on function public.get_verification_review_detail(text,uuid) to authenticated,service_role;
revoke all on function public.decide_verification_review(text,uuid,text,text) from public,anon;
grant execute on function public.decide_verification_review(text,uuid,text,text) to authenticated,service_role;

do $assert$
begin
  if has_table_privilege('authenticated','public.entity_verification_documents','INSERT')
     or has_table_privilege('authenticated','public.doctors','UPDATE')
     or has_table_privilege('authenticated','public.providers','UPDATE') then
    raise exception 'Step 18 failed: direct verification mutation grant remains';
  end if;
  if has_function_privilege('anon','public.get_verification_review_queue(text,text,integer,integer)','EXECUTE') then
    raise exception 'Step 18 failed: anon review queue access remains';
  end if;
  if not has_function_privilege('authenticated','public.decide_verification_review(text,uuid,text,text)','EXECUTE') then
    raise exception 'Step 18 failed: authenticated decision RPC grant missing';
  end if;
end;
$assert$;

select 'STEP 18 VERIFICATION OFFICER SECURITY PASSED' as result;
