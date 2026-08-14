# Sirajganj Doctor Platform — সম্পূর্ণ Project Handoff Summary

শেষ আপডেট: ১৪ আগস্ট ২০২৬  
বর্তমান frontend release: `0.22.0`  
বর্তমান completed frontend milestone: Step 22  
সর্বশেষ database migration: `supabase/21_super_admin_control_center.sql`

এই ফাইলের উদ্দেশ্য হলো—নতুন কোনো Codex/ChatGPT account, developer বা team member
শুধু project folder ও এই summary পেলেই যেন আগের কাজ পুনরায় না করে সরাসরি পরবর্তী
development শুরু করতে পারে।

---

## ১. নতুন developer/agent প্রথমে কী করবে

1. এই `PROJECT_HANDOFF_SUMMARY.md` পুরোটা পড়বে।
2. মূল master plan পড়বে:
   `C:\Users\Dhaka Technology\Downloads\DOCTOR_PLATFORM_FEATURE_PLAN.md`
3. `README.md`, সর্বশেষ `docs/STEP22.md`, এবং `docs/LIVE_TESTING.md` পড়বে।
4. `package.json` দেখে current version ও scripts যাচাই করবে।
5. Supabase-এ কোন migration পর্যন্ত চালানো হয়েছে তা database/SQL history থেকে
   যাচাই করবে—কথোপকথনের ভিত্তিতে latest migration applied ধরে নেবে না।
6. Code পরিবর্তনের আগে চালাবে:

   ```powershell
   npm.cmd install
   npm.cmd run typecheck
   npm.cmd run build
   ```

7. Completed feature আবার rebuild করবে না। নতুন কাজ master plan-এর remaining
   scope থেকে এবং user-এর বর্তমান priority অনুযায়ী করবে।

### নতুন agent-কে দেওয়ার সংক্ষিপ্ত prompt

```text
এই project-এর PROJECT_HANDOFF_SUMMARY.md এবং DOCTOR_PLATFORM_FEATURE_PLAN.md
আগে সম্পূর্ণ পড়ো। Existing Step 22 functionality বা Admin features duplicate
করবে না। Supabase migration state যাচাই করো, typecheck/build চালাও, তারপর
remaining scope-এর requested next slice implement করো। Security invariants,
RPC-only mutations, RLS, audit logs এবং role boundaries অপরিবর্তিত রাখো।
```

---

## ২. Project-এর লক্ষ্য

বাংলাদেশ-কেন্দ্রিক, বাংলা-প্রথম healthcare discovery এবং operations platform।
প্রধান ব্যবহার:

- রোগী Doctor খুঁজবে, profile দেখবে এবং verified schedule-এ appointment করবে।
- Doctor নিজের professional profile, প্রতিষ্ঠান link, schedule ও appointment
  পরিচালনা করবে।
- Hospital/Chamber নিজের profile, Doctor invitation/link, schedule এবং reception
  appointment queue পরিচালনা করবে।
- Ambulance owner listing, private verification documents, availability/GPS এবং
  Hospital affiliation পরিচালনা করবে।
- Verification Officer শুধু submitted data/evidence review করে approve/reject করবে।
- Admin দৈনন্দিন operations, user status, appointment dispute এবং CMS দেখবে।
- একমাত্র Super Admin privileged roles, sensitive user data, exact last location,
  account deletion এবং full audit authority পাবে।

বর্তমান design mobile-first, role-based, Supabase-backed এবং Vercel deployable।

---

## ৩. Tech stack

### Frontend

- React `19.2.x`
- TypeScript `7.0.x`, strict mode
- Vite `8.2.x`
- React Router `7.18.x`
- Supabase JS `2.112.x`
- Lucide React icons
- Tailwind Vite plugin আছে; অধিকাংশ custom styling `src/styles.css`-এ
- SPA rewrite-এর জন্য `vercel.json`

### Backend

- Supabase Postgres
- Supabase Auth
- Supabase Storage
- Row Level Security (RLS)
- `SECURITY DEFINER` RPC-based mutation model
- Postgres enums, triggers, indexes, notifications এবং audit tables

### বর্তমান architecture

