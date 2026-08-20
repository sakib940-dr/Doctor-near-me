import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const sql60 = read('supabase/60_dhaka_city_area_location_system.sql');
const seed = read('supabase/11_reference_data_storage.sql');
const discovery = read('src/services/discovery.ts');
const visitor = read('src/pages/VisitorHomePage.tsx');
const categories = read('src/pages/CategoriesPage.tsx');
const providers = read('src/pages/PublicProvidersPage.tsx');
const chamber = read('src/pages/DoctorChamberDetailsPage.tsx');
const providerProfile = read('src/pages/ProviderProfilePage.tsx');
const types = read('src/types.ts');
const sql59 = read('supabase/59_free_tier_resource_optimization.sql');

let checks = 0;
function assert(condition, message) {
  checks += 1;
  if (!condition) throw new Error(`FAIL: ${message}`);
}

const realDhaka = ['savar','dhamrai','keraniganj','dohar','nawabganj'];
const cityAreas = ['mirpur','uttara','banani','gulshan','dhanmondi','mohammadpur','badda','bashundhara','rampura','khilgaon','tejgaon','farmgate','motijheel','jatrabari','wari','ramna','pallabi'];

assert(sql60.includes("add column if not exists location_type text not null default 'upazila'"), 'location_type metadata added without new hierarchy');
assert(sql60.includes('add column if not exists city_corporation text'), 'city_corporation metadata added');
assert(!/create\s+table/i.test(sql60), 'STEP 60 creates no replacement location table');
assert(sql60.includes("location_type in ('upazila','city_area')"), 'location_type is constrained');
assert(sql60.includes("city_corporation in ('north','south')"), 'city corporation metadata is constrained');
for (const slug of realDhaka) assert(sql60.includes(`'${slug}'`), `real Dhaka Upazila preserved: ${slug}`);
for (const slug of cityAreas) assert(sql60.includes(`'${slug}'`), `Dhaka city area exists: ${slug}`);
assert(sql60.includes("DOCBD-DHAKA-MIRPUR"), 'city areas use non-administrative DOCBD source codes');
assert(sql60.includes('Do not delete/deactivate a possible legacy generic Dhaka row'), 'legacy IDs are preserved');
assert(!sql60.includes('set is_active=false'), 'STEP 60 does not deactivate legacy IDs');
assert(sql60.includes("lower(u.slug) not in ('dhaka-sadar','main-dhaka','main-dhaka-city','dhaka-city')"), 'generic Dhaka placeholders excluded from GPS resolver');
assert(discovery.includes(".select('id,district_id,name_bn,name_en,slug,location_type,city_corporation')"), 'existing upazilas query returns metadata only');
assert(discovery.includes('hiddenLegacyDhakaSlugs'), 'generic Dhaka placeholders hidden from new selectors');
assert(types.includes("location_type: 'upazila' | 'city_area'"), 'frontend type distinguishes city area from Upazila');
assert(types.includes("'dhaka_city_area_centroid'"), 'GPS resolution source supports Dhaka city area');
assert(visitor.includes('applyResolvedLocation(resolved)'), 'visitor GPS applies resolved second-level location');
assert(visitor.includes("setUpazilaId(nextUpazilaId)"), 'visitor GPS sets existing upazila_id state');
assert(visitor.includes("contextVersion: 2"), 'old cached GPS context is versioned for safe re-resolution');
assert(visitor.includes('সকল উপজেলা / এলাকা'), 'visitor has All Areas fallback label');
assert(visitor.includes("item.location_type === 'city_area' ? ' · এলাকা' : ''"), 'visitor explicitly labels city-area rows as area');
assert(categories.includes("searchParams.get('upazila')"), 'category/specialty links preserve existing second-level location ID');
assert(providers.includes("searchParams.get('upazila')"), 'hospital directory accepts same second-level location query context');
assert(chamber.includes('upazilaId: resolved.upazila_id'), 'doctor chamber GPS saves resolved existing second-level ID');
assert(providerProfile.includes('upazila_id: resolved.upazila_id'), 'hospital/provider GPS saves resolved existing second-level ID');
assert(chamber.includes('upazilaId: draft.upazilaId'), 'doctor chamber save reuses existing save RPC field');
assert(providerProfile.includes('upazilaId: profile.upazila_id'), 'hospital save reuses existing save RPC field');
assert(!/create\s+or\s+replace\s+function\s+public\.(search_doctors|get_public_marketplace_doctors|get_public_providers)/i.test(sql60), 'no duplicate search/provider RPC introduced');
assert(sql59.includes('p_upazila_id'), 'existing free-tier search read layer continues to use p_upazila_id');
assert(sql59.includes('get_public_nearest_doctors_v2') && discovery.includes("rpc('get_public_nearest_doctors_v2'"), 'existing Near Me read path remains present');
assert(read('src/pages/DoctorDirectory.tsx').includes('উপজেলা / এলাকা'), 'doctor search filter label updated');
assert(read('src/pages/DoctorProfessionalProfilePage.tsx').includes('উপজেলা / এলাকা'), 'doctor profile location label updated');
assert(providerProfile.includes('উপজেলা / এলাকা'), 'hospital/provider location label updated');
assert(read('src/pages/OnboardingPage.tsx').includes('Upazila / Area'), 'doctor/hospital onboarding location label updated');
assert(!read('src/pages/DoctorChamberDetailsPage.tsx').includes('এলাকা/এলাকা'), 'no duplicate location wording');

