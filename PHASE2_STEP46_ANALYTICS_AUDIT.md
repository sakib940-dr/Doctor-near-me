# Phase 2 — STEP 46 Doctor / Hospital Profile Analytics Audit

## Scope
STEP 46 expands the existing `profile_interactions` event architecture. It does **not** create a second analytics table and does not disable RLS. Canonical appointments, follows and structured reviews remain the source of truth for current totals.

## Events
Public interaction RPC accepts only visitor-facing, low-risk events:
- `profile_view`
- `call_click`
- `whatsapp_click`
- `appointment_click`
- `map_click`

Server-owned events are emitted only by validated mutation RPCs:
- `appointment_submitted` — successful `create_patient_appointment`
- `follow_gain` / `follow_loss` — existing STEP 42 `toggle_my_follow`
- `review_submitted` / `review_edited` — validated structured review upsert RPCs

## Dedupe / spam control
- Public events have an optional indexed `dedupe_key`.
- The browser uses an opaque random `sessionStorage` analytics session id; no IP/device fingerprint is collected.
- Profile views use a 30-minute target/session bucket and a DB unique index, so React re-renders/StrictMode do not create extra views.
- Click events use a 1.2-second in-memory rapid-click guard plus a 5-second DB bucket.
- Owner self-views/self-clicks are excluded from public Doctor/Provider engagement.
- Tracking is fire-and-forget, so `tel:`, WhatsApp, map and appointment navigation are not blocked.

## Canonical totals
- Appointment Requests: `appointments`
- Total Followers: `patient_follows`
- Total Reviews / Average Rating: valid published structured reviews joined to private authorship
- Views/clicks and event-history metrics: `profile_interactions`

This means current appointment/follower/review totals remain exact even if event history started later. Historical follow gain/loss before STEP 42 and review submit/edit before STEP 46 cannot be reconstructed.

## Owner / Admin analytics
Central internal function: `build_profile_analytics(doctor_id, provider_id, days)`.

Owner wrappers:
- `get_my_doctor_profile_analytics(days)`
- `get_my_provider_profile_analytics(provider_id, days)`

Admin wrapper:
- `admin_get_profile_analytics(doctor_id, provider_id, days)`

Supported periods in UI: 7 days, 30 days, all time. All-time trend uses monthly buckets; 7/30 use daily buckets.

## UI
New routes:
- `/doctor/analytics`
- `/provider/analytics`

Hospital/Chamber analytics includes an owned-provider selector. Dashboard cards show profile views, calls, WhatsApp, appointment clicks/requests, followers, reviews, map clicks and gain/edit activity, plus a compact trend chart using the existing Recharts dependency.

## Security
- No new analytics table.
- No RLS disable.
- Direct client `INSERT` into `profile_interactions` remains revoked.
- Anonymous/authenticated public RPC cannot emit follow/review/appointment-submitted event types.
- Doctor owner analytics is Doctor-only.
- Provider analytics requires exact ownership plus active Hospital/Chamber role.
- Admin aggregate access uses existing `is_admin_or_above()`.

## Changed files
- `src/App.tsx`
- `src/components/DashboardShell.tsx`
- `src/lib/analyticsClient.ts` (new)
- `src/pages/BookingPage.tsx`
- `src/pages/DashboardPage.tsx`
- `src/pages/DoctorProfile.tsx`
- `src/pages/ProfileAnalyticsPage.tsx` (new)
- `src/pages/ProviderWebsitePage.tsx`
- `src/pages/PublicProviderProfilePage.tsx`
- `src/services/engagement.ts`
- `src/services/profileAnalytics.ts` (new)
- `src/styles.css`
- `src/types.ts`
- `supabase/46_profile_analytics_expansion.sql` (new)
- `PHASE2_STEP46_ANALYTICS_AUDIT.md` (new)

## Validation
- TypeScript/TSX AST syntax parse: 77 files, 0 parse errors.
- Relative import scan: 0 missing.
- CSS braces balanced.
- Migrations 01–45 unchanged from STEP 45 baseline.
- STEP 46 creates no table and contains no RLS disable statement.
- Direct interaction inserts remain revoked; public server-owned event forgery remains blocked by RPC validation.
- Full dependency-backed npm build cannot be claimed in the local execution environment because dependency installation is unavailable/times out; Vercel build remains the final dependency-backed compile check.
