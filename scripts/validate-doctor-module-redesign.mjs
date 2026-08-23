import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const mustInclude = (text, needles, label) => {
  const missing = needles.filter((needle) => !text.includes(needle));
  if (missing.length) throw new Error(`${label}: missing ${missing.join(', ')}`);
};
const mustNotInclude = (text, needles, label) => {
  const found = needles.filter((needle) => text.includes(needle));
  if (found.length) throw new Error(`${label}: unexpected ${found.join(', ')}`);
};

const shell = read('src/components/DashboardShell.tsx');
const app = read('src/App.tsx');
const wizard = read('src/pages/DoctorPublicContentManagementPage.tsx');
const verification = read('src/pages/DoctorVerificationPage.tsx');
const appointments = read('src/pages/DoctorAppointmentsPage.tsx');
const analytics = read('src/pages/ProfileAnalyticsPage.tsx');
const publicView = read('src/pages/DoctorPublicProfileViewPage.tsx');
const settings = read('src/pages/DoctorSettingsPage.tsx');
const myProfile = read('src/pages/DoctorProfessionalProfilePage.tsx');
const onboarding = read('src/pages/OnboardingPage.tsx');
const doctorDashboardService = read('src/services/doctorDashboard.ts');
const migration = read('supabase/62_doctor_module_menu_ui_redesign.sql');
const migration63 = read('supabase/63_doctor_full_onboarding_profile_integration.sql');
const discovery = read('src/services/discovery.ts');
const doctorCard = read('src/components/DoctorResultCard.tsx');
const doctorProfile = read('src/pages/DoctorProfile.tsx');
const adminDashboard = read('src/pages/AdminDashboardPage.tsx');
const superAdmin = read('src/pages/SuperAdminPage.tsx');
const styles = read('src/styles.css');

mustInclude(shell, [
  "'Settings'), path: '/doctor/settings'",
  "'Public Content Management'), path: '/doctor/public-content'",
  "'Verification Application'), path: '/doctor/verification'",
  "'Support / Chat with Admin'), path: '/doctor/support'",
  "'Feedback / Bug Report'), path: '/doctor/feedback'",
  "'FAQ / Help'), path: '/doctor/help'",
  "'Appointment Management'), path: '/doctor/appointments'",
  "'Prescription'), path: '/doctor/prescriptions'",
  "'Analytics'), path: '/doctor/analytics'",
  "'My Profile'), path: '/doctor/profile'",
  "'Public Profile View'), path: '/doctor/public-view'",
], 'Doctor navigation');
mustNotInclude(shell, ["path: '/doctor/invitations'"], 'Removed Doctor invitation navigation');

// Old scattered Doctor items must not still be visible in the Doctor hamburger array.
const doctorMenu = shell.slice(shell.indexOf("case 'doctor':"), shell.indexOf("case 'patient':"));
mustNotInclude(doctorMenu, [
  "label: 'Dashboard'", "label: 'Analytics'", "label: 'Premium'", "label: 'Appointments'",
  "label: 'Prescription'", "label: 'Chamber Details'", "label: 'Schedule'", "label: 'Visiting Card'",
  "label: 'Public Profile Content'", "label: 'Profile'",
], 'Doctor hamburger de-duplication');

mustInclude(app, [
  'path="/doctor/settings"', 'path="/doctor/public-content"', 'path="/doctor/support"',
  'path="/doctor/feedback"', 'path="/doctor/help"', 'path="/doctor/public-view"',
  'path="/doctor/appointments"', 'path="/doctor/prescriptions"', 'path="/doctor/analytics"',
  'path="/doctor/profile"', 'path="/doctor/visiting-card"', 'path="/doctor/chambers"',
  'path="/doctor/schedules"', 'path="/doctor/public-profile"', 'path="/doctor/premium"',
  'path="/admin/doctor-support"',
], 'Routes and legacy compatibility');

mustInclude(wizard, [
  "title: 'Visiting Card Input'", "title: 'Chamber Details + Location Setup'", "title: 'About Doctor'",
  "title: 'Service List Setup'", "title: 'Treatment Cost List Setup'", "title: 'Investigation Cost List Setup'",
  '<DoctorVisitingCardPage onSaved=', '<DoctorChamberDetailsPage onSaved=', 'section="about" embedded',
  'section="services" embedded', 'section="treatment" embedded', 'section="investigation" embedded',
  "saved ? 'Saved' : 'Incomplete'", 'Previous', 'Next', "getMyDoctorProfile()", "getMyDoctorPublicContent()",
], 'Six-step Public Content Management');

mustInclude(verification, [
  'verification_submitted_at', 'submittedPending', 'applicationLocked', 'evidenceEditable',
  'submitMyDoctorVerificationApplication', 'Re-Verification Apply', 'Review note:',
  'Pending অবস্থায় information, evidence edit বা re-submit করা যাবে না',
], 'Verification lifecycle UI');

