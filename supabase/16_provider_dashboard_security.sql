-- ============================================================
-- STEP 16 — HOSPITAL / CHAMBER DASHBOARD SECURITY
-- Run after Step 15. Safe to re-run.
-- ============================================================

alter table public.providers
  add column if not exists whatsapp text,
  add column if not exists facebook_url text,
  add column if not exists departments text[] not null default '{}',
  add column if not exists services text[] not null default '{}',
  add column if not exists gallery_paths text[] not null default '{}';

-- Provider banners and gallery images may be larger than avatars.
update storage.buckets set file_size_limit=6291456
where id='public-images' and file_size_limit<6291456;

create or replace function public.get_my_provider_dashboard()
returns jsonb
language sql
stable
security definer
set search_path=public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',pr.id,'provider_type',pr.provider_type,'name_bn',pr.name_bn,
    'name_en',pr.name_en,'short_description',pr.short_description,
    'logo_url',pr.logo_url,'banner_url',pr.banner_url,'phone',pr.phone,
    'whatsapp',pr.whatsapp,'email',pr.email,'facebook_url',pr.facebook_url,
    'website_url',pr.website_url,'address',pr.address,
    'district_id',pr.district_id,'upazila_id',pr.upazila_id,
    'latitude',pr.latitude,'longitude',pr.longitude,
    'google_maps_url',coalesce(pr.google_maps_url,pr.map_url),
    'opening_note',pr.opening_note,
    'emergency_available',pr.emergency_available,
    'departments',pr.departments,'services',pr.services,
    'gallery_paths',pr.gallery_paths,'status',pr.status,'verified',pr.verified,
    'doctor_links',coalesce((
      select jsonb_agg(jsonb_build_object(
        'doctor_id',d.id,'doctor_name',dp.full_name,
        'avatar_url',coalesce(d.profile_photo_url,dp.avatar_url),
        'degree',d.degree,'designation',d.designation,
        'professional_title',d.professional_title,
        'verification_status',d.verification_status,
        'link_status',l.status,'created_at',l.created_at,
        'schedules',coalesce((
          select jsonb_agg(jsonb_build_object(
            'id',cs.id,'day_of_week',cs.day_of_week,
            'start_time',cs.start_time,'end_time',cs.end_time,
            'fee',cs.fee,'is_active',cs.is_active
          ) order by cs.day_of_week,cs.start_time,cs.id)
          from public.chamber_schedules cs
          where cs.provider_id=pr.id and cs.doctor_id=d.id
        ),'[]'::jsonb)
      ) order by l.created_at desc,d.id)
      from public.doctor_provider_links l
      join public.doctors d on d.id=l.doctor_id
      join public.profiles dp on dp.id=d.id
      where l.provider_id=pr.id
    ),'[]'::jsonb)
  ) order by pr.created_at,pr.id),'[]'::jsonb)
  from public.providers pr
  join public.profiles owner on owner.id=pr.owner_user_id
  where pr.owner_user_id=auth.uid()
    and owner.role in ('hospital','chamber')
    and owner.account_status='active';
$$;

