import fs from 'node:fs';

const read = (file) => fs.readFileSync(file, 'utf8');
const dashboard = read('src/pages/DashboardPage.tsx');
const protectedRoute = read('src/components/ProtectedRoute.tsx');
const shell = read('src/components/DashboardShell.tsx');
const auth = read('src/contexts/AuthContext.tsx');
const app = read('src/App.tsx');
const main = read('src/main.tsx');
const discovery = read('src/services/discovery.ts');

let checks = 0;
function assert(condition, message) {
  checks += 1;
  if (!condition) throw new Error(`FAIL: ${message}`);
}

const dashboardMemo = dashboard.indexOf('const patientRecentAppointments = useMemo');
const onboardingReturn = dashboard.indexOf('return <Navigate to="/onboarding" replace />');
assert(dashboardMemo >= 0 && onboardingReturn > dashboardMemo, 'Dashboard onboarding redirect occurs after hooks');
assert(dashboard.includes("const role = account?.role ?? 'patient';"), 'Dashboard shell role is driven by canonical account context');
assert(dashboard.includes('AccountStateFallback'), 'Dashboard renders readable account fallback');

assert(protectedRoute.includes('if (!account)'), 'ProtectedRoute explicitly handles authenticated session without account context');
assert(protectedRoute.includes('<AccountStateFallback'), 'ProtectedRoute uses readable fallback instead of falling through');
assert(!/if \(!account\)[\s\S]{0,120}<Navigate to="\/dashboard"/.test(protectedRoute), 'ProtectedRoute does not self-redirect on missing account');

assert(shell.includes('if (loading) return <AccountStateFallback loading />'), 'DashboardShell shows visible loading state');
assert(shell.includes('if (!account) return <AccountStateFallback'), 'DashboardShell does not self-redirect when account is null');
assert(shell.includes('if (account.role !== role) return <Navigate to="/dashboard" replace />'), 'Role mismatch still returns safely to canonical dashboard');

assert(auth.includes("throw new Error('Authenticated session পাওয়া গেছে, কিন্তু account profile/context পাওয়া যায়নি।')"), 'Null account RPC result is promoted to readable auth error');
assert(auth.includes("'message' in error"), 'Supabase-style error objects preserve backend error messages');

assert(main.includes('<AppErrorBoundary>'), 'Global render error boundary wraps App');
assert(app.includes('if (loading) return <AccountStateFallback loading />'), 'Role-aware routes no longer render a blank loading page');

assert(discovery.includes('isMissingDhakaLocationMetadata'), 'Location selector detects missing STEP60 metadata');
assert(discovery.includes(".select('id,district_id,name_bn,name_en,slug')"), 'Location selector has pre-STEP60 fallback query');
assert(discovery.includes("location_type: 'upazila' as const"), 'Legacy location rows receive null-safe metadata defaults');

for (const role of ['patient','doctor','hospital','admin','super_admin','verification_officer','chamber','ambulance']) {
  assert(shell.includes(`case '${role}'`) || shell.includes(`${role}:`), `DashboardShell supports ${role}`);
}

console.log(`Login regression validation PASS: ${checks}/${checks}`);