```text
Browser React UI
  ├─ src/pages/*                 Route-level UI
  ├─ src/services/*              Supabase RPC/storage calls
  ├─ src/contexts/AuthContext    Session + account context
  ├─ src/lib/supabase.ts         Browser client (publishable/anon key only)
  └─ src/types.ts                Shared TypeScript contracts
             │
             ▼
Supabase
  ├─ Auth users
  ├─ public schema tables + RLS
  ├─ SECURITY DEFINER RPCs
  ├─ Storage buckets/policies
  ├─ notifications
  └─ admin_audit_logs
```

কোনো service-role key frontend-এ রাখা হয়নি এবং রাখা যাবে না।

---

## ৪. Project structure

```text
sirajganj-doctor-production-step8/
├─ src/
│  ├─ App.tsx                    Public homepage + all routes
│  ├─ main.tsx
│  ├─ styles.css                 Shared and role dashboard styling
│  ├─ types.ts                   All frontend domain types
│  ├─ components/
│  │  ├─ DoctorResultCard.tsx
│  │  ├─ ProtectedRoute.tsx
│  │  └─ PublicHeader.tsx
│  ├─ contexts/AuthContext.tsx
│  ├─ lib/
│  │  ├─ storage.ts
│  │  └─ supabase.ts
│  ├─ pages/                     22 route-level page components
│  └─ services/                  Role/domain-specific Supabase calls
├─ supabase/                     Ordered SQL migrations 01–21 + 11b
├─ tests/step11_smoke.sql
├─ docs/STEP8.md ... STEP22.md
├─ docs/LIVE_TESTING.md
├─ scripts/generate_step11_reference_data.mjs
├─ .env.example
├─ package.json
├─ vercel.json
└─ vite.config.ts
```

---

## ৫. Role model

Database enum `public.user_role`:

- `patient`
- `doctor`
- `chamber`
- `hospital`
- `ambulance`
- `verification_officer`
- `admin`
- `super_admin`

Account status:

- `active`
- `suspended`
- `banned`

Verification/provider status:

- Doctor: `pending`, `approved`, `rejected`, `expired`
- Provider/Ambulance: `pending`, `approved`, `rejected`, `suspended`

### Role boundaries

| Role | প্রধান ক্ষমতা | নিষেধাজ্ঞা |
|---|---|---|
| Patient | Profile, Doctor search, appointment booking/cancel | অন্যের private data বা status edit নয় |
| Doctor | Professional profile, evidence, invitations, schedule, appointments | অন্য Doctor/Provider profile edit নয় |
| Hospital/Chamber | Provider profile, Doctor consent link, schedules, appointments | Doctor personal profile edit নয় |
| Ambulance | Listing, evidence, availability/GPS, Hospital link | Approval ছাড়া public/available নয় |
| Verification Officer | Read-only review + approve/reject/note | Profile edit, Admin/CMS access নয় |
| Admin | Operations, safe user suspend/restore, appointment override, verification, CMS | Role change, privileged account control, banned restore নয় |
| Super Admin | Full user directory, sensitive detail/location, roles, invites, status, deletion, full audit | নিজের role/status/delete নয়; দ্বিতীয় Super Admin নয় |

Public registration-এ privileged roles কখনো দেখানো হয় না।

---

## ৬. বর্তমান frontend routes

### Public

- `/` — বাংলা-first homepage, Doctor/Ambulance discovery
- `/doctors` — advanced Doctor directory/filter
- `/doctors/:doctorId` — approved Doctor public profile
- `/auth` — login/public registration/password reset

### Authenticated common/Patient

- `/onboarding` — supported public-role onboarding
- `/dashboard` — role-aware dashboard launcher
- `/profile` — Patient profile
- `/appointments` — Patient appointments
- `/doctors/:doctorId/book` — exact verified schedule booking

### Doctor

- `/doctor/profile`
- `/doctor/schedules`
- `/doctor/appointments`
- `/doctor/invitations`
- `/verification/evidence`

### Hospital/Chamber

- `/provider/profile`
- `/provider/doctors`
- `/provider/appointments`
- `/provider/ambulances` — Hospital-only Ambulance link review
- `/verification/evidence`

### Ambulance

- `/ambulance/services`
- `/ambulance/hospitals`

### Verification/Admin/Super Admin

- `/verification/reviews`
- `/admin`
- `/admin/cms`
- `/super-admin`

Unknown routes homepage-এ redirect হয়। `ProtectedRoute` authentication দেখে;
প্রতিটি privileged page নিজের role guard-ও প্রয়োগ করে।

