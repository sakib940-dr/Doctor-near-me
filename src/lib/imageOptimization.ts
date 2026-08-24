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
export const MAX_SOURCE_IMAGE_BYTES = 5 * MB;
export const MAX_OPTIMIZED_IMAGE_BYTES = 200 * 1024;
export const IMAGE_MAX_SIZE_ERROR = 'ছবির সর্বোচ্চ সাইজ 5 MB';
export const IMAGE_UPLOAD_LIMIT_HINT = 'সর্বোচ্চ 5 MB • upload-এর আগে 100–200 KB WebP-তে auto-compress হবে';

export const IMAGE_PRESETS: Record<ImageOptimizationPreset, PresetConfig> = {
  profile: {
    width: 800, height: 800, fit: 'cover', targetBytes: 150_000, softMaxBytes: 195_000,
    minQuality: 0.74, startQuality: 0.90,
    thumbnail: { width: 320, height: 320, fit: 'cover', targetBytes: 55_000, softMaxBytes: 85_000 },
  },
  logo: {
    width: 800, height: 800, fit: 'contain', targetBytes: 130_000, softMaxBytes: 190_000,
    minQuality: 0.76, startQuality: 0.92,
    thumbnail: { width: 320, height: 320, fit: 'contain', targetBytes: 50_000, softMaxBytes: 80_000 },
  },
  slider: {
    width: 1600, height: 900, fit: 'cover', targetBytes: 180_000, softMaxBytes: 200_000,
    minQuality: 0.72, startQuality: 0.90,
    thumbnail: { width: 640, height: 360, fit: 'cover', targetBytes: 75_000, softMaxBytes: 110_000 },
  },
  banner: {
    width: 1600, height: 900, fit: 'cover', targetBytes: 180_000, softMaxBytes: 200_000,
    minQuality: 0.72, startQuality: 0.90,
    thumbnail: { width: 640, height: 360, fit: 'cover', targetBytes: 75_000, softMaxBytes: 110_000 },
  },
  category: {
    width: 600, height: 600, fit: 'cover', targetBytes: 110_000, softMaxBytes: 170_000,
    minQuality: 0.76, startQuality: 0.92,
    thumbnail: { width: 240, height: 240, fit: 'cover', targetBytes: 38_000, softMaxBytes: 65_000 },
  },
  gallery: {
    width: 1400, height: 1400, fit: 'contain', targetBytes: 175_000, softMaxBytes: 200_000,
    minQuality: 0.72, startQuality: 0.90,
    thumbnail: { width: 480, height: 480, fit: 'contain', targetBytes: 65_000, softMaxBytes: 95_000 },
  },
  service: {
    width: 1000, height: 1000, fit: 'contain', targetBytes: 140_000, softMaxBytes: 190_000,
    minQuality: 0.74, startQuality: 0.90,
    thumbnail: { width: 360, height: 360, fit: 'contain', targetBytes: 55_000, softMaxBytes: 85_000 },
  },
  verification: {
    width: 2200, height: 2200, fit: 'contain', targetBytes: 180_000, softMaxBytes: 200_000,
    minQuality: 0.76, startQuality: 0.92,
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
  const hasSupportedExtension = /\.(?:jpe?g|png|webp|avif)$/i.test(file.name);
  if (!supportedImageTypes.has(file.type) && !hasSupportedExtension) {
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
    input.setCustomValidity('');
    delete input.dataset.uploadError;
    return true;
  } catch (error) {
    input.value = '';
    const message = error instanceof Error ? error.message : IMAGE_MAX_SIZE_ERROR;
    input.setCustomValidity(message);
    input.dataset.uploadError = message;
    input.reportValidity();
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
    // Some mixed image/PDF fields validate locally so PDF selection remains supported.
    if (target.dataset.skipGlobalGuard === 'true') return;
    const hasImage = Array.from(target.files).some((file) => file.type.startsWith('image/'));
    if (hasImage) guardImageFileInput(target);
  }, true);
}

function baseName(name: string) {
  return (name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'image').slice(0, 60);
}

async function decodeImageWithElement(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof document === 'undefined') throw new Error('এই browser-এ image optimization support নেই।');
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('ছবিটি browser decode করতে পারছে না। JPG, PNG, WebP অথবা AVIF ছবি দিন।'));
      element.src = url;
    });
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('ছবিটির width/height পাওয়া যায়নি।');
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

async function isJpegFile(file: Blob) {
  const header = new Uint8Array(await file.slice(0, 3).arrayBuffer());
  return header.length === 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
}

