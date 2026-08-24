import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const walk = (path) => readdirSync(new URL(path, root)).flatMap((name) => {
  const relative = `${path}/${name}`;
  return statSync(new URL(relative, root)).isDirectory() ? walk(relative) : [relative];
});
const fail = (message) => { throw new Error(`Hospital Console validation failed: ${message}`); };

const featureFiles = walk('src/features/hospital').filter((path) => /\.(ts|tsx)$/.test(path));
for (const path of featureFiles) {
  const source = read(path);
  if (/from ['"][^'"]*(?:pages\/Doctor|services\/doctor|components\/Doctor)/i.test(source)) fail(`${path} imports Doctor Module code`);
  if (/from ['"][^'"]*services\/appointments['"]/i.test(source)) fail(`${path} imports the canonical appointment service`);
}

for (const path of ['src/pages/PublicProviderProfilePage.tsx','src/pages/ProviderDoctorsPublicPage.tsx','src/pages/ProviderWebsitePage.tsx']) {
  const source = read(path);
  for (const forbidden of ['ProviderManagedDoctorCard','DoctorResultCard','getPublicProviderPageBase','doctorPublicPath']) {
    if (source.includes(forbidden)) fail(`${path} still depends on ${forbidden}`);
  }
}

const app = read('src/App.tsx');
for (const route of ['/hospital-console','/hospital-console/appointments','/hospital-console/doctors','/hospital-console/analytics','/hospital-console/profile-preview','/hospital-console/onboarding','/hospital-console/admin-support','/hospital-console/security']) {
  if (!app.includes(`path="${route}"`)) fail(`missing route ${route}`);
}

const migration = read('supabase/81_hospital_console_independent_upgrade.sql');
for (const contract of ['contact_mode','individual_phone','individual_whatsapp','room_information','get_public_hospital_page_base','hospital_staff_members','hospital_doctor_photo_insert']) {
  if (!migration.includes(contract)) fail(`migration contract missing ${contract}`);
}
if (/\b(?:insert into|update|delete from|alter table)\s+public\.appointments\b/i.test(migration)) fail('migration mutates canonical appointments');

const completion = read('supabase/82_hospital_premium_completion.sql');
for (const contract of ['hospital_gallery_media_insert','enforce_hospital_slider_limit','hospital_support_threads','hospital_support_messages','get_my_hospital_support_threads','create_my_hospital_support_conversation','admin_send_hospital_support_message']) {
  if (!completion.includes(contract)) fail(`Step 82 contract missing ${contract}`);
}
if (/\b(?:alter table|insert into|update|delete from)\s+public\.(?:doctors|appointments|doctor_support_threads|doctor_support_messages)\b/i.test(completion)) fail('Step 82 mutates a protected non-Hospital table');
if (!completion.includes("revoke all on table public.hospital_support_threads,public.hospital_support_messages from public,anon,authenticated")) fail('Hospital support direct table access is not blocked');

const shell = read('src/features/hospital/HospitalShell.tsx');
const primaryBlock = shell.match(/const primary = \[([\s\S]*?)\];/)?.[1] ?? '';
if ((primaryBlock.match(/path:/g) ?? []).length !== 5) fail('Hospital bottom navigation must contain exactly five items');
for (const duplicate of ['Premium Membership','Ambulance Links','Verification']) {
  if (shell.includes(`label: bi('${duplicate}`)) fail(`obsolete duplicate menu item remains: ${duplicate}`);
}

console.log(`Hospital Console validation passed (${featureFiles.length} feature files checked).`);
