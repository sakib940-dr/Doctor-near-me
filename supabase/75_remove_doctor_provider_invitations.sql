-- ============================================================
-- STEP 75 — REMOVE LEGACY DOCTOR/PROVIDER INVITATION SYSTEM
-- Run after Step 74.
--
-- doctor_provider_links remains as the internal relationship between a
-- Doctor and that Doctor's own chamber. External Hospital/Doctor invitation
-- rows, schedules and RPCs are removed permanently. Existing appointment
-- history is intentionally preserved.
-- ============================================================

begin;

-- External provider-controlled schedules are no longer part of the product.
delete from public.chamber_schedules s
using public.providers pr
where pr.id=s.provider_id
  and pr.owner_user_id is distinct from s.doctor_id;

-- Remove pending, approved, rejected and removed legacy external links.
delete from public.doctor_provider_links l
using public.providers pr
where pr.id=l.provider_id
  and pr.owner_user_id is distinct from l.doctor_id;

-- Remove every RPC that powered the invitation/link-management workflow.
drop function if exists public.search_approved_doctors_for_provider(text,integer);
drop function if exists public.invite_doctor_to_my_provider(uuid,uuid);
drop function if exists public.get_my_doctor_provider_invitations();
drop function if exists public.respond_to_provider_invitation(uuid,boolean);
drop function if exists public.remove_doctor_from_my_provider(uuid,uuid);
drop function if exists public.save_provider_doctor_schedule(uuid,uuid,smallint,time without time zone,time without time zone,numeric,boolean,uuid);
drop function if exists public.delete_provider_doctor_schedule(uuid,uuid);
drop function if exists public.provider_add_doctor(uuid,uuid);

-- Protect the remaining table from any future external link creation while
-- allowing the existing Doctor-owned chamber RPCs to keep using it.
create or replace function public.enforce_doctor_owned_provider_link()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if not exists(
    select 1 from public.providers pr
    where pr.id=new.provider_id and pr.owner_user_id=new.doctor_id
  ) then
    raise exception 'EXTERNAL_DOCTOR_PROVIDER_LINKS_DISABLED';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_doctor_owned_provider_link() from public,anon,authenticated;

drop trigger if exists trg_enforce_doctor_owned_provider_link on public.doctor_provider_links;
create trigger trg_enforce_doctor_owned_provider_link
before insert or update of doctor_id,provider_id on public.doctor_provider_links
for each row execute function public.enforce_doctor_owned_provider_link();

do $$
begin
  if exists(
    select 1 from public.doctor_provider_links l
    join public.providers pr on pr.id=l.provider_id
    where pr.owner_user_id is distinct from l.doctor_id
  ) then raise exception 'STEP 75 failed: external Doctor/provider links remain'; end if;
  if to_regprocedure('public.invite_doctor_to_my_provider(uuid,uuid)') is not null
    or to_regprocedure('public.respond_to_provider_invitation(uuid,boolean)') is not null
    or to_regprocedure('public.provider_add_doctor(uuid,uuid)') is not null then
    raise exception 'STEP 75 failed: legacy invitation RPC remains';
  end if;
  raise notice 'STEP 75 DOCTOR PROVIDER INVITATION REMOVAL PASSED';
end $$;

commit;
