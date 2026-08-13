-- ============================================================
-- STEP 12 — PUBLIC DOCTOR PROFILE RPC SECURITY FIX
-- Run after Step 11B on an existing database. Safe to re-run.
-- ============================================================

-- The RPC has an explicit public-safe JSON shape and filters to approved,
-- active doctors. SECURITY DEFINER lets anonymous visitors cross the private
-- profiles-table RLS boundary without exposing any unlisted profile columns.
alter function public.get_doctor_public_profile(uuid) security definer;
alter function public.get_doctor_public_profile(uuid) set search_path=public;

revoke all on function public.get_doctor_public_profile(uuid)
  from public,anon;
grant execute on function public.get_doctor_public_profile(uuid)
  to anon,authenticated,service_role;

-- Supabase projects can retain a direct anon table grant from default
-- privileges. Anonymous visitors only need the safe RPC above; signed-in
-- users retain SELECT so the existing own/admin RLS policy keeps working.
revoke select on table public.profiles from public,anon;
grant select on table public.profiles to authenticated,service_role;

do $assert$
begin
  if not has_function_privilege(
    'anon','public.get_doctor_public_profile(uuid)','EXECUTE'
  ) then
    raise exception 'Step 12 failed: anonymous public-profile access is missing';
  end if;

  if has_table_privilege('anon','public.profiles','SELECT') then
    raise exception 'Step 12 failed: anon must not receive direct profiles SELECT';
  end if;

  if not has_table_privilege('authenticated','public.profiles','SELECT') then
    raise exception 'Step 12 failed: authenticated profiles SELECT is missing';
  end if;
end;
$assert$;

select 'STEP 12 PUBLIC DOCTOR PROFILE SECURITY PASSED' as result;
