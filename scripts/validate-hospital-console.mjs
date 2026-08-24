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
for (const route of ['/hospital-console','/hospital-console/appointments','/hospital-console/doctors','/hospital-console/analytics']) {
  if (!app.includes(`path="${route}"`)) fail(`missing route ${route}`);
}

const migration = read('supabase/81_hospital_console_independent_upgrade.sql');
for (const contract of ['contact_mode','individual_phone','individual_whatsapp','room_information','get_public_hospital_page_base','hospital_staff_members','hospital_doctor_photo_insert']) {
  if (!migration.includes(contract)) fail(`migration contract missing ${contract}`);
}
if (/\b(?:insert into|update|delete from|alter table)\s+public\.appointments\b/i.test(migration)) fail('migration mutates canonical appointments');

console.log(`Hospital Console validation passed (${featureFiles.length} feature files checked).`);
