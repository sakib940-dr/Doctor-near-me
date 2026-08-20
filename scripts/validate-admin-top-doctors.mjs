import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');
const sql=read('supabase/55_admin_top_doctors_analytics.sql');
const page=read('src/pages/AdminDashboardPage.tsx');
const service=read('src/services/adminDashboard.ts');
const types=read('src/types.ts');
const css=read('src/styles.css');
const must=(value,msg)=>{if(!value) throw new Error(msg)};

for(const table of ['doctor_prescriptions','patient_follows','profile_interactions','appointments','doctor_reviews','doctor_review_authors']) {
  must(sql.includes(`public.${table}`),`Missing canonical source ${table}`);
}
must(!/create\s+table/i.test(sql),'Step 55 must not create duplicate analytics/counter tables');
must(sql.includes("event_type='call_click'") && sql.includes("event_type='whatsapp_click'") && sql.includes("event_type='profile_view'"),'Canonical interaction events missing');
must(sql.includes('r.is_published=true') && sql.includes('doctor_review_authors'),'Genuine published review filter missing');
must(sql.includes('avg(r.rating)'),'Highest-rated ranking must use actual structured review rating');
must(sql.includes('public.is_admin_or_above()'),'Admin authorization missing');
must(sql.includes('public.is_doctor_publicly_listable'),'View Profile eligibility guard missing');
for(const label of ['Top Prescription Generator','Most Saved/Followed Doctor','Most Call Clicks','Most WhatsApp Clicks','Most Appointment Requests','Most Profile Views','Most Reviewed Doctor','Highest Rated Doctor']) must(page.includes(label),`Missing UI ranking: ${label}`);
for(const range of ["['today','Today']","['7d','7 Days']","['30d','30 Days']","['all','All Time']"]) must(page.includes(range),`Missing range ${range}`);
must(page.includes('loading="lazy"') && page.includes('decoding="async"'),'Doctor ranking images must be lazy/async');
must(page.includes('/doctor/${doctor.profile_slug}') || page.includes('`/doctor/${doctor.profile_slug}`'),'Clean profile route missing');
must(service.includes("rpc('get_admin_top_doctors_analytics'"),'Top Doctors RPC service missing');
must(types.includes("AdminTopDoctorMetricKey") && types.includes("AdminTopDoctorsAnalytics"),'Top Doctors types missing');
must(css.includes('@media (max-width:380px)') && css.includes('.admin-top-doctors-grid'),'Mobile overflow-safe styles missing');
console.log('Admin Top Doctors analytics validation: PASS');
console.log('Covered: canonical data sources, 8 rankings, 4 ranges, genuine reviews/ratings, admin auth, no duplicate counters, lazy photos, clean profile links, mobile layout.');
