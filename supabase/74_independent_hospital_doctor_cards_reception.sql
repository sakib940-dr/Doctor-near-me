-- ============================================================
-- STEP 74 — INDEPENDENT HOSPITAL DOCTOR CARDS + RECEPTION QUEUE
-- Run after Step 73. Existing Doctor/provider links remain untouched for
-- backward compatibility, but the new Hospital UI does not require them.
-- ============================================================

begin;

create table if not exists public.provider_managed_doctor_cards (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers(id) on delete cascade,
  doctor_name text not null check(char_length(btrim(doctor_name)) between 2 and 150),
  photo_path text,
  degree text,
  designation text,
  specialty text,
  bmdc_registration_no text,
  experience_years integer check(experience_years is null or experience_years between 0 and 80),
  consultation_fee numeric(12,2) check(consultation_fee is null or consultation_fee>=0),
  visiting_schedule text,
  appointment_note text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_managed_doctor_cards_text_limits check(
    char_length(coalesce(degree,''))<=250 and
    char_length(coalesce(designation,''))<=250 and
    char_length(coalesce(specialty,''))<=250 and
    char_length(coalesce(bmdc_registration_no,''))<=100 and
    char_length(coalesce(visiting_schedule,''))<=500 and
    char_length(coalesce(appointment_note,''))<=500
  )
);

create index if not exists idx_provider_managed_doctor_cards_public
  on public.provider_managed_doctor_cards(provider_id,is_active,sort_order,id);

