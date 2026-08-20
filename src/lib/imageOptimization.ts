export type ImageOptimizationPreset =
  | 'profile'
  | 'logo'
  | 'slider'
  | 'banner'
  | 'category'
  | 'gallery'
  | 'service'
  | 'verification';

type FitMode = 'cover' | 'contain';

interface PresetConfig {
  width: number;
  height: number;
  fit: FitMode;
  targetBytes: number;
  softMaxBytes: number;
  minQuality: number;
  startQuality: number;
  thumbnail?: { width: number; height: number; fit: FitMode; targetBytes: number; softMaxBytes: number };
}

const MB = 1024 * 1024;
export const MAX_SOURCE_IMAGE_BYTES = 3 * MB;
export const IMAGE_MAX_SIZE_ERROR = 'ছবির সর্বোচ্চ সাইজ 3 MB';
export const IMAGE_UPLOAD_LIMIT_HINT = 'সর্বোচ্চ 3 MB • আপলোডের পর ছবি স্বয়ংক্রিয়ভাবে অপটিমাইজ হবে';

export const IMAGE_PRESETS: Record<ImageOptimizationPreset, PresetConfig> = {
  profile: {
    width: 800, height: 800, fit: 'cover', targetBytes: 150_000, softMaxBytes: 220_000,
    minQuality: 0.74, startQuality: 0.90,
    thumbnail: { width: 320, height: 320, fit: 'cover', targetBytes: 55_000, softMaxBytes: 85_000 },
  },
  logo: {
    width: 800, height: 800, fit: 'contain', targetBytes: 130_000, softMaxBytes: 200_000,
    minQuality: 0.76, startQuality: 0.92,
    thumbnail: { width: 320, height: 320, fit: 'contain', targetBytes: 50_000, softMaxBytes: 80_000 },
  },
  slider: {
    width: 1600, height: 900, fit: 'cover', targetBytes: 190_000, softMaxBytes: 300_000,
    minQuality: 0.72, startQuality: 0.90,
    thumbnail: { width: 640, height: 360, fit: 'cover', targetBytes: 75_000, softMaxBytes: 110_000 },
  },
  banner: {
    width: 1600, height: 900, fit: 'cover', targetBytes: 190_000, softMaxBytes: 300_000,
    minQuality: 0.72, startQuality: 0.90,
    thumbnail: { width: 640, height: 360, fit: 'cover', targetBytes: 75_000, softMaxBytes: 110_000 },
  },
  category: {
    width: 600, height: 600, fit: 'cover', targetBytes: 110_000, softMaxBytes: 170_000,
    minQuality: 0.76, startQuality: 0.92,
    thumbnail: { width: 240, height: 240, fit: 'cover', targetBytes: 38_000, softMaxBytes: 65_000 },
  },
  gallery: {
    width: 1400, height: 1400, fit: 'contain', targetBytes: 180_000, softMaxBytes: 280_000,
    minQuality: 0.72, startQuality: 0.90,
    thumbnail: { width: 480, height: 480, fit: 'contain', targetBytes: 65_000, softMaxBytes: 95_000 },
  },
  service: {
    width: 1000, height: 1000, fit: 'contain', targetBytes: 140_000, softMaxBytes: 220_000,
    minQuality: 0.74, startQuality: 0.90,
    thumbnail: { width: 360, height: 360, fit: 'contain', targetBytes: 55_000, softMaxBytes: 85_000 },
  },
  verification: {
    width: 2200, height: 2200, fit: 'contain', targetBytes: 320_000, softMaxBytes: 500_000,
    minQuality: 0.80, startQuality: 0.94,
  },
};

const supportedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

export interface OptimizedImageResult {
  file: File;
  originalBytes: number;
  optimizedBytes: number;
  width: number;
  height: number;
  changed: boolean;
}

export interface OptimizedImageSet {
  master: OptimizedImageResult;
  thumbnail: OptimizedImageResult | null;
  fingerprint: string;
}

export function assertOptimizableImage(file: File) {
  if (!supportedImageTypes.has(file.type)) {
    throw new Error('JPG, PNG, WebP অথবা AVIF ছবি দিন।');
  }
  if (file.size > MAX_SOURCE_IMAGE_BYTES) {
    throw new Error(IMAGE_MAX_SIZE_ERROR);
  }
}

export function validateSelectedImage(file: File | null) {
  if (!file) return null;
  assertOptimizableImage(file);
  return file;
}

export function validateSelectedImages(files: File[]) {
  files.forEach(assertOptimizableImage);
  return files;
}

export function guardImageFileInput(input: HTMLInputElement) {
  const imageFiles = Array.from(input.files ?? []).filter((file) => file.type.startsWith('image/'));
  try {
    validateSelectedImages(imageFiles);
    return true;
  } catch (error) {
    input.value = '';
    const message = error instanceof Error ? error.message : IMAGE_MAX_SIZE_ERROR;
    input.setCustomValidity(message);
    input.reportValidity();
    input.setCustomValidity('');
    return false;
  }
}

export function imageUploadHint(recommended: string) {
  return `প্রস্তাবিত সাইজ: ${recommended} px • ${IMAGE_UPLOAD_LIMIT_HINT}`;
}

let globalImageGuardInstalled = false;

export function installGlobalImageUploadGuard() {
  if (globalImageGuardInstalled || typeof document === 'undefined') return;
  globalImageGuardInstalled = true;
  document.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.type !== 'file' || !target.files?.length) return;
    const hasImage = Array.from(target.files).some((file) => file.type.startsWith('image/'));
    if (hasImage) guardImageFileInput(target);
  }, true);
}

