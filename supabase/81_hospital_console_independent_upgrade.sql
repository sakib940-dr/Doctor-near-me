-- ============================================================
-- STEP 81 — INDEPENDENT HOSPITAL CONSOLE
-- Additive only: Doctor Module and canonical appointments are untouched.
-- ============================================================

begin;

alter table public.provider_managed_doctor_cards
  add column if not exists contact_mode text not null default 'reception',
  add column if not exists individual_phone text,
  add column if not exists individual_whatsapp text,
  add column if not exists room_information text,
  add column if not exists archived_at timestamptz;

do $$ begin
  alter table public.provider_managed_doctor_cards
    add constraint provider_managed_doctor_cards_contact_mode_check
    check(contact_mode in ('reception','individual'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.provider_managed_doctor_cards
    add constraint provider_managed_doctor_cards_hospital_fields_limit
    check(
      char_length(coalesce(individual_phone,''))<=50 and
      char_length(coalesce(individual_whatsapp,''))<=50 and
      char_length(coalesce(room_information,''))<=250
    );
exception when duplicate_object then null; end $$;

create index if not exists idx_hospital_doctor_cards_owner_list
  on public.provider_managed_doctor_cards(provider_id,archived_at,is_active,sort_order,created_at,id);

create table if not exists public.hospital_staff_members (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers(id) on delete cascade,
  full_name text not null check(char_length(btrim(full_name)) between 2 and 150),
  designation text,
  department text,
  phone text,
  email text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hospital_staff_members_text_limits check(
    char_length(coalesce(designation,''))<=150 and
    char_length(coalesce(department,''))<=150 and
    char_length(coalesce(phone,''))<=50 and
    char_length(coalesce(email,''))<=254 and
    char_length(coalesce(notes,''))<=1000
  )
);

create index if not exists idx_hospital_staff_owner_list
  on public.hospital_staff_members(provider_id,is_active,created_at,id);

drop trigger if exists trg_hospital_staff_updated_at on public.hospital_staff_members;
create trigger trg_hospital_staff_updated_at before update on public.hospital_staff_members
for each row execute function public.set_updated_at();

alter table public.hospital_staff_members enable row level security;
revoke all on table public.hospital_staff_members from public,anon,authenticated;
grant select,insert,update,delete on table public.hospital_staff_members to service_role;

create or replace function public.is_my_active_hospital(p_provider_id uuid)
returns boolean
language sql stable security definer set search_path=public
as $$
  select coalesce(exists(
    select 1 from public.providers pr
    join public.profiles owner on owner.id=pr.owner_user_id
    where pr.id=p_provider_id and pr.owner_user_id=auth.uid()
      and pr.provider_type='hospital' and owner.role='hospital'
      and owner.account_status='active'
  ),false);
$$;

create or replace function public.get_my_hospital_doctor_cards(p_provider_id uuid)
returns jsonb
language plpgsql stable security definer set search_path=public
as $$
declare result jsonb;
begin
  if not public.is_my_active_hospital(p_provider_id) then raise exception 'HOSPITAL_OWNER_REQUIRED'; end if;
  select coalesce(jsonb_agg(to_jsonb(c) order by c.sort_order,c.created_at,c.id),'[]'::jsonb)
  into result
  from (
    select id,provider_id,doctor_name,photo_path,degree,designation,specialty,
      bmdc_registration_no,experience_years,consultation_fee,visiting_schedule,
      appointment_note,is_active,sort_order,contact_mode,individual_phone,
      individual_whatsapp,room_information,archived_at,created_at,updated_at
    from public.provider_managed_doctor_cards
    where provider_id=p_provider_id
  ) c;
  return result;
end;
$$;

create or replace function public.save_my_hospital_doctor_card(
  p_provider_id uuid,p_card_id uuid,p_doctor_name text,p_photo_path text default null,
  p_degree text default null,p_designation text default null,p_specialty text default null,
  p_bmdc_registration_no text default null,p_experience_years integer default null,
  p_consultation_fee numeric default null,p_visiting_schedule text default null,
  p_appointment_note text default null,p_room_information text default null,
  p_contact_mode text default 'reception',p_individual_phone text default null,
  p_individual_whatsapp text default null,p_is_active boolean default true,p_sort_order integer default 0
)
returns uuid
language plpgsql security definer set search_path=public
as $$
declare result_id uuid; clean_photo text:=nullif(btrim(coalesce(p_photo_path,'')),'');
begin
  if not public.is_my_active_hospital(p_provider_id) then raise exception 'HOSPITAL_OWNER_REQUIRED'; end if;
  if char_length(btrim(coalesce(p_doctor_name,''))) not between 2 and 150 then raise exception 'INVALID_DOCTOR_NAME'; end if;
  if coalesce(p_contact_mode,'reception') not in ('reception','individual') then raise exception 'INVALID_CONTACT_MODE'; end if;
  if clean_photo is not null and clean_photo not like auth.uid()::text||'/%' then raise exception 'PHOTO_MUST_BELONG_TO_HOSPITAL_OWNER'; end if;
  if p_experience_years is not null and p_experience_years not between 0 and 80 then raise exception 'INVALID_EXPERIENCE'; end if;
  if p_consultation_fee is not null and p_consultation_fee<0 then raise exception 'INVALID_FEE'; end if;
  if char_length(coalesce(p_degree,''))>250 or char_length(coalesce(p_designation,''))>250
    or char_length(coalesce(p_specialty,''))>250 or char_length(coalesce(p_bmdc_registration_no,''))>100
    or char_length(coalesce(p_visiting_schedule,''))>500 or char_length(coalesce(p_appointment_note,''))>500
    or char_length(coalesce(p_room_information,''))>250 or char_length(coalesce(p_individual_phone,''))>50
    or char_length(coalesce(p_individual_whatsapp,''))>50 then raise exception 'DOCTOR_FIELD_TOO_LONG'; end if;

  if p_card_id is null then
    insert into public.provider_managed_doctor_cards(
      provider_id,doctor_name,photo_path,degree,designation,specialty,bmdc_registration_no,
      experience_years,consultation_fee,visiting_schedule,appointment_note,room_information,
      contact_mode,individual_phone,individual_whatsapp,is_active,sort_order
    ) values(
      p_provider_id,btrim(p_doctor_name),clean_photo,nullif(btrim(coalesce(p_degree,'')),''),
      nullif(btrim(coalesce(p_designation,'')),''),nullif(btrim(coalesce(p_specialty,'')),''),
      nullif(btrim(coalesce(p_bmdc_registration_no,'')),''),p_experience_years,p_consultation_fee,
      nullif(btrim(coalesce(p_visiting_schedule,'')),''),nullif(btrim(coalesce(p_appointment_note,'')),''),
      nullif(btrim(coalesce(p_room_information,'')),''),coalesce(p_contact_mode,'reception'),
      nullif(btrim(coalesce(p_individual_phone,'')),''),nullif(btrim(coalesce(p_individual_whatsapp,'')),''),
      coalesce(p_is_active,true),coalesce(p_sort_order,0)
    ) returning id into result_id;
  else
    update public.provider_managed_doctor_cards set
      doctor_name=btrim(p_doctor_name),photo_path=clean_photo,
      degree=nullif(btrim(coalesce(p_degree,'')),''),designation=nullif(btrim(coalesce(p_designation,'')),''),
      specialty=nullif(btrim(coalesce(p_specialty,'')),''),bmdc_registration_no=nullif(btrim(coalesce(p_bmdc_registration_no,'')),''),
      experience_years=p_experience_years,consultation_fee=p_consultation_fee,
      visiting_schedule=nullif(btrim(coalesce(p_visiting_schedule,'')),''),appointment_note=nullif(btrim(coalesce(p_appointment_note,'')),''),
      room_information=nullif(btrim(coalesce(p_room_information,'')),''),contact_mode=coalesce(p_contact_mode,'reception'),
      individual_phone=nullif(btrim(coalesce(p_individual_phone,'')),''),individual_whatsapp=nullif(btrim(coalesce(p_individual_whatsapp,'')),''),
      is_active=coalesce(p_is_active,true),sort_order=coalesce(p_sort_order,0),archived_at=null
    where id=p_card_id and provider_id=p_provider_id returning id into result_id;
    if result_id is null then raise exception 'HOSPITAL_DOCTOR_NOT_FOUND'; end if;
  end if;
  return result_id;
end;
$$;

create or replace function public.set_my_hospital_doctor_visibility(p_provider_id uuid,p_card_id uuid,p_is_active boolean)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  if not public.is_my_active_hospital(p_provider_id) then raise exception 'HOSPITAL_OWNER_REQUIRED'; end if;
  update public.provider_managed_doctor_cards set is_active=coalesce(p_is_active,false)
  where id=p_card_id and provider_id=p_provider_id and archived_at is null;
  if not found then raise exception 'HOSPITAL_DOCTOR_NOT_FOUND'; end if;
  return true;
end $$;

create or replace function public.archive_my_hospital_doctor_card(p_provider_id uuid,p_card_id uuid,p_restore boolean default false)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  if not public.is_my_active_hospital(p_provider_id) then raise exception 'HOSPITAL_OWNER_REQUIRED'; end if;
  update public.provider_managed_doctor_cards
  set archived_at=case when coalesce(p_restore,false) then null else now() end,
      is_active=case when coalesce(p_restore,false) then false else false end
  where id=p_card_id and provider_id=p_provider_id;
  if not found then raise exception 'HOSPITAL_DOCTOR_NOT_FOUND'; end if;
  return true;
end $$;

create or replace function public.get_public_hospital_doctor_cards(p_provider_id uuid)
returns table(
  id uuid,provider_id uuid,doctor_name text,photo_path text,degree text,designation text,
  specialty text,bmdc_registration_no text,experience_years integer,consultation_fee numeric,
  visiting_schedule text,appointment_note text,sort_order integer,contact_mode text,
  individual_phone text,individual_whatsapp text,room_information text
)
language sql stable security definer set search_path=public as $$
  select c.id,c.provider_id,c.doctor_name,c.photo_path,c.degree,c.designation,c.specialty,
    c.bmdc_registration_no,c.experience_years,c.consultation_fee,c.visiting_schedule,
    c.appointment_note,c.sort_order,c.contact_mode,
    case when c.contact_mode='individual' then c.individual_phone else null end,
    case when c.contact_mode='individual' then c.individual_whatsapp else null end,
    c.room_information
  from public.provider_managed_doctor_cards c
  where c.provider_id=p_provider_id and c.is_active=true and c.archived_at is null
    and public.is_provider_publicly_listable(c.provider_id)
  order by c.sort_order,c.created_at,c.id;
$$;

-- Public Hospital base deliberately omits doctor_provider_links and Doctors.
create or replace function public.get_public_hospital_page_base(p_identifier text)
returns jsonb
language plpgsql stable security definer set search_path=public
as $$
declare route_json jsonb; hospital_id uuid; provider_json jsonb;
begin
  route_json:=public.resolve_public_provider_route(p_identifier);
  if route_json is null then return null; end if;
  hospital_id:=(route_json->>'id')::uuid;
  select jsonb_build_object(
    'id',v.id,'provider_type',v.provider_type,'name_bn',v.name_bn,'name_en',v.name_en,'slug',v.slug,
    'logo_url',v.logo_url,'banner_url',v.banner_url,'phone',v.phone,'address',v.address,
    'district_id',v.district_id,'upazila_id',v.upazila_id,'latitude',v.latitude,'longitude',v.longitude,
    'map_url',v.map_url,'verified',v.verified,'short_description',v.short_description,'whatsapp',v.whatsapp,
    'email',v.email,'facebook_url',v.facebook_url,'website_url',v.website_url,'opening_note',v.opening_note,
    'emergency_available',v.emergency_available,'about_bn',v.about_bn,'about_en',v.about_en
  ) into provider_json from public.public_provider_directory v where v.id=hospital_id and v.provider_type='hospital';
  if provider_json is null then return null; end if;
  return jsonb_build_object('route',route_json,'provider',provider_json,'content',public.get_public_provider_page_content(hospital_id));
end $$;

create or replace function public.get_my_hospital_staff(p_provider_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare result jsonb;
begin
  if not public.is_my_active_hospital(p_provider_id) then raise exception 'HOSPITAL_OWNER_REQUIRED'; end if;
  select coalesce(jsonb_agg(to_jsonb(s) order by s.created_at,s.id),'[]'::jsonb) into result
  from public.hospital_staff_members s where s.provider_id=p_provider_id;
  return result;
end $$;

create or replace function public.save_my_hospital_staff(
  p_provider_id uuid,p_staff_id uuid,p_full_name text,p_designation text default null,
  p_department text default null,p_phone text default null,p_email text default null,
  p_notes text default null,p_is_active boolean default true
)
returns uuid language plpgsql security definer set search_path=public as $$
declare result_id uuid;
begin
  if not public.is_my_active_hospital(p_provider_id) then raise exception 'HOSPITAL_OWNER_REQUIRED'; end if;
  if char_length(btrim(coalesce(p_full_name,''))) not between 2 and 150 then raise exception 'INVALID_STAFF_NAME'; end if;
  if p_staff_id is null then
    insert into public.hospital_staff_members(provider_id,full_name,designation,department,phone,email,notes,is_active)
    values(p_provider_id,btrim(p_full_name),nullif(btrim(coalesce(p_designation,'')),''),nullif(btrim(coalesce(p_department,'')),''),
      nullif(btrim(coalesce(p_phone,'')),''),nullif(btrim(coalesce(p_email,'')),''),nullif(btrim(coalesce(p_notes,'')),''),coalesce(p_is_active,true))
    returning id into result_id;
  else
    update public.hospital_staff_members set full_name=btrim(p_full_name),designation=nullif(btrim(coalesce(p_designation,'')),''),
      department=nullif(btrim(coalesce(p_department,'')),''),phone=nullif(btrim(coalesce(p_phone,'')),''),
      email=nullif(btrim(coalesce(p_email,'')),''),notes=nullif(btrim(coalesce(p_notes,'')),''),is_active=coalesce(p_is_active,true)
    where id=p_staff_id and provider_id=p_provider_id returning id into result_id;
    if result_id is null then raise exception 'HOSPITAL_STAFF_NOT_FOUND'; end if;
  end if;
  return result_id;
end $$;

create or replace function public.delete_my_hospital_staff(p_provider_id uuid,p_staff_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  if not public.is_my_active_hospital(p_provider_id) then raise exception 'HOSPITAL_OWNER_REQUIRED'; end if;
  delete from public.hospital_staff_members where id=p_staff_id and provider_id=p_provider_id;
  if not found then raise exception 'HOSPITAL_STAFF_NOT_FOUND'; end if;
  return true;
end $$;

-- Preserve reception-card photos during orphan cleanup.
create or replace function public.storage_object_reference_count(p_bucket text,p_name text)
returns bigint language plpgsql security definer stable set search_path=public,storage as $$
declare v_name text:=trim(coalesce(p_name,'')); v_count bigint:=0;
begin
  if v_name='' or p_bucket not in ('avatars','public-images','verification-documents') then return 0; end if;
  if v_name ~ '-opt-thumb\\.webp$' then v_name:=regexp_replace(v_name,'-opt-thumb\\.webp$','-opt.webp'); end if;
  if p_bucket='avatars' then
    select (select count(*) from public.profiles p where p.avatar_url=v_name and not exists(
      select 1 from public.doctors d where d.id=p.id and nullif(trim(coalesce(d.profile_photo_url,'')),'') is not null))
      +(select count(*) from public.doctors d where d.profile_photo_url=v_name) into v_count;
  elsif p_bucket='public-images' then
    select (select count(*) from public.providers p where p.logo_url=v_name or p.banner_url=v_name or v_name=any(coalesce(p.gallery_paths,'{}'::text[])))
      +(select count(*) from public.specialties s where s.icon_url=v_name)
      +(select count(*) from public.homepage_banners b where b.image_path=v_name)
      +(select count(*) from public.doctor_slider_images d where d.image=v_name)
      +(select count(*) from public.provider_services s where s.image=v_name)
      +(select count(*) from public.provider_gallery_images g where g.image=v_name)
      +(select count(*) from public.provider_slider_images s where s.image=v_name)
      +(select count(*) from public.provider_managed_doctor_cards c where c.photo_path=v_name)
    into v_count;
  else
    select (select count(*) from public.ambulance_verification_documents d where d.storage_path=v_name)
      +(select count(*) from public.entity_verification_documents d where d.storage_path=v_name) into v_count;
  end if;
  return coalesce(v_count,0);
end $$;

-- Independent, narrow upload permission for Hospital doctor photos.
drop policy if exists "hospital_doctor_photo_insert" on storage.objects;
create policy "hospital_doctor_photo_insert" on storage.objects for insert to authenticated
with check (
  bucket_id='public-images'
  and (storage.foldername(name))[1]=auth.uid()::text
  and (storage.foldername(name))[2]='hospital-doctors'
  and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='hospital' and p.account_status='active')
);

revoke all on function public.is_my_active_hospital(uuid) from public,anon;
revoke all on function public.get_my_hospital_doctor_cards(uuid) from public,anon;
revoke all on function public.save_my_hospital_doctor_card(uuid,uuid,text,text,text,text,text,text,integer,numeric,text,text,text,text,text,text,boolean,integer) from public,anon;
revoke all on function public.set_my_hospital_doctor_visibility(uuid,uuid,boolean) from public,anon;
revoke all on function public.archive_my_hospital_doctor_card(uuid,uuid,boolean) from public,anon;
revoke all on function public.get_public_hospital_doctor_cards(uuid) from public;
revoke all on function public.get_public_hospital_page_base(text) from public;
revoke all on function public.get_my_hospital_staff(uuid) from public,anon;
revoke all on function public.save_my_hospital_staff(uuid,uuid,text,text,text,text,text,text,boolean) from public,anon;
revoke all on function public.delete_my_hospital_staff(uuid,uuid) from public,anon;

grant execute on function public.is_my_active_hospital(uuid) to authenticated,service_role;
grant execute on function public.get_my_hospital_doctor_cards(uuid) to authenticated,service_role;
grant execute on function public.save_my_hospital_doctor_card(uuid,uuid,text,text,text,text,text,text,integer,numeric,text,text,text,text,text,text,boolean,integer) to authenticated,service_role;
grant execute on function public.set_my_hospital_doctor_visibility(uuid,uuid,boolean) to authenticated,service_role;
grant execute on function public.archive_my_hospital_doctor_card(uuid,uuid,boolean) to authenticated,service_role;
grant execute on function public.get_public_hospital_doctor_cards(uuid) to anon,authenticated,service_role;
grant execute on function public.get_public_hospital_page_base(text) to anon,authenticated,service_role;
grant execute on function public.get_my_hospital_staff(uuid) to authenticated,service_role;
grant execute on function public.save_my_hospital_staff(uuid,uuid,text,text,text,text,text,text,boolean) to authenticated,service_role;
grant execute on function public.delete_my_hospital_staff(uuid,uuid) to authenticated,service_role;

do $$ begin
  if has_table_privilege('authenticated','public.hospital_staff_members','INSERT') then
    raise exception 'STEP81: direct staff mutation must remain disabled';
  end if;
  if not has_function_privilege('anon','public.get_public_hospital_doctor_cards(uuid)','EXECUTE') then
    raise exception 'STEP81: public Hospital doctor read grant missing';
  end if;
  raise notice 'STEP 81 INDEPENDENT HOSPITAL CONSOLE PASSED';
end $$;

commit;
