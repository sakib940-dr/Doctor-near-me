-- ============================================================
-- STEP 83 — HOSPITAL DOCTOR PHOTO UPLOAD RELIABILITY
-- Hospital-only storage path/policy repair. Safe to re-run.
-- Run after Step 82.
-- Does not alter Doctor, Patient, Visitor, Appointment or Admin tables.
-- ============================================================

begin;

-- Compression emits WebP master + thumbnail files. Keep the shared bucket
-- public and explicitly permit every source/optimized MIME used here.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('public-images','public-images',true,5242880,array['image/jpeg','image/png','image/webp','image/avif'])
on conflict(id) do update set
  public=true,
  file_size_limit=5242880,
  allowed_mime_types=array['image/jpeg','image/png','image/webp','image/avif'];

-- Canonical path:
-- {auth.uid()}/{hospital_provider_id}/hospital-doctors/{fingerprint}-opt.webp
drop policy if exists "hospital_doctor_photo_insert" on storage.objects;
create policy "hospital_doctor_photo_insert"
on storage.objects for insert to authenticated
with check (
  bucket_id='public-images'
  and (storage.foldername(name))[1]=auth.uid()::text
  and coalesce((storage.foldername(name))[3],'')='hospital-doctors'
  and exists (
    select 1
    from public.providers pr
    join public.profiles owner on owner.id=pr.owner_user_id
    where pr.id::text=(storage.foldername(name))[2]
      and pr.owner_user_id=auth.uid()
      and pr.provider_type='hospital'
      and owner.role='hospital'
      and owner.account_status='active'
  )
);

-- Permit safe cleanup after replacement/save failure. Legacy Step-81 objects
-- at {uid}/hospital-doctors/... remain deletable.
drop policy if exists "hospital_doctor_photo_delete" on storage.objects;
create policy "hospital_doctor_photo_delete"
on storage.objects for delete to authenticated
using (
  bucket_id='public-images'
  and owner_id=auth.uid()::text
  and (storage.foldername(name))[1]=auth.uid()::text
  and not public.storage_object_is_referenced(bucket_id,name)
  and (
    (
      coalesce((storage.foldername(name))[2],'')='hospital-doctors'
      and exists (
        select 1 from public.providers pr
        join public.profiles owner on owner.id=pr.owner_user_id
        where pr.owner_user_id=auth.uid() and pr.provider_type='hospital'
          and owner.role='hospital' and owner.account_status='active'
      )
    )
    or
    (
      coalesce((storage.foldername(name))[3],'')='hospital-doctors'
      and exists (
        select 1 from public.providers pr
        join public.profiles owner on owner.id=pr.owner_user_id
        where pr.id::text=(storage.foldername(name))[2]
          and pr.owner_user_id=auth.uid() and pr.provider_type='hospital'
          and owner.role='hospital' and owner.account_status='active'
      )
    )
  )
);

do $$
begin
  if not exists (
    select 1 from storage.buckets
    where id='public-images' and public=true and file_size_limit=5242880
      and 'image/webp'=any(allowed_mime_types)
  ) then
    raise exception 'STEP83: public-images WebP bucket configuration is not ready';
  end if;
  raise notice 'STEP 83 HOSPITAL DOCTOR PHOTO UPLOAD RELIABILITY PASSED';
end $$;

commit;
