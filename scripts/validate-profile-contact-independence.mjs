import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const migration = read('supabase/78_public_profile_contact_map_independence.sql');
const doctorProfile = read('src/pages/DoctorProfile.tsx');
const booking = read('src/pages/BookingPage.tsx');
const adminPage = read('src/pages/AdminBmdcCorrectionPage.tsx');

for (const rpc of [
  'is_doctor_publicly_listable', 'is_provider_publicly_listable',
  'get_doctor_public_profile', 'create_patient_appointment',
  'create_provider_reception_appointment', 'save_my_provider_profile',
  'admin_update_doctor_bmdc',
]) assert(migration.includes(`function public.${rpc}`), `Missing Step 78 function: ${rpc}`);

assert(migration.includes("public.is_provider_publicly_listable(pr.id)"), 'Doctor chamber public gate was not replaced');
assert(migration.includes("d.accepting_appointments"), 'Doctor appointment preference check missing');
assert(migration.includes("BMDC_CHANGE_REQUIRES_ADMIN"), 'Owner BMDC lock missing');
assert(migration.includes("role in ('admin','super_admin')"), 'Admin BMDC role guard missing');
assert(migration.includes('insert into public.admin_audit_logs'), 'BMDC audit log missing');
assert(migration.includes('security definer set search_path=public'), 'SECURITY DEFINER search_path invariant missing');
assert(doctorProfile.includes('Boolean(profile?.doctor.accepting_appointments)'), 'Doctor profile still gates appointment on verification');
assert(booking.includes('Boolean(profile?.doctor.accepting_appointments)'), 'Booking page still gates appointment on verification');
assert(adminPage.includes('adminUpdateDoctorBmdc'), 'Admin BMDC correction UI missing');

console.log('Profile contact/map/appointment independence validation PASS');
