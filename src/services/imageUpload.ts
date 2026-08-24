import { requireSupabase } from '../lib/supabase';
import { friendlyImageUploadError, getStableUploadFile, optimizeImageSet, type ImageOptimizationPreset } from '../lib/imageOptimization';

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
  memorySafeDecode?: boolean;
}) {
  try {
    const optimized = await optimizeImageSet(input.file, input.preset, { memorySafeDecode: input.memorySafeDecode });
    const cleanFolder = input.folder.replace(/^\/+|\/+$/g, '');
    const prefix = `${input.ownerPrefix.replace(/\/+$/g, '')}/${cleanFolder}/${optimized.fingerprint}-opt`;
    const masterPath = `${prefix}.webp`;
    const thumbnailPath = `${prefix}-thumb.webp`;
    const cacheControl = input.cacheControl ?? '31536000';

    await uploadOnce(input.bucket, masterPath, optimized.master.file, cacheControl);
    if (optimized.thumbnail) await uploadOnce(input.bucket, thumbnailPath, optimized.thumbnail.file, cacheControl);
    return {path:masterPath,thumbnailPath:optimized.thumbnail?thumbnailPath:null,originalBytes:optimized.master.originalBytes,optimizedBytes:optimized.master.optimizedBytes};
  } catch(error) {
    const friendly=new Error(friendlyImageUploadError(error));
    (friendly as Error&{cause?:unknown}).cause=error;
    throw friendly;
  }
}

export async function optimizeVerificationImageIfNeeded(file: File) {
  const stableFile=await getStableUploadFile(file);
  if (!stableFile.type.startsWith('image/')) return stableFile;
  const optimized = await optimizeImageSet(stableFile, 'verification', {memorySafeDecode:true});
  return optimized.master.file;
}

function optimizedVariantPaths(path: string) {
  if (/-opt-thumb\.webp$/i.test(path)) {
    const master = path.replace(/-opt-thumb\.webp$/i, '-opt.webp');
    return [master, path];
  }
  if (/-opt\.webp$/i.test(path)) return [path, path.replace(/-opt\.webp$/i, '-opt-thumb.webp')];
  return [path];
}

export async function removeOptimizedImageVariants(bucket: string, path: string | null | undefined) {
  if (!path || /^https?:\/\//i.test(path)) return false;
  const client = requireSupabase();
  const { data: referenced, error: referenceError } = await client.rpc('storage_object_is_referenced', {
    p_bucket: bucket,
    p_name: path,
  });
  if (referenceError) throw referenceError;
  if (referenced === true) return false;

  const paths = optimizedVariantPaths(path);
  const { error } = await client.storage.from(bucket).remove(paths);
  if (error) throw error;
  return true;
}
