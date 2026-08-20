# Phase 2 STEP 48 — Global Public Language, Lean Search, Rating-only Reviews, Premium Auth

## Baseline preserved
- Built on `docbd_info_PHASE2_STEP47_VERCEL_BUILD_FIX.zip`.
- Existing migrations through STEP 47 are unchanged.
- Existing Doctor/Hospital public profile redesigns, Follow/Save, ranking, analytics, appointments, Blood Bank, GPS/distance and RLS architecture are preserved.

## Global public language switch
- Added `VisitorLanguageContext` with Bengali default and a persisted visitor preference.
- `PublicHeader` now owns the compact `বাংলা | EN` control on the right side.
- Doctor Details, Hospital Details and Provider Website consume this global language state.
- Their page-local language switches were removed so there is one public language control rather than duplicate controls.
- Storage failures fall back safely to Bengali.

## WhatsApp appointment prefill
- Added the shared `buildWhatsAppAppointmentUrl` helper.
- Public Doctor/Hospital WhatsApp actions and Hospital common Doctor-card WhatsApp actions use it.
- Message is URL-encoded and starts with salam, identifies the user as a patient coming from `docbd.info`, and requests an appointment.
- Existing click analytics remain attached; the actual WhatsApp action/navigation is not blocked by analytics.

## Patient reviews: rating-only mode
- `StructuredReviewSection` keeps the five structured 1–5 ratings and removes Patient free-text input/display.
- Migration 48 keeps the legacy `p_comment` RPC argument for backward compatibility but ignores it and stores `NULL`.
- Existing historical Patient comments are not deleted, but public/my-review read RPCs return no Patient comment while rating-only mode is active.
- One Patient = one Doctor/Hospital review and existing edit, moderation, analytics, authorship and RLS rules remain intact.
- Provider-authored legacy testimonials are intentionally separate and remain supported.

## Lean Doctor Search / egress control
- `/doctors?advanced=1` opens the filters without loading Doctor result rows.
- A name/query or at least one real filter must be present before the frontend calls `search_doctors_advanced`.
- Migration 48 repeats that guard server-side so stale/old clients cannot trigger a blank full-directory read.
- Search result RPC is hard-capped to 20 rows per page; frontend pagination is also exactly 20/page.
- Ranking remains centralized and unchanged.

## Premium Auth page
- Existing Supabase Auth implementation remains unchanged internally.
- User-visible technical Supabase/RLS implementation copy is removed.
- Login/register layout is more compact/premium and keeps phone+email architecture and existing role flows.
- Registration shows compact copy for the selected Patient/Doctor/Hospital/Ambulance role.
- Login shows compact Patient/Doctor/Hospital capability cues beneath the form.

## Files changed
- `src/main.tsx`
- `src/contexts/VisitorLanguageContext.tsx` (new)
- `src/components/PublicHeader.tsx`
- `src/lib/whatsapp.ts` (new)
- `src/pages/DoctorProfile.tsx`
- `src/pages/PublicProviderProfilePage.tsx`
- `src/pages/ProviderWebsitePage.tsx`
- `src/pages/ProviderDoctorsPublicPage.tsx`
- `src/components/StructuredReviewSection.tsx`
- `src/components/ProviderWebsiteContentTabs.tsx`
- `src/pages/DoctorDirectory.tsx`
- `src/services/discovery.ts`
- `src/pages/AuthPage.tsx`
- `src/styles.css`
- `supabase/48_global_language_search_rating_only.sql` (new)

## Validation
- 81 TS/TSX source files parse: 0 syntax errors.
- Missing relative imports: 0.
- Modified-file noResolve unused-local/import diagnostics: 0.
- CSS braces balanced.
- All baseline SQL migrations through STEP 47 are byte-identical.
- STEP48 creates no table and does not disable RLS.
- STEP48 SQL dollar-quote balance passes.
- Static checks pass for global header toggle, details-page global language, rating-only review UI, blank-search guard, 20/page cap, premium auth, and WhatsApp prefill.
- `npm run typecheck` was invoked, but this local environment does not have the project React/React Router/Lucide/JSX runtime dependencies installed because dependency installation timed out. The observed diagnostics start with missing external modules rather than a completed dependency-backed compile. Vercel remains the final dependency-backed build check.
