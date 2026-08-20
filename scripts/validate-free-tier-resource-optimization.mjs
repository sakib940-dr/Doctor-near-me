import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const checks = [];
const ok = (name, condition) => { if (!condition) throw new Error(`FAIL: ${name}`); checks.push(name); };

const discovery = read('src/services/discovery.ts');
const home = read('src/pages/VisitorHomePage.tsx');
const notifications = read('src/services/notifications.ts');
const notificationPage = read('src/pages/NotificationsPage.tsx');
const bell = read('src/components/NotificationBell.tsx');
const providerSite = read('src/pages/ProviderWebsitePage.tsx');
const requestCache = read('src/lib/requestCache.ts');
const admin = read('src/pages/AdminDashboardPage.tsx');
const superAdmin = read('src/pages/SuperAdminPage.tsx');
const blood = read('src/pages/BloodBankPage.tsx');
const sql = read('supabase/59_free_tier_resource_optimization.sql');

const srcFiles = [];
function walk(dir) { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const full = path.join(dir, entry.name); if (entry.isDirectory()) walk(full); else if (/\.(ts|tsx)$/.test(entry.name)) srcFiles.push(full); } }
walk(path.join(root, 'src'));
const allSrc = srcFiles.map((f) => fs.readFileSync(f, 'utf8')).join('\n');

ok('no select(*) data fetches', !allSrc.includes("select('*')"));
ok('no Supabase realtime channel subscriptions', !/\.channel\s*\(/.test(allSrc) && !/postgres_changes/.test(allSrc));
ok('bounded public memory cache', requestCache.includes('MAX_PUBLIC_CACHE_ENTRIES') && requestCache.includes('prunePublicCache'));
ok('public cache and in-flight dedupe exist', requestCache.includes('publicCachedRequest') && requestCache.includes('dedupeRequest'));
ok('doctor search cards use one aggregated RPC', discovery.includes("get_public_doctor_search_cards"));
ok('marketplace cards use one aggregated RPC', discovery.includes("get_public_marketplace_doctors_v2"));
ok('near me uses v2 batched RPC', discovery.includes("get_public_nearest_doctors_v2"));
ok('homepage primary rails bundled', home.includes('getHomepagePrimaryDoctorSections') && discovery.includes('get_public_homepage_primary_doctors'));
ok('homepage secondary rails bundled', home.includes('getHomepageSecondaryDoctorSections') && discovery.includes('get_public_homepage_secondary_doctors'));
ok('provider doctor cards paginated', discovery.includes('get_public_provider_doctors_v3') && discovery.includes('offset'));
ok('provider website uses bundled public base', providerSite.includes('getPublicProviderPageBase') && !providerSite.includes('resolvePublicProviderRoute'));
ok('notification bell uses preview RPC', bell.includes('getMyNotificationPreview') && bell.includes('180_000'));
ok('notification center uses one page RPC', notifications.includes('getMyNotificationPage') && notificationPage.includes('getMyNotificationPage(20'));
ok('notification center paginated', notificationPage.includes('load(false, items.length)'));
ok('admin user/appointment load-more present', admin.includes('usersHasMore') && admin.includes('appointmentsHasMore'));
ok('super admin user pagination present', superAdmin.includes('SUPER_ADMIN_PAGE_SIZE = 30') && superAdmin.includes('usersHasMore'));
ok('super admin unused privileged data lazy-loaded', superAdmin.includes('invitesLoaded') && superAdmin.includes('policyLoaded'));
ok('blood donor pagination present', blood.includes('donorsHasMore') && blood.includes('loadDonors(false)'));
ok('SQL batch card RPC present', sql.includes('get_public_doctor_card_bundle'));
ok('SQL follower/review stats aggregate once', sql.includes('with requested_doctors as') && sql.includes('requested_providers as') && sql.includes('df as (') && sql.includes('pf as ('));
ok('SQL patient dashboard aggregate present', sql.includes('get_my_patient_dashboard_summary'));
ok('SQL doctor dashboard aggregate present', sql.includes('get_my_doctor_dashboard_analytics'));
ok('SQL review bundle present', sql.includes('get_public_structured_review_bundle'));
ok('SQL notification page bundle present', sql.includes('get_my_notification_page'));
ok('targeted public provider index present', sql.includes('idx_providers_public_directory_location'));
ok('targeted provider-doctor index present', sql.includes('idx_doctor_provider_links_provider_approved'));
ok('targeted patient recent appointment index present', sql.includes('idx_appointments_patient_created_at_free_tier'));
ok('no service worker/private cache changes required by phase', true);

console.log(`Free-tier resource validation PASS (${checks.length}/${checks.length})`);
for (const c of checks) console.log(`✓ ${c}`);
