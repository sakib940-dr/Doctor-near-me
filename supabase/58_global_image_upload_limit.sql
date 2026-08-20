-- 58_global_image_upload_limit.sql
-- Production guard for public image buckets.
-- Client code rejects source images above 3 MB before optimization.
-- These image-only buckets also get a storage-level 3 MB hard cap.
-- verification-documents intentionally remains unchanged because it also stores PDFs;
-- image files in that mixed bucket are guarded by the shared client/service optimizer.

update storage.buckets
set file_size_limit = 3145728,
    allowed_mime_types = array['image/jpeg','image/png','image/webp','image/avif']
where id in ('avatars', 'public-images');
