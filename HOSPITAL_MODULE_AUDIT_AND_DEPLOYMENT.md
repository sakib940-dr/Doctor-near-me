# Hospital Module Audit, Architecture and Deployment

## Scope boundary

The Hospital Console is isolated under `src/features/hospital`. Doctor, Patient, Visitor and Admin page/component implementations were not edited. `src/App.tsx` received additive Hospital-only routes. Existing canonical appointment tables/services were not rewritten.

## Existing architecture audit

### Routes and UI

- `/hospital-console`: Hospital operational dashboard.
- `/hospital-console/appointments`: reception-managed requests for Hospital-owned Doctor cards.
- `/hospital-console/doctors`: independent Hospital Doctor-card management.
- `/hospital-console/analytics`: existing provider profile analytics.
- `/hospital-console/public-profile`, `/information`, `/gallery`, `/services`, `/treatment-costs`, `/investigation-costs`: Hospital public content management.
- `/hospital-console/reception`, `/staff`, `/settings`, `/support`: Hospital operations.
- `HospitalShell.tsx`: role guard, header, drawer and bottom navigation.
- `HospitalDoctorCard.tsx`: visitor-facing vertical card, popup, contact fallback and reception appointment request.

### Data and Supabase access

- `providers`: Hospital identity, logo, reception phone/WhatsApp, address and verification state.
- `provider_slider_images`: top public-profile slider (public read; owner-managed via existing RLS).
- `provider_services`, `provider_treatment_costs`, `provider_investigation_costs`: public content.
- `provider_managed_doctor_cards`: Hospital-controlled Doctor directory, contact override and soft deletion.
- `provider_reception_appointments`: independent reception queue; it does not require a Doctor account.
- `hospital_staff_members`: Hospital-only internal staff directory through owner-checked RPCs.
- `public-images`: public optimized image storage. Master and thumbnail paths are owner-prefixed.

### Security baseline

- `is_my_active_hospital(provider_id)` verifies provider ownership, provider type, Hospital role and active account.
- Hospital Doctor/staff writes use SECURITY DEFINER RPCs; direct staff-table mutation is revoked.
- Public Doctor-card reads require a publicly listable verified Hospital.
- Doctor-photo paths must begin with the authenticated Hospital owner's UUID.
- Gallery/content RLS requires provider ownership; public reads require approved/verified provider content.

### Audit findings

- The old drawer and dashboard repeated destinations already present in primary navigation.
- Bottom navigation contained four items, not the requested five.
- Gallery used the correct `provider_slider_images` table and public slider read path, but an explicitly recoverable Hospital gallery bucket/policy contract was missing from the latest Hospital migration.
- Doctor support tables/functions were role-locked to Doctor accounts and could not safely be reused for Hospital accounts.
- Hospital onboarding state was not presented as an eight-step persistent checklist.

## Implemented architecture

- Five bottom items: Dashboard, Appointments, Doctors, Analytics and Profile Preview.
- Categorized drawer with the requested Hospital Profile, Content, Reception, Staff, Communication and Settings sections.
- Dashboard navigation duplicates removed; dashboard now shows operational metrics and onboarding readiness.
- Appointment views: Today, Upcoming, All, Accepted and Rejected.
- Eight-step onboarding progress is derived from saved provider/content data, so refresh does not clear completion.
- Four fixed gallery slots use `provider_slider_images`, which is already consumed as the public Hospital top slider.
- Gallery upload/replace/delete has friendly errors and success states.
- Doctor deletion is a safe soft delete: it disappears from the directory while historical appointments remain intact.
- Hospital support uses new isolated `hospital_support_threads` and `hospital_support_messages` tables and owner/admin RPCs. Existing Doctor support is untouched.
- Hospital Security page updates the current Hospital user's Supabase Auth password.

## Step 82 database change

Run `supabase/82_hospital_premium_completion.sql` after Step 81. It:

1. Ensures the `public-images` bucket exists and enforces the 5 MB image/MIME contract.
2. Adds narrow Hospital-owner policies for `{user}/{provider}/website/slider/*` insert/delete.
3. Enforces a maximum of four Hospital slider rows.
4. Adds isolated Hospital support tables with RLS enabled and all direct authenticated table access revoked.
5. Adds Hospital-owner RPCs for conversation list, history, create and send.
6. Adds Admin-authorized RPCs for list, reply and status update without changing Admin UI files.

## Deployment order

1. Back up the Supabase project.
2. Run all previously required migrations through Step 81 if not already applied.
3. Run `supabase/82_hospital_premium_completion.sql` in Supabase SQL Editor.
4. Confirm the final notice: `STEP 82 HOSPITAL PREMIUM COMPLETION PASSED`.
5. Deploy the source ZIP to Vercel with the existing Supabase environment variables.
6. Sign in as a Hospital account and test gallery upload, Doctor CRUD, appointments, onboarding, password update and Admin support.

## Known scope boundary

Step 82 provides the Admin-authorized Hospital support reply/status RPCs. The Admin Module UI was intentionally not edited because the requested safety boundary forbids Admin Module changes. An Admin UI can call these RPCs in a separately authorized Admin-module phase.
