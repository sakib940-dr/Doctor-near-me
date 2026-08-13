import { supabase } from './supabase';

export function getImageUrl(
  path: string | null | undefined,
  bucket = 'public-images',
) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  if (!supabase) return null;

  const normalized = path.replace(/^\/+/, '');
  const bucketPrefix = `${bucket}/`;
  const objectPath = normalized.startsWith(bucketPrefix)
    ? normalized.slice(bucketPrefix.length)
    : normalized;

  return supabase.storage.from(bucket).getPublicUrl(objectPath).data.publicUrl;
}
