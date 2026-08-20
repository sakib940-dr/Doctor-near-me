import assert from 'node:assert/strict';

// Deterministic model tests for the production invariants enforced by SQL 61 + client lifecycle.
const GRACE_HOURS = 24;
const now = Date.now();
const hoursAgo = (h) => new Date(now - h * 3600_000).toISOString();
const refs = new Map();
const objects = new Map();
const key = (bucket, name) => `${bucket}:${name}`;
const add = (bucket, name, ageHours, referenceCount = 0) => {
  objects.set(key(bucket, name), { bucket, name, created_at: hoursAgo(ageHours) });
  refs.set(key(bucket, name), referenceCount);
};
const referenced = (bucket, name) => (refs.get(key(bucket, name)) ?? 0) > 0;
const eligible = (bucket, name) => {
  const object = objects.get(key(bucket, name));
  if (!object || referenced(bucket, name)) return false;
  return (now - new Date(object.created_at).getTime()) / 3600_000 >= GRACE_HOURS;
};
const removeIfUnreferenced = (bucket, name) => {
  if (referenced(bucket, name)) return false;
  return objects.delete(key(bucket, name));
};

let passed = 0;
function test(name, fn) { fn(); passed += 1; console.log(`PASS ${passed} ${name}`); }

test('successful replacement deletes old after DB reference switches', () => {
  add('avatars', 'u/old-opt.webp', 72, 1); add('avatars', 'u/new-opt.webp', 0, 0);
  // Upload succeeded, DB transaction now references new path.
  refs.set(key('avatars', 'u/new-opt.webp'), 1); refs.set(key('avatars', 'u/old-opt.webp'), 0);
  assert.equal(removeIfUnreferenced('avatars', 'u/old-opt.webp'), true);
  assert.equal(objects.has(key('avatars', 'u/new-opt.webp')), true);
});

test('failed replacement preserves old valid image and rolls back new upload', () => {
  add('public-images', 'u/logo-old-opt.webp', 72, 1); add('public-images', 'u/logo-new-opt.webp', 0, 0);
  // DB save failed: old reference never changed.
  assert.equal(removeIfUnreferenced('public-images', 'u/logo-old-opt.webp'), false);
  assert.equal(removeIfUnreferenced('public-images', 'u/logo-new-opt.webp'), true);
  assert.equal(objects.has(key('public-images', 'u/logo-old-opt.webp')), true);
});

test('shared image is not deleted while another valid reference remains', () => {
  add('public-images', 'u/shared-opt.webp', 72, 2);
  refs.set(key('public-images', 'u/shared-opt.webp'), 1); // one record removed/replaced
  assert.equal(removeIfUnreferenced('public-images', 'u/shared-opt.webp'), false);
});

test('explicit DB delete makes unique media removable', () => {
  add('public-images', 'u/slide-opt.webp', 72, 1);
  refs.set(key('public-images', 'u/slide-opt.webp'), 0); // row deleted first
  assert.equal(removeIfUnreferenced('public-images', 'u/slide-opt.webp'), true);
});

test('recent orphan stays protected by grace period', () => {
  add('public-images', 'u/in-progress-opt.webp', 2, 0);
  assert.equal(eligible('public-images', 'u/in-progress-opt.webp'), false);
});

test('old genuine orphan becomes cleanup eligible', () => {
  add('public-images', 'u/orphan-opt.webp', 48, 0);
  assert.equal(eligible('public-images', 'u/orphan-opt.webp'), true);
});

test('referenced old object never becomes orphan just because it is old', () => {
  add('verification-documents', 'entities/a/doc.pdf', 240, 1);
  assert.equal(eligible('verification-documents', 'entities/a/doc.pdf'), false);
});

test('quota warning thresholds classify only configured quota', () => {
  const warning = (used, quota) => quota == null ? 'unknown' : used / quota >= .95 ? 'critical' : used / quota >= .85 ? 'warning' : used / quota >= .70 ? 'notice' : 'normal';
  assert.equal(warning(700, 1000), 'notice');
  assert.equal(warning(850, 1000), 'warning');
  assert.equal(warning(950, 1000), 'critical');
  assert.equal(warning(950, null), 'unknown');
});

console.log(`STORAGE LIFECYCLE MODEL TESTS PASSED ${passed}/${passed}`);
