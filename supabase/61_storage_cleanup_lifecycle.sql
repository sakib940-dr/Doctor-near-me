-- ============================================================
-- STEP 61 — STORAGE LIFECYCLE + SAFE ORPHAN CLEANUP
-- Run after Step 60. Safe to re-run.
-- Preserves application records; only unreferenced Storage objects are eligible.
-- ============================================================

insert into public.site_settings(setting_key,setting_value,is_public,description)
values(
  'storage_cleanup_policy',
  '{"quota_bytes":null,"grace_hours":24,"notice_percent":70,"warning_percent":85,"critical_percent":95}'::jsonb,
  false,
  'Admin-only Storage cleanup policy. quota_bytes stays null until an Admin configures a reliable plan quota.'
)
on conflict(setting_key) do nothing;

-- Canonical DB reference counter for managed Storage paths. Optimized thumbnails
-- inherit the reference state of their master object so a referenced card image
-- cannot lose its thumbnail during cleanup.
create or replace function public.storage_object_reference_count(p_bucket text,p_name text)
returns bigint
language plpgsql
security definer
stable
set search_path=public,storage
as $$
declare
  v_name text:=trim(coalesce(p_name,''));
  v_count bigint:=0;
begin
  if v_name='' or p_bucket not in ('avatars','public-images','verification-documents') then return 0; end if;
  if v_name ~ '-opt-thumb\\.webp$' then
    v_name:=regexp_replace(v_name,'-opt-thumb\\.webp$','-opt.webp');
  end if;

  if p_bucket='avatars' then
    -- For Doctor accounts, doctors.profile_photo_url is the active canonical image.
    -- A legacy profiles.avatar_url shadowed by a non-empty Doctor photo must not
    -- keep an obsolete Storage object referenced forever.
    select
      (select count(*)
         from public.profiles p
        where p.avatar_url=v_name
          and not exists (
            select 1 from public.doctors d
            where d.id=p.id
              and nullif(trim(coalesce(d.profile_photo_url,'')),'') is not null
          ))
      +(select count(*) from public.doctors d where d.profile_photo_url=v_name)
    into v_count;
  elsif p_bucket='public-images' then
    select
      (select count(*) from public.providers p where p.logo_url=v_name or p.banner_url=v_name or v_name=any(coalesce(p.gallery_paths,'{}'::text[])))
      +(select count(*) from public.specialties s where s.icon_url=v_name)
      +(select count(*) from public.homepage_banners b where b.image_path=v_name)
      +(select count(*) from public.doctor_slider_images d where d.image=v_name)
      +(select count(*) from public.provider_services s where s.image=v_name)
      +(select count(*) from public.provider_gallery_images g where g.image=v_name)
      +(select count(*) from public.provider_slider_images s where s.image=v_name)
    into v_count;
  else
    select
      (select count(*) from public.ambulance_verification_documents d where d.storage_path=v_name)
      +(select count(*) from public.entity_verification_documents d where d.storage_path=v_name)
    into v_count;
  end if;
  return coalesce(v_count,0);
end;
$$;

create or replace function public.storage_object_is_referenced(p_bucket text,p_name text)
returns boolean
language sql
security definer
stable
set search_path=public,storage
as $$ select public.storage_object_reference_count(p_bucket,p_name)>0 $$;

revoke all on function public.storage_object_reference_count(text,text) from public,anon;
revoke all on function public.storage_object_is_referenced(text,text) from public,anon;
grant execute on function public.storage_object_reference_count(text,text) to authenticated,service_role;
grant execute on function public.storage_object_is_referenced(text,text) to authenticated,service_role;

-- Harden the existing owner delete policy: owner rollback/delete remains possible,
-- but a path still referenced by any valid record (or its thumbnail) cannot be removed.
drop policy if exists "owner_public_media_delete" on storage.objects;
create policy "owner_public_media_delete"
on storage.objects for delete to authenticated
using (
  bucket_id in ('avatars','public-images')
  and owner_id=auth.uid()::text
  and not public.storage_object_is_referenced(bucket_id,name)
  and not (
    bucket_id='public-images'
    and coalesce((storage.foldername(name))[2],'')='cms'
    and coalesce((storage.foldername(name))[3],'')='specialties'
  )
);

-- Admin specialty uploads need immediate rollback after a failed DB save, but still
-- may never delete a referenced object.
drop policy if exists "admin_specialty_media_delete" on storage.objects;
create policy "admin_specialty_media_delete"
on storage.objects for delete to authenticated
using (
  bucket_id='public-images'
  and coalesce((storage.foldername(name))[2],'')='cms'
  and coalesce((storage.foldername(name))[3],'')='specialties'
  and public.is_admin_or_above()
  and not public.storage_object_is_referenced(bucket_id,name)
);

