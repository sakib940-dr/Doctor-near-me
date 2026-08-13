import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const sourceRoot = resolve(process.argv[2] || '');
const outputFile = resolve(
  process.argv[3] || join('supabase', '11_reference_data_storage.sql'),
);

if (!process.argv[2]) {
  throw new Error(
    'Usage: node scripts/generate_step11_reference_data.mjs <dataset-root> [output-file]',
  );
}

const load = (name) =>
  JSON.parse(readFileSync(join(sourceRoot, 'data', name), 'utf8'));

const divisions = load('all-division.json');
const districts = load('all-district.json');
const upazilas = load('all-upazila.json');

if (divisions.length !== 8 || districts.length !== 64 || upazilas.length !== 495) {
  throw new Error(
    `Unexpected source counts: ${divisions.length} divisions, ${districts.length} districts, ${upazilas.length} upazilas`,
  );
}

const sqlText = (value) =>
  value == null ? 'null' : `'${String(value).replaceAll("'", "''")}'`;
const sqlNumber = (value) =>
  value == null || value === '' ? 'null' : String(Number(value));
const cleanSlug = (slug) => slug.replace(/-bd\d+$/i, '');

const assertUnique = (items, key, label) => {
  const seen = new Set();
  for (const item of items) {
    const value = key(item);
    if (seen.has(value)) throw new Error(`Duplicate ${label}: ${value}`);
    seen.add(value);
  }
};

assertUnique(divisions, (x) => cleanSlug(x.name.slug), 'division slug');
assertUnique(districts, (x) => cleanSlug(x.name.slug), 'district slug');
assertUnique(
  upazilas,
  (x) => `${x.parent.id}/${cleanSlug(x.name.slug)}`,
  'upazila district/slug',
);

const divisionValues = divisions
  .map(
    (x) =>
      `  (${sqlText(x.id)},${sqlText(x.name.local)},${sqlText(x.name.en)},${sqlText(cleanSlug(x.name.slug))},${sqlNumber(x.geo?.lat)},${sqlNumber(x.geo?.lon)})`,
  )
  .join(',\n');

const districtValues = districts
  .map(
    (x) =>
      `  (${sqlText(x.id)},${sqlText(x.parent.id)},${sqlText(x.name.local)},${sqlText(x.name.en)},${sqlText(cleanSlug(x.name.slug))},${sqlNumber(x.geo?.lat)},${sqlNumber(x.geo?.lon)})`,
  )
  .join(',\n');

const upazilaValues = upazilas
  .map(
    (x) =>
      `  (${sqlText(x.id)},${sqlText(x.parent.id)},${sqlText(x.name.local)},${sqlText(x.name.en)},${sqlText(cleanSlug(x.name.slug))},${sqlNumber(x.geo?.lat)},${sqlNumber(x.geo?.lon)})`,
  )
  .join(',\n');