// Lightweight simulation of the STEP 60 resolver for requested regression cases.
const R = 6371;
const rad = (d) => d * Math.PI / 180;
function dist(aLat,aLon,bLat,bLon) {
  const dLat=rad(bLat-aLat), dLon=rad(bLon-aLon);
  const a=Math.sin(dLat/2)**2 + Math.cos(rad(aLat))*Math.cos(rad(bLat))*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));
}
function parseDistricts(text) {
  const out=[];
  const re=/\('([A-Z]{2}\d{4})','([A-Z]{2}\d{2})','([^']*)','([^']*)','([^']*)',([\d.]+),([\d.]+)\)/g;
  for (const m of text.matchAll(re)) out.push({code:m[1],bn:m[3],en:m[4],slug:m[5],lat:+m[6],lon:+m[7]});
  return out;
}
function parseUpazilas(text) {
  const out=[];
  const re=/\('([A-Z]{2}\d{8})','([A-Z]{2}\d{4})','([^']*)','([^']*)','([^']*)',([\d.]+),([\d.]+)\)/g;
  for (const m of text.matchAll(re)) out.push({code:m[1],districtCode:m[2],bn:m[3],en:m[4],slug:m[5],lat:+m[6],lon:+m[7],type:'upazila'});
  return out;
}
const districts=parseDistricts(seed);
const admin=parseUpazilas(seed).filter(x => !['dhaka-sadar','main-dhaka','main-dhaka-city','dhaka-city'].includes(x.slug));
const city=[
  ['mirpur',23.8223,90.3654],['uttara',23.8759,90.3795],['banani',23.7937,90.4066],['gulshan',23.7929,90.4186],
  ['dhanmondi',23.7461,90.3742],['mohammadpur',23.7660,90.3586],['badda',23.7806,90.4267],['bashundhara',23.8190,90.4278],
  ['rampura',23.7615,90.4197],['khilgaon',23.7516,90.4244],['tejgaon',23.7639,90.3910],['farmgate',23.7588,90.3897],
  ['motijheel',23.7330,90.4172],['jatrabari',23.7107,90.4344],['wari',23.7176,90.4170],['ramna',23.7373,90.3954],['pallabi',23.8294,90.3660],
].map(([slug,lat,lon])=>({slug,lat,lon,type:'city_area',districtCode:'BD3026'}));
function resolve(lat,lon) {
  const urban=lat>=23.68 && lat<23.89 && lon>=90.33 && lon<=90.46;
  const nearestCity=[...city].sort((a,b)=>dist(lat,lon,a.lat,a.lon)-dist(lat,lon,b.lat,b.lon))[0];
  const cityDistance=nearestCity ? dist(lat,lon,nearestCity.lat,nearestCity.lon) : Infinity;
  const nearestFive=[...admin].sort((a,b)=>dist(lat,lon,a.lat,a.lon)-dist(lat,lon,b.lat,b.lon)).slice(0,5);
  const scores=new Map();
  for (const u of nearestFive) {
    const d=dist(lat,lon,u.lat,u.lon); const s=scores.get(u.districtCode)||{score:0,near:Infinity};
    s.score += 1/(d+1); s.near=Math.min(s.near,d); scores.set(u.districtCode,s);
  }
  const winning=[...scores].sort((a,b)=>b[1].score-a[1].score || a[1].near-b[1].near || a[0].localeCompare(b[0]))[0]?.[0];
  const nearestDistrict=[...districts].sort((a,b)=>dist(lat,lon,a.lat,a.lon)-dist(lat,lon,b.lat,b.lon))[0]?.code;
  const effective=urban ? 'BD3026' : (winning || nearestDistrict);
  const d=districts.find(x=>x.code===effective);
  const nearestAdmin=[...admin].filter(x=>x.districtCode===effective).sort((a,b)=>dist(lat,lon,a.lat,a.lon)-dist(lat,lon,b.lat,b.lon))[0];
  const adminDistance=nearestAdmin ? dist(lat,lon,nearestAdmin.lat,nearestAdmin.lon) : Infinity;
  if (d?.slug==='dhaka' && urban && cityDistance<=5.5) return {district:'dhaka',second:nearestCity.slug,type:'city_area'};
  if (d?.slug==='dhaka' && adminDistance<=4.0) return {district:'dhaka',second:nearestAdmin.slug,type:'upazila'};
  if (d?.slug==='dhaka' && urban) return {district:'dhaka',second:null,type:null};
  if (d?.slug==='dhaka' && adminDistance<=20) return {district:'dhaka',second:nearestAdmin.slug,type:'upazila'};
  return {district:d?.slug ?? null,second:nearestAdmin?.slug ?? null,type:nearestAdmin?'upazila':null};
}
const cases=[
  ['Dhaka → Mirpur',23.8223,90.3654,'dhaka','mirpur','city_area'],
  ['Dhaka → Banani',23.7937,90.4066,'dhaka','banani','city_area'],
  ['Dhaka → Gulshan',23.7929,90.4186,'dhaka','gulshan','city_area'],
  ['Dhaka → Savar',23.8800,90.2810,'dhaka','savar','upazila'],
  ['Sirajganj existing',24.4940,89.6900,'sirajganj','sirajganj-sadar','upazila'],
];
for (const [label,lat,lon,district,second,type] of cases) {
  const got=resolve(lat,lon);
  assert(got.district===district && got.second===second && got.type===type, `${label} GPS simulation (${JSON.stringify(got)})`);
}

console.log(`Dhaka location validation PASS: ${checks}/${checks}`);
