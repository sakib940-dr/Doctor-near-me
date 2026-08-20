import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root,p),'utf8');
const dashboard = read('src/pages/AdminDashboardPage.tsx');
const premium = read('src/pages/PremiumAdminPage.tsx');
const types = read('src/types.ts');
const sql = read('supabase/57_admin_action_center_premium_management.sql');

const checks = [
  ['Action Center heading', dashboard.includes('Action Center')],
  ['Doctor verification priority', dashboard.includes('Pending Doctor Verification')],
  ['Hospital verification priority', dashboard.includes('Pending Hospital Verification')],
  ['Premium requests priority', dashboard.includes('Premium Requests')],
  ['Premium expiry priority', dashboard.includes('Expiring Premium')],
  ['Pending appointments priority', dashboard.includes('Pending Appointments')],
  ['System issue source', dashboard.includes('Push Delivery Issues')],
  ['Flagged review capability is conditional', dashboard.includes('flagged_reviews_supported')],
  ['Premium filter query support', premium.includes("useSearchParams") && premium.includes("filter=pending") === false && premium.includes('changeTargetFilter')],
  ['Premium status visible', premium.includes('Current status')],
  ['Follower/referral progress', premium.includes('Followers') && premium.includes('Referrals')],
  ['Achievement progress', premium.includes('Badge / Achievement')],
  ['Criteria progress', premium.includes('Premium criteria') && premium.includes('premiumCriteriaProgress')],
  ['Expiry visible', premium.includes('Expiry')],
  ['Approve action', premium.includes('Confirm Approve')],
  ['Revoke action confirmation', premium.includes('Confirm Revoke') && premium.includes('decisionConfirm')],
  ['View profile action', premium.includes('premium-view-link') && premium.includes('ExternalLink')],
  ['Admin summary types extended', types.includes('pending_doctor_verifications') && types.includes('expiring_premium_memberships')],
  ['Actual premium requests source', /premium_memberships[\s\S]*status='pending'/.test(sql)],
  ['Actual expiry source', /expires_at<=now\(\)\+interval '30 days'/.test(sql)],
  ['Actual push failure source', /web_push_outbox where status='failed'/.test(sql)],
  ['No fake review queue', sql.includes("'flagged_reviews_supported',false")],
  ['Premium direct mutation blocked', sql.includes("has_table_privilege('authenticated','public.premium_memberships','UPDATE')")],
  ['No SEO/domain work', !sql.includes('sitemap') && !sql.includes('canonical') && !sql.includes('docbd.info')],
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (!ok) failed++;
}
if (failed) process.exit(1);
console.log(`PASS ${checks.length}/${checks.length} Admin Action Center + Premium checks`);