---

## ৭. Completed functionality

### Public discovery

- Homepage configuration Supabase থেকে আসে।
- Discovery Topics ও Specialty mapping আছে।
- 64 districts এবং reference data seed আছে।
- Doctor search: name, location, Specialty, degree, designation, fee, availability,
  sort এবং pagination-ready RPC shape।
- Public Doctor profile শুধু approved Doctor, approved Provider link এবং active
  schedule ফেরত দেয়।
- Ambulance search শুধু approved, verified এবং optionally available records দেয়;
  distance দেখাতে পারে কিন্তু exact live coordinates public করে না।

### Authentication/onboarding

- Email/password Supabase Auth।
- Session persistence এবং refresh।
- Public roles: Patient, Doctor, Hospital, Ambulance।
- Doctor registration pending verification হয়।
- Privileged roles browser metadata দিয়ে self-assign করা যায় না।
- Super Admin privileged invitation exact email match করে Auth trigger থেকে
  Admin/Verification Officer role দেয়।

### Patient ও appointment

- Patient personal/location/emergency profile।
- Approved Doctor + approved Provider + active exact schedule ছাড়া booking নয়।
- Duplicate active booking block।
- Patient cancellation দুই ধাপের confirmation।
- Doctor/Provider role-based appointment processing।
- Server-side allowed status transition enforcement।
- Admin reason-required dispute override।

### Doctor

- Full professional profile: title, degree, designation, BMDC, bio, fee,
  experience, language, photo, location, appointment preference।
- Credential change হলে verification আবার pending।
- Evidence: BMDC, degree, NID ইত্যাদি private bucket-এ।
- Provider invitations accept/reject।
- Approved/verified link ছাড়া schedule editable নয়।
- Appointment queue এবং valid status transitions।

### Hospital/Chamber

- Provider profile: bilingual name, description, contacts, website/social,
  address/map, departments, services, emergency, logo/banner/gallery।
- Core identity/location change হলে re-verification।
- Approved Doctor search ও consent-based invitation।
- Doctor accept না করা পর্যন্ত link pending।
- Provider-level schedule এবং reception appointment workflow।
- Link remove হলে schedules inactive।
- Hospital Ambulance affiliation request review।

### Ambulance

- One listing per Ambulance account।
- Vehicle/contact/capability/location/service data।
- Private verification documents এবং signed URLs।
- Approved+verified না হলে availability/GPS চালু করা যায় না।
- Profile edit/rejection হলে availability off।
- Approved Hospital search এবং consent-based affiliation।
- Public result exact current coordinates ফেরত দেয় না।

### Verification Officer

- Doctor/Provider/Ambulance unified oldest-first queue।
- Entity/status filters।
- Submitted data read-only।
- Private evidence signed URL-এ দেখা।
- Approve/reject দুই ধাপের confirmation।
- Reject reason বাধ্যতামূলক।
- Owner notification এবং audit log।
- Verification Officer Admin/CMS/user-directory authority পায় না।

### Admin operations

- User/service/verification/appointment overview counts।
- Operational user directory search/filter।
- Non-privileged account suspend/restore।
- Admin নিজেকে বা Admin/Super Admin account control করতে পারে না।
- Banned restore Super Admin-only।
- Appointment search এবং reason-required override।
- Admin নিজের activity দেখে; Super Admin full trail দেখে।
- Verification queue shortcut।

### Admin CMS/reference

- Specialty add/edit/order/active।
- Discovery Topic add/edit/keyword/Specialty mapping/order/active।
- Homepage Section add/edit/filter JSON/path/card limit/order/active।
- Banner image upload, district targeting, schedule, order, active।
- About/Terms/Privacy/FAQ/Help bilingual draft/publish।
- `public_brand`, `social_links`, `default_location` public JSON settings।
- Direct authenticated CMS table mutation revoked; audited RPC-only writes।

### Super Admin

- Database-level maximum one Super Admin partial unique index।
- Full user list: name, email, phone, role, status, address এবং timestamps।
- Name/email/phone search।
- Role/status/district/upazila combined filters।
- User popup: complete Profile, safe Auth timestamps, Doctor/Provider/Ambulance/
  Blood donor data, appointment counts/history, target audit history।
