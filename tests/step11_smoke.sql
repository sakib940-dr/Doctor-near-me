-- ============================================================
-- STEP 11 — READ-ONLY DATABASE / RLS SMOKE TEST
-- Run after 01..11 in a Supabase staging project.
-- It raises an exception on the first failed assertion.
-- ============================================================

do $$
declare
  source_divisions integer;
  source_districts integer;
  source_upazilas integer;
  sirajganj_upazilas integer;
  active_specialties integer;
  active_topics integer;
  mapped_topics integer;
  bucket_count integer;
  storage_policy_count integer;
begin
  select count(*) into source_divisions
  from public.divisions where source_code is not null and is_active;

  select count(*) into source_districts
  from public.districts where source_code is not null and is_active;

  select count(*) into source_upazilas
  from public.upazilas where source_code is not null and is_active;

  select count(*) into sirajganj_upazilas
  from public.upazilas u
  join public.districts d on d.id=u.district_id
  where d.slug='sirajganj' and u.is_active;

  select count(*) into active_specialties
  from public.specialties where is_active;

  select count(*) into active_topics
  from public.discovery_topics where is_active;

  select count(distinct topic_id) into mapped_topics
  from public.discovery_topic_specialties;

  select count(*) into bucket_count
  from storage.buckets
  where id in ('avatars','public-images','verification-documents');

  select count(*) into storage_policy_count
  from pg_policies
  where schemaname='storage'
    and tablename='objects'
    and policyname in (
      'owner_public_media_read','owner_public_media_insert',
      'owner_public_media_update','owner_public_media_delete',
      'verification_documents_read','verification_documents_insert',
      'verification_documents_delete'
    );

  if source_divisions<>8 then
    raise exception 'Expected 8 sourced divisions, found %',source_divisions;
  end if;
  if source_districts<>64 then
    raise exception 'Expected 64 sourced districts, found %',source_districts;
  end if;
  if source_upazilas<>495 then
    raise exception 'Expected 495 sourced upazilas, found %',source_upazilas;
  end if;
  if sirajganj_upazilas<>9 then
    raise exception 'Expected 9 Sirajganj upazilas, found %',sirajganj_upazilas;
  end if;
  if active_specialties<26 then
    raise exception 'Expected at least 26 specialties, found %',active_specialties;
  end if;
  if active_topics<16 or mapped_topics<16 then
    raise exception 'Discovery topic seed/mapping is incomplete';
  end if;
  if bucket_count<>3 or storage_policy_count<>7 then
    raise exception 'Storage bucket/policy setup is incomplete';
  end if;

  if not exists(
    select 1 from pg_enum e
    join pg_type t on t.oid=e.enumtypid
    join pg_namespace n on n.oid=t.typnamespace
    where n.nspname='public' and t.typname='user_role'
      and e.enumlabel='verification_officer'
  ) then
    raise exception 'verification_officer role is missing';
  end if;

  if not exists(
    select 1 from pg_enum e
    join pg_type t on t.oid=e.enumtypid
    join pg_namespace n on n.oid=t.typnamespace
    where n.nspname='public' and t.typname='user_role'
      and e.enumlabel='ambulance'
  ) then
    raise exception 'ambulance role is missing';
  end if;

  if to_regprocedure(
    'public.search_doctors_advanced(text,bigint,bigint,bigint[],text[],text[],numeric,numeric,boolean,text,integer,integer)'
  ) is null then
    raise exception 'search_doctors_advanced RPC is missing';
  end if;

  if to_regprocedure(
    'public.search_ambulances(bigint,bigint,text[],boolean,double precision,double precision,double precision,integer,integer)'
  ) is null then
    raise exception 'search_ambulances RPC is missing';
  end if;

  if not has_function_privilege(
    'anon',
    'public.search_ambulances(bigint,bigint,text[],boolean,double precision,double precision,double precision,integer,integer)',
    'EXECUTE'
  ) then
    raise exception 'Anonymous ambulance search grant is missing';
  end if;

  if has_table_privilege('anon','public.ambulance_services','SELECT')
     or has_table_privilege('authenticated','public.ambulance_services','SELECT') then
    raise exception 'Sensitive ambulance base table has an unsafe direct SELECT grant';
  end if;

  if has_function_privilege(
    'anon',
    'public.register_ambulance_service(text,text,text,text,text,text,text,text[],text,bigint,bigint,double precision,double precision,text,boolean,uuid)',
    'EXECUTE'
  ) then
    raise exception 'Anonymous role must not execute ambulance registration';
  end if;
end;
$$;

select 'STEP 11 SMOKE TEST PASSED' as result,
       public.get_reference_data_health() as reference_data;
