-- ============================================================
-- STEP 24 — ADMIN 30-DAY OPERATIONAL TRENDS
-- Run after Step 23. Safe to re-run.
-- ============================================================

create or replace function public.get_admin_operational_trends()
returns table(
  day date,
  new_users bigint,
  appointments bigint
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
  with days as (
    select generate_series(current_date - 29, current_date, interval '1 day')::date as day
  ), user_counts as (
    select p.created_at::date as day, count(*)::bigint as total
    from public.profiles p
    where p.created_at >= current_date - 29
      and p.created_at < current_date + 1
    group by p.created_at::date
  ), appointment_counts as (
    select a.created_at::date as day, count(*)::bigint as total
    from public.appointments a
    where a.created_at >= current_date - 29
      and a.created_at < current_date + 1
    group by a.created_at::date
  )
  select d.day,
         coalesce(u.total, 0)::bigint as new_users,
         coalesce(a.total, 0)::bigint as appointments
  from days d
  left join user_counts u on u.day=d.day
  left join appointment_counts a on a.day=d.day
  order by d.day;
end;
$$;

revoke all on function public.get_admin_operational_trends() from public,anon;
grant execute on function public.get_admin_operational_trends() to authenticated,service_role;

do $assert$
begin
  if has_function_privilege('anon','public.get_admin_operational_trends()','EXECUTE') then
    raise exception 'Step 24 failed: anonymous Admin trend RPC access remains';
  end if;
  if not has_function_privilege('authenticated','public.get_admin_operational_trends()','EXECUTE') then
    raise exception 'Step 24 failed: authenticated Admin trend RPC grant missing';
  end if;
end;
$assert$;

select 'STEP 24 ADMIN OPERATIONAL TRENDS PASSED' as result;