- Exact last recorded location ও Google Maps link; detail access নিজেই audit হয়।
- Reason-required name/phone/address/location/profile correction।
- Auth email/password read-only রাখা হয়েছে—browser/SQL দিয়ে unsafe Auth identity
  modification করা হয়নি।
- Existing user promote/demote: Admin, Verification Officer এবং অন্যান্য
  non-Super-Admin roles।
- Role change করলে incompatible public resources নিরাপদভাবে pending/rejected/
  suspended এবং unavailable হয়।
- Active/suspended/banned transitions।
- New Admin/Verification Officer time-limited invitation।
- Permanent deletion: reason + exact typed text + second confirmation;
  self-delete এবং Super Admin delete block।
- Existing Admin, Verification ও CMS tool duplicate না করে shortcut।

---

## ৮. Database migration order

Fresh/staging Supabase project-এ exact order:

```text
01_foundation.sql
02_location_core.sql
03_doctor_directory.sql
04_doctor_chamber_profile.sql
05_patient_role_blood_foundation.sql
06_role_dashboard_appointments_location.sql
07_notifications_rbac.sql
08_blood_request_matching.sql
09_homepage_discovery_cms.sql
10_ambulance_directory_verification.sql
11_reference_data_storage.sql
11b_rpc_acl_hardening.sql
12_public_doctor_profile_security.sql
13_auth_onboarding_security.sql
14_patient_appointment_security.sql
15_doctor_dashboard_security.sql
16_provider_dashboard_security.sql
17_ambulance_dashboard_security.sql
18_verification_officer_dashboard.sql
19_admin_operations_dashboard.sql
20_admin_cms_security.sql
21_super_admin_control_center.sql
```

### Migration responsibilities

| SQL | কাজ |
|---|---|
| 01 | Core enums, profiles, Doctors, Providers, links, schedules, locations, appointments, notifications, audit, baseline RLS |
| 02 | Location distance helpers/core |
| 03 | Doctor/Provider public directory indexes/views |
| 04 | Production Doctor/Chamber profile layer এবং early Super Admin functions |
| 05 | Patient extensions, Blood donor/request foundation |
| 06 | Role dashboard, appointment/location RPCs |
| 07 | Notification/RBAC hardening, Admin directory/verification foundation |
| 08 | Blood request matching + notification engine |
| 09 | Homepage discovery topics, sections, banners, content, settings |
| 10 | Ambulance directory, verification, availability, Hospital links |
| 11 | Bangladesh reference data, Storage buckets/policies, self-checks |
| 11b | Anonymous RPC ACL hotfix |
| 12 | Public Doctor profile security fix |
| 13 | Secure Auth trigger ও self-onboarding |
| 14 | Patient profile/appointment hardening |
| 15 | Doctor self-service security |
| 16 | Hospital/Chamber dashboard security |
| 17 | Ambulance self-service security |
| 18 | Unified Verification Officer workflow/evidence |
| 19 | Admin operations/user status/appointment override/activity |
| 20 | Admin CMS audited mutation RPCs এবং direct DML revoke |
| 21 | Single-owner Super Admin, full directory/detail/location, invites, roles, deletion |

### গুরুত্বপূর্ণ numbering note

Frontend milestone Step 22-এর সর্বশেষ migration হলো SQL Step 21। কারণ frontend
foundation Step 12 থেকে শুরু হওয়ায় documentation milestone এবং SQL migration
number এক ধাপ আলাদা দেখা যেতে পারে। File order-ই authoritative।

### Existing database হলে

- Supabase SQL history/known result দেখে শেষ applied file নির্ধারণ করুন।
- Latest SQL applied নিশ্চিত নয়—বিশেষ করে `19`, `20`, `21` codebase-এ আছে বলে
  database-এ চালানো হয়েছে ধরে নেবেন না।
- Missing migration filename order-এ চালান।
- `21` চালানোর আগে zero বা one Super Admin থাকতে হবে; একাধিক থাকলে migration
  ইচ্ছাকৃতভাবে থেমে যাবে।

Expected latest result:

```text
STEP 21 SUPER ADMIN SECURITY PASSED
```

---

## ৯. Main database entities

### Identity/location

- `profiles`
- `divisions`, `districts`, `upazilas`
- `user_current_locations`, `user_locations`

### Doctor/Provider

- `doctors`
- `specialties`, `doctor_specialties`
- `providers`
- `doctor_provider_links`
- `chamber_schedules`

