# Phase 2 STEP 47 — Hospital / Provider Public Profile Redesign Audit

## Scope
STEP47 preserves the existing Provider/Hospital architecture and redesigns the existing `/providers/:providerId` public route to match the compact, mobile-first Doctor profile design language. It does not create a second Hospital profile/content/review/follow/analytics system.

## Reused canonical data
- `providers`: Hospital/Chamber identity, bilingual names, address, contact, map coordinates, verification, logo/banner, `about_bn/about_en` from STEP39.
- `provider_slider_images`: public slider content. STEP47 adds a DB max-4 trigger only.
- `provider_opening_hours`: structured weekly opening hours.
- `provider_services`, `provider_treatment_costs`, `provider_investigation_costs`: bilingual public service/cost content.
- `doctor_provider_links` + `chamber_schedules`: consent-based Hospital↔Doctor associations and visiting schedules.
- `patient_follows`: follower/save state and count.
- `provider_reviews` + `provider_review_authors`: STEP44 structured Patient reviews.
- `profile_interactions`: STEP46 Call/WhatsApp/Appointment/Map/Profile analytics.
- `premium_memberships` / central ranking helpers: Premium/Verified display.
- `public-images`: existing media bucket.
- `location_distance_km`: existing Haversine distance source.

## Doctor-card rule
Hospital owners do not type arbitrary Doctor cards. Existing approved `docbd.info` Doctors are searched and invited through the existing Provider Doctors workflow. A Doctor must accept the link before the public card appears. Removing the association removes the public card. No external/fake Doctor roster table was added.

## Public route structure
1. Swipe slider (maximum four public images)
2. Compact Hospital/Chamber summary card
3. Call / WhatsApp / Appointment-Contact / Save / Directions actions
4. Followers / Reviews / Rating summary
5. Bilingual About
6. Opening Hours accordion
7. Services accordion
8. Treatment/Service Costs accordion
9. Investigation Costs accordion
10. Linked Doctors rail (first 10) + View All route
11. Contact / Map / GPS distance
12. Existing structured review section

## New narrow backend helpers
- `update_my_provider_about(...)`: owner-only bilingual About update without changing the old `save_my_provider_profile` signature.
- `get_public_provider_page_content(uuid)`: publication-safe aggregate of slider/hours/services/costs.
- `get_public_provider_distance(uuid,lat,lon)`: approved/verified Provider distance using `location_distance_km`.
- `get_public_provider_doctors_v2(uuid)`: approved linked, publicly listable Doctor cards + this Provider's schedule + total count.
- `enforce_provider_slider_image_limit()`: max-four database guard with Provider-row lock.

## Dashboard
Existing Provider Profile page remains the owner entry point. It now includes bilingual About and extends the existing Provider website-content tabs with structured Opening Hours and a max-four Public Slider manager. Slider supports upload, replace, delete, reorder, active/hidden, optional bilingual caption, and browser-side optimization for large slider images.

## Security
- No RLS disable.
- Provider content tables and storage retain existing owner RLS/path rules.
- About mutation verifies `owner_user_id=auth.uid()` and an active Hospital/Chamber account.
- Public page/content/distance/Doctor-association reads require an approved + verified Provider.
- Linked Doctor output additionally requires approved `doctor_provider_links` and the existing central Doctor publication policy.
- No manual Doctor-card insertion path exists.
- Analytics continue through the existing STEP46 RPCs; actual phone/WhatsApp/direction actions remain normal links.

## Compatibility
- Existing `/providers/:providerId` route is preserved.
- New `/providers/:providerId/doctors` route is only the full linked-Doctor list.
- Existing custom Provider website route remains available.
- Existing `save_my_provider_profile` RPC signature is unchanged.
- Prior migrations 01–46 are unchanged.
