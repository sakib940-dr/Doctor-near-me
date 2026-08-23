-- ============================================================
-- STEP 77 — GLOBAL 5 MB SOURCE IMAGE POLICY
-- Run after Step 76.
-- Browser code compresses accepted images to WebP with a hard 200 KB ceiling
-- before upload. Storage keeps a 5 MB defence-in-depth ceiling for legacy
-- clients. The mixed verification bucket stays 10 MB because it accepts PDFs.
-- ============================================================

begin;

update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg','image/png','image/webp','image/avif']
where id in ('avatars', 'public-images');

do $$
declare v_bad_count integer;
begin
  select count(*) into v_bad_count
  from storage.buckets
  where id in ('avatars', 'public-images')
    and (file_size_limit <> 5242880
      or allowed_mime_types is distinct from array['image/jpeg','image/png','image/webp','image/avif']::text[]);
  if v_bad_count <> 0 then
    raise exception 'STEP 77 failed: image bucket policy mismatch';
  end if;
  raise notice 'STEP 77 GLOBAL 5 MB IMAGE POLICY PASSED';
end $$;

commit;