### Appointment/notification/audit

- `appointments`
- `notifications`
- `admin_audit_logs`
- `referral_codes`, `referrals`

### Blood foundation

- `blood_donor_profiles`
- `blood_requests`
- `blood_request_responses`

Database engine/matching আছে; complete Blood Request frontend এখনো নেই।

### Ambulance

- `ambulance_services`
- `ambulance_availability`
- `ambulance_verification_documents`
- `ambulance_hospital_links`

### Verification

- `entity_verification_documents` — Doctor/Provider evidence
- Ambulance evidence আলাদা table-এ

### CMS/discovery

- `discovery_topics`
- `discovery_topic_specialties`
- `homepage_sections`
- `homepage_banners`
- `content_pages`
- `site_settings`

### Privileged access

- `privileged_account_invites`

---

## ১০. Security invariants—পরবর্তী developer অবশ্যই বজায় রাখবে

1. Browser-এ কখনো service-role key নয়।
2. Public registration থেকে `admin`, `verification_officer`, `super_admin` নয়।
3. Sensitive mutation direct table grant দিয়ে নয়; validated audited RPC দিয়ে।
4. RLS থাকলেও RPC-এর ভেতরে explicit role/account-status check বজায় রাখতে হবে।
5. Public Doctor/Provider/Ambulance শুধু approved/verified/active হলে দেখা যাবে।
6. Verification Officer submitted data edit করবে না।
7. Rejection, suspension, role change, override এবং deletion reason-required।
8. Destructive actions দুই ধাপ confirmation।
9. Exact live/current location public response-এ নয়।
10. Sensitive Super Admin detail view audit করতে হবে।
11. একমাত্র Super Admin নিজের role/status/delete করতে পারবে না।
12. দ্বিতীয় Super Admin database unique index দিয়ে block।
13. Auth password, encrypted password, tokens বা service secrets কখনো RPC/UI-তে
    ফেরত দেওয়া যাবে না।
14. Auth email login identity এই browser UI থেকে edit করা হয় না। ভবিষ্যতে দরকার
    হলে server-side Admin API/Edge Function এবং re-verification flow ব্যবহার করতে হবে।
15. Private evidence শুধু signed URL এবং ownership/staff policy দিয়ে।
16. User-supplied Storage path entity ownership/status দিয়ে validate করতে হবে।
17. Role demotion/suspension হলে incompatible public resources ও Ambulance
    availability বন্ধ করতে হবে।
18. Existing audit logs destructive cleanup করা যাবে না।

---

## ১১. Storage model

Buckets:

- `avatars` — public, default 3 MB
- `public-images` — public, Provider/CMS images; latest limit at least 6 MB
- `verification-documents` — private, 10 MB, image/PDF

Path conventions:

- Avatar/public user media: `{auth.uid()}/...`
- Admin banner: `{auth.uid()}/cms/banners/{uuid}.{ext}`
- Doctor verification: `doctors/{doctor_id}/...`
- Provider verification: `providers/{provider_id}/...`
- Ambulance verification: `ambulances/{ambulance_id}/...`

Storage metadata path database-এ রাখা হয়; provider-specific public URL নয়।

---

## ১২. Local setup

### Environment

`.env.example` copy করে `.env.local` বানান:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
# অথবা legacy project হলে:
# VITE_SUPABASE_ANON_KEY=YOUR_LEGACY_ANON_KEY
```

### Commands

```powershell
npm.cmd install
npm.cmd run dev
```

Local URL:

```text
http://127.0.0.1:5173/
```

Quality checks:

```powershell
npm.cmd run typecheck
npm.cmd run build
npm.cmd run preview -- --host 127.0.0.1 --port 4173
```

### Vercel

1. Repository/ZIP contents upload করুন।
2. Vercel project environment variables-এ URL এবং publishable key দিন।
3. Build command: `npm run build`
4. Output: `dist`
5. `vercel.json` সব SPA route `/index.html`-এ rewrite করে।

Latest clean archive at handoff time:

```text
sirajganj-doctor-step22-super-admin-control-vercel-ready.zip
```

Archive-এ `node_modules`, `dist`, `.git`, `.env.local` বা পুরোনো ZIP নেই।

---

## ১৩. Super Admin bootstrap

Public registration দিয়ে Super Admin করা যাবে না। Supabase Authentication-এ
fresh user add করে Auto Confirm চালু করুন, তারপর SQL Editor-এ:

```sql
do $$
declare
  target_user_id uuid;
