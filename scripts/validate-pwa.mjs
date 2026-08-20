import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const fail = (message) => { throw new Error(message); };
const expect = (condition, message) => { if (!condition) fail(message); };

function pngSize(path) {
  const buffer = fs.readFileSync(path);
  expect(buffer.length >= 24, `${path}: invalid PNG`);
  expect(buffer.toString('ascii', 1, 4) === 'PNG', `${path}: invalid PNG signature`);
  return [buffer.readUInt32BE(16), buffer.readUInt32BE(20)];
}

const manifest = JSON.parse(read('public/manifest.webmanifest'));
for (const [key, expected] of Object.entries({
  name: 'docbd.info',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  theme_color: '#0b8467',
  background_color: '#f7f9fb',
})) {
  expect(manifest[key] === expected, `manifest ${key} must be ${expected}`);
}
expect(Boolean(manifest.short_name), 'manifest short_name is required');

for (const [size, purpose] of [['192x192', 'any'], ['512x512', 'any'], ['192x192', 'maskable'], ['512x512', 'maskable']]) {
  const icon = manifest.icons.find((item) => item.sizes === size && (item.purpose || 'any').includes(purpose));
  expect(Boolean(icon), `manifest missing ${purpose} ${size} icon`);
  const file = `public/${icon.src.replace(/^\//, '')}`;
  expect(fs.existsSync(file), `${file} does not exist`);
  const expected = size.split('x').map(Number);
  expect(pngSize(file).join('x') === expected.join('x'), `${file} dimensions do not match manifest`);
}

const indexHtml = read('index.html');
for (const token of ['/manifest.webmanifest', '/favicon.ico', '/icons/app-icon.svg', '/icons/apple-touch-icon.png']) {
  expect(indexHtml.includes(token), `index.html missing ${token}`);
}

const sw = read('public/sw.js');
for (const token of ["request.mode === 'navigate'", "url.origin !== self.location.origin", "url.pathname.startsWith('/assets/')", 'SKIP_WAITING', '/offline.html']) {
  expect(sw.includes(token), `service worker missing ${token}`);
}
const shellBlock = sw.split('const SHELL_ASSETS = [')[1]?.split('];')[0]?.toLowerCase() || '';
for (const sensitive of ['/doctor/prescriptions', '/profile', '/dashboard', '/auth', '/appointments', '/provider/']) {
  expect(!shellBlock.includes(sensitive), `sensitive route is precached: ${sensitive}`);
}

const vercel = JSON.parse(read('vercel.json'));
const rewrites = vercel.rewrites || [];
expect(rewrites.at(-1)?.source === '/(.*)' && rewrites.at(-1)?.destination === '/index.html', 'Vercel SPA fallback rewrite missing');
for (const path of ['/sw.js', '/manifest.webmanifest', '/favicon.ico', '/offline.html']) {
  expect(rewrites.some((item) => item.source === path && item.destination === path), `Vercel static exception missing for ${path}`);
}

const auth = read('src/lib/supabase.ts');
expect(auth.includes('persistSession: true') && auth.includes('autoRefreshToken: true'), 'Supabase session persistence config changed');
const app = read('src/App.tsx');
expect(app.includes('path="/doctors/:doctorId"') && app.includes('path="/providers/:providerId"'), 'public route definitions missing');
const doctorProfile = read('src/pages/DoctorProfile.tsx');
expect(doctorProfile.includes('resolvePublicDoctorRoute(doctorId)') || doctorProfile.includes('resolvePublicDoctorId(doctorId)') || doctorProfile.includes('getPublicDoctorPageBase(doctorId)'), 'public doctor slug resolver not wired');

console.log('PWA validation passed.');
