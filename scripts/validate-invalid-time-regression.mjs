import fs from 'node:fs';

const dashboard = fs.readFileSync(new URL('../src/pages/DashboardPage.tsx', import.meta.url), 'utf8');
const notifications = fs.readFileSync(new URL('../src/components/NotificationBell.tsx', import.meta.url), 'utf8');
const analytics = fs.readFileSync(new URL('../src/services/doctorDashboard.ts', import.meta.url), 'utf8');
const dateSafe = fs.readFileSync(new URL('../src/lib/dateSafe.ts', import.meta.url), 'utf8');

const checks = [
  ['dashboard imports safe formatter', dashboard.includes("from '../lib/dateSafe'")],
  ['dashboard does not directly Intl-format dates', !dashboard.includes('new Intl.DateTimeFormat')],
  ['dashboard appointment dates use safe formatter', dashboard.includes('formatDateSafe(appointment.appointment_date')],
  ['dashboard sort uses safe timestamp', dashboard.includes('safeDateTimestamp(b.created_at)')],
  ['notification timestamp uses safe formatter', notifications.includes('formatDateSafe(item.created_at')],
  ['doctor analytics sanitizes date-only values', analytics.includes('safeDateOnly(item?.date)')],
  ['safe date utility rejects null-like strings', dateSafe.includes("text === 'null' || text === 'undefined'")],
  ['safe formatter catches Intl failures', dateSafe.includes('new Intl.DateTimeFormat(locale, options).format(date)') && dateSafe.includes('catch {')],
];

const failed = checks.filter(([, ok]) => !ok);
if (failed.length) {
  console.error('Invalid-time regression validation FAILED');
  for (const [name] of failed) console.error(`- ${name}`);
  process.exit(1);
}
console.log(`Invalid-time regression validation PASS: ${checks.length}/${checks.length}`);