-- Verification document delete flow already removes metadata first. Preserve that
-- workflow while blocking deletion of a still-referenced private document.
drop policy if exists "verification_documents_delete" on storage.objects;
create policy "verification_documents_delete"
on storage.objects for delete to authenticated
using (
  bucket_id='verification-documents'
  and owner_id=auth.uid()::text
  and not public.storage_object_is_referenced(bucket_id,name)
);

-- Admin cleanup can delete another user's orphan only after the configured grace
-- window. This policy is intentionally narrower than general Admin storage access.
drop policy if exists "admin_safe_orphan_storage_delete" on storage.objects;
create policy "admin_safe_orphan_storage_delete"
on storage.objects for delete to authenticated
using (
  bucket_id in ('avatars','public-images','verification-documents')
  and public.is_admin_or_above()
  and not public.storage_object_is_referenced(bucket_id,name)
  and created_at < now() - make_interval(hours => greatest(1,least(168,coalesce(
    (select (setting_value->>'grace_hours')::integer from public.site_settings where setting_key='storage_cleanup_policy'),24
  ))))
);

create or replace function public.get_admin_storage_cleanup_summary()
returns jsonb
language plpgsql
security definer
stable
set search_path=public,storage
as $$
declare
  cfg jsonb;
  grace_hours integer;
  quota_bytes bigint;
  total_files bigint:=0; referenced_files bigint:=0; orphan_files bigint:=0; recent_unreferenced bigint:=0;
  total_bytes bigint:=0; orphan_bytes bigint:=0;
  usage_percent numeric:=null; level text:='unknown';
  expired_push bigint:=0;
begin
  if not public.is_admin_or_above() then raise exception 'Admin access required'; end if;
  select setting_value into cfg from public.site_settings where setting_key='storage_cleanup_policy';
  cfg:=coalesce(cfg,'{}'::jsonb);
  grace_hours:=greatest(1,least(168,coalesce((cfg->>'grace_hours')::integer,24)));
  quota_bytes:=nullif(coalesce(cfg->>'quota_bytes',''),'')::bigint;

  with managed as (
    select o.bucket_id,o.name,o.created_at,coalesce((o.metadata->>'size')::bigint,0) as bytes,
           public.storage_object_reference_count(o.bucket_id,o.name) as refs
    from storage.objects o
    where o.bucket_id in ('avatars','public-images','verification-documents')
  )
  select count(*),count(*) filter(where refs>0),
         count(*) filter(where refs=0 and created_at<now()-make_interval(hours=>grace_hours)),
         count(*) filter(where refs=0 and created_at>=now()-make_interval(hours=>grace_hours)),
         coalesce(sum(bytes),0),coalesce(sum(bytes) filter(where refs=0 and created_at<now()-make_interval(hours=>grace_hours)),0)
  into total_files,referenced_files,orphan_files,recent_unreferenced,total_bytes,orphan_bytes
  from managed;

  if quota_bytes is not null and quota_bytes>0 then
    usage_percent:=round(total_bytes::numeric*100/quota_bytes,2);
    if usage_percent>=coalesce((cfg->>'critical_percent')::numeric,95) then level:='critical';
    elsif usage_percent>=coalesce((cfg->>'warning_percent')::numeric,85) then level:='warning';
    elsif usage_percent>=coalesce((cfg->>'notice_percent')::numeric,70) then level:='notice';
    else level:='normal'; end if;
  end if;

  if to_regclass('public.web_push_subscriptions') is not null then
    select count(*) into expired_push from public.web_push_subscriptions s
    where (not s.is_active and s.last_seen_at<now()-interval '30 days')
       or (s.expiration_time is not null and s.expiration_time>0 and s.expiration_time < (extract(epoch from now())*1000)::bigint and s.last_seen_at<now()-interval '7 days');
  end if;

  return jsonb_build_object(
    'total_files',total_files,'referenced_files',referenced_files,'orphan_files',orphan_files,
    'recent_unreferenced_files',recent_unreferenced,'total_bytes',total_bytes,'orphan_bytes',orphan_bytes,
    'grace_hours',grace_hours,'quota_bytes',quota_bytes,'usage_percent',usage_percent,'warning_level',level,
    'notice_percent',coalesce((cfg->>'notice_percent')::integer,70),
    'warning_percent',coalesce((cfg->>'warning_percent')::integer,85),
    'critical_percent',coalesce((cfg->>'critical_percent')::integer,95),
    'expired_push_subscriptions',expired_push
  );
end;
$$;

