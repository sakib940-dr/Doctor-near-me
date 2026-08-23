import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const optimizer = read('src/lib/imageOptimization.ts');
const uploader = read('src/services/imageUpload.ts');
const storage = read('src/lib/storage.ts');
const doctor = read('src/services/doctorDashboard.ts');
const provider = read('src/services/providerDashboard.ts');
const doctorSlider = read('src/services/doctorPublicContent.ts');
const providerWeb = read('src/services/providerWebsiteContent.ts');
const admin = read('src/services/adminCms.ts');
const css = read('src/styles.css');

assert(optimizer.includes("MAX_SOURCE_IMAGE_BYTES = 5 * MB"), 'Global 5 MB source image limit missing');
assert(optimizer.includes("MAX_OPTIMIZED_IMAGE_BYTES = 200 * 1024"), 'Optimized 200 KB hard limit missing');
assert(optimizer.includes("ছবির সর্বোচ্চ সাইজ 5 MB"), 'Exact 5 MB Bengali error missing');
for (const preset of ['profile','logo','slider','banner','category','gallery','service','verification']) {
  assert(optimizer.includes(`${preset}: {`), `Missing ${preset} image preset`);
}
assert(optimizer.includes("canvasToBlob(working, 'image/webp'"), 'WebP encoder missing');
assert(optimizer.includes('decodeImageWithElement'), 'HTML image decoder fallback missing');
assert(optimizer.includes('const bitmap = await createImageBitmap(file);'), 'Plain ImageBitmap retry missing');
assert(optimizer.includes("import('jpeg-js')"), 'Pure-JavaScript JPEG decoder fallback missing');
assert(optimizer.includes('tolerantDecoding: true'), 'Tolerant JPEG decoding missing');
assert(optimizer.includes('targetBytes: 150_000'), 'Profile target size missing');
assert(optimizer.includes('targetBytes: 180_000'), 'Slider/banner target size missing');
assert(optimizer.includes('imageSmoothingQuality = \'high\''), 'High-quality resize missing');
assert(optimizer.includes("fit: 'cover'"), 'Safe crop mode missing');
assert(optimizer.includes("fit: 'contain'"), 'Aspect-preserving contain mode missing');
assert(uploader.includes('fingerprint'), 'Content fingerprint dedupe missing');
assert(uploader.includes('already exists'), 'Duplicate storage collision handling missing');
assert(uploader.includes('`${prefix}-thumb.webp`'), 'Thumbnail variant upload missing');
assert(storage.includes("variant: 'master' | 'thumbnail'"), 'Thumbnail URL resolver missing');
for (const source of [doctor, provider, doctorSlider, providerWeb, admin]) {
  assert(source.includes('uploadOptimizedImage'), 'A public image upload flow bypasses shared optimizer');
}
assert(css.includes('overflow-x: clip'), 'Whole-page horizontal overflow guard missing');
assert(css.includes('content-visibility:auto'), 'Off-screen card paint optimization missing');

const forbiddenSeoFiles = ['src/lib/seo.ts','src/components/SeoHead.tsx','api/seo.js'];
for (const file of forbiddenSeoFiles) assert(!fs.existsSync(path.join(root,file)), `SEO file unexpectedly present: ${file}`);

console.log('Image/performance validation PASS');
