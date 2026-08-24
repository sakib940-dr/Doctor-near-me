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
for (const route of ['/hospital-doctors/:cardId','/hospital-console','/hospital-console/appointments','/hospital-console/doctors','/hospital-console/analytics','/hospital-console/profile-preview','/hospital-console/onboarding','/hospital-console/admin-support','/hospital-console/security']) {
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
const photoReliability = read('supabase/83_hospital_doctor_photo_upload_reliability.sql');
for (const contract of ['image/webp','hospital_doctor_photo_insert','hospital_doctor_photo_delete',"(storage.foldername(name))[3],'')='hospital-doctors'"]) {
  if (!photoReliability.includes(contract)) fail(`Step 83 contract missing ${contract}`);
}
if (/\b(?:alter table|insert into|update|delete from)\s+public\.(?:doctors|appointments|patients)\b/i.test(photoReliability)) fail('Step 83 mutates a protected non-Hospital table');
const publicDoctorProfile = read('supabase/84_hospital_doctor_public_profile_discovery.sql');
for (const contract of ['get_public_hospital_doctor_profile','search_public_hospital_doctors','public_provider_directory','provider_managed_doctor_cards']) {
  if (!publicDoctorProfile.includes(contract)) fail(`Step 84 contract missing ${contract}`);
}
if (/\b(?:alter table|insert into|update|delete from)\s+public\.(?:doctors|appointments|patients)\b/i.test(publicDoctorProfile)) fail('Step 84 mutates a protected non-Hospital table');

const shell = read('src/features/hospital/HospitalShell.tsx');
const primaryBlock = shell.match(/const primary = \[([\s\S]*?)\];/)?.[1] ?? '';
if ((primaryBlock.match(/path:/g) ?? []).length !== 5) fail('Hospital bottom navigation must contain exactly five items');
if (shell.includes('Doctor card management')) fail('Doctors route is duplicated in the hamburger menu');
if (shell.includes("path: '/hospital-console/reception'")) fail('Reception Settings remains duplicated in the hamburger menu');
if (shell.includes("path: '/hospital-console/information'")) fail('Hospital Information remains duplicated in the hamburger menu');
if (shell.includes("path: '/hospital-console/gallery'")) fail('Gallery Management remains duplicated in the hamburger menu');
if (shell.includes("path: '/hospital-console/support'")) fail('Help / Support remains duplicated in the hamburger menu');
if (shell.includes("path: '/hospital-console/settings'")) fail('Account Settings remains duplicated in the hamburger menu');
if (shell.includes("path: '/hospital-console/appointment-settings'")) fail('Appointment Settings remains in the hamburger menu');
if (shell.includes("path: '/hospital-console/staff'")) fail('Staff remains in the hamburger menu');
for (const duplicate of ['Premium Membership','Ambulance Links','Verification']) {
  if (shell.includes(`label: bi('${duplicate}`)) fail(`obsolete duplicate menu item remains: ${duplicate}`);
}
const hospitalContent = read('src/features/hospital/pages/HospitalContentPages.tsx');
const providerProfile = read('src/pages/ProviderProfilePage.tsx');
if (!hospitalContent.includes('<ProviderProfilePage hideWebsiteContent hidePublicProfileLink/>')) fail('Hospital Information still renders duplicate public-profile actions');
if (!hospitalContent.includes('HospitalPublicProfileManagementPage(){return <HospitalInformationPage/>}')) fail('Hospital Profile does not open the Hospital Information content');
if (!providerProfile.includes('!hideWebsiteContent && !loading && profile.id')) fail('Hospital-only website shortcut opt-out is missing');
if (!providerProfile.includes('profile.id && !hidePublicProfileLink')) fail('Hospital-only public-profile link opt-out is missing');
const hospitalUtility = read('src/features/hospital/pages/HospitalUtilityPages.tsx');
if (!hospitalUtility.includes('<Navigate to={`/hospital/${provider.id}`} replace />')) fail('Bottom public-profile navigation does not open the live profile directly');
const hospitalStyles = read('src/features/hospital/hospital.css');
if (!hospitalStyles.includes('.hospital-console-shell .gallery-upload{width:100%;max-width:100%')) fail('Hospital profile gallery upload can overflow the mobile viewport');
const hospitalGallery = read('src/features/hospital/pages/HospitalGalleryPage.tsx');
if (!hospitalGallery.includes('const current = await providerSlider.getAll(provider.id)')) fail('Hospital top gallery upload does not refresh its four-slot count');
if (!hospitalGallery.includes('<input hidden multiple type="file"')) fail('Hospital top gallery does not support selecting the remaining images together');
if (!hospitalGallery.includes("'slider',{memorySafeDecode:true}")) fail('Hospital top gallery does not use the mobile-safe decode path');
const hospitalDoctorService = read('src/features/hospital/services/hospitalDoctors.ts');
if (!hospitalDoctorService.includes('folder: `${providerId}/hospital-doctors`')) fail('Hospital doctor photo is not stored under its Hospital-owned path');
if (!hospitalDoctorService.includes('memorySafeDecode: true')) fail('Hospital doctor photo does not use the mobile-safe decode path');
if (!hospitalDoctorService.includes('get_public_hospital_doctor_profile') || !hospitalDoctorService.includes('search_public_hospital_doctors')) fail('Hospital Doctor public profile/discovery service is missing');
const hospitalDoctorCard = read('src/features/hospital/components/HospitalDoctorCard.tsx');
if (!hospitalDoctorCard.includes('to={`/hospital-doctors/${doctor.id}`}')) fail('Hospital Doctor card does not open the public details route');
if (hospitalDoctorCard.includes('HospitalDoctorProfileModal')) fail('Hospital Doctor card still opens the legacy modal');
const hospitalDoctorPublicPage = read('src/features/hospital/pages/HospitalDoctorPublicPage.tsx');
for (const contract of ['createProviderReceptionAppointment','StructuredReviewSection','ProfileReportButton','hospital.latitude','hospital.longitude']) {
  if (!hospitalDoctorPublicPage.includes(contract)) fail(`Hospital Doctor public details missing ${contract}`);
}
const doctorDirectory = read('src/pages/DoctorDirectory.tsx');
if (!doctorDirectory.includes('searchPublicHospitalDoctors') || !doctorDirectory.includes('HospitalDoctorSearchCard')) fail('Visitor Doctor search does not include Hospital-managed doctors');
const publicProviderPage = read('src/pages/PublicProviderProfilePage.tsx');
if (!publicProviderPage.includes("provider?.provider_type!=='hospital'||sliderImages.length<2")) fail('Hospital public gallery autoplay is missing');
if (!publicProviderPage.includes("hospital-slider-v2")) fail('Hospital public gallery is not isolated as a full-width slider');
if (!publicProviderPage.includes('[doctorLimit,setDoctorLimit]=useState(20)')) fail('Hospital public Doctor list does not start with 20 cards');
if (!publicProviderPage.includes('setDoctorLimit(limit=>limit+20)')) fail('Hospital public Doctor list does not load 20 more cards');
if (!hospitalContent.includes('plainServices={tab===\'services\'}')) fail('Hospital Services still exposes image/icon controls');
if (!providerProfile.includes('hidePublicProfileLink = false')) fail('Hospital profile isolation props are missing');
if (!providerProfile.includes('Delete logo') || !providerProfile.includes('Delete banner')) fail('Hospital/Chamber logo and banner delete controls are missing');
if (!providerProfile.includes('<CombinedCoordinateInput')) fail('Hospital/Chamber location is not a single combined coordinate field');
if (!hospitalContent.includes('costMode="treatment"')) fail('Treatment Cost page is not limited to treatment costs');
if (!hospitalContent.includes('costMode="investigation"')) fail('Investigation Cost page is not limited to investigation costs');
const websiteContentTabs = read('src/components/ProviderWebsiteContentTabs.tsx');
if (!websiteContentTabs.includes("costMode='both'")) fail('Shared cost editor default behavior is not preserved');

console.log(`Hospital Console validation passed (${featureFiles.length} feature files checked).`);
