import fs from 'node:fs';

const page = fs.readFileSync('src/pages/AdminDashboardPage.tsx','utf8');
const service = fs.readFileSync('src/services/adminDashboard.ts','utf8');
const css = fs.readFileSync('src/styles.css','utf8');
const app = fs.readFileSync('src/App.tsx','utf8');
const cms = fs.readFileSync('src/pages/AdminCmsPage.tsx','utf8');

const checks = [
  ['Overview lazy-loads visible data only', page.includes('Promise.all([getAdminOperationalSummary(), getAdminOperationalTrends()])' ) && !page.includes('async function loadAll()')],
  ['Users lazy tab load', page.includes("if (tab === 'users') { void loadUsers(true); return; }")],
  ['Appointments lazy tab load', page.includes("if (tab === 'appointments') { void loadAppointments(true); return; }")],
  ['Activity lazy tab load', page.includes("if (tab === 'activity') void loadActivity();")],
  ['Concurrent read RPC dedupe', service.includes('adminReadInflight') && service.includes('dedupeAdminRead')],
  ['High-level analytics deduped', service.includes('admin:analytics:')],
  ['Top doctors deduped', service.includes('admin:top-doctors:')],
  ['Hospital analytics deduped', service.includes('admin:hospitals:')],
  ['Analytics skeleton state', page.includes('AdminAnalyticsSkeleton') && css.includes('.admin-analytics-skeleton')],
  ['Overview skeleton state', page.includes('AdminOverviewSkeleton') && css.includes('.admin-overview-skeleton')],
  ['Retryable analytics error state', page.includes('AdminRetryState') && css.includes('.admin-inline-error')],
  ['Preserved-data updating state', page.includes('admin-section-updating')],
  ['Top prescription doctors present', page.includes('Top Prescription Generator')],
  ['Top saved doctor present', page.includes('Most Saved/Followed Doctor')],
  ['Top call present', page.includes('Most Call Clicks')],
  ['Top WhatsApp present', page.includes('Most WhatsApp Clicks')],
  ['Top appointments present', page.includes('Most Appointment Requests')],
  ['Profile views present', page.includes('Most Profile Views')],
  ['Reviews and ratings present', page.includes('Most Reviewed Doctor') && page.includes('Highest Rated Doctor')],
  ['Premium growth present', page.includes("['Premium growth','premium',Crown]")],
  ['Top hospitals preserved', page.includes('topHospitalRankingConfig')],
  ['Visitor engagement preserved', page.includes('Visitor action mix')],
  ['Charts use ResponsiveContainer', page.includes('ResponsiveContainer width="100%" height="100%"')],
  ['Chart width bounded', css.includes('.recharts-responsive-container') && css.includes('max-width: 100% !important')],
  ['No page horizontal overflow', css.includes('.admin-page { overflow-x: clip; }')],
  ['430px mobile rule', css.includes('@media (max-width: 430px)')],
  ['390px mobile rule', css.includes('@media (max-width: 390px)')],
  ['375px mobile rule', css.includes('@media (max-width: 375px)')],
  ['360px mobile rule', css.includes('@media (max-width: 360px)')],
  ['CMS route preserved', app.includes('path="/admin/cms"')],
  ['Verification route preserved', app.includes('path="/verification/reviews"')],
  ['Premium route preserved', app.includes('path="/admin/premium"')],
  ['Notifications route preserved', app.includes('path="/notifications"')],
  ['Categories CMS preserved', cms.includes("['specialties', Tags, 'Specialty']")],
  ['Prescription Footer CMS preserved', cms.includes("['prescription', FileText, 'Prescription Footer']")],
  ['User management preserved', page.includes('User management') && page.includes('setAdminUserAccountStatus')],
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (!ok) failed++;
}
if (failed) {
  console.error(`Admin final polish validation failed: ${failed}/${checks.length}`);
  process.exit(1);
}
console.log(`PASS ${checks.length}/${checks.length} Admin final polish checks`);
