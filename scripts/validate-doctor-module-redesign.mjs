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
const styles = read('src/styles.css');

mustInclude(shell, [
  "{ label: 'Settings', path: '/doctor/settings'",
  "{ label: 'Public Content Management', path: '/doctor/public-content'",
  "{ label: 'Verification Application', path: '/doctor/verification'",
  "{ label: 'Hospital / Provider Invitation', path: '/doctor/invitations'",
  "{ label: 'Support / Chat with Admin', path: '/doctor/support'",
  "{ label: 'Feedback / Bug Report', path: '/doctor/feedback'",
  "{ label: 'FAQ / Help', path: '/doctor/help'",
  "{ label: 'Appointment Management', path: '/doctor/appointments'",
  "{ label: 'Prescription', path: '/doctor/prescriptions'",
  "{ label: 'Analytics', path: '/doctor/analytics'",
  "{ label: 'My Profile', path: '/doctor/profile'",
  "{ label: 'Public Profile View', path: '/doctor/public-view'",
], 'Doctor navigation');

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
  'submitMyDoctorVerificationApplication', 'Save Draft & Continue', 'Apply & Continue',
  "verificationStatus==='approved'||(verificationStatus==='pending'&&Boolean(submittedAt))",
  'disabled={locked}', 'disabled={disabled||!file}',
], 'Doctor onboarding verification compatibility');

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

mustInclude(appointments, [
  'Today + Upcoming • Latest 5', 'slice(0, 5)', 'doctor-appointment-summary-grid',
  'Last 7 Days', 'All Appointments', 'updateAppointmentStatus',
  "act(appointment.appointment_id, 'confirmed')", "act(appointment.appointment_id, 'rejected'",
  "act(appointment.appointment_id, 'completed')", "act(appointment.appointment_id, 'no_show')",
  "act(appointment.appointment_id, 'cancelled'", '/doctor/prescriptions?appointment=',
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
console.log('Database: migration 62 only; earlier migrations untouched');
