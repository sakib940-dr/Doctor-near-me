import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const optimizer = read('src/lib/imageOptimization.ts');
const main = read('src/main.tsx');
const uploadService = read('src/services/imageUpload.ts');
const migration = read('supabase/77_global_5mb_image_compression_policy.sql');

const failures = [];
const ok = (condition, message) => { if (!condition) failures.push(message); };

ok(/MAX_SOURCE_IMAGE_BYTES\s*=\s*5\s*\*\s*MB/.test(optimizer), 'global source limit must be exactly 5 MB');
ok(optimizer.includes('MAX_OPTIMIZED_IMAGE_BYTES = 200 * 1024'), 'optimized image hard limit must be 200 KB');
ok(optimizer.includes("IMAGE_MAX_SIZE_ERROR = 'ছবির সর্বোচ্চ সাইজ 5 MB'"), 'exact Bengali size error missing');
ok(optimizer.includes('installGlobalImageUploadGuard'), 'global file-input guard missing');
ok(main.includes('installGlobalImageUploadGuard();'), 'global file-input guard not installed');
ok(optimizer.includes("throw new Error('এই browser-এ image optimization সম্পন্ন করা যায়নি"), 'optimizer may fall back to original file instead of failing safely');
ok(uploadService.includes('optimizeImageSet(input.file, input.preset)'), 'shared optimized upload path missing');
ok(migration.includes("where id in ('avatars', 'public-images')"), 'storage hard-limit must target public image buckets');
ok(migration.includes('file_size_limit = 5242880'), 'storage source hard-limit is not 5 MB');

const sourceFiles = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(tsx|ts)$/.test(entry.name)) sourceFiles.push(full);
  }
}
walk(path.join(root, 'src'));
let imageInputCount = 0;
for (const file of sourceFiles) {
  const text = fs.readFileSync(file, 'utf8');
  const regex = /<input\b[^>]*type=["']file["'][^>]*>/g;
  for (const match of text.matchAll(regex)) {
    const tag = match[0];
    if (!/accept=["'][^"']*image\//.test(tag)) continue;
    imageInputCount += 1;
    const after = text.slice((match.index ?? 0) + tag.length, (match.index ?? 0) + tag.length + 3000);
    ok(after.includes('প্রস্তাবিত'), `${path.relative(root, file)} image field missing recommended resolution hint`);
    ok(after.includes('সর্বোচ্চ 5 MB'), `${path.relative(root, file)} image field missing 5 MB hint`);
    ok(after.includes('100–200 KB WebP-তে auto-compress হবে'), `${path.relative(root, file)} image field missing auto-compress hint`);
  }
}
ok(imageInputCount >= 10, `unexpectedly low image input audit count: ${imageInputCount}`);

for (const file of sourceFiles) {
  const text = fs.readFileSync(file, 'utf8');
  ok(!text.includes('5–6 MB source image'), `${path.relative(root, file)} still advertises 5–6 MB image uploads`);
  ok(!text.includes('সর্বোচ্চ ১২ MB'), `${path.relative(root, file)} still contains old 12 MB image rule`);
}

if (failures.length) {
  console.error(`Global image policy validation FAILED (${failures.length})`);
  failures.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}
console.log(`Global image policy validation PASS (${imageInputCount} image-capable upload fields audited)`);
