-- ============================================================
-- STEP 7 — NOTIFICATIONS + ROLE ACCESS HARDENING
-- Run ONLY this file now.
-- Previous migrations are stored separately.
-- ============================================================

-- ------------------------------------------------------------
-- NOTIFICATION READ / UNREAD QUERY
-- ------------------------------------------------------------
create or replace function public.get_my_notifications(
  p_unread_only boolean default false,
  p_limit integer default 30,
  p_offset integer default 0
)
returns table(
  notification_id uuid,
  type text,
  title_bn text,
  body_bn text,
  data jsonb,
  is_read boolean,
  created_at timestamptz
)
language sql
stable
security invoker
set search_path=public
as $$
  select n.id,n.type,n.title_bn,n.body_bn,n.data,
         (n.read_at is not null),n.created_at
  from public.notifications n
  where n.recipient_id=auth.uid()
    and (not p_unread_only or n.read_at is null)
  order by n.created_at desc
  limit greatest(1,least(p_limit,100))
  offset greatest(p_offset,0);
$$;

-- ------------------------------------------------------------
-- MARK ALL NOTIFICATIONS READ
-- ------------------------------------------------------------
create or replace function public.mark_all_notifications_read()
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  affected integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  update public.notifications
  set read_at=coalesce(read_at,now())
  where recipient_id=auth.uid()
    and read_at is null;

  get diagnostics affected = row_count;
  return affected;
end;
$$;

-- ------------------------------------------------------------
-- ROLE CAPABILITY CHECK
-- Centralized backend permission check.
-- ------------------------------------------------------------
create or replace function public.can_manage_role(p_target_role public.user_role)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select case
    when public.is_super_admin() then true
    when public.is_admin_or_above() and p_target_role in ('doctor','patient','chamber','hospital') then true
    else false
  end;
$$;

-- ------------------------------------------------------------
-- ADMIN USER DIRECTORY
-- Admin sees operational user records.
-- Passwords are NEVER stored/returned here.
-- ------------------------------------------------------------
create or replace function public.admin_user_directory(
  p_role public.user_role default null,
  p_status public.account_status default null,
  p_search text default null,
  p_limit integer default 30,
  p_offset integer default 0
)
returns table(
  user_id uuid,
  full_name text,
  role public.user_role,
  account_status public.account_status,
  phone text,
  district_id bigint,
  upazila_id bigint,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path=public
as $$
begin
  if not public.is_admin_or_above() then
    raise exception 'Admin access required';
  end if;

  return query
  select p.id,p.full_name,p.role,p.account_status,p.phone,
         p.district_id,p.upazila_id,p.created_at,p.updated_at
  from public.profiles p
  where (p_role is null or p.role=p_role)
    and (p_status is null or p.account_status=p_status)
    and (
      p_search is null
      or p.full_name ilike '%'||p_search||'%'
      or p.phone ilike '%'||p_search||'%'
    )
  order by p.created_at desc
  limit greatest(1,least(p_limit,100))
  offset greatest(p_offset,0);
end;
$$;

-- ------------------------------------------------------------
-- SUPER ADMIN USER SUMMARY
-- Gives management counts without loading every user.
-- ------------------------------------------------------------
create or replace function public.super_admin_user_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Super Admin access required';
  end if;

  return (
    select jsonb_object_agg(coalesce(role::text,'unknown'),total)
    from (
      select role,count(*)::bigint as total
      from public.profiles
      group by role
    ) x
  ) || jsonb_build_object(
    'active_users',(select count(*) from public.profiles where account_status='active'),
    'suspended_users',(select count(*) from public.profiles where account_status='suspended'),
    'pending_doctors',(select count(*) from public.doctors where verification_status='pending'),
    'approved_doctors',(select count(*) from public.doctors where verification_status='approved')
  );
end;
$$;

-- ------------------------------------------------------------
-- DOCTOR VERIFICATION
-- Only Admin/Super Admin can approve/reject.
-- ------------------------------------------------------------
create or replace function public.admin_set_doctor_verification(
  p_doctor_id uuid,
  p_status text
)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
begin
  if not public.is_admin_or_above() then
    raise exception 'Admin access required';
  end if;

  if p_status not in ('pending','approved','rejected') then
    raise exception 'Invalid verification status';
  end if;

  update public.doctors
  set verification_status=p_status,
      updated_at=now()
  where id=p_doctor_id;

  if not found then
    raise exception 'Doctor not found';
  end if;

  insert into public.notifications(
    recipient_id,sender_id,type,title_bn,body_bn,data
  )
  values(
    p_doctor_id,auth.uid(),'doctor_verification',
    'ডক্টর প্রোফাইল যাচাই আপডেট',
    case
      when p_status='approved' then 'আপনার ডক্টর প্রোফাইল অনুমোদিত হয়েছে।'
      when p_status='rejected' then 'আপনার ডক্টর প্রোফাইল অনুমোদিত হয়নি।'
      else 'আপনার ডক্টর প্রোফাইল পুনরায় যাচাইয়ের জন্য অপেক্ষমাণ।'
    end,
    jsonb_build_object('doctor_id',p_doctor_id,'status',p_status)
  );

  return true;
end;
$$;

-- ------------------------------------------------------------
-- PROVIDER VERIFICATION
-- Only Admin/Super Admin can approve/reject.
-- ------------------------------------------------------------
create or replace function public.admin_set_provider_verification(
  p_provider_id uuid,
  p_status text,
  p_verified boolean default null
)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
begin
  if not public.is_admin_or_above() then
    raise exception 'Admin access required';
  end if;

  if p_status not in ('pending','approved','rejected','suspended') then
    raise exception 'Invalid provider status';
  end if;

  update public.providers
  set status=p_status,
      verified=coalesce(p_verified,verified),
      updated_at=now()
  where id=p_provider_id;

  if not found then
    raise exception 'Provider not found';
  end if;

  return true;
end;
$$;

-- ------------------------------------------------------------
-- SUPER ADMIN: HARD ROLE CHANGE
-- Prevents changing the last Super Admin into another role.
-- ------------------------------------------------------------
create or replace function public.super_admin_change_role_safe(
  p_user_id uuid,
  p_new_role public.user_role
)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare
  old_role public.user_role;
  super_count bigint;
begin
  if not public.is_super_admin() then
    raise exception 'Only Super Admin can change roles';
  end if;

  select role into old_role
  from public.profiles
  where id=p_user_id
  for update;

  if old_role is null then
    raise exception 'User profile not found';
  end if;

  if old_role='super_admin' and p_new_role<>'super_admin' then
    select count(*) into super_count
    from public.profiles
    where role='super_admin'
      and account_status='active';

    if super_count<=1 then
      raise exception 'Cannot remove the last active Super Admin';
    end if;
  end if;

  update public.profiles
  set role=p_new_role,updated_at=now()
  where id=p_user_id;

  return true;
end;
$$;

-- ------------------------------------------------------------
-- SEARCH / DISCOVERY INDEXES
-- ------------------------------------------------------------
create index if not exists idx_profiles_role_status
  on public.profiles(role,account_status);

create index if not exists idx_doctors_verification_updated
  on public.doctors(verification_status,updated_at desc);

create index if not exists idx_providers_status_updated
  on public.providers(status,updated_at desc);

-- ============================================================
-- END STEP 7
-- ============================================================
