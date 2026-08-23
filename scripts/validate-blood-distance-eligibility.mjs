import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const expect = (condition, message) => { if (!condition) throw new Error(message); };

const sql = read('supabase/71_blood_distance_compatibility_eligibility.sql');
const fulfillmentSql = read('supabase/72_blood_fulfillment_privacy_antispam.sql');
const service = read('src/services/bloodBank.ts');
const page = read('src/pages/BloodBankPage.tsx');
const types = read('src/types.ts');

for (const token of [
  'public.location_distance_km(',
  'p_latitude double precision default null',
  'p_longitude double precision default null',
  'distance_km double precision',
  'p_include_compatible boolean default false',
  'public.is_blood_donor_compatible',
  "b.last_donation_date<=current_date-120",
  'get_my_patient_profile()',
  'left join public.user_current_locations',
]) expect(sql.includes(token), `STEP 71 SQL missing ${token}`);

expect(!/create\s+extension[^;]*postgis/i.test(sql), 'STEP 71 must not require PostGIS');
expect((sql.match(/DONOR_NOT_ELIGIBLE_YET/g) ?? []).length >= 2, 'direct request and response eligibility guards are required');
expect(sql.includes("revoke all on function public.respond_to_blood_request(uuid,text) from public,anon"), 'response RPC ACL hardening missing');
expect(sql.includes("where id=auth.uid() and role='patient' and account_status='active'"), 'patient mutation role guard missing');

for (const token of ['p_latitude', 'p_longitude', 'p_include_compatible']) {
  expect(service.includes(token), `blood service missing ${token}`);
}
expect(service.includes('p_include_compatible: input.includeCompatibleDonors ?? false'), 'broadcast compatible default-off wiring missing');
expect(page.includes('compatible group-ও দেখান'), 'compatible donor toggle missing');
expect(page.includes('profile?.latitude ?? null') && page.includes('profile?.longitude ?? null'), 'patient search coordinates missing');
expect(page.includes('km দূরে'), 'distance display missing');
expect(page.includes('DONOR_NOT_ELIGIBLE_YET'), 'eligibility error UX missing');
expect(types.includes('distance_km: number | null'), 'donor distance type missing');

for (const token of [
  'create table if not exists public.blood_request_fulfillments',
  'create or replace function public.confirm_blood_donation',
  'request_row.requester_id<>auth.uid()',
  'next_status:=case',
  "when fulfilled_units>=request_row.units_needed then 'fulfilled'",
  'units_fulfilled integer',
  'revoke all on function public.get_recent_active_blood_requests(integer) from public,anon',
  'grant execute on function public.get_recent_active_blood_requests(integer) to authenticated,service_role',
  "n.created_at>=now()-interval '24 hours'",
  "n.created_at>=now()-interval '1 hour'",
  'BLOOD_DONOR_COOLDOWN_ACTIVE',
  'BLOOD_DIRECT_REQUEST_RATE_LIMIT',
  'pg_advisory_xact_lock',
]) expect(fulfillmentSql.includes(token), `STEP 72 fulfillment/privacy/anti-spam missing ${token}`);
expect(service.includes("rpc('confirm_blood_donation'"), 'fulfillment service RPC wiring missing');
expect(page.includes('Mark as donated') && page.includes('ইউনিট নিশ্চিত হয়েছে'), 'fulfillment progress UI missing');
expect(types.includes('units_fulfilled: number'), 'request fulfillment type missing');

console.log('Blood distance, compatibility, eligibility, fulfillment, privacy, and anti-spam validation passed.');