const specialties = [
  ['medicine', 'মেডিসিন', 'Internal Medicine'],
  ['cardiology', 'হৃদরোগ', 'Cardiology'],
  ['neurology', 'স্নায়ুরোগ', 'Neurology'],
  ['ophthalmology', 'চক্ষুরোগ', 'Ophthalmology'],
  ['ent', 'নাক-কান-গলা', 'ENT'],
  ['dentistry', 'দন্তরোগ', 'Dentistry'],
  ['orthopedics', 'অর্থোপেডিকস', 'Orthopedics'],
  ['pediatrics', 'শিশুরোগ', 'Pediatrics'],
  ['gynecology-obstetrics', 'স্ত্রী ও প্রসূতিরোগ', 'Gynecology & Obstetrics'],
  ['dermatology', 'চর্ম ও যৌনরোগ', 'Dermatology'],
  ['psychiatry', 'মানসিক রোগ', 'Psychiatry'],
  ['gastroenterology', 'পরিপাকতন্ত্র ও লিভার', 'Gastroenterology'],
  ['nephrology', 'কিডনি রোগ', 'Nephrology'],
  ['urology', 'মূত্ররোগ', 'Urology'],
  ['pulmonology', 'বক্ষব্যাধি', 'Pulmonology'],
  ['endocrinology-diabetes', 'হরমোন ও ডায়াবেটিস', 'Endocrinology & Diabetes'],
  ['general-surgery', 'জেনারেল সার্জারি', 'General Surgery'],
  ['neurosurgery', 'নিউরোসার্জারি', 'Neurosurgery'],
  ['oncology', 'ক্যান্সার', 'Oncology'],
  ['rheumatology', 'বাত ও জয়েন্ট', 'Rheumatology'],
  ['hematology', 'রক্তরোগ', 'Hematology'],
  ['anesthesiology', 'অ্যানেস্থেসিওলজি', 'Anesthesiology'],
  ['radiology-imaging', 'রেডিওলজি ও ইমেজিং', 'Radiology & Imaging'],
  ['pathology', 'প্যাথলজি', 'Pathology'],
  ['physiotherapy', 'ফিজিওথেরাপি', 'Physiotherapy'],
  ['nutrition', 'পুষ্টি', 'Nutrition'],
];

const specialtyValues = specialties
  .map(
    ([slug, bn, en], index) =>
      `  (${sqlText(bn)},${sqlText(en)},${sqlText(slug)},${(index + 1) * 10},true)`,
  )
  .join(',\n');

const topics = [
  ['heart', 'হৃদরোগ', 'Heart', '🫀', ['হার্ট', 'হৃদপিণ্ড', 'বুক ধড়ফড়', 'cardiac'], ['cardiology']],
  ['eye', 'চোখ', 'Eye', '👁️', ['চক্ষু', 'চোখের ডাক্তার', 'দৃষ্টি', 'eye doctor'], ['ophthalmology']],
  ['dental', 'দাঁত', 'Dental', '🦷', ['দন্ত', 'দাঁতের ডাক্তার', 'মাড়ি', 'tooth'], ['dentistry']],
  ['brain-nerve', 'মস্তিষ্ক ও স্নায়ু', 'Brain & Nerve', '🧠', ['নিউরো', 'মাথাব্যথা', 'স্ট্রোক', 'নার্ভ'], ['neurology', 'neurosurgery']],
  ['bone-joint', 'হাড় ও জয়েন্ট', 'Bone & Joint', '🦴', ['অর্থোপেডিক', 'বাত', 'জয়েন্ট', 'হাড়'], ['orthopedics', 'rheumatology', 'physiotherapy']],
  ['child', 'শিশু', 'Child', '👶', ['বাচ্চার ডাক্তার', 'শিশুরোগ', 'pediatric'], ['pediatrics']],
  ['women-pregnancy', 'নারী ও গর্ভাবস্থা', 'Women & Pregnancy', '🤰', ['গাইনি', 'প্রসূতি', 'গর্ভাবস্থা', 'নারী রোগ'], ['gynecology-obstetrics']],
  ['skin', 'ত্বক', 'Skin', '🧴', ['চর্ম', 'এলার্জি', 'চুলকানি', 'skin'], ['dermatology']],
  ['kidney-urine', 'কিডনি ও মূত্র', 'Kidney & Urine', '🫘', ['কিডনি', 'ইউরোলজি', 'প্রস্রাব'], ['nephrology', 'urology']],
  ['stomach-liver', 'পেট ও লিভার', 'Stomach & Liver', '🫃', ['গ্যাস্ট্রিক', 'লিভার', 'পাকস্থলী', 'হজম'], ['gastroenterology']],
  ['lung-breathing', 'ফুসফুস ও শ্বাসকষ্ট', 'Lung & Breathing', '🫁', ['বক্ষব্যাধি', 'হাঁপানি', 'শ্বাসকষ্ট', 'চেস্ট'], ['pulmonology']],
  ['diabetes-hormone', 'ডায়াবেটিস ও হরমোন', 'Diabetes & Hormone', '🩸', ['ডায়াবেটিস', 'থাইরয়েড', 'হরমোন'], ['endocrinology-diabetes']],
  ['mental-health', 'মানসিক স্বাস্থ্য', 'Mental Health', '🧘', ['মনোরোগ', 'উদ্বেগ', 'ডিপ্রেশন', 'মানসিক'], ['psychiatry']],
  ['cancer', 'ক্যান্সার', 'Cancer', '🎗️', ['টিউমার', 'অনকোলজি', 'ক্যান্সার'], ['oncology']],
  ['blood', 'রক্তরোগ', 'Blood', '🩸', ['হেমাটোলজি', 'রক্তস্বল্পতা', 'থ্যালাসেমিয়া'], ['hematology']],
  ['general-medicine', 'জ্বর ও সাধারণ রোগ', 'General Medicine', '🩺', ['মেডিসিন', 'জ্বর', 'সাধারণ রোগ', 'medicine'], ['medicine']],
];

