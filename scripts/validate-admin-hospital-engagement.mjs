import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root,p),'utf8');
const sql = read('supabase/56_admin_top_hospitals_visitor_engagement.sql');
const page = read('src/pages/AdminDashboardPage.tsx');
const service = read('src/services/adminDashboard.ts');
const types = read('src/types.ts');
const css = read('src/styles.css');

const checks = [
  ['admin-only aggregated RPC', sql.includes('get_admin_hospital_engagement_analytics') && sql.includes('is_admin_or_above()')],
  ['canonical follow source', sql.includes('public.patient_follows') && sql.includes("event_type='follow_gain'")],
  ['canonical interactions', sql.includes('public.profile_interactions') && sql.includes("event_type='call_click'") && sql.includes("event_type='whatsapp_click'")],
  ['actual appointments', sql.includes('public.appointments')],
  ['authored provider reviews', sql.includes('public.provider_reviews') && sql.includes('public.provider_review_authors')],
  ['authored doctor reviews', sql.includes('public.doctor_reviews') && sql.includes('public.doctor_review_authors')],
  ['completed shares only', sql.includes("event_type in ('share_native','share_copy')")],
  ['map interactions', sql.includes("event_type='map_click'")],
  ['hospital eligibility', sql.includes("provider_type='hospital'") && sql.includes("status='approved'")],
  ['all requested hospital rankings', ['follows','calls','whatsapp','appointments','views','reviews','rating'].every(k => sql.includes(`'${k}'`))],
  ['visitor summary fields', ['doctor_saves','hospital_saves','calls','whatsapp','appointments','reviews','shares','map_clicks'].every(k => sql.includes(`'${k}'`))],
  ['single frontend RPC', service.includes("rpc('get_admin_hospital_engagement_analytics'")],
  ['typed response', types.includes('AdminHospitalEngagementAnalytics') && types.includes('AdminVisitorEngagementSummary')],
  ['same range system', types.includes("AdminTopDoctorRangeKey") && page.includes("hospitalRange")],
  ['reusable ranking UI', page.includes('function AdminRankingCards') && page.includes('<AdminRankingCards cards={topDoctorRankingCards}/>') && page.includes('<AdminRankingCards cards={topHospitalRankingCards}/>')],
  ['hospital view profile', page.includes('/hospital/${hospital.slug}')],
  ['visitor donut', page.includes('visitorEngagementDonut') && page.includes('PieChart')],
  ['mobile responsive styles', css.includes('.admin-visitor-engagement-kpis') && css.includes('@media (max-width:380px)')],
];

let failed = false;
for (const [label, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failed = true;
}
if (failed) process.exit(1);
console.log('Admin Hospital + Visitor Engagement validation PASSED');