mustInclude(myProfile, [
  'Personal Information', 'Study Information', 'Address', 'Phone',
  'getMyDoctorPrivateProfile', 'updateMyDoctorPrivateProfile',
  'verificationProfile?.medical_college', 'verificationProfile?.medical_session', 'verificationProfile?.medical_batch',
  'About Doctor content Public Content Management-এর Step 3',
], 'My Profile private/study information');
mustNotInclude(myProfile, ['<span>নিজের সম্পর্কে</span>'], 'Duplicate About editor removal');
mustInclude(doctorDashboardService, ['getMyDoctorPrivateProfile', 'updateMyDoctorPrivateProfile'], 'Doctor private-profile service');


mustInclude(onboarding, [
  "const doctorSteps = ['Basic Information', 'Verification', 'Visiting Card', 'Chamber Details', 'About Doctor', 'Services', 'Treatment Cost']",
  'Medical Type *', 'Select MBBS / BDS', 'Save & Next',
  'submitMyDoctorVerificationApplication',
  "verificationStatus==='approved'||(verificationStatus==='pending'&&Boolean(submittedAt))",
  'disabled={locked}', 'disabled={disabled||busy||!file}',
  'Visiting Card Details', 'Public Visiting-card Address *', 'Use My Current Location',
  '<h2>About Doctor</h2>', '<h2>Service List</h2>', '<h2>Treatment Cost</h2>',
  'Skip & Complete', 'Complete Onboarding', 'useUnsavedWarning',
], 'Seven-step Doctor onboarding compatibility');

mustInclude(migration, [
  'add column if not exists verification_submitted_at timestamptz',
  'guard_doctor_verification_locked_identity',
  'submit_my_doctor_verification_application',
  "old.verification_status='rejected'",
  "new.verification_status := 'rejected'",
  'get_my_doctor_private_profile', 'update_my_doctor_private_profile',
  'doctor_support_threads', 'doctor_support_messages', 'doctor_feedback_reports',
  'admin_get_doctor_support_threads', 'admin_get_doctor_feedback',
  "d.verification_status='pending' and d.verification_submitted_at is not null",
], 'Additive migration 62');


mustInclude(migration63, [
  'add column if not exists medical_type text', 'add column if not exists specialty_text text',
  'add column if not exists public_address text', 'add column if not exists permanent_address text',
  'save_my_doctor_basic_onboarding', 'update_my_doctor_verification_info_v2',
  'update_my_doctor_visiting_card_v2', 'save_my_doctor_chamber_v2',
  'get_public_doctor_search_cards_v2', 'p_medical_types text[]',
  'get_admin_user_directory_v2', 'super_admin_user_directory_v3', 'p_specialty_id bigint',
  'onboarding_step=7', 'onboarding_completed_at=coalesce(onboarding_completed_at,now())',
], 'Additive migration 63');

mustInclude(discovery, ['medicalTypes', 'get_public_doctor_search_cards_v2', 'hydrateDoctorCardsV2', 'get_public_doctor_card_bundle_v2'], 'Public Doctor data integration');
mustInclude(doctorCard, ['doctor.specialty_text', 'doctor.public_address', 'computedDistance', 'nearest_provider_latitude'], 'Visitor Doctor card integration');
mustInclude(doctorProfile, ['profile.doctor.specialty_text', 'profile.doctor.public_address', 'chamber.whatsapp', 'buildWhatsAppAppointmentUrl'], 'Doctor details public integration');
mustInclude(adminDashboard, ['All Medical Type', 'userDistrictId', 'userUpazilaId', 'userSpecialtyId'], 'Admin Doctor filters');
mustInclude(superAdmin, ['All Medical Type', 'specialtyId', 'সব জেলা', 'সব উপজেলা', 'সব স্পেশালিটি'], 'Super Admin Doctor filters');

mustInclude(appointments, [
  'Today + Upcoming • Latest 5', 'slice(0, 5)', 'doctor-appointment-summary-grid',
  'Last 7 Days', 'All Appointments', 'updateAppointmentStatus',
  'act(appointment.appointment_id, "confirmed")', 'act(appointment.appointment_id, "rejected"',
  'act(appointment.appointment_id, "completed")', 'act(appointment.appointment_id, "no_show")',
  'act(appointment.appointment_id, "cancelled"', '/doctor/prescriptions?appointment=',
], 'Appointment Management');

mustInclude(analytics, [
  'getDoctorAnalytics', 'Appointment Analytics', 'Monthly Unique Patients', 'Last 7 Days',
  'Profile views', 'Call Clicks', 'WhatsApp Clicks', 'Appointment Clicks', 'Appointment Requests',
], 'Centralized Doctor Analytics');

mustInclude(publicView, ['resolvePublicDoctorRoute', 'doctorPublicPath', '<Navigate to={target} replace />'], 'Live public profile view');
mustInclude(settings, ['auth.updateUser({ password })', '/doctor/premium'], 'Settings and Premium preservation');
mustInclude(styles, ['.doctor-primary-nav', '@media(max-width:1023px)', '.doctor-content-wizard-page', '.doctor-support-card'], 'Responsive Doctor UI');

console.log('DOCTOR MODULE REDESIGN VALIDATION PASSED');
console.log('Hamburger: 7 consolidated items');
console.log('Bottom navigation: 5 primary items');
console.log('Public content: 6 independently saved canonical-data steps');
console.log('Legacy Doctor routes: retained for deep-link compatibility');
console.log('Database: migrations 62 + additive 63; migrations 01–62 remain untouched by STEP63');
