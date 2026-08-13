-- ============================================================
-- STEP 17 — AMBULANCE SELF-SERVICE DASHBOARD SECURITY
-- Run after Step 16. Safe to re-run.
-- ============================================================

create or replace function public.save_my_ambulance_service(
  p_ambulance_id uuid default null,
  p_operator_name text default null,
  p_phone text default null,
  p_vehicle_registration_no text default null,
  p_vehicle_type text default null,
  p_address text default null,
  p_driver_name text default null,
  p_secondary_phone text default null,
  p_capabilities text[] default null,
  p_service_area text default null,
  p_district_id bigint default null,
  p_upazila_id bigint default null,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_price_note text default null,
  p_operates_24_hours boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  result_id uuid;
  is_new boolean:=p_ambulance_id is null;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  perform 1 from public.profiles
  where id=auth.uid() and role='ambulance' and account_status='active'
  for update;
  if not found then raise exception 'Active Ambulance account required'; end if;

  if length(trim(coalesce(p_operator_name,'')))<2 then raise exception 'Operator name is required'; end if;
  if length(regexp_replace(coalesce(p_phone,''),'[^0-9+]','','g'))<7 then raise exception 'A valid phone number is required'; end if;
  if length(trim(coalesce(p_vehicle_registration_no,'')))<3 then raise exception 'Vehicle registration number is required'; end if;
  if p_vehicle_type not in ('ac','non_ac','icu','freezer','basic','other') then raise exception 'Invalid vehicle type'; end if;
  if length(trim(coalesce(p_address,'')))<3 then raise exception 'Address is required'; end if;
  if cardinality(coalesce(p_capabilities,'{}'::text[]))>20 then raise exception 'Too many capabilities'; end if;
  if p_upazila_id is not null and not exists(
    select 1 from public.upazilas u
    where u.id=p_upazila_id and u.district_id=p_district_id and u.is_active
  ) then raise exception 'Upazila does not belong to selected district'; end if;
  if (p_latitude is null)<>(p_longitude is null) then raise exception 'Latitude and longitude must be provided together'; end if;
  if p_latitude is not null and not (p_latitude between -90 and 90) then raise exception 'Invalid latitude'; end if;
  if p_longitude is not null and not (p_longitude between -180 and 180) then raise exception 'Invalid longitude'; end if;

  if is_new then
    if exists(select 1 from public.ambulance_services where owner_user_id=auth.uid()) then
      raise exception 'This account already has an Ambulance listing';
    end if;
    insert into public.ambulance_services(
      owner_user_id,operator_name,driver_name,phone,secondary_phone,
      vehicle_registration_no,vehicle_type,capabilities,service_area,address,
      district_id,upazila_id,latitude,longitude,price_note,operates_24_hours,
      status,verified
    ) values(
      auth.uid(),trim(p_operator_name),nullif(trim(p_driver_name),''),trim(p_phone),
      nullif(trim(p_secondary_phone),''),upper(trim(p_vehicle_registration_no)),
      p_vehicle_type,coalesce(p_capabilities,'{}'::text[]),nullif(trim(p_service_area),''),
      trim(p_address),p_district_id,p_upazila_id,p_latitude,p_longitude,
      nullif(trim(p_price_note),''),coalesce(p_operates_24_hours,false),'pending',false
    ) returning id into result_id;
    insert into public.ambulance_availability(ambulance_id,is_available)
    values(result_id,false) on conflict(ambulance_id) do nothing;
  else
    update public.ambulance_services set
      operator_name=trim(p_operator_name),driver_name=nullif(trim(p_driver_name),''),
      phone=trim(p_phone),secondary_phone=nullif(trim(p_secondary_phone),''),
      vehicle_registration_no=upper(trim(p_vehicle_registration_no)),
      vehicle_type=p_vehicle_type,capabilities=coalesce(p_capabilities,'{}'::text[]),
      service_area=nullif(trim(p_service_area),''),address=trim(p_address),
      district_id=p_district_id,upazila_id=p_upazila_id,
      latitude=p_latitude,longitude=p_longitude,
      price_note=nullif(trim(p_price_note),''),
      operates_24_hours=coalesce(p_operates_24_hours,false),
      status='pending',verified=false,admin_note=null,verified_by=null,
      verified_at=null,updated_at=now()
    where id=p_ambulance_id and owner_user_id=auth.uid()
    returning id into result_id;
    if result_id is null then raise exception 'Ambulance listing not found or access denied'; end if;
    update public.ambulance_availability set is_available=false,last_seen_at=now()
    where ambulance_id=result_id;
  end if;

  update public.profiles set profile_completed=true,updated_at=now() where id=auth.uid();
  return jsonb_build_object('ambulance_id',result_id,'verification_reset',not is_new);
exception when unique_violation then
  raise exception 'This vehicle registration number is already in use';
end;
$$;

create or replace function public.set_my_ambulance_availability(
  p_ambulance_id uuid,p_is_available boolean,
  p_latitude double precision default null,p_longitude double precision default null,
  p_accuracy_meters numeric default null
)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
begin
  if not exists(
    select 1 from public.ambulance_services a
    join public.profiles owner on owner.id=a.owner_user_id
    where a.id=p_ambulance_id and a.owner_user_id=auth.uid()
      and a.status='approved' and a.verified
      and owner.role='ambulance' and owner.account_status='active'
  ) then raise exception 'Only an approved active Ambulance owner can update availability'; end if;
  if (p_latitude is null)<>(p_longitude is null) then raise exception 'Latitude and longitude must be provided together'; end if;
  if p_latitude is not null and not (p_latitude between -90 and 90) then raise exception 'Invalid latitude'; end if;
  if p_longitude is not null and not (p_longitude between -180 and 180) then raise exception 'Invalid longitude'; end if;
  if p_accuracy_meters is not null and p_accuracy_meters<0 then raise exception 'Invalid location accuracy'; end if;
  insert into public.ambulance_availability(
    ambulance_id,is_available,current_latitude,current_longitude,
    location_accuracy_meters,last_seen_at
  ) values(p_ambulance_id,coalesce(p_is_available,false),p_latitude,p_longitude,p_accuracy_meters,now())
  on conflict(ambulance_id) do update set
    is_available=excluded.is_available,current_latitude=excluded.current_latitude,
    current_longitude=excluded.current_longitude,
    location_accuracy_meters=excluded.location_accuracy_meters,
    last_seen_at=excluded.last_seen_at,updated_at=now();
  return true;
end;
$$;

create or replace function public.search_approved_hospitals_for_ambulance(
  p_query text default null,p_district_id bigint default null,p_limit integer default 30
)
returns table(hospital_id uuid,hospital_name text,address text,district_id bigint,upazila_id bigint)
language sql
stable
security definer
set search_path=public
as $$
  select p.id,p.name_bn,p.address,p.district_id,p.upazila_id
  from public.providers p
  where exists(
    select 1 from public.profiles me where me.id=auth.uid()
      and me.role='ambulance' and me.account_status='active'
  )
    and p.provider_type='hospital' and p.status='approved' and p.verified
    and (p_district_id is null or p.district_id=p_district_id)
    and (p_query is null or trim(p_query)='' or p.name_bn ilike '%'||trim(p_query)||'%'
      or p.name_en ilike '%'||trim(p_query)||'%' or p.address ilike '%'||trim(p_query)||'%')
  order by p.name_bn,p.id limit greatest(1,least(p_limit,50));
$$;

create or replace function public.request_ambulance_hospital_link(
  p_ambulance_id uuid,p_hospital_id uuid
)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
begin
  if not exists(
    select 1 from public.ambulance_services a join public.profiles owner on owner.id=a.owner_user_id
    where a.id=p_ambulance_id and a.owner_user_id=auth.uid()
      and owner.role='ambulance' and owner.account_status='active'
  ) then raise exception 'Ambulance listing not found or access denied'; end if;
  if not exists(
    select 1 from public.providers p where p.id=p_hospital_id
      and p.provider_type='hospital' and p.status='approved' and p.verified
  ) then raise exception 'Approved verified Hospital not found'; end if;
  insert into public.ambulance_hospital_links(
    ambulance_id,hospital_id,status,requested_by,reviewed_by,review_note
  ) values(p_ambulance_id,p_hospital_id,'pending',auth.uid(),null,null)
  on conflict(ambulance_id,hospital_id) do update set
    status='pending',requested_by=auth.uid(),reviewed_by=null,
    review_note=null,updated_at=now();
  return true;
end;
$$;

create or replace function public.get_my_ambulance_documents(p_ambulance_id uuid)
returns table(document_id uuid,document_type text,storage_path text,created_at timestamptz)
language sql
stable
security definer
set search_path=public
as $$
  select d.id,d.document_type,d.storage_path,d.created_at
  from public.ambulance_verification_documents d
  join public.ambulance_services a on a.id=d.ambulance_id
  join public.profiles owner on owner.id=a.owner_user_id
  where d.ambulance_id=p_ambulance_id and a.owner_user_id=auth.uid()
    and owner.role='ambulance' and owner.account_status='active'
  order by d.created_at desc,d.id;
$$;

create or replace function public.can_write_ambulance_verification_object(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path=public,storage
as $$
declare parts text[]; ambulance_uuid uuid;
begin
  parts:=storage.foldername(p_name);
  if coalesce(array_length(parts,1),0)<2 or parts[1]<>'ambulances' then return false; end if;
  ambulance_uuid:=parts[2]::uuid;
  return exists(
    select 1 from public.ambulance_services a
    join public.profiles owner on owner.id=a.owner_user_id
    where a.id=ambulance_uuid and a.owner_user_id=auth.uid()
      and a.status in ('pending','rejected')
      and owner.role='ambulance' and owner.account_status='active'
  );
exception when invalid_text_representation then return false;
end;
$$;

revoke all on function public.can_write_ambulance_verification_object(text) from public,anon;
grant execute on function public.can_write_ambulance_verification_object(text) to authenticated,service_role;

drop policy if exists "verification_documents_insert" on storage.objects;
create policy "verification_documents_insert"
on storage.objects for insert to authenticated
with check(
  bucket_id='verification-documents'
  and public.can_write_ambulance_verification_object(name)
);

drop policy if exists "verification_documents_delete" on storage.objects;
create policy "verification_documents_delete"
on storage.objects for delete to authenticated
using(
  bucket_id='verification-documents' and owner_id=auth.uid()::text
  and public.can_write_ambulance_verification_object(name)
);

create or replace function public.add_my_ambulance_document(
  p_ambulance_id uuid,p_document_type text,p_storage_path text
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare result_id uuid;
begin
  if p_document_type not in ('vehicle_registration','driver_license','national_id','organization_document','vehicle_photo','other') then
    raise exception 'Invalid document type';
  end if;
  if p_storage_path not like 'ambulances/'||p_ambulance_id::text||'/%' then
    raise exception 'Invalid document storage path';
  end if;
  if not exists(
    select 1 from public.ambulance_services a join public.profiles owner on owner.id=a.owner_user_id
    where a.id=p_ambulance_id and a.owner_user_id=auth.uid()
      and a.status in ('pending','rejected')
      and owner.role='ambulance' and owner.account_status='active'
  ) then raise exception 'Documents can be changed only while verification is pending or rejected'; end if;
  insert into public.ambulance_verification_documents(
    ambulance_id,document_type,storage_path,uploaded_by
  ) values(p_ambulance_id,p_document_type,p_storage_path,auth.uid())
  returning id into result_id;
  update public.ambulance_services set status='pending',verified=false,
    admin_note=null,verified_by=null,verified_at=null,updated_at=now()
  where id=p_ambulance_id;
  return result_id;
end;
$$;

create or replace function public.delete_my_ambulance_document(p_document_id uuid)
returns text
language plpgsql
security definer
set search_path=public
as $$
declare result_path text;
begin
  delete from public.ambulance_verification_documents d
  using public.ambulance_services a,public.profiles owner
  where d.id=p_document_id and a.id=d.ambulance_id
    and owner.id=a.owner_user_id and a.owner_user_id=auth.uid()
    and a.status in ('pending','rejected')
    and owner.role='ambulance' and owner.account_status='active'
  returning d.storage_path into result_path;
  if result_path is null then raise exception 'Document not found or cannot be deleted'; end if;
  return result_path;
end;
$$;

create or replace function public.respond_to_ambulance_hospital_link(
  p_ambulance_id uuid,p_hospital_id uuid,p_status text,p_review_note text default null
)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
begin
  if p_status not in ('approved','rejected','removed') then raise exception 'Invalid link status'; end if;
  if not (
    public.is_admin_or_above() or exists(
      select 1 from public.providers p join public.profiles owner on owner.id=p.owner_user_id
      where p.id=p_hospital_id and p.provider_type='hospital'
        and p.owner_user_id=auth.uid() and owner.role in ('hospital','chamber')
        and owner.account_status='active'
    )
  ) then raise exception 'Active Hospital owner or Admin access required'; end if;
  update public.ambulance_hospital_links set status=p_status,
    reviewed_by=auth.uid(),review_note=nullif(trim(p_review_note),''),updated_at=now()
  where ambulance_id=p_ambulance_id and hospital_id=p_hospital_id;
  if not found then raise exception 'Hospital link request not found'; end if;
  return true;
end;
$$;

create or replace function public.get_hospital_ambulance_link_requests(
  p_hospital_id uuid,p_status text default 'pending'
)
returns table(
  ambulance_id uuid,operator_name text,phone text,
  vehicle_registration_no text,vehicle_type text,
  ambulance_status public.provider_status,link_status text,
  requested_at timestamptz,review_note text
)
language plpgsql
stable
security definer
set search_path=public
as $$
begin
  if not (
    public.is_admin_or_above() or exists(
      select 1 from public.providers p join public.profiles owner on owner.id=p.owner_user_id
      where p.id=p_hospital_id and p.provider_type='hospital'
        and p.owner_user_id=auth.uid() and owner.role='hospital'
        and owner.account_status='active'
    )
  ) then raise exception 'Active Hospital owner or Admin access required'; end if;
  return query
  select a.id,a.operator_name,a.phone,a.vehicle_registration_no,a.vehicle_type,
    a.status,l.status,l.created_at,l.review_note
  from public.ambulance_hospital_links l
  join public.ambulance_services a on a.id=l.ambulance_id
  where l.hospital_id=p_hospital_id and (p_status is null or l.status=p_status)
  order by case l.status when 'pending' then 0 when 'approved' then 1 else 2 end,
    l.created_at,a.id;
end;
$$;

-- Sensitive document metadata is now RPC-only. Storage objects remain guarded
-- by the owner-scoped private bucket policies from Step 11.
revoke insert,delete on table public.ambulance_verification_documents from public,anon,authenticated;
revoke insert,update,delete on table public.ambulance_services from public,anon,authenticated;
revoke insert,update,delete on table public.ambulance_availability from public,anon,authenticated;
revoke insert,update,delete on table public.ambulance_hospital_links from public,anon,authenticated;

-- Legacy self-registration/update APIs are backend/admin compatibility helpers.
-- Browser owners use save_my_ambulance_service, which requires Ambulance role.
revoke all on function public.register_ambulance_service(text,text,text,text,text,text,text,text[],text,bigint,bigint,double precision,double precision,text,boolean,uuid) from public,anon,authenticated;
grant execute on function public.register_ambulance_service(text,text,text,text,text,text,text,text[],text,bigint,bigint,double precision,double precision,text,boolean,uuid) to service_role;
revoke all on function public.update_my_ambulance_service(uuid,text,text,text,text,text,text,text,text[],text,bigint,bigint,double precision,double precision,text,boolean) from public,anon,authenticated;
grant execute on function public.update_my_ambulance_service(uuid,text,text,text,text,text,text,text,text[],text,bigint,bigint,double precision,double precision,text,boolean) to service_role;

revoke all on function public.save_my_ambulance_service(uuid,text,text,text,text,text,text,text,text[],text,bigint,bigint,double precision,double precision,text,boolean) from public,anon;
grant execute on function public.save_my_ambulance_service(uuid,text,text,text,text,text,text,text,text[],text,bigint,bigint,double precision,double precision,text,boolean) to authenticated,service_role;
revoke all on function public.search_approved_hospitals_for_ambulance(text,bigint,integer) from public,anon;
grant execute on function public.search_approved_hospitals_for_ambulance(text,bigint,integer) to authenticated,service_role;
revoke all on function public.get_my_ambulance_documents(uuid) from public,anon;
grant execute on function public.get_my_ambulance_documents(uuid) to authenticated,service_role;
revoke all on function public.add_my_ambulance_document(uuid,text,text) from public,anon;
grant execute on function public.add_my_ambulance_document(uuid,text,text) to authenticated,service_role;
revoke all on function public.delete_my_ambulance_document(uuid) from public,anon;
grant execute on function public.delete_my_ambulance_document(uuid) to authenticated,service_role;
revoke all on function public.set_my_ambulance_availability(uuid,boolean,double precision,double precision,numeric) from public,anon;
grant execute on function public.set_my_ambulance_availability(uuid,boolean,double precision,double precision,numeric) to authenticated,service_role;
revoke all on function public.request_ambulance_hospital_link(uuid,uuid) from public,anon;
grant execute on function public.request_ambulance_hospital_link(uuid,uuid) to authenticated,service_role;
revoke all on function public.respond_to_ambulance_hospital_link(uuid,uuid,text,text) from public,anon;
grant execute on function public.respond_to_ambulance_hospital_link(uuid,uuid,text,text) to authenticated,service_role;
revoke all on function public.get_hospital_ambulance_link_requests(uuid,text) from public,anon;
grant execute on function public.get_hospital_ambulance_link_requests(uuid,text) to authenticated,service_role;

do $assert$
begin
  if has_table_privilege('authenticated','public.ambulance_services','UPDATE')
     or has_table_privilege('authenticated','public.ambulance_verification_documents','INSERT')
     or has_table_privilege('authenticated','public.ambulance_hospital_links','UPDATE') then
    raise exception 'Step 17 failed: direct Ambulance mutation grant remains';
  end if;
  if has_function_privilege('anon','public.save_my_ambulance_service(uuid,text,text,text,text,text,text,text,text[],text,bigint,bigint,double precision,double precision,text,boolean)','EXECUTE') then
    raise exception 'Step 17 failed: anon Ambulance save must be blocked';
  end if;
  if has_function_privilege('authenticated','public.register_ambulance_service(text,text,text,text,text,text,text,text[],text,bigint,bigint,double precision,double precision,text,boolean,uuid)','EXECUTE') then
    raise exception 'Step 17 failed: legacy role-changing registration remains browser-callable';
  end if;
  if not has_function_privilege('authenticated','public.add_my_ambulance_document(uuid,text,text)','EXECUTE') then
    raise exception 'Step 17 failed: document RPC grant missing';
  end if;
end;
$assert$;

select 'STEP 17 AMBULANCE DASHBOARD SECURITY PASSED' as result;
