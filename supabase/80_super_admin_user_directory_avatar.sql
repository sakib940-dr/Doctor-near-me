-- ============================================================
-- Migration 80: Super Admin user directory — add avatar/photo
-- ============================================================
-- Adds avatar_url (doctor profile photo fallback to profile avatar)
-- to the Super Admin user directory so the User Management cards
-- can show a real photo, matching the public visitor card style.
-- No changes to filters, permissions, or RLS — purely additive column.

create or replace function public.super_admin_user_directory_v4(
  p_role text default null,p_status text default null,p_district_id bigint default null,p_upazila_id bigint default null,
  p_medical_type text default null,p_specialty_id bigint default null,p_search text default null,p_limit integer default 50,p_offset integer default 0
)
returns table(
  user_id uuid,full_name text,email text,phone text,role text,account_status text,district_id bigint,district_name text,
  upazila_id bigint,upazila_name text,address_line text,profile_completed boolean,medical_type text,avatar_url text,
  last_location_at timestamptz,last_sign_in_at timestamptz,created_at timestamptz,total_count bigint
)
language plpgsql stable security definer set search_path=public,auth
as $$
begin
  if not public.is_super_admin() then raise exception 'Only Super Admin can access the full user directory'; end if;
  if p_role is not null and p_role not in ('patient','doctor','chamber','hospital','ambulance','verification_officer','admin','super_admin') then raise exception 'Invalid role'; end if;
  if p_status is not null and p_status not in ('active','suspended','banned') then raise exception 'Invalid account status'; end if;
  if p_medical_type is not null and upper(p_medical_type) not in ('MBBS','BDS') then raise exception 'Invalid Medical Type'; end if;
  if p_upazila_id is not null and not exists(select 1 from public.upazilas u where u.id=p_upazila_id and (p_district_id is null or u.district_id=p_district_id)) then raise exception 'Invalid upazila filter'; end if;
  if p_specialty_id is not null and not exists(select 1 from public.specialties s where s.id=p_specialty_id and s.is_active) then raise exception 'Invalid specialty filter'; end if;
  return query
  select p.id,p.full_name,p.email,p.phone,p.role::text,p.account_status::text,p.district_id,dist.name_bn,p.upazila_id,u.name_bn,
    p.address_line,p.profile_completed,doc.medical_type,coalesce(doc.profile_photo_url,p.avatar_url),loc.updated_at,au.last_sign_in_at,p.created_at,count(*) over()
  from public.profiles p
  left join public.doctors doc on doc.id=p.id left join public.districts dist on dist.id=p.district_id
  left join public.upazilas u on u.id=p.upazila_id left join public.user_current_locations loc on loc.user_id=p.id
  left join auth.users au on au.id=p.id
  where (p_role is null or p.role::text=p_role) and (p_status is null or p.account_status::text=p_status)
    and (p_district_id is null or p.district_id=p_district_id) and (p_upazila_id is null or p.upazila_id=p_upazila_id)
    and (p_medical_type is null or (p.role='doctor' and doc.medical_type=upper(p_medical_type)))
    and (p_specialty_id is null or (p.role='doctor' and exists(
      select 1 from public.doctor_specialties ds where ds.doctor_id=doc.id and ds.specialty_id=p_specialty_id
    )))
    and (nullif(trim(p_search),'') is null or p.full_name ilike '%'||trim(p_search)||'%' or p.email ilike '%'||trim(p_search)||'%' or p.phone ilike '%'||trim(p_search)||'%')
  order by p.created_at desc,p.id limit greatest(1,least(p_limit,100)) offset greatest(p_offset,0);
end;
$$;

revoke all on function public.super_admin_user_directory_v4(text,text,bigint,bigint,text,bigint,text,integer,integer) from public,anon;
grant execute on function public.super_admin_user_directory_v4(text,text,bigint,bigint,text,bigint,text,integer,integer) to authenticated,service_role;