create table if not exists public.provider_reception_appointments (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers(id) on delete cascade,
  doctor_card_id uuid not null references public.provider_managed_doctor_cards(id) on delete restrict,
  patient_id uuid not null references public.profiles(id) on delete cascade,
  appointment_date date not null,
  preferred_time time,
  patient_note text,
  serial_number integer check(serial_number is null or serial_number>0),
  status text not null default 'pending'
    check(status in ('pending','confirmed','rejected','cancelled','completed','no_show')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ux_provider_reception_active_request
  on public.provider_reception_appointments(patient_id,doctor_card_id,appointment_date)
  where status in ('pending','confirmed');
create unique index if not exists ux_provider_reception_serial
  on public.provider_reception_appointments(doctor_card_id,appointment_date,serial_number)
  where serial_number is not null;
create index if not exists idx_provider_reception_owner_queue
  on public.provider_reception_appointments(provider_id,status,appointment_date,created_at);
create index if not exists idx_provider_reception_patient
  on public.provider_reception_appointments(patient_id,created_at desc);

drop trigger if exists trg_provider_managed_doctor_cards_updated_at on public.provider_managed_doctor_cards;
create trigger trg_provider_managed_doctor_cards_updated_at before update on public.provider_managed_doctor_cards
for each row execute function public.set_updated_at();
drop trigger if exists trg_provider_reception_appointments_updated_at on public.provider_reception_appointments;
create trigger trg_provider_reception_appointments_updated_at before update on public.provider_reception_appointments
for each row execute function public.set_updated_at();

alter table public.provider_managed_doctor_cards enable row level security;
alter table public.provider_reception_appointments enable row level security;
revoke all on table public.provider_managed_doctor_cards from public,anon,authenticated;
revoke all on table public.provider_reception_appointments from public,anon,authenticated;
grant select,insert,update,delete on table public.provider_managed_doctor_cards to service_role;
grant select,insert,update,delete on table public.provider_reception_appointments to service_role;

create or replace function public.get_my_provider_managed_doctor_cards(p_provider_id uuid)
returns table(
  id uuid,provider_id uuid,doctor_name text,photo_path text,degree text,
  designation text,specialty text,bmdc_registration_no text,experience_years integer,
  consultation_fee numeric,visiting_schedule text,appointment_note text,
  is_active boolean,sort_order integer,created_at timestamptz,updated_at timestamptz
)
language plpgsql stable security definer set search_path=public
as $$
begin
  if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if not exists(
    select 1 from public.providers pr join public.profiles me on me.id=pr.owner_user_id
    where pr.id=p_provider_id and pr.owner_user_id=auth.uid()
      and me.role in ('hospital','chamber') and me.account_status='active'
  ) then raise exception 'PROVIDER_OWNER_REQUIRED'; end if;
  return query select c.id,c.provider_id,c.doctor_name,c.photo_path,c.degree,
    c.designation,c.specialty,c.bmdc_registration_no,c.experience_years,
    c.consultation_fee,c.visiting_schedule,c.appointment_note,c.is_active,
    c.sort_order,c.created_at,c.updated_at
  from public.provider_managed_doctor_cards c
  where c.provider_id=p_provider_id order by c.sort_order,c.created_at,c.id;
end;
$$;

create or replace function public.save_my_provider_managed_doctor_card(
  p_provider_id uuid,p_card_id uuid,p_doctor_name text,p_photo_path text default null,
  p_degree text default null,p_designation text default null,p_specialty text default null,
  p_bmdc_registration_no text default null,p_experience_years integer default null,
  p_consultation_fee numeric default null,p_visiting_schedule text default null,
  p_appointment_note text default null,p_is_active boolean default true,p_sort_order integer default 0
)
returns uuid
language plpgsql security definer set search_path=public
as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if not exists(
    select 1 from public.providers pr join public.profiles me on me.id=pr.owner_user_id
    where pr.id=p_provider_id and pr.owner_user_id=auth.uid()
      and me.role in ('hospital','chamber') and me.account_status='active'
  ) then raise exception 'PROVIDER_OWNER_REQUIRED'; end if;
  if char_length(btrim(coalesce(p_doctor_name,'')))<2 then raise exception 'DOCTOR_NAME_REQUIRED'; end if;
  if char_length(btrim(p_doctor_name))>150 then raise exception 'DOCTOR_NAME_TOO_LONG'; end if;
  if p_experience_years is not null and p_experience_years not between 0 and 80 then raise exception 'INVALID_EXPERIENCE'; end if;
  if p_consultation_fee is not null and p_consultation_fee<0 then raise exception 'INVALID_FEE'; end if;
  if char_length(coalesce(p_photo_path,''))>500 or char_length(coalesce(p_degree,''))>250
    or char_length(coalesce(p_designation,''))>250 or char_length(coalesce(p_specialty,''))>250
    or char_length(coalesce(p_bmdc_registration_no,''))>100
    or char_length(coalesce(p_visiting_schedule,''))>500
    or char_length(coalesce(p_appointment_note,''))>500 then raise exception 'CARD_FIELD_TOO_LONG'; end if;

  if p_card_id is null then
    insert into public.provider_managed_doctor_cards(
      provider_id,doctor_name,photo_path,degree,designation,specialty,bmdc_registration_no,
      experience_years,consultation_fee,visiting_schedule,appointment_note,is_active,sort_order
    ) values(
      p_provider_id,btrim(p_doctor_name),nullif(btrim(coalesce(p_photo_path,'')),''),
      nullif(btrim(coalesce(p_degree,'')),''),nullif(btrim(coalesce(p_designation,'')),''),
      nullif(btrim(coalesce(p_specialty,'')),''),nullif(btrim(coalesce(p_bmdc_registration_no,'')),''),
      p_experience_years,p_consultation_fee,nullif(btrim(coalesce(p_visiting_schedule,'')),''),
      nullif(btrim(coalesce(p_appointment_note,'')),''),coalesce(p_is_active,true),coalesce(p_sort_order,0)
    ) returning id into v_id;
  else
    update public.provider_managed_doctor_cards set
      doctor_name=btrim(p_doctor_name),photo_path=nullif(btrim(coalesce(p_photo_path,'')),''),
      degree=nullif(btrim(coalesce(p_degree,'')),''),designation=nullif(btrim(coalesce(p_designation,'')),''),
      specialty=nullif(btrim(coalesce(p_specialty,'')),''),
      bmdc_registration_no=nullif(btrim(coalesce(p_bmdc_registration_no,'')),''),
      experience_years=p_experience_years,consultation_fee=p_consultation_fee,
      visiting_schedule=nullif(btrim(coalesce(p_visiting_schedule,'')),''),
      appointment_note=nullif(btrim(coalesce(p_appointment_note,'')),''),
      is_active=coalesce(p_is_active,true),sort_order=coalesce(p_sort_order,0)
    where id=p_card_id and provider_id=p_provider_id returning id into v_id;
    if v_id is null then raise exception 'DOCTOR_CARD_NOT_FOUND'; end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.deactivate_my_provider_managed_doctor_card(p_provider_id uuid,p_card_id uuid)
returns boolean
language plpgsql security definer set search_path=public
as $$
begin
  if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if not exists(
    select 1 from public.providers pr join public.profiles me on me.id=pr.owner_user_id
    where pr.id=p_provider_id and pr.owner_user_id=auth.uid()
      and me.role in ('hospital','chamber') and me.account_status='active'
  ) then raise exception 'PROVIDER_OWNER_REQUIRED'; end if;
  update public.provider_managed_doctor_cards set is_active=false
  where id=p_card_id and provider_id=p_provider_id;
  if not found then raise exception 'DOCTOR_CARD_NOT_FOUND'; end if;
  return true;
end;
$$;

create or replace function public.get_public_provider_managed_doctor_cards(p_provider_id uuid)
returns table(
  id uuid,provider_id uuid,doctor_name text,photo_path text,degree text,
  designation text,specialty text,bmdc_registration_no text,experience_years integer,
  consultation_fee numeric,visiting_schedule text,appointment_note text,sort_order integer
)
language sql stable security definer set search_path=public
as $$
  select c.id,c.provider_id,c.doctor_name,c.photo_path,c.degree,c.designation,c.specialty,
    c.bmdc_registration_no,c.experience_years,c.consultation_fee,c.visiting_schedule,
    c.appointment_note,c.sort_order
  from public.provider_managed_doctor_cards c
  join public.providers pr on pr.id=c.provider_id
  where c.provider_id=p_provider_id and c.is_active=true
    and pr.status='approved' and pr.verified=true
  order by c.sort_order,c.created_at,c.id;
$$;

create or replace function public.create_provider_reception_appointment(
  p_doctor_card_id uuid,p_appointment_date date,p_preferred_time time default null,p_patient_note text default null
)
returns uuid
language plpgsql security definer set search_path=public
as $$
declare v_id uuid; v_provider uuid; v_owner uuid; v_doctor_name text; v_patient_name text;
begin
  if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if not exists(select 1 from public.profiles where id=auth.uid() and role='patient' and account_status='active' and profile_completed) then
    raise exception 'COMPLETE_PATIENT_PROFILE_REQUIRED';
  end if;
  if p_appointment_date is null or p_appointment_date<current_date or p_appointment_date>current_date+180 then
    raise exception 'INVALID_APPOINTMENT_DATE';
  end if;
  if char_length(coalesce(p_patient_note,''))>500 then raise exception 'PATIENT_NOTE_TOO_LONG'; end if;
  select c.provider_id,pr.owner_user_id,c.doctor_name into v_provider,v_owner,v_doctor_name
  from public.provider_managed_doctor_cards c join public.providers pr on pr.id=c.provider_id
  where c.id=p_doctor_card_id and c.is_active=true and pr.status='approved' and pr.verified=true;
  if not found then raise exception 'DOCTOR_CARD_NOT_AVAILABLE'; end if;
  if v_owner is null then raise exception 'RECEPTION_NOT_AVAILABLE'; end if;

  insert into public.provider_reception_appointments(
    provider_id,doctor_card_id,patient_id,appointment_date,preferred_time,patient_note
  ) values(v_provider,p_doctor_card_id,auth.uid(),p_appointment_date,p_preferred_time,nullif(btrim(coalesce(p_patient_note,'')),''))
  returning id into v_id;

  select full_name into v_patient_name from public.profiles where id=auth.uid();
  insert into public.notifications(recipient_id,sender_id,type,title_bn,body_bn,data,dedupe_key)
  values(v_owner,auth.uid(),'reception_appointment_new','নতুন Reception appointment',
    coalesce(v_patient_name,'একজন রোগী')||' '||v_doctor_name||'-এর serial চেয়েছেন।',
    jsonb_build_object('reception_appointment_id',v_id,'provider_id',v_provider,'doctor_card_id',p_doctor_card_id,'deep_link','/provider/appointments'),
    'reception_appointment_new:'||v_id::text)
  on conflict(recipient_id,dedupe_key) where dedupe_key is not null do nothing;
  return v_id;
exception when unique_violation then raise exception 'DUPLICATE_RECEPTION_APPOINTMENT';
end;
$$;

create or replace function public.get_my_provider_reception_appointments(p_status text default null)
returns table(
  appointment_id uuid,provider_id uuid,provider_name text,doctor_card_id uuid,doctor_name text,
  patient_id uuid,patient_name text,patient_phone text,appointment_date date,preferred_time time,
  patient_note text,serial_number integer,status text,created_at timestamptz,updated_at timestamptz
)
language plpgsql stable security definer set search_path=public
as $$
declare v_role text;
begin
  if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  select role::text into v_role from public.profiles where id=auth.uid() and account_status='active';
  if v_role is null then raise exception 'ACTIVE_ACCOUNT_REQUIRED'; end if;
  if v_role not in ('patient','hospital','chamber') then raise exception 'RECEPTION_APPOINTMENT_ACCESS_DENIED'; end if;
  if p_status is not null and p_status not in ('pending','confirmed','rejected','cancelled','completed','no_show') then
    raise exception 'INVALID_APPOINTMENT_STATUS';
  end if;
  return query select a.id,a.provider_id,pr.name_bn,a.doctor_card_id,c.doctor_name,
    a.patient_id,pp.full_name,
    case when v_role in ('hospital','chamber') then pp.phone else null end,
    a.appointment_date,a.preferred_time,a.patient_note,a.serial_number,a.status,a.created_at,a.updated_at
  from public.provider_reception_appointments a
  join public.providers pr on pr.id=a.provider_id
  join public.provider_managed_doctor_cards c on c.id=a.doctor_card_id
  join public.profiles pp on pp.id=a.patient_id
  where (a.patient_id=auth.uid() or pr.owner_user_id=auth.uid())
    and (p_status is null or a.status=p_status)
  order by case a.status when 'pending' then 0 when 'confirmed' then 1 else 2 end,
    a.appointment_date,a.preferred_time nulls last,a.created_at desc;
end;
$$;

create or replace function public.update_provider_reception_appointment(
  p_appointment_id uuid,p_status text,p_serial_number integer default null
)
returns boolean
language plpgsql security definer set search_path=public
as $$
declare a public.provider_reception_appointments%rowtype; v_owner uuid; v_serial integer;
begin
  if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if not exists(select 1 from public.profiles where id=auth.uid() and account_status='active') then raise exception 'ACTIVE_ACCOUNT_REQUIRED'; end if;
  select * into a from public.provider_reception_appointments where id=p_appointment_id for update;
  if not found then raise exception 'RECEPTION_APPOINTMENT_NOT_FOUND'; end if;
  select owner_user_id into v_owner from public.providers where id=a.provider_id;

  if a.patient_id=auth.uid() then
    if p_status<>'cancelled' or a.status not in ('pending','confirmed') then raise exception 'PATIENT_CAN_ONLY_CANCEL'; end if;
  elsif v_owner=auth.uid() then
    if not ((a.status='pending' and p_status in ('confirmed','rejected','cancelled'))
      or (a.status='confirmed' and p_status in ('completed','no_show','cancelled'))) then
      raise exception 'INVALID_APPOINTMENT_STATUS_TRANSITION';
    end if;
  else raise exception 'RECEPTION_APPOINTMENT_ACCESS_DENIED'; end if;

  if p_status='confirmed' then
    if p_serial_number is not null and p_serial_number<1 then raise exception 'INVALID_SERIAL_NUMBER'; end if;
    perform pg_advisory_xact_lock(hashtextextended(a.doctor_card_id::text||':'||a.appointment_date::text,0));
    v_serial:=coalesce(p_serial_number,(select coalesce(max(serial_number),0)+1 from public.provider_reception_appointments
      where doctor_card_id=a.doctor_card_id and appointment_date=a.appointment_date));
  else v_serial:=a.serial_number; end if;

  update public.provider_reception_appointments set status=p_status,serial_number=v_serial where id=a.id;

  if a.patient_id<>auth.uid() then
    insert into public.notifications(recipient_id,sender_id,type,title_bn,body_bn,data,dedupe_key)
    values(a.patient_id,auth.uid(),'reception_appointment_changed',
      case when p_status='confirmed' then 'Hospital serial নিশ্চিত হয়েছে' else 'Hospital appointment আপডেট হয়েছে' end,
      case when p_status='confirmed' then 'আপনার serial নম্বর '||v_serial||'।' else 'আপনার reception appointment status: '||p_status end,
      jsonb_build_object('reception_appointment_id',a.id,'status',p_status,'serial_number',v_serial,'deep_link','/appointments'),
      'reception_appointment_status:'||a.id::text||':'||p_status)
    on conflict(recipient_id,dedupe_key) where dedupe_key is not null do nothing;
  elsif p_status='cancelled' and v_owner is not null then
    insert into public.notifications(recipient_id,sender_id,type,title_bn,body_bn,data,dedupe_key)
    values(v_owner,auth.uid(),'reception_appointment_cancelled','Reception appointment বাতিল হয়েছে',
      'একজন রোগী তার reception appointment বাতিল করেছেন।',
      jsonb_build_object('reception_appointment_id',a.id,'deep_link','/provider/appointments'),
      'reception_appointment_cancelled:'||a.id::text)
    on conflict(recipient_id,dedupe_key) where dedupe_key is not null do nothing;
  end if;
  return true;
exception when unique_violation then raise exception 'SERIAL_NUMBER_ALREADY_USED';
end;
$$;

create or replace function public.get_public_content_page(p_slug text)
returns jsonb
language plpgsql stable security definer set search_path=public
as $$
declare v jsonb;
begin
  if lower(btrim(coalesce(p_slug,''))) not in ('terms','privacy') then return null; end if;
  select jsonb_build_object('slug',p.slug,'title_bn',p.title_bn,'title_en',p.title_en,
    'body_bn',p.body_bn,'body_en',p.body_en,'seo_title',p.seo_title,'meta_description',p.meta_description,
    'updated_at',p.updated_at) into v
  from public.content_pages p where p.slug=lower(btrim(p_slug)) and p.is_published=true;
  return v;
end;
$$;

revoke all on function public.get_my_provider_managed_doctor_cards(uuid) from public,anon;
revoke all on function public.save_my_provider_managed_doctor_card(uuid,uuid,text,text,text,text,text,text,integer,numeric,text,text,boolean,integer) from public,anon;
revoke all on function public.deactivate_my_provider_managed_doctor_card(uuid,uuid) from public,anon;
revoke all on function public.get_public_provider_managed_doctor_cards(uuid) from public;
revoke all on function public.create_provider_reception_appointment(uuid,date,time,text) from public,anon;
revoke all on function public.get_my_provider_reception_appointments(text) from public,anon;
revoke all on function public.update_provider_reception_appointment(uuid,text,integer) from public,anon;
revoke all on function public.get_public_content_page(text) from public;

grant execute on function public.get_my_provider_managed_doctor_cards(uuid) to authenticated,service_role;
grant execute on function public.save_my_provider_managed_doctor_card(uuid,uuid,text,text,text,text,text,text,integer,numeric,text,text,boolean,integer) to authenticated,service_role;
grant execute on function public.deactivate_my_provider_managed_doctor_card(uuid,uuid) to authenticated,service_role;
grant execute on function public.get_public_provider_managed_doctor_cards(uuid) to anon,authenticated,service_role;
grant execute on function public.create_provider_reception_appointment(uuid,date,time,text) to authenticated,service_role;
grant execute on function public.get_my_provider_reception_appointments(text) to authenticated,service_role;
grant execute on function public.update_provider_reception_appointment(uuid,text,integer) to authenticated,service_role;
grant execute on function public.get_public_content_page(text) to anon,authenticated,service_role;

do $$
begin
  if has_table_privilege('authenticated','public.provider_managed_doctor_cards','INSERT')
    or has_table_privilege('authenticated','public.provider_reception_appointments','UPDATE') then
    raise exception 'STEP 74 failed: direct mutation privilege remains';
  end if;
  if not has_function_privilege('authenticated','public.create_provider_reception_appointment(uuid,date,time,text)','EXECUTE') then
    raise exception 'STEP 74 failed: reception booking grant missing';
  end if;
  raise notice 'STEP 74 INDEPENDENT HOSPITAL DOCTOR CARDS AND RECEPTION PASSED';
end $$;

commit;