begin
  if exists(select 1 from public.profiles where role='super_admin') then
    raise exception 'একজন Super Admin ইতোমধ্যে রয়েছে';
  end if;

  select id into target_user_id
  from auth.users
  where lower(email)=lower('YOUR_SUPER_ADMIN_EMAIL');

  if target_user_id is null then
    raise exception 'এই email-এর Auth user পাওয়া যায়নি';
  end if;

  update public.profiles
  set role='super_admin',account_status='active',profile_completed=true,
      full_name=coalesce(nullif(full_name,''),'Super Admin'),updated_at=now()
  where id=target_user_id;
end;
$$;
```

Verify:

```sql
select id,full_name,email,role,account_status,profile_completed
from public.profiles where role='super_admin';
```

তারপর logout/login করে `/super-admin` খুলুন।

---

## ১৪. Testing state

Current release-এ নিচের local checks pass করেছে:

- `npm.cmd run typecheck`
- `npm.cmd run build`
- Vite production route smoke:
  - `/`
  - `/dashboard`
  - `/super-admin`
  - `/admin`
  - privileged registration URL
- Latest clean ZIP required-file validation pass

SQL migrations local Postgres CLI দিয়ে execute করা হয়নি, কারণ workspace-এ linked
Supabase CLI/DB credentials ছিল না। SQL files static-reviewed এবং self-assertion
blocks আছে; staging Supabase-এ user-কে run করে expected result যাচাই করতে হবে।

Full manual checklist:

```text
docs/LIVE_TESTING.md
```

Reference smoke test:

```text
tests/step11_smoke.sql
```

Staging-এ শুধু fictional data ব্যবহার করবেন। Real NID, medical documents,
patient data বা exact private location দিয়ে test করবেন না।

---

## ১৫. গুরুত্বপূর্ণ implementation decisions

- Owner self-service এবং privileged operations আলাদা RPC surface।
- Provider–Doctor relation consent-based; Provider একতরফা Doctor personal
  profile control পায় না।
- Verification evidence public bucket-এ নয়।
- Credential/core identity change re-verification trigger করে।
- Appointment arbitrary payload নয়; verified schedule exact match করে।
- Ambulance availability verification status-এর সাথে server-side bound।
- CMS records delete না করে inactive/unpublished করা হয়, যাতে recoverable থাকে।
- Permanent user delete শুধু Super Admin এবং pre-deletion audit snapshotসহ।
- Privileged নতুন account browser service key ছাড়া invitation + exact-email Auth
  trigger দিয়ে তৈরি হয়। Super Admin password জানে/তৈরি করে না।
- Admin-equivalent features Super Admin dashboard-এ duplicate করা হয়নি; links আছে।

---

## ১৬. Known limitations / paused work

এগুলোকে completed ধরে নেওয়া যাবে না:

### High-value remaining product work

- Blood donor/request সম্পূর্ণ frontend ও role workflow—database foundation এবং
  matching engine আছে, UI নেই।
- In-app Notification inbox UI, realtime update, push/PWA notification।
- Admin targeted broadcast tool (role/location filter)।
- Public Hospital/Chamber directory এবং dedicated public Provider profile route।
- Dedicated public Ambulance directory/detail route; homepage search আছে।
- Doctor/Hospital analytics এবং platform analytics।
- PWA manifest, service worker, offline/installation flow।
- Contextual Bangla help, walkthrough এবং per-role guide UI।

### Larger future modules

- Doctor/Hospital/Chamber website request + Website Builder/CMS + publishing।
- Review/rating/moderation system।
- Referral/growth frontend।
- Subscription/billing/monetization feature gates।
- SMS/WhatsApp/email operational integrations।
- Cloudflare R2 migration/integration।
- Data export, backup UI এবং deeper system settings।
- Extended automated unit/integration/E2E tests।

### Existing Admin master-plan gaps

User সর্বশেষ নির্দেশনায় Admin-এর already-capable feature duplicate না করে আগে
Super Admin-only কাজ শেষ করতে বলেছেন। তাই নিচের Admin enhancements এখনো future:

- Arbitrary Doctor/Provider profile override editor
- Admin manual Ambulance creation
- District/Upazila reference editor
- Degree/designation master tables/editors
- Advanced traffic/search analytics

User পুনরায় priority না দিলে এগুলো নিজের থেকে শুরু করবেন না।

### Auth identity limitation

- Super Admin popup email/password দেখায় না বা edit করে না।
- Email read-only display হয়।
- ভবিষ্যৎ email change অবশ্যই secure server-side Supabase Admin API/Edge Function,
  confirmation এবং audit দিয়ে implement করতে হবে।

---

## ১৭. Suggested next development order

User-এর সর্বশেষ priority: Super Admin-only কাজ আগে শেষ, Admin duplicate নয়। সেটা
Step 22-এ complete। এখন নতুন user নির্দেশ ছাড়া বড় module শুরু করবেন না। User
`next` বললে practical order:

1. Blood Request/Donor frontend—কারণ backend foundation আগে থেকেই আছে।
2. Notification inbox + Admin targeted broadcast।
3. Public Hospital/Chamber directory/profile।
4. PWA + push notification।
5. Analytics।
6. Website Builder/CMS premium module।

প্রতিটি নতুন slice-এর নিয়ম:

1. Master plan scope পড়ুন।
2. Existing DB/RPC reuse করুন।
3. Missing security migration আলাদা numbered SQL-এ দিন।
4. UI + service + types + route + dashboard navigation যোগ করুন।
5. RLS/RPC ACL self-assertion যোগ করুন।
6. Typecheck/build/production route smoke চালান।
7. `README`, `docs/STEPxx.md`, `docs/LIVE_TESTING.md`, package version update করুন।
8. Clean Vercel-ready ZIP তৈরি করুন।

---

## ১৮. Development conventions

- File edits `apply_patch` দিয়ে করা হয়েছে।
- TypeScript strict এবং unused variables error।
- Frontend service functions `src/services`-এ domain অনুযায়ী রাখুন।
- Shared return/input contracts `src/types.ts`-এ রাখুন।
- Page-level role guard অবশ্যই রাখুন; শুধু hidden navigation security নয়।
- SQL function-এ explicit `search_path`, `SECURITY DEFINER`, role check এবং ACL দিন।
- New RPC-এর default PUBLIC execute revoke করুন।
- Anonymous/public RPC safe explicit return shape ছাড়া raw private table expose করবে না।
- User-facing UI বাংলা-first; technical terms প্রয়োজন হলে English রাখা হয়েছে।
- Mobile responsive CSS যোগ করুন।
- Delete-এর চেয়ে deactivate/archive prefer করুন; সত্যিকারের delete হলে typed
  confirmation, reason, audit এবং exact target validation লাগবে।

---

## ১৯. Handoff completion checklist

নতুন account/team কাজ শুরু করার আগে নিশ্চিত করবে:

- [ ] `PROJECT_HANDOFF_SUMMARY.md` পড়া হয়েছে
- [ ] Master plan পড়া হয়েছে
- [ ] Supabase migration history যাচাই হয়েছে
- [ ] Missing migrations filename order-এ applied
- [ ] Latest expected SQL result pass
- [ ] `.env.local` configured, service-role key নেই
- [ ] `npm.cmd run typecheck` pass
- [ ] `npm.cmd run build` pass
- [ ] Super Admin exactly one
- [ ] Role test accounts fictional/staging
- [ ] Existing feature duplicate করা হচ্ছে না
- [ ] নতুন scope-এর security/RLS/audit plan নির্ধারিত

---

## ২০. Current authoritative files

- Master product plan: `DOCTOR_PLATFORM_FEATURE_PLAN.md` (Downloads folder)
- Complete handoff: `PROJECT_HANDOFF_SUMMARY.md`
- Current release overview: `README.md`
- Latest implementation guide: `docs/STEP22.md`
- Full manual test order: `docs/LIVE_TESTING.md`
- Latest security migration: `supabase/21_super_admin_control_center.sql`
- App route map: `src/App.tsx`
- Role launch cards: `src/pages/DashboardPage.tsx`
- Database/domain contracts: `src/types.ts`
- Super Admin UI: `src/pages/SuperAdminPage.tsx`
- Super Admin API client: `src/services/superAdmin.ts`

এই summary তৈরির সময় project version `0.22.0`; typecheck/build pass এবং Step 22
Vercel-ready archive validated ছিল।
