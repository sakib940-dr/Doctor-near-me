import { requireSupabase } from '../lib/supabase';
import { optimizeImageSet, type ImageOptimizationPreset } from '../lib/imageOptimization';

function isAlreadyExistsError(error: unknown) {
  const value = error as { statusCode?: string | number; message?: string; error?: string } | null;
  const status = Number(value?.statusCode ?? 0);
  const message = `${value?.message ?? ''} ${value?.error ?? ''}`.toLowerCase();
  return status === 409 || message.includes('already exists') || message.includes('duplicate');
}

async function uploadOnce(bucket: string, path: string, file: File, cacheControl: string) {
  const { error } = await requireSupabase().storage.from(bucket).upload(path, file, {
    cacheControl,
    contentType: file.type,
    upsert: false,
  });
  if (error && !isAlreadyExistsError(error)) throw error;
}

export async function uploadOptimizedImage(input: {
  file: File;
  bucket: string;
  ownerPrefix: string;
  folder: string;
  preset: ImageOptimizationPreset;
  cacheControl?: string;
}) {
  const optimized = await optimizeImageSet(input.file, input.preset);
  const cleanFolder = input.folder.replace(/^\/+|\/+$/g, '');
  const prefix = `${input.ownerPrefix.replace(/\/+$/g, '')}/${cleanFolder}/${optimized.fingerprint}-opt`;
  const masterPath = `${prefix}.webp`;
  const thumbnailPath = `${prefix}-thumb.webp`;
  const cacheControl = input.cacheControl ?? '31536000';

  await uploadOnce(input.bucket, masterPath, optimized.master.file, cacheControl);
  if (optimized.thumbnail) {
    await uploadOnce(input.bucket, thumbnailPath, optimized.thumbnail.file, cacheControl);
  }

  return {
    path: masterPath,
    thumbnailPath: optimized.thumbnail ? thumbnailPath : null,
    originalBytes: optimized.master.originalBytes,
    optimizedBytes: optimized.master.optimizedBytes,
  };
}

export async function optimizeVerificationImageIfNeeded(file: File) {
  if (!file.type.startsWith('image/')) return file;
  const optimized = await optimizeImageSet(file, 'verification');
  return optimized.master.file;
}

export async function removeOptimizedImageVariants(bucket: string, path: string | null | undefined) {
  if (!path || /^https?:\/\//i.test(path)) return;
  // Optimized objects are content-addressed by fingerprint and may be shared when
  // the same image is reused. Do not delete a shared object from a single-record
  // delete/replace path; that could break another card/slider that references it.
  // Legacy non-content-addressed objects remain safe to remove as before.
  if (/-opt\.webp$/i.test(path)) return;
  const { error } = await requireSupabase().storage.from(bucket).remove([path]);
  if (error) throw error;
}
