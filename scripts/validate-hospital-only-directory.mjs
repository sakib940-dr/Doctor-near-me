import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const migration = read('supabase/79_hospital_only_public_directory_doctor_chamber_scope.sql');
const discovery = read('src/services/discovery.ts');
const home = read('src/pages/VisitorHomePage.tsx');
const providers = read('src/pages/PublicProvidersPage.tsx');
const chamber = read('src/pages/DoctorChamberDetailsPage.tsx');

for (const fragment of [
  "pr.provider_type='hospital'",
  "owner.role='hospital'",
  "pr.status='approved'",
  'pr.verified=true',
  "pr.provider_type='chamber'",
  "owner.role='doctor'",
  'public.is_doctor_owned_chamber_publicly_listable(pr.id,d.id)',
  "values(result_id,auth.uid(),'chamber'",
  "'approved',false",
  "where pr.provider_type='hospital' and owner.role='hospital'",
  'security definer set search_path=public',
]) assert(migration.includes(fragment), `Missing Step 79 SQL invariant: ${fragment}`);

assert(migration.includes("if auth.uid() is null then raise exception 'Authentication required'"), 'Doctor chamber mutation auth guard missing');
assert(migration.includes("owner_user_id=auth.uid() and provider_type='chamber'"), 'Doctor chamber ownership guard missing');
assert(migration.includes('public.is_provider_publicly_listable(pr.id)'), 'Verified Hospital link missing from Doctor details');
assert(discovery.includes("row.provider_type === 'hospital' && row.verified === true"), 'Hospital directory frontend defense missing');
assert(discovery.includes("raw.provider.provider_type !== 'hospital' || raw.provider.verified !== true"), 'Standalone Provider page frontend defense missing');
assert(home.includes("title={tr('হাসপাতাল', 'Hospitals')}"), 'Visitor homepage Hospital-only heading missing');
assert(providers.includes("<h1>{tr('হাসপাতাল', 'Hospitals')}</h1>"), 'Hospital directory heading missing');
assert(chamber.includes('এটি আপনার Doctor details page-এ দেখা যাবে'), 'Doctor chamber scope message missing');

console.log('Hospital-only directory and Doctor chamber scope validation PASS');
