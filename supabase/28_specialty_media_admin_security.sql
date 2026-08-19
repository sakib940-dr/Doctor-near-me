-- ============================================================
-- STEP 28 — SPECIALTY MEDIA + ADMIN-ONLY CMS STORAGE SECURITY
-- Run after Step 27. Safe to re-run.
-- Reuses public.specialties.icon_url and the existing public-images bucket.
-- ============================================================

-- Discovery-topic emoji/icon is legacy presentation data. Public category
-- imagery now comes from the mapped specialty's existing icon_url field.
update public.discovery_topics
set icon = null
where icon is not null;

-- Reserve {auth.uid()}/cms/specialties/* inside public-images for Admin CMS.
-- Existing avatar/public-image owner behavior remains unchanged everywhere else.
drop policy if exists "owner_public_media_insert" on storage.objects;
create policy "owner_public_media_insert"
on storage.objects for insert to authenticated
with check (
  (
    bucket_id='avatars'
    and (storage.foldername(name))[1]=auth.uid()::text
  )
  or
  (
    bucket_id='public-images'
    and (storage.foldername(name))[1]=auth.uid()::text
    and not (
      coalesce((storage.foldername(name))[2],'')='cms'
      and coalesce((storage.foldername(name))[3],'')='specialties'
    )
  )
);

drop policy if exists "owner_public_media_update" on storage.objects;
create policy "owner_public_media_update"
on storage.objects for update to authenticated
using (
  bucket_id in ('avatars','public-images')
  and owner_id=auth.uid()::text
  and not (
    bucket_id='public-images'
    and coalesce((storage.foldername(name))[2],'')='cms'
    and coalesce((storage.foldername(name))[3],'')='specialties'
  )
)
with check (
  bucket_id in ('avatars','public-images')
  and (storage.foldername(name))[1]=auth.uid()::text
  and not (
    bucket_id='public-images'
    and coalesce((storage.foldername(name))[2],'')='cms'
    and coalesce((storage.foldername(name))[3],'')='specialties'
  )
);

drop policy if exists "owner_public_media_delete" on storage.objects;
create policy "owner_public_media_delete"
on storage.objects for delete to authenticated
using (
  bucket_id in ('avatars','public-images')
  and owner_id=auth.uid()::text
  and not (
    bucket_id='public-images'
    and coalesce((storage.foldername(name))[2],'')='cms'
    and coalesce((storage.foldername(name))[3],'')='specialties'
  )
);

drop policy if exists "admin_specialty_media_insert" on storage.objects;
create policy "admin_specialty_media_insert"
on storage.objects for insert to authenticated
with check (
  bucket_id='public-images'
  and (storage.foldername(name))[1]=auth.uid()::text
  and coalesce((storage.foldername(name))[2],'')='cms'
  and coalesce((storage.foldername(name))[3],'')='specialties'
  and public.is_admin_or_above()
);

drop policy if exists "admin_specialty_media_update" on storage.objects;
create policy "admin_specialty_media_update"
on storage.objects for update to authenticated
using (
  bucket_id='public-images'
  and coalesce((storage.foldername(name))[2],'')='cms'
  and coalesce((storage.foldername(name))[3],'')='specialties'
  and public.is_admin_or_above()
)
with check (
  bucket_id='public-images'
  and coalesce((storage.foldername(name))[2],'')='cms'
  and coalesce((storage.foldername(name))[3],'')='specialties'
  and public.is_admin_or_above()
);

drop policy if exists "admin_specialty_media_delete" on storage.objects;
create policy "admin_specialty_media_delete"
on storage.objects for delete to authenticated
using (
  bucket_id='public-images'
  and coalesce((storage.foldername(name))[2],'')='cms'
  and coalesce((storage.foldername(name))[3],'')='specialties'
  and public.is_admin_or_above()
);

-- Database category-image modification remains RPC-only. Step 20 already
-- revokes direct specialty mutation from authenticated users and the RPC
-- itself checks is_admin_or_above(). Reassert those ACLs here.
revoke insert,update,delete on table public.specialties from public,anon,authenticated;
revoke all on function public.save_admin_specialty(bigint,text,text,text,text,boolean,integer) from public,anon;
grant execute on function public.save_admin_specialty(bigint,text,text,text,text,boolean,integer) to authenticated,service_role;

select 'STEP 28 SPECIALTY MEDIA ADMIN SECURITY PASSED' as result;