function baseName(name: string) {
  return (name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'image').slice(0, 60);
}

async function decodeImage(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
  }
  if (typeof document === 'undefined') throw new Error('এই browser-এ image optimization support নেই।');
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('ছবিটি পড়া যাচ্ছে না।'));
      element.src = url;
    });
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

function drawToCanvas(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  fit: FitMode,
) {
  const canvas = document.createElement('canvas');
  let outputWidth = targetWidth;
  let outputHeight = targetHeight;

  if (fit === 'contain') {
    const scale = Math.min(1, targetWidth / sourceWidth, targetHeight / sourceHeight);
    outputWidth = Math.max(1, Math.round(sourceWidth * scale));
    outputHeight = Math.max(1, Math.round(sourceHeight * scale));
    canvas.width = outputWidth;
    canvas.height = outputHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image canvas unavailable');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(source, 0, 0, sourceWidth, sourceHeight, 0, 0, outputWidth, outputHeight);
    return canvas;
  }

  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = targetWidth / targetHeight;
  let sx = 0;
  let sy = 0;
  let sw = sourceWidth;
  let sh = sourceHeight;
  if (sourceRatio > targetRatio) {
    sw = sourceHeight * targetRatio;
    sx = (sourceWidth - sw) / 2;
  } else if (sourceRatio < targetRatio) {
    sh = sourceWidth / targetRatio;
    sy = (sourceHeight - sh) / 2;
  }
  const scale = Math.min(1, targetWidth / sw, targetHeight / sh);
  outputWidth = Math.max(1, Math.round(sw * scale));
  outputHeight = Math.max(1, Math.round(sh * scale));
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Image canvas unavailable');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, sx, sy, sw, sh, 0, 0, outputWidth, outputHeight);
  return canvas;
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

async function encodeWebpWithinTarget(
  canvas: HTMLCanvasElement,
  targetBytes: number,
  softMaxBytes: number,
  startQuality: number,
  minQuality: number,
) {
  let best: Blob | null = null;
  let quality = startQuality;
  while (quality >= minQuality - 0.001) {
    const blob = await canvasToBlob(canvas, 'image/webp', quality);
    if (!blob || blob.type !== 'image/webp') break;
    best = blob;
    if (blob.size <= targetBytes) return blob;
    quality -= 0.05;
  }
  if (best && best.size <= softMaxBytes) return best;

  // Quality is protected first. If a highly detailed image is still too large,
  // reduce dimensions modestly rather than making faces/text visibly blocky.
  let working = canvas;
  for (let pass = 0; pass < 3; pass += 1) {
    const scale = 0.88;
    const next = document.createElement('canvas');
    next.width = Math.max(1, Math.round(working.width * scale));
    next.height = Math.max(1, Math.round(working.height * scale));
    const context = next.getContext('2d');
    if (!context) break;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(working, 0, 0, next.width, next.height);
    const blob = await canvasToBlob(next, 'image/webp', Math.max(minQuality, 0.78));
    if (blob) best = blob;
    working = next;
    if (blob && blob.size <= softMaxBytes) break;
  }
  return best;
}

async function optimizeWithConfig(file: File, config: PresetConfig | NonNullable<PresetConfig['thumbnail']>): Promise<OptimizedImageResult> {
  assertOptimizableImage(file);
  if (typeof document === 'undefined') {
    throw new Error('এই environment-এ image optimization support নেই।');
  }
  const decoded = await decodeImage(file);
  try {
    const startQuality = 'startQuality' in config ? config.startQuality : 0.88;
    const minQuality = 'minQuality' in config ? config.minQuality : 0.74;
    const canvas = drawToCanvas(decoded.source, decoded.width, decoded.height, config.width, config.height, config.fit);
    const blob = await encodeWebpWithinTarget(canvas, config.targetBytes, config.softMaxBytes, startQuality, minQuality);
    if (!blob) {
      throw new Error('এই browser-এ image optimization সম্পন্ন করা যায়নি। অন্য JPG/PNG/WebP ছবি চেষ্টা করুন।');
    }
    const optimized = new File([blob], `${baseName(file.name)}.webp`, { type: 'image/webp', lastModified: file.lastModified });
    return {
      file: optimized,
      originalBytes: file.size,
      optimizedBytes: optimized.size,
      width: canvas.width,
      height: canvas.height,
      changed: optimized.size < file.size || file.type !== 'image/webp',
    };
  } finally {
    decoded.close();
  }
}

async function fingerprint(file: Blob) {
  if (globalThis.crypto?.subtle) {
    const buffer = await file.arrayBuffer();
    const digest = await globalThis.crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(digest)).slice(0, 12).map((value) => value.toString(16).padStart(2, '0')).join('');
  }
  return `${file.size.toString(36)}-${Date.now().toString(36)}`;
}

export async function optimizeImageSet(file: File, preset: ImageOptimizationPreset): Promise<OptimizedImageSet> {
  const config = IMAGE_PRESETS[preset];
  const master = await optimizeWithConfig(file, config);
  const thumbnail = config.thumbnail ? await optimizeWithConfig(master.file, config.thumbnail) : null;
  return { master, thumbnail, fingerprint: await fingerprint(master.file) };
}

export function optimizedVariantPath(path: string, variant: 'master' | 'thumbnail') {
  if (variant === 'master' || !/-opt\.webp$/i.test(path)) return path;
  return path.replace(/-opt\.webp$/i, '-opt-thumb.webp');
}

export function imageOptimizationHint(preset: ImageOptimizationPreset) {
  const config = IMAGE_PRESETS[preset];
  return `${config.width}×${config.height} px`;
}