async function decodeJpegWithJavaScript(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof document === 'undefined') throw new Error('এই browser-এ image optimization support নেই।');

  const { decode } = await import('jpeg-js');
  const decoded = decode(new Uint8Array(await file.arrayBuffer()), {
    useTArray: true,
    formatAsRGBA: true,
    tolerantDecoding: true,
    maxResolutionInMP: 40,
    maxMemoryUsageInMB: 256,
  });
  if (!decoded.width || !decoded.height || decoded.data.length !== decoded.width * decoded.height * 4) {
    throw new Error('JPEG ছবিটির pixel data সঠিক নয়।');
  }

  const canvas = document.createElement('canvas');
  canvas.width = decoded.width;
  canvas.height = decoded.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Image canvas unavailable');
  const imageData = context.createImageData(decoded.width, decoded.height);
  imageData.data.set(decoded.data);
  context.putImageData(imageData, 0, 0);

  return {
    source: canvas,
    width: decoded.width,
    height: decoded.height,
    close: () => {
      canvas.width = 1;
      canvas.height = 1;
    },
  };
}

async function decodeImage(file: Blob, memorySafeWidth?: number): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === 'function') {
    if (memorySafeWidth) {
      try {
        const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image', resizeWidth: memorySafeWidth, resizeQuality: 'high' });
        if (bitmap.width && bitmap.height) return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
        bitmap.close();
      } catch {
        // Older mobile browsers fall through to the established decode chain.
      }
    }
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      if (bitmap.width && bitmap.height) return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
      bitmap.close();
    } catch {
      // Android/WhatsApp JPEG metadata can fail the orientation-aware decoder.
      // Retry the browser's plain bitmap decoder before using an HTMLImageElement.
    }
    try {
      const bitmap = await createImageBitmap(file);
      if (bitmap.width && bitmap.height) return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
      bitmap.close();
    } catch {
      // Final compatibility fallback below.
    }
  }
  try {
    return await decodeImageWithElement(file);
  } catch (browserDecodeError) {
    // Some Android/WhatsApp JPEGs contain metadata or scan layouts rejected by
    // every native browser decoder. jpeg-js tolerantly decodes the pixels so the
    // shared canvas/WebP upload pipeline still works on those files.
    if (await isJpegFile(file)) {
      try {
        return await decodeJpegWithJavaScript(file);
      } catch {
        throw new Error('JPEG ছবিটি নষ্ট বা অসম্পূর্ণ। অন্য একটি ছবি নির্বাচন করুন।');
      }
    }
    throw browserDecodeError;
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
  const hardMaxBytes = Math.min(softMaxBytes, MAX_OPTIMIZED_IMAGE_BYTES);
  let working = canvas;
  let best: Blob | null = null;
  for (let pass = 0; pass < 10; pass += 1) {
    let quality = startQuality;
    while (quality >= minQuality - 0.001) {
      const blob = await canvasToBlob(working, 'image/webp', quality);
      if (!blob || blob.type !== 'image/webp') break;
      if (!best || blob.size < best.size) best = blob;
      if (blob.size <= targetBytes) return blob;
      quality -= 0.05;
    }
    if (best && best.size <= hardMaxBytes) return best;

    // Detailed phone-camera images are progressively resized until the hard
    // 200 KB ceiling is met. The original file is never uploaded as fallback.
    const scale = 0.84;
    const next = document.createElement('canvas');
    next.width = Math.max(1, Math.round(working.width * scale));
    next.height = Math.max(1, Math.round(working.height * scale));
    const context = next.getContext('2d');
    if (!context) break;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(working, 0, 0, next.width, next.height);
    working = next;
  }
  return best && best.size <= hardMaxBytes ? best : null;
}

async function optimizeWithConfig(file: File, config: PresetConfig | NonNullable<PresetConfig['thumbnail']>, memorySafeDecode = false): Promise<OptimizedImageResult> {
  assertOptimizableImage(file);
  if (typeof document === 'undefined') {
    throw new Error('এই environment-এ image optimization support নেই।');
  }
  const decoded = await decodeImage(file, memorySafeDecode ? Math.max(config.width, config.height) : undefined);
  try {
    const startQuality = 'startQuality' in config ? config.startQuality : 0.88;
    const minQuality = 'minQuality' in config ? config.minQuality : 0.74;
    const canvas = drawToCanvas(decoded.source, decoded.width, decoded.height, config.width, config.height, config.fit);
    const blob = await encodeWebpWithinTarget(canvas, config.targetBytes, config.softMaxBytes, startQuality, minQuality);
    if (!blob) {
      throw new Error('এই browser-এ image optimization সম্পন্ন করা যায়নি। অন্য JPG/PNG/WebP ছবি চেষ্টা করুন।');
    }
    const optimized = new File([blob], `${baseName(file.name)}.webp`, { type: 'image/webp', lastModified: file.lastModified });
    if (optimized.size > MAX_OPTIMIZED_IMAGE_BYTES) {
      throw new Error('ছবিটি 200 KB-এর মধ্যে compress করা যায়নি। অন্য ছবি চেষ্টা করুন।');
    }
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

export async function optimizeImageSet(file: File, preset: ImageOptimizationPreset, options?: { memorySafeDecode?: boolean }): Promise<OptimizedImageSet> {
  const config = IMAGE_PRESETS[preset];
  const master = await optimizeWithConfig(file, config, options?.memorySafeDecode);
  const thumbnail = config.thumbnail ? await optimizeWithConfig(master.file, config.thumbnail, options?.memorySafeDecode) : null;
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