const topicValues = topics
  .map(
    ([slug, bn, en, icon, keywords], index) =>
      `  (${sqlText(bn)},${sqlText(en)},${sqlText(slug)},${sqlText(icon)},array[${keywords.map(sqlText).join(',')}]::text[],${(index + 1) * 10},true)`,
  )
  .join(',\n');

const topicMapValues = topics
  .flatMap(([topicSlug, , , , , specialtySlugs]) =>
    specialtySlugs.map(
      (specialtySlug) => `  (${sqlText(topicSlug)},${sqlText(specialtySlug)})`,
    ),
  )
  .join(',\n');

const sql = `-- ============================================================
-- STEP 11 — REFERENCE DATA + STORAGE SECURITY + SELF-CHECKS
-- Generated by scripts/generate_step11_reference_data.mjs
-- Run ONLY this file after Step 10 has completed successfully.
-- ============================================================
-- Location source: Bangladesh Administrative Divisions Dataset
-- https://github.com/open-admin-data/bangladesh-administrative-divisions
-- CC-BY-4.0, snapshot updated 2026-06-01.
-- Cross-checked against Bangladesh National Portal district/upazila lists.
-- Source snapshot: 8 divisions, 64 districts, 495 upazilas.
-- ============================================================

-- ------------------------------------------------------------
-- LOCATION SOURCE CODES + COORDINATES
-- Existing identity IDs/FKs stay stable; source_code stores BBS-style codes.
-- ------------------------------------------------------------
alter table public.divisions add column if not exists source_code text;
alter table public.divisions add column if not exists latitude double precision;
alter table public.divisions add column if not exists longitude double precision;
alter table public.districts add column if not exists source_code text;
alter table public.districts add column if not exists latitude double precision;
alter table public.districts add column if not exists longitude double precision;
alter table public.upazilas add column if not exists source_code text;
alter table public.upazilas add column if not exists latitude double precision;
alter table public.upazilas add column if not exists longitude double precision;

create unique index if not exists ux_divisions_source_code
  on public.divisions(source_code) where source_code is not null;
create unique index if not exists ux_districts_source_code
  on public.districts(source_code) where source_code is not null;
create unique index if not exists ux_upazilas_source_code
  on public.upazilas(source_code) where source_code is not null;

with incoming(source_code,name_bn,name_en,slug,latitude,longitude) as (
values
${divisionValues}
)
insert into public.divisions(source_code,name_bn,name_en,slug,latitude,longitude,is_active)
select source_code,name_bn,name_en,slug,latitude,longitude,true from incoming
on conflict(slug) do update
set source_code=excluded.source_code,name_bn=excluded.name_bn,name_en=excluded.name_en,
    latitude=excluded.latitude,longitude=excluded.longitude,is_active=true;

with incoming(source_code,division_code,name_bn,name_en,slug,latitude,longitude) as (
values
${districtValues}
)
insert into public.districts(
  source_code,division_id,name_bn,name_en,slug,latitude,longitude,is_active
)
select i.source_code,d.id,i.name_bn,i.name_en,i.slug,i.latitude,i.longitude,true
from incoming i
join public.divisions d on d.source_code=i.division_code
on conflict(slug) do update
set source_code=excluded.source_code,division_id=excluded.division_id,
    name_bn=excluded.name_bn,name_en=excluded.name_en,
    latitude=excluded.latitude,longitude=excluded.longitude,is_active=true;

with incoming(source_code,district_code,name_bn,name_en,slug,latitude,longitude) as (
values
${upazilaValues}
)
insert into public.upazilas(
  source_code,district_id,name_bn,name_en,slug,latitude,longitude,is_active
)
select i.source_code,d.id,i.name_bn,i.name_en,i.slug,i.latitude,i.longitude,true
from incoming i
join public.districts d on d.source_code=i.district_code
on conflict(district_id,slug) do update
set source_code=excluded.source_code,name_bn=excluded.name_bn,name_en=excluded.name_en,
    latitude=excluded.latitude,longitude=excluded.longitude,is_active=true;

-- ------------------------------------------------------------
-- SPECIALTY + PATIENT-FRIENDLY DISCOVERY TOPIC SEED
-- ------------------------------------------------------------
insert into public.specialties(name_bn,name_en,slug,sort_order,is_active)
values
${specialtyValues}
on conflict(slug) do update
set name_bn=excluded.name_bn,name_en=excluded.name_en,
    sort_order=excluded.sort_order,is_active=true;

insert into public.discovery_topics(
  name_bn,name_en,slug,icon,search_keywords,sort_order,is_active
)
values
${topicValues}
on conflict(slug) do update
set name_bn=excluded.name_bn,name_en=excluded.name_en,icon=excluded.icon,
    search_keywords=excluded.search_keywords,sort_order=excluded.sort_order,is_active=true;

with mappings(topic_slug,specialty_slug) as (
values
${topicMapValues}
)
insert into public.discovery_topic_specialties(topic_id,specialty_id)
select t.id,s.id
from mappings m
join public.discovery_topics t on t.slug=m.topic_slug
join public.specialties s on s.slug=m.specialty_slug
on conflict(topic_id,specialty_id) do nothing;

-- ------------------------------------------------------------
-- AMBULANCE RPC ACL HARDENING
-- Revoke inherited PUBLIC access and any direct anon default grant.
-- Public search is explicitly granted back below.
-- ------------------------------------------------------------
revoke execute on function public.is_verification_staff() from public,anon;
revoke execute on function public.is_ambulance_owner(uuid) from public,anon;
revoke execute on function public.can_edit_ambulance_documents(uuid) from public,anon;
revoke execute on function public.is_provider_owner(uuid) from public,anon;
revoke execute on function public.register_ambulance_service(
  text,text,text,text,text,text,text,text[],text,bigint,bigint,
  double precision,double precision,text,boolean,uuid
) from public,anon;
revoke execute on function public.update_my_ambulance_service(
  uuid,text,text,text,text,text,text,text,text[],text,bigint,bigint,
  double precision,double precision,text,boolean
) from public,anon;
revoke execute on function public.set_my_ambulance_availability(
  uuid,boolean,double precision,double precision,numeric
) from public,anon;
revoke execute on function public.request_ambulance_hospital_link(uuid,uuid)
from public,anon;
revoke execute on function public.respond_to_ambulance_hospital_link(uuid,uuid,text,text)
from public,anon;
revoke execute on function public.get_hospital_ambulance_link_requests(uuid,text)
from public,anon;
revoke execute on function public.get_ambulance_verification_queue(integer,integer)
from public,anon;
revoke execute on function public.set_ambulance_verification(uuid,text,text)
from public,anon;
revoke execute on function public.get_my_ambulance_services()
from public,anon;
revoke execute on function public.search_ambulances(
  bigint,bigint,text[],boolean,double precision,double precision,
  double precision,integer,integer
) from public,anon;

grant execute on function public.is_verification_staff()
to authenticated,service_role;
grant execute on function public.is_ambulance_owner(uuid)
to authenticated,service_role;
grant execute on function public.can_edit_ambulance_documents(uuid)
to authenticated,service_role;
grant execute on function public.is_provider_owner(uuid)
to authenticated,service_role;
grant execute on function public.register_ambulance_service(
  text,text,text,text,text,text,text,text[],text,bigint,bigint,
  double precision,double precision,text,boolean,uuid
) to authenticated,service_role;
grant execute on function public.update_my_ambulance_service(
  uuid,text,text,text,text,text,text,text,text[],text,bigint,bigint,
  double precision,double precision,text,boolean
) to authenticated,service_role;
grant execute on function public.set_my_ambulance_availability(
  uuid,boolean,double precision,double precision,numeric
) to authenticated,service_role;
grant execute on function public.request_ambulance_hospital_link(uuid,uuid)
to authenticated,service_role;
grant execute on function public.respond_to_ambulance_hospital_link(uuid,uuid,text,text)
to authenticated,service_role;
grant execute on function public.get_hospital_ambulance_link_requests(uuid,text)
to authenticated,service_role;
grant execute on function public.get_ambulance_verification_queue(integer,integer)
to authenticated,service_role;
grant execute on function public.set_ambulance_verification(uuid,text,text)
to authenticated,service_role;
grant execute on function public.get_my_ambulance_services()
to authenticated,service_role;
grant execute on function public.search_ambulances(
  bigint,bigint,text[],boolean,double precision,double precision,
  double precision,integer,integer
) to anon,authenticated,service_role;

-- ------------------------------------------------------------
-- SUPABASE STORAGE BUCKETS
-- Store only object paths in application tables, never provider-specific URLs.
-- ------------------------------------------------------------
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values
  ('avatars','avatars',true,3145728,array['image/jpeg','image/png','image/webp','image/avif']),
  ('public-images','public-images',true,5242880,array['image/jpeg','image/png','image/webp','image/avif']),
  ('verification-documents','verification-documents',false,10485760,
   array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict(id) do update
set name=excluded.name,public=excluded.public,
    file_size_limit=excluded.file_size_limit,
    allowed_mime_types=excluded.allowed_mime_types;

-- Object-name rules (bucket name is not part of storage.objects.name):
-- avatars bucket: {auth.uid()}/file.ext
-- public-images bucket: {auth.uid()}/file.ext
-- verification-documents bucket: ambulances/{ambulance_id}/file.ext
drop policy if exists "public_media_read" on storage.objects;
drop policy if exists "owner_public_media_read" on storage.objects;
create policy "owner_public_media_read"
on storage.objects for select to authenticated
using (
  bucket_id in ('avatars','public-images')
  and owner_id=(select auth.uid()::text)
);

drop policy if exists "owner_public_media_insert" on storage.objects;
create policy "owner_public_media_insert"
on storage.objects for insert to authenticated
with check (
  bucket_id in ('avatars','public-images')
  and (storage.foldername(name))[1]=auth.uid()::text
);

drop policy if exists "owner_public_media_update" on storage.objects;
create policy "owner_public_media_update"
on storage.objects for update to authenticated
using (
  bucket_id in ('avatars','public-images')
  and owner_id=auth.uid()::text
)
with check (
  bucket_id in ('avatars','public-images')
  and (storage.foldername(name))[1]=auth.uid()::text
);

drop policy if exists "owner_public_media_delete" on storage.objects;
create policy "owner_public_media_delete"
on storage.objects for delete to authenticated
using (
  bucket_id in ('avatars','public-images')
  and owner_id=auth.uid()::text
);

create or replace function public.is_verification_object_owner(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path=public,storage
as $$
declare
  parts text[];
  ambulance_uuid uuid;
begin
  parts:=storage.foldername(p_name);
  if coalesce(array_length(parts,1),0)<2 or parts[1]<>'ambulances' then
    return false;
  end if;
  ambulance_uuid:=parts[2]::uuid;
  return public.is_ambulance_owner(ambulance_uuid);
exception when invalid_text_representation then
  return false;
end;
$$;

create or replace function public.can_access_verification_object(p_name text)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select public.is_verification_object_owner(p_name)
         or public.is_verification_staff();
$$;

revoke all on function public.is_verification_object_owner(text) from public,anon;
revoke all on function public.can_access_verification_object(text) from public,anon;
grant execute on function public.is_verification_object_owner(text)
to authenticated,service_role;
grant execute on function public.can_access_verification_object(text)
to authenticated,service_role;

drop policy if exists "verification_documents_read" on storage.objects;
create policy "verification_documents_read"
on storage.objects for select to authenticated
using (
  bucket_id='verification-documents'
  and public.can_access_verification_object(name)
);

drop policy if exists "verification_documents_insert" on storage.objects;
create policy "verification_documents_insert"
on storage.objects for insert to authenticated
with check (
  bucket_id='verification-documents'
  and public.is_verification_object_owner(name)
);

drop policy if exists "verification_documents_delete" on storage.objects;
create policy "verification_documents_delete"
on storage.objects for delete to authenticated
using (
  bucket_id='verification-documents'
  and owner_id=auth.uid()::text
  and public.is_verification_object_owner(name)
);

-- ------------------------------------------------------------
-- REFERENCE-DATA HEALTH RPC
-- ------------------------------------------------------------
create or replace function public.get_reference_data_health()
returns jsonb
language sql
stable
security definer
set search_path=public
as $$
  select jsonb_build_object(
    'divisions',(select count(*) from public.divisions where is_active),
    'districts',(select count(*) from public.districts where is_active),
    'upazilas',(select count(*) from public.upazilas where is_active),
    'sirajganj_upazilas',(
      select count(*)
      from public.upazilas u
      join public.districts d on d.id=u.district_id
      where d.slug='sirajganj' and u.is_active
    ),
    'specialties',(select count(*) from public.specialties where is_active),
    'discovery_topics',(select count(*) from public.discovery_topics where is_active),
    'storage_buckets',(
      select count(*) from storage.buckets
      where id in ('avatars','public-images','verification-documents')
    )
  );
$$;

revoke all on function public.get_reference_data_health() from public,anon;
grant execute on function public.get_reference_data_health()
to authenticated,service_role;

-- ------------------------------------------------------------
-- FAIL-FAST MIGRATION ASSERTIONS
-- ------------------------------------------------------------
do $$
declare
  health jsonb;
begin
  health:=public.get_reference_data_health();
  if (health->>'divisions')::integer<8 then
    raise exception 'Step 11 failed: division seed incomplete';
  end if;
  if (health->>'districts')::integer<64 then
    raise exception 'Step 11 failed: district seed incomplete';
  end if;
  if (health->>'upazilas')::integer<495 then
    raise exception 'Step 11 failed: upazila seed incomplete';
  end if;
  if (health->>'sirajganj_upazilas')::integer<>9 then
    raise exception 'Step 11 failed: Sirajganj must have exactly 9 seeded upazilas';
  end if;
  if (health->>'specialties')::integer<26 then
    raise exception 'Step 11 failed: specialty seed incomplete';
  end if;
  if (health->>'discovery_topics')::integer<16 then
    raise exception 'Step 11 failed: discovery topic seed incomplete';
  end if;
  if (health->>'storage_buckets')::integer<>3 then
    raise exception 'Step 11 failed: storage bucket setup incomplete';
  end if;
end;
$$;

-- ============================================================
-- END STEP 11
-- ============================================================
`;

writeFileSync(outputFile, sql, 'utf8');
console.log(
  `Generated ${outputFile}: ${divisions.length} divisions, ${districts.length} districts, ${upazilas.length} upazilas, ${specialties.length} specialties, ${topics.length} topics`,
);
