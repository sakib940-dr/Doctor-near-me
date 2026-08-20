# Phase 2 STEP 43 — Visitor Card, Category/Search and Patient Blood Bank Fix

## Baseline
Built cumulatively on `docbd_info_PHASE2_STEP42_PATIENT_FOLLOW_SAVE.zip`. Existing migrations 01–42 are preserved. Migration 40 inside this package is the corrected saved-list version from the prior hotfix.

## Root causes fixed
1. Visitor Doctor cards were still optimized as small marketplace portrait cards and displayed consultation fee; the requested visiting-card information was not consistently available in search/category results.
2. Homepage category “সব দেখুন” linked to Doctor search instead of a complete category directory.
3. District/upazila controls visually looked like plain text/pills and did not expose a clear nationwide reset.
4. Bottom Search reused contextual district state instead of explicitly opening nationwide Advanced Search.
5. Blood Bank entry sent logged-out users to auth, but Patient had no `/blood` module/route/navigation after login.
6. Existing `search_blood_donors` was `SECURITY INVOKER` while `blood_donor_profiles` RLS allows own/admin rows, preventing a Patient from seeing other consented donors through the search function.

## UI changes
- Doctor and Provider cards are horizontal: image left, visiting-card information right.
- Doctor cards show name, degree, professional title/specialty, BMDC, chamber/hospital/present job, medical college when relevant, location and distance when available.
- Visitor cards no longer render consultation/visit fee. Existing Details page fee is untouched.
- Existing Follow/Save reusable action and ranking/verification badges remain.
- Added `/categories` for all Admin-controlled specialties/discovery topics.
- Homepage “সব দেখুন” for category/specialty discovery now opens `/categories`.
- Homepage location controls clearly label জেলা, উপজেলা and GPS/Near Me and support `সারা বাংলাদেশ` / `সকল উপজেলা` reset.
- Bottom Search now opens `/doctors?advanced=1`, which starts Advanced Search with no forced district/upazila.
- Public Doctor Directory keeps Degree/Specialty/District/Upazila/Near-Me relevant filters and STEP41 designation-filter removal.
- Added Patient `/blood` module and Patient dashboard/sidebar access.

## Blood module
Reuses existing `blood_donor_profiles`, `blood_requests`, `blood_request_responses` and existing mutation/response RPCs. Adds no Blood entity table.

Patient Blood Bank supports:
- donor search by blood group and optional district/upazila;
- voluntary donor profile/preferences;
- blood request creation;
- own request list, response view and cancellation.

Migration 43 replaces only the legacy donor-search implementation with a narrowly exposed `SECURITY DEFINER` function that:
- requires an authenticated active Patient;
- returns only active voluntary available Patient donors;
- never returns exact coordinates;
- returns phone only when both donor and profile public-phone consent are true;
- preserves table RLS.

## Database changes
New migration: `supabase/43_visitor_cards_categories_blood_access.sql`

No new table is created.

New read RPCs:
- `get_public_doctor_card_context(uuid[])`
- `get_my_blood_donor_profile()`
- `get_my_blood_requests()`

Replaced existing RPC implementation, same signature/return schema:
- `search_blood_donors(text,bigint,bigint,integer,integer)`

Existing Blood mutation RPC grants are reasserted for authenticated/service-role only. Anonymous Blood RPC mutation/search is revoked.

## Changed files
- `src/App.tsx`
- `src/styles.css`
- `src/types.ts`
- `src/pages/VisitorHomePage.tsx`
- `src/pages/DoctorDirectory.tsx`
- `src/pages/PublicProvidersPage.tsx`
- `src/pages/DashboardPage.tsx`
- `src/services/discovery.ts`
- `src/components/ProviderCard.tsx`
- `src/components/DashboardShell.tsx`
- `src/components/VisitorBottomNav.tsx`
- `src/components/DoctorResultCard.tsx`

New files:
- `src/pages/CategoriesPage.tsx`
- `src/pages/BloodBankPage.tsx`
- `src/services/bloodBank.ts`
- `supabase/43_visitor_cards_categories_blood_access.sql`

## Safety / compatibility
- Migrations 01–42 unchanged from STEP42.
- No RLS disable.
- No duplicate Category, Blood, Doctor, Provider, Follow or Location table.
- Existing Doctor/Provider Details routes remain canonical.
- Existing Follow/Save, ranking, verification, GPS/distance and auth return-path flows are reused.
- Homepage contextual search can still use the selected location; Bottom Search is intentionally nationwide Advanced Search.

## Validation
- 71 TS/TSX source files parsed by TypeScript AST: 0 parse errors.
- Missing relative imports: 0.
- CSS brace balance: 0.
- STEP43 `CREATE TABLE`: 0.
- STEP43 `DISABLE ROW LEVEL SECURITY`: 0.
- Prior migration hash comparison 01–42: unchanged.
- Corrected migration 40 (`saved.saved_at`) preserved.
- A real async callback issue found during compiler comparison in `BloodBankPage.tsx` was fixed before packaging.
- Full `npm run build` cannot be completed in this environment because React/Vite/Lucide packages are not installed; resulting diagnostics are dependency-resolution/JSX-type cascades. No successful dependency-backed production build is claimed.
