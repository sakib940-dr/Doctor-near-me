-- ============================================================
-- STEP 11B — RPC ACL HOTFIX
-- Repairs direct anon EXECUTE grants caused by project-level defaults.
-- Run after Step 10/11. Safe to run more than once.
-- ============================================================

revoke execute on function public.is_verification_staff() from public,anon;
revoke execute on function public.is_ambulance_owner(uuid) from public,anon;
revoke execute on function public.can_edit_ambulance_documents(uuid) from public,anon;
revoke execute on function public.is_provider_owner(uuid) from public,anon;
revoke execute on function public.register_ambulance_service(
  text,text,text,text,text,text,text,text[],text,bigint,bigint,
  double precision,double precision,text,boolean,uuid
) from public,anon;
revoke execute on function public.update_my_ambulance_service(
  uuid,text,text,text,text,text,text,text,text[],text,bigint,bigint,
  double precision,double precision,text,boolean
) from public,anon;
revoke execute on function public.set_my_ambulance_availability(
  uuid,boolean,double precision,double precision,numeric
) from public,anon;
revoke execute on function public.request_ambulance_hospital_link(uuid,uuid)
from public,anon;
revoke execute on function public.respond_to_ambulance_hospital_link(uuid,uuid,text,text)
from public,anon;
revoke execute on function public.get_hospital_ambulance_link_requests(uuid,text)
from public,anon;
revoke execute on function public.get_ambulance_verification_queue(integer,integer)
from public,anon;
revoke execute on function public.set_ambulance_verification(uuid,text,text)
from public,anon;
revoke execute on function public.get_my_ambulance_services()
from public,anon;
revoke execute on function public.search_ambulances(
  bigint,bigint,text[],boolean,double precision,double precision,
  double precision,integer,integer
) from public,anon;

grant execute on function public.is_verification_staff()
to authenticated,service_role;
grant execute on function public.is_ambulance_owner(uuid)
to authenticated,service_role;
grant execute on function public.can_edit_ambulance_documents(uuid)
to authenticated,service_role;
grant execute on function public.is_provider_owner(uuid)
to authenticated,service_role;
grant execute on function public.register_ambulance_service(
  text,text,text,text,text,text,text,text[],text,bigint,bigint,
  double precision,double precision,text,boolean,uuid
) to authenticated,service_role;
grant execute on function public.update_my_ambulance_service(
  uuid,text,text,text,text,text,text,text,text[],text,bigint,bigint,
  double precision,double precision,text,boolean
) to authenticated,service_role;
grant execute on function public.set_my_ambulance_availability(
  uuid,boolean,double precision,double precision,numeric
) to authenticated,service_role;
grant execute on function public.request_ambulance_hospital_link(uuid,uuid)
to authenticated,service_role;
grant execute on function public.respond_to_ambulance_hospital_link(uuid,uuid,text,text)
to authenticated,service_role;
grant execute on function public.get_hospital_ambulance_link_requests(uuid,text)
to authenticated,service_role;
grant execute on function public.get_ambulance_verification_queue(integer,integer)
to authenticated,service_role;
grant execute on function public.set_ambulance_verification(uuid,text,text)
to authenticated,service_role;
grant execute on function public.get_my_ambulance_services()
to authenticated,service_role;

-- Public search remains intentionally available.
grant execute on function public.search_ambulances(
  bigint,bigint,text[],boolean,double precision,double precision,
  double precision,integer,integer
) to anon,authenticated,service_role;

-- Step 11 helper RPCs are optional here so this hotfix also works after Step 10.
do $acl$
begin
  if to_regprocedure('public.is_verification_object_owner(text)') is not null then
    execute 'revoke execute on function public.is_verification_object_owner(text) from public,anon';
  end if;
  if to_regprocedure('public.can_access_verification_object(text)') is not null then
    execute 'revoke execute on function public.can_access_verification_object(text) from public,anon';
  end if;
  if to_regprocedure('public.get_reference_data_health()') is not null then
    execute 'revoke execute on function public.get_reference_data_health() from public,anon';
  end if;
end;
$acl$;

do $assert$
begin
  if has_function_privilege(
    'anon',
    'public.register_ambulance_service(text,text,text,text,text,text,text,text[],text,bigint,bigint,double precision,double precision,text,boolean,uuid)',
    'EXECUTE'
  ) then
    raise exception 'Step 11B failed: anon still has ambulance registration EXECUTE';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.register_ambulance_service(text,text,text,text,text,text,text,text[],text,bigint,bigint,double precision,double precision,text,boolean,uuid)',
    'EXECUTE'
  ) then
    raise exception 'Step 11B failed: authenticated registration EXECUTE is missing';
  end if;

  if not has_function_privilege(
    'anon',
    'public.search_ambulances(bigint,bigint,text[],boolean,double precision,double precision,double precision,integer,integer)',
    'EXECUTE'
  ) then
    raise exception 'Step 11B failed: anonymous ambulance search EXECUTE is missing';
  end if;
end;
$assert$;

select 'STEP 11B RPC ACL HARDENING PASSED' as result;