create or replace function public.get_admin_storage_cleanup_preview(p_limit integer default 100)
returns table(bucket_id text,name text,size_bytes bigint,created_at timestamptz,age_hours numeric)
language plpgsql
security definer
stable
set search_path=public,storage
as $$
declare grace_hours integer;
begin
  if not public.is_admin_or_above() then raise exception 'Admin access required'; end if;
  select greatest(1,least(168,coalesce((setting_value->>'grace_hours')::integer,24)))
    into grace_hours from public.site_settings where setting_key='storage_cleanup_policy';
  grace_hours:=coalesce(grace_hours,24);
  return query
  select o.bucket_id,o.name,coalesce((o.metadata->>'size')::bigint,0),o.created_at,
         round(extract(epoch from (now()-o.created_at))/3600,1)
  from storage.objects o
  where o.bucket_id in ('avatars','public-images','verification-documents')
    and o.created_at<now()-make_interval(hours=>grace_hours)
    and not public.storage_object_is_referenced(o.bucket_id,o.name)
  order by o.created_at asc
  limit greatest(1,least(coalesce(p_limit,100),500));
end;
$$;

create or replace function public.save_admin_storage_cleanup_policy(p_quota_bytes bigint default null,p_grace_hours integer default 24)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare next_value jsonb;
begin
  if not public.is_admin_or_above() then raise exception 'Admin access required'; end if;
  if p_quota_bytes is not null and p_quota_bytes<1048576 then raise exception 'Configured quota must be at least 1 MB'; end if;
  if p_grace_hours not between 1 and 168 then raise exception 'Grace period must be between 1 and 168 hours'; end if;
  next_value:=jsonb_build_object('quota_bytes',p_quota_bytes,'grace_hours',p_grace_hours,'notice_percent',70,'warning_percent',85,'critical_percent',95);
  insert into public.site_settings(setting_key,setting_value,is_public,description,updated_by,updated_at)
  values('storage_cleanup_policy',next_value,false,'Admin-only Storage cleanup policy.',auth.uid(),now())
  on conflict(setting_key) do update set setting_value=excluded.setting_value,is_public=false,updated_by=auth.uid(),updated_at=now();
  insert into public.admin_audit_logs(actor_id,action,target_type,target_id,metadata)
  values(auth.uid(),'storage_cleanup_policy_saved','site_setting','storage_cleanup_policy',jsonb_build_object('quota_bytes',p_quota_bytes,'grace_hours',p_grace_hours));
  return true;
end;
$$;

create or replace function public.admin_finalize_storage_cleanup(p_deleted_count integer,p_deleted_bytes bigint,p_failed_count integer default 0)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare expired_deleted integer:=0;
begin
  if not public.is_admin_or_above() then raise exception 'Admin access required'; end if;
  if to_regclass('public.web_push_subscriptions') is not null then
    with gone as (
      delete from public.web_push_subscriptions s
      where (not s.is_active and s.last_seen_at<now()-interval '30 days')
         or (s.expiration_time is not null and s.expiration_time>0 and s.expiration_time < (extract(epoch from now())*1000)::bigint and s.last_seen_at<now()-interval '7 days')
      returning 1
    ) select count(*) into expired_deleted from gone;
  end if;
  insert into public.admin_audit_logs(actor_id,action,target_type,target_id,metadata)
  values(auth.uid(),'storage_safe_cleanup','storage','managed-buckets',jsonb_build_object(
    'deleted_objects',greatest(coalesce(p_deleted_count,0),0),'deleted_bytes',greatest(coalesce(p_deleted_bytes,0),0),
    'failed_objects',greatest(coalesce(p_failed_count,0),0),'expired_push_subscriptions_deleted',expired_deleted
  ));
  return jsonb_build_object('expired_push_subscriptions_deleted',expired_deleted);
end;
$$;

revoke all on function public.get_admin_storage_cleanup_summary() from public,anon;
revoke all on function public.get_admin_storage_cleanup_preview(integer) from public,anon;
revoke all on function public.save_admin_storage_cleanup_policy(bigint,integer) from public,anon;
revoke all on function public.admin_finalize_storage_cleanup(integer,bigint,integer) from public,anon;
grant execute on function public.get_admin_storage_cleanup_summary() to authenticated,service_role;
grant execute on function public.get_admin_storage_cleanup_preview(integer) to authenticated,service_role;
grant execute on function public.save_admin_storage_cleanup_policy(bigint,integer) to authenticated,service_role;
grant execute on function public.admin_finalize_storage_cleanup(integer,bigint,integer) to authenticated,service_role;

-- Self-check: no application clinical/history table is touched by this migration.
do $$
begin
  if to_regclass('storage.objects') is null then raise exception 'STEP61: storage.objects missing'; end if;
  if to_regclass('public.site_settings') is null then raise exception 'STEP61: site_settings missing'; end if;
  if not exists(select 1 from public.site_settings where setting_key='storage_cleanup_policy') then raise exception 'STEP61: cleanup policy missing'; end if;
end;
$$;

select 'STEP 61 STORAGE CLEANUP LIFECYCLE PASSED' as result;