create or replace function public.save_my_provider_profile(
  p_provider_id uuid default null,
  p_name_bn text default null,
  p_name_en text default null,
  p_short_description text default null,
  p_logo_url text default null,
  p_banner_url text default null,
  p_phone text default null,
  p_whatsapp text default null,
  p_email text default null,
  p_facebook_url text default null,
  p_website_url text default null,
  p_address text default null,
  p_district_id bigint default null,
  p_upazila_id bigint default null,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_google_maps_url text default null,
  p_opening_note text default null,
  p_emergency_available boolean default false,
  p_departments text[] default null,
  p_services text[] default null,
  p_gallery_paths text[] default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  account_role public.user_role;
  required_type text;
  result_id uuid;
  old_provider public.providers%rowtype;
  identity_changed boolean:=false;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select role into account_role from public.profiles
  where id=auth.uid() and role in ('hospital','chamber') and account_status='active'
  for update;
  if account_role is null then raise exception 'Active Hospital/Chamber account required'; end if;
  required_type:=case when account_role='hospital' then 'hospital' else 'chamber' end;

  if length(trim(coalesce(p_name_bn,'')))<2 then raise exception 'Provider name is required'; end if;
  if p_short_description is not null and length(p_short_description)>2000 then
    raise exception 'Description must be 2000 characters or fewer';
  end if;
  if cardinality(coalesce(p_departments,'{}'::text[]))>50
     or cardinality(coalesce(p_services,'{}'::text[]))>100 then
    raise exception 'Too many departments or services';
  end if;
  if cardinality(coalesce(p_gallery_paths,'{}'::text[]))>8 then
    raise exception 'Gallery can contain at most 8 images';
  end if;
  if p_upazila_id is not null and not exists(
    select 1 from public.upazilas u
    where u.id=p_upazila_id and u.district_id=p_district_id and u.is_active
  ) then raise exception 'Upazila does not belong to selected district'; end if;
  if (p_latitude is not null and (p_latitude < -90 or p_latitude > 90))
     or (p_longitude is not null and (p_longitude < -180 or p_longitude > 180)) then
    raise exception 'Invalid map coordinates';
  end if;
  if exists(
    select 1 from unnest(array[p_logo_url,p_banner_url]) path
    where path is not null and path<>'' and path not like auth.uid()::text||'/%'
  ) then raise exception 'Media path must belong to current user'; end if;
  if exists(
    select 1 from unnest(coalesce(p_gallery_paths,'{}'::text[])) path
    where path is null or path='' or path not like auth.uid()::text||'/%'
  ) then raise exception 'Gallery path must belong to current user'; end if;

  if p_provider_id is null then
    if exists(select 1 from public.providers where owner_user_id=auth.uid()) then
      raise exception 'This account already has a Provider profile';
    end if;
    result_id:=gen_random_uuid();
    insert into public.providers(
      id,owner_user_id,provider_type,name_bn,name_en,slug,short_description,
      logo_url,banner_url,phone,whatsapp,email,facebook_url,website_url,address,
      district_id,upazila_id,latitude,longitude,google_maps_url,opening_note,
      emergency_available,departments,services,gallery_paths,status,verified
    ) values(
      result_id,auth.uid(),required_type,trim(p_name_bn),nullif(trim(p_name_en),''),
      required_type||'-'||replace(result_id::text,'-',''),nullif(trim(p_short_description),''),
      nullif(trim(p_logo_url),''),nullif(trim(p_banner_url),''),nullif(trim(p_phone),''),
      nullif(trim(p_whatsapp),''),nullif(trim(p_email),''),nullif(trim(p_facebook_url),''),
      nullif(trim(p_website_url),''),nullif(trim(p_address),''),p_district_id,p_upazila_id,
      p_latitude,p_longitude,nullif(trim(p_google_maps_url),''),nullif(trim(p_opening_note),''),
      p_emergency_available,coalesce(p_departments,'{}'::text[]),
      coalesce(p_services,'{}'::text[]),coalesce(p_gallery_paths,'{}'::text[]),
      'pending',false
    );
  else
    select * into old_provider from public.providers
    where id=p_provider_id and owner_user_id=auth.uid() for update;
    if not found then raise exception 'Provider not found or not owned by this account'; end if;
    if old_provider.provider_type<>required_type then raise exception 'Provider type does not match account role'; end if;
    identity_changed:=old_provider.name_bn is distinct from trim(p_name_bn)
      or old_provider.address is distinct from nullif(trim(p_address),'')
      or old_provider.district_id is distinct from p_district_id
      or old_provider.upazila_id is distinct from p_upazila_id;
    update public.providers set
      name_bn=trim(p_name_bn),name_en=nullif(trim(p_name_en),''),
      short_description=nullif(trim(p_short_description),''),
      logo_url=nullif(trim(p_logo_url),''),banner_url=nullif(trim(p_banner_url),''),
      phone=nullif(trim(p_phone),''),whatsapp=nullif(trim(p_whatsapp),''),
      email=nullif(trim(p_email),''),facebook_url=nullif(trim(p_facebook_url),''),
      website_url=nullif(trim(p_website_url),''),address=nullif(trim(p_address),''),
      district_id=p_district_id,upazila_id=p_upazila_id,
      latitude=p_latitude,longitude=p_longitude,
      google_maps_url=nullif(trim(p_google_maps_url),''),
      opening_note=nullif(trim(p_opening_note),''),
      emergency_available=p_emergency_available,
      departments=coalesce(p_departments,'{}'::text[]),
      services=coalesce(p_services,'{}'::text[]),
      gallery_paths=coalesce(p_gallery_paths,'{}'::text[]),
      status=case when identity_changed then 'pending'::public.provider_status else status end,
      verified=case when identity_changed then false else verified end,
      updated_at=now()
    where id=p_provider_id;
    result_id:=p_provider_id;
  end if;

  update public.profiles set profile_completed=true,updated_at=now() where id=auth.uid();
  return jsonb_build_object('provider_id',result_id,'verification_reset',identity_changed);
end;
$$;

create or replace function public.search_approved_doctors_for_provider(
  p_query text default null,
  p_limit integer default 20
)
returns table(
  doctor_id uuid,doctor_name text,avatar_url text,degree text,
  designation text,professional_title text,specialty_names_bn text[]
)
language sql
stable
security definer
set search_path=public
as $$
  select d.id,p.full_name,coalesce(d.profile_photo_url,p.avatar_url),d.degree,
         d.designation,d.professional_title,
         coalesce(array_agg(s.name_bn order by s.sort_order,s.id)
           filter(where s.id is not null),'{}'::text[])
  from public.doctors d
  join public.profiles p on p.id=d.id
  left join public.doctor_specialties ds on ds.doctor_id=d.id
  left join public.specialties s on s.id=ds.specialty_id and s.is_active
  where exists(
      select 1 from public.profiles me where me.id=auth.uid()
      and me.role in ('hospital','chamber') and me.account_status='active'
    )
    and d.verification_status='approved' and p.account_status='active'
    and (p_query is null or trim(p_query)=''
      or p.full_name ilike '%'||trim(p_query)||'%'
      or d.degree ilike '%'||trim(p_query)||'%'
      or d.designation ilike '%'||trim(p_query)||'%'
      or d.professional_title ilike '%'||trim(p_query)||'%')
  group by d.id,p.full_name,d.profile_photo_url,p.avatar_url,d.degree,
           d.designation,d.professional_title
  order by p.full_name,d.id
  limit greatest(1,least(p_limit,50));
$$;

create or replace function public.invite_doctor_to_my_provider(
  p_provider_id uuid,p_doctor_id uuid
)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
begin
  if not exists(
    select 1 from public.providers pr join public.profiles p on p.id=pr.owner_user_id
    where pr.id=p_provider_id and pr.owner_user_id=auth.uid()
      and p.role in ('hospital','chamber') and p.account_status='active'
  ) then raise exception 'Provider not found or not owned by this account'; end if;
  if not exists(
    select 1 from public.doctors d join public.profiles p on p.id=d.id
    where d.id=p_doctor_id and d.verification_status='approved'
      and p.account_status='active'
  ) then raise exception 'Only an approved active Doctor can be invited'; end if;
  insert into public.doctor_provider_links(doctor_id,provider_id,status,invited_by)
  values(p_doctor_id,p_provider_id,'pending',auth.uid())
  on conflict(doctor_id,provider_id) do update set
    status=case when doctor_provider_links.status='approved' then 'approved' else 'pending' end,
    invited_by=excluded.invited_by,created_at=now();
  return true;
end;
$$;

create or replace function public.get_my_doctor_provider_invitations()
returns table(
  provider_id uuid,provider_name text,provider_type text,address text,
  link_status text,invited_at timestamptz
)
language sql
stable
security definer
set search_path=public
as $$
  select pr.id,pr.name_bn,pr.provider_type,pr.address,l.status,l.created_at
  from public.doctor_provider_links l
  join public.providers pr on pr.id=l.provider_id
  join public.profiles me on me.id=l.doctor_id
  where l.doctor_id=auth.uid() and me.role='doctor' and me.account_status='active'
  order by case l.status when 'pending' then 0 when 'approved' then 1 else 2 end,
           l.created_at desc;
$$;

create or replace function public.respond_to_provider_invitation(
  p_provider_id uuid,p_accept boolean
)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
begin
  if not exists(
    select 1 from public.profiles where id=auth.uid()
      and role='doctor' and account_status='active'
  ) then raise exception 'Active Doctor account required'; end if;
  update public.doctor_provider_links
  set status=case when p_accept then 'approved' else 'rejected' end
  where doctor_id=auth.uid() and provider_id=p_provider_id and status='pending';
  if not found then raise exception 'Pending invitation not found'; end if;
  return true;
end;
$$;

create or replace function public.remove_doctor_from_my_provider(
  p_provider_id uuid,p_doctor_id uuid
)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
begin
  if not exists(
    select 1 from public.providers pr join public.profiles p on p.id=pr.owner_user_id
    where pr.id=p_provider_id and pr.owner_user_id=auth.uid()
      and p.role in ('hospital','chamber') and p.account_status='active'
  ) then raise exception 'Provider not found or not owned by this account'; end if;
  update public.doctor_provider_links set status='removed'
  where provider_id=p_provider_id and doctor_id=p_doctor_id
    and status in ('pending','approved','rejected');
  if not found then raise exception 'Doctor link not found'; end if;
  update public.chamber_schedules set is_active=false
  where provider_id=p_provider_id and doctor_id=p_doctor_id;
  return true;
end;
$$;

create or replace function public.save_provider_doctor_schedule(
  p_provider_id uuid,p_doctor_id uuid,p_day_of_week smallint,
  p_start_time time,p_end_time time,p_fee numeric default null,
  p_is_active boolean default true,p_schedule_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare result_id uuid;
begin
  if not exists(
    select 1 from public.providers pr join public.profiles p on p.id=pr.owner_user_id
    where pr.id=p_provider_id and pr.owner_user_id=auth.uid()
      and p.role in ('hospital','chamber') and p.account_status='active'
  ) then raise exception 'Provider not found or not owned by this account'; end if;
  if not exists(
    select 1 from public.doctor_provider_links
    where provider_id=p_provider_id and doctor_id=p_doctor_id and status='approved'
  ) then raise exception 'An approved Doctor link is required'; end if;
  if p_day_of_week not between 0 and 6 then raise exception 'Invalid weekday'; end if;
  if p_start_time is null or p_end_time is null or p_end_time<=p_start_time then
    raise exception 'End time must be after start time';
  end if;
  if p_fee is not null and p_fee<0 then raise exception 'Fee cannot be negative'; end if;
  if p_schedule_id is null then
    insert into public.chamber_schedules(
      doctor_id,provider_id,day_of_week,start_time,end_time,fee,is_active
    ) values(p_doctor_id,p_provider_id,p_day_of_week,p_start_time,p_end_time,p_fee,p_is_active)
    returning id into result_id;
  else
    update public.chamber_schedules set day_of_week=p_day_of_week,
      start_time=p_start_time,end_time=p_end_time,fee=p_fee,is_active=p_is_active
    where id=p_schedule_id and provider_id=p_provider_id and doctor_id=p_doctor_id
    returning id into result_id;
    if result_id is null then raise exception 'Schedule not found'; end if;
  end if;
  return result_id;
exception when unique_violation then raise exception 'This schedule already exists';
end;
$$;

create or replace function public.delete_provider_doctor_schedule(
  p_provider_id uuid,p_schedule_id uuid
)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
begin
  if not exists(
    select 1 from public.providers pr join public.profiles p on p.id=pr.owner_user_id
    where pr.id=p_provider_id and pr.owner_user_id=auth.uid()
      and p.role in ('hospital','chamber') and p.account_status='active'
  ) then raise exception 'Provider not found or not owned by this account'; end if;
  delete from public.chamber_schedules where id=p_schedule_id and provider_id=p_provider_id;
  if not found then raise exception 'Schedule not found'; end if;
  return true;
end;
$$;

-- Existing Step 4 helper is Admin-only from this point. Provider owners must
-- use the consent-based invitation flow above.
create or replace function public.provider_add_doctor(p_provider_id uuid,p_doctor_id uuid)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
begin
  if not public.is_admin_or_above() then raise exception 'Admin access required'; end if;
  if not exists(select 1 from public.providers where id=p_provider_id) then
    raise exception 'Provider not found';
  end if;
  if not exists(select 1 from public.doctors where id=p_doctor_id and verification_status='approved') then
    raise exception 'Doctor is not approved';
  end if;
  insert into public.doctor_provider_links(doctor_id,provider_id,status,invited_by)
  values(p_doctor_id,p_provider_id,'approved',auth.uid())
  on conflict(doctor_id,provider_id) do update set status='approved',invited_by=excluded.invited_by;
  return true;
end;
$$;

revoke insert,update,delete on table public.providers from public,anon,authenticated;
revoke insert,update,delete on table public.doctor_provider_links from public,anon,authenticated;
revoke insert,update,delete on table public.chamber_schedules from public,anon,authenticated;

revoke all on function public.get_my_provider_dashboard() from public,anon;
grant execute on function public.get_my_provider_dashboard() to authenticated,service_role;
revoke all on function public.save_my_provider_profile(uuid,text,text,text,text,text,text,text,text,text,text,text,bigint,bigint,double precision,double precision,text,text,boolean,text[],text[],text[]) from public,anon;
grant execute on function public.save_my_provider_profile(uuid,text,text,text,text,text,text,text,text,text,text,text,bigint,bigint,double precision,double precision,text,text,boolean,text[],text[],text[]) to authenticated,service_role;
revoke all on function public.search_approved_doctors_for_provider(text,integer) from public,anon;
grant execute on function public.search_approved_doctors_for_provider(text,integer) to authenticated,service_role;
revoke all on function public.invite_doctor_to_my_provider(uuid,uuid) from public,anon;
grant execute on function public.invite_doctor_to_my_provider(uuid,uuid) to authenticated,service_role;
revoke all on function public.get_my_doctor_provider_invitations() from public,anon;
grant execute on function public.get_my_doctor_provider_invitations() to authenticated,service_role;
revoke all on function public.respond_to_provider_invitation(uuid,boolean) from public,anon;
grant execute on function public.respond_to_provider_invitation(uuid,boolean) to authenticated,service_role;
revoke all on function public.remove_doctor_from_my_provider(uuid,uuid) from public,anon;
grant execute on function public.remove_doctor_from_my_provider(uuid,uuid) to authenticated,service_role;
revoke all on function public.save_provider_doctor_schedule(uuid,uuid,smallint,time,time,numeric,boolean,uuid) from public,anon;
grant execute on function public.save_provider_doctor_schedule(uuid,uuid,smallint,time,time,numeric,boolean,uuid) to authenticated,service_role;
revoke all on function public.delete_provider_doctor_schedule(uuid,uuid) from public,anon;
grant execute on function public.delete_provider_doctor_schedule(uuid,uuid) to authenticated,service_role;
revoke all on function public.provider_add_doctor(uuid,uuid) from public,anon;
grant execute on function public.provider_add_doctor(uuid,uuid) to authenticated,service_role;

do $assert$
begin
  if has_table_privilege('authenticated','public.providers','UPDATE')
     or has_table_privilege('authenticated','public.doctor_provider_links','INSERT')
     or has_table_privilege('authenticated','public.chamber_schedules','UPDATE') then
    raise exception 'Step 16 failed: direct Provider mutation grant remains';
  end if;
  if has_function_privilege('anon','public.save_my_provider_profile(uuid,text,text,text,text,text,text,text,text,text,text,text,bigint,bigint,double precision,double precision,text,text,boolean,text[],text[],text[])','EXECUTE') then
    raise exception 'Step 16 failed: anon Provider update must be blocked';
  end if;
  if has_function_privilege('anon','public.provider_add_doctor(uuid,uuid)','EXECUTE') then
    raise exception 'Step 16 failed: anon direct approval helper remains';
  end if;
  if not has_function_privilege('authenticated','public.invite_doctor_to_my_provider(uuid,uuid)','EXECUTE') then
    raise exception 'Step 16 failed: Provider invitation grant missing';
  end if;
end;
$assert$;

select 'STEP 16 PROVIDER DASHBOARD SECURITY PASSED' as result;
