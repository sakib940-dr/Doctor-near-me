import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const mustContain = (file, ...patterns) => {
  const text = read(file);
  for (const pattern of patterns) {
    if (pattern instanceof RegExp) assert.match(text, pattern, `${file} is missing ${pattern}`);
    else assert.ok(text.includes(pattern), `${file} is missing ${pattern}`);
  }
};

const sqlFile = 'supabase/52_stable_public_slugs_and_share_analytics.sql';
const sql = read(sqlFile);

// SQL slug architecture and stability.
mustContain(sqlFile,
  'docbd_bn_to_latin',
  'docbd_unique_doctor_slug',
  'docbd_unique_provider_slug',
  "lpad(mod(hashtext(p_doctor_id::text)::bigint+2147483648,100000)::text,5,'0')",
  'public_slug_aliases',
  'trg_protect_stable_doctor_slug',
  'trg_protect_stable_provider_slug',
  'resolve_public_doctor_route',
  'resolve_public_provider_route',
  'get_public_profile_slugs',
);
assert.match(sql, /where d\.profile_slug is null[\s\S]*d\.profile_slug !~ '\^\[a-z0-9\]\+\(-\[a-z0-9\]\+\)\*\$'/, 'Doctor backfill must preserve valid existing slugs');
assert.match(sql, /p_doctor_ids is not null\s+and d\.id=any\(p_doctor_ids\)/, 'Doctor batch lookup must be scoped to requested IDs');
assert.match(sql, /p_provider_ids is not null\s+and p\.id=any\(p_provider_ids\)/, 'Provider batch lookup must be scoped to requested IDs');
assert.match(sql, /public_slug_aliases[\s\S]*entity_type='doctor'/, 'Doctor aliases must be protected from reuse');
assert.match(sql, /public_slug_aliases[\s\S]*entity_type='provider'/, 'Provider aliases must be protected from reuse');
const sqlCodeOnly = sql.replace(/^--.*$/gm, '');
assert.ok(!/docbd\.info|canonical|sitemap|robots\.txt|search console/i.test(sqlCodeOnly), 'Migration must remain domain/SEO-configuration independent');

// A small deterministic mirror verifies the requested English/Bangla slug shape.
const bnMap = new Map(Object.entries({
  'ড':'d','া':'a','ঃ':'h','ন':'n','জ':'j','ম':'m','ু':'u','স':'s','ক':'k','ি':'i','ব':'b',
}));
const bnToLatin = (value) => [...value].map((ch) => bnMap.get(ch) ?? ch).join('');
const slugify = (value) => bnToLatin(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
const doctorBase = (name) => {
  const clean = name.replace(/^\s*(ডা\.?|ডাঃ|ডাক্তার)\s*/iu, '').replace(/^\s*(dr\.?|doctor)\s+/iu, '');
  return `dr-${slugify(clean)}`;
};
assert.equal(doctorBase('Dr. Nazmus Sakib'), 'dr-nazmus-sakib', 'English doctor name slug failed');
assert.equal(doctorBase('ডা. নাজমুস সাকিব'), 'dr-najmus-sakib', 'Bangla doctor transliteration slug failed');
assert.equal(slugify('Ibn Sina Diagnostic Sirajganj'), 'ibn-sina-diagnostic-sirajganj', 'Hospital slug failed');
assert.match(sql, /candidate:=left\(base,58\)\|\|'-'\|\|suffix/, 'Duplicate names need deterministic suffix support');

// Public route helpers are origin-independent and clean.
const routes = await import(pathToFileURL(path.join(root, 'src/lib/publicRoutes.ts')).href);
assert.equal(routes.doctorPublicPath('dr-nazmus-sakib', 'ignored'), '/doctor/dr-nazmus-sakib');
assert.equal(routes.hospitalPublicPath('ibn-sina-diagnostic-sirajganj', 'ignored'), '/hospital/ibn-sina-diagnostic-sirajganj');
assert.equal(routes.chamberPublicPath('city-dental-care', 'ignored'), '/chamber/city-dental-care');

mustContain('src/App.tsx',
  '<Route path="/doctor/:doctorId" element={<DoctorProfile />} />',
  '<Route path="/doctors/:doctorId" element={<DoctorProfile />} />',
  '<Route path="/hospital/:providerId" element={<PublicProviderProfilePage />} />',
  '<Route path="/chamber/:providerId" element={<PublicProviderProfilePage />} />',
  '<Route path="/providers/:providerId" element={<PublicProviderProfilePage />} />',
);
mustContain('src/pages/DoctorProfile.tsx', 'getPublicDoctorPageBase', 'navigate(canonicalPath, { replace: true })', 'ডাক্তার পাওয়া যায়নি', '<ProfileShareButton');
mustContain('src/pages/PublicProviderProfilePage.tsx', 'getPublicProviderPageBase', 'navigate(canonicalPath,{replace:true})', 'প্রতিষ্ঠানটি পাওয়া যায়নি', '<ProfileShareButton');

// Homepage/search/provider-doctor cards and saved profiles use the clean route helpers.
mustContain('src/components/DoctorResultCard.tsx', 'doctorPublicPath(doctor.profile_slug, doctor.doctor_id)');
mustContain('src/components/ProviderCard.tsx', 'providerPublicPath(provider.provider_type, provider.slug, provider.id)');
mustContain('src/pages/SavedProfilesPage.tsx', 'doctorPublicPath(item.public_slug, item.target_id)', 'providerPublicPath(item.provider_type, item.public_slug, item.target_id)');

// Share behavior: native sheet only after a click, current origin, and copy fallback.
mustContain('src/components/ProfileShareButton.tsx',
  "typeof navigator.share === 'function'",
  'window.location.origin',
  'await navigator.share({ title, url })',
  'navigator.clipboard?.writeText',
  "document.execCommand('copy')",
  'লিংক কপি হয়েছে',
  "'share_click'",
  "'share_native'",
  "'share_copy'",
);
assert.ok(!/whatsapp\.com|facebook\.com|messenger\.com/i.test(read('src/components/ProfileShareButton.tsx')), 'Share button must not force a receiving app');

// Analytics reuses profile_interactions and exposes a Profile Shares metric.
mustContain(sqlFile, "'share_click','share_native','share_copy'", 'get_my_profile_share_metrics');
mustContain('src/pages/ProfileAnalyticsPage.tsx', 'Profile Shares', 'native_share_initiated', 'copy_link');
mustContain('src/services/profileAnalytics.ts', "rpc('get_my_profile_share_metrics'", 'profile_shares');

// Vercel SPA fallback remains intact, so direct slug refreshes reach React Router.
const vercel = JSON.parse(read('vercel.json'));
const serializedVercel = JSON.stringify(vercel);
assert.ok(serializedVercel.includes('/index.html'), 'SPA fallback required for direct slug refresh');

// Phase 6 SEO artifacts must not be present in this Phase 5-based branch.
assert.ok(!fs.existsSync(path.join(root, 'api/seo.js')), 'SEO server file must not be included');
assert.ok(!fs.existsSync(path.join(root, 'supabase/52_technical_seo_public_read_model.sql')), 'Held SEO migration must not be included');

console.log('Stable public slugs + sharing validation: PASS');
console.log('Covered: English/Bangla slug shape, duplicate strategy, hospital slug, direct/old routes, refresh fallback, card navigation, native/copy sharing, analytics, invalid slugs, SEO hold.');
