# STEP 47 Vercel Build Fix

Vercel reported TS2739 in `src/pages/OnboardingPage.tsx` because STEP47 made `aboutBn` and `aboutEn` required members of `ProviderProfileInput`, while the shared Hospital onboarding `providerBase()` helper did not include them.

Fix:
- `providerBase()` now maps `ProviderDashboardItem.about_bn -> aboutBn` and `about_en -> aboutEn`.
- Existing Hospital About content is preserved through onboarding saves.
- New Hospital onboarding uses `null` for the bilingual About fields until the Hospital edits them.
- No SQL, RPC, schema, route, RLS, profile, analytics, or public-page behavior was otherwise changed.

Validation:
- 79 TS/TSX files syntax parsed with 0 errors.
- 0 missing relative imports.
- `providerBase()` now contains every required `ProviderProfileInput` key.
