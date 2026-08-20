# New Feature Phase — Architecture & Data Foundation Audit

Baseline: cumulative `docbd.info` project through migration 38 and the Vercel TS6133 build fix.

## Existing architecture reused

- Patient/user: `public.profiles` (`role='patient'`), with `preferred_language`, location and account status.
- Doctor: `public.doctors` + `public.profiles` + `doctor_specialties`/`specialties`.
- Hospital/Chamber: `public.providers` + `doctor_provider_links` + `chamber_schedules`.
- Doctor public profile: `/doctors/:doctorId` -> `get_doctor_public_profile(uuid)`.
- Provider public profile: `/providers/:providerId`; provider website: `/providers/:slug/website`.
- Appointments: existing `appointments` table/RPCs and `/doctors/:doctorId/book`.
- Doctor analytics: current frontend counts appointment metrics from `appointments`; no profile interaction event store existed.
- Search: `search_doctors_advanced(...)`; existing `doctors.degree` and `p_degrees` are retained. Designation parameter remains only for backward compatibility until the next UI step hides it.
- Verification: `doctors.verification_status`, provider `status` + `verified`, existing evidence/review queue.
- Provider website content already exists: `provider_services`, `provider_gallery_images`, `provider_slider_images`, `provider_reviews`, `provider_treatment_costs`, `provider_investigation_costs`.
- Media: existing `avatars` and `public-images` storage with owner-path policies.
- Map/location: providers/chambers store lat/lon; existing `location_distance_km`, `nearest_doctors`, `resolve_location_context`.
- CMS/settings: existing `site_settings`, homepage/discovery CMS.
- Referral: existing `referral_codes` and `referrals`; no duplicate referral system is added.

## Foundation added in Step 39

### Follow / Save
`patient_follows` uses explicit nullable Doctor/Provider FKs with an exactly-one-target check and partial unique indexes:
- one Patient + one Doctor maximum one follow
- one Patient + one Provider maximum one follow

Mutation is RPC-only through `toggle_my_follow` and requires an active Patient account.

### Structured reviews
Provider review infrastructure is reused rather than replaced.

- New Doctor review content: `doctor_reviews`.
- Private Doctor authorship map: `doctor_review_authors`, unique `(patient_id, doctor_id)`.
- Existing `provider_reviews` extended with `review_source`, five structured scores, generated structured rating, moderation/edit metadata.
- Private Provider authorship map: `provider_review_authors`, unique `(patient_id, provider_id)`.
- Patient account IDs are not stored in public review content rows, preventing public UUID exposure.
- Patient review mutation is RPC-only. There is no Patient delete RPC.
- Provider-owner legacy testimonials (`review_source='provider'`) remain editable/deletable by the Provider.
- Provider owners may reply/reorder Patient reviews but a database trigger prevents changing Patient scores/comment/publication state.
- Admin/Super Admin moderation uses `moderate_structured_review` and audit logs.

Question labels are stored in existing public `site_settings` key `structured_review_questions` with Bangla + English text.

### Doctor content
New Doctor-only equivalents are required because no Doctor tables existed:
- `doctor_slider_images` (database-enforced max 4)
- `doctor_services`
- `doctor_treatment_costs`
- `doctor_investigation_costs`

Existing `public-images` storage is reused. No new bucket.

Doctor About adds `doctors.bio_bn` + `doctors.bio_en`; legacy `doctors.bio` is preserved as fallback/source during migration.

### Hospital content
Existing Provider content is reused. No duplicate Hospital service/slider/cost tables.

Added only missing structured opening hours:
- `provider_opening_hours`

Added bilingual About fields:
- `providers.about_bn`
- `providers.about_en`

Doctor chamber schedules remain `chamber_schedules`; no duplicate Doctor opening-hours table.

### Interaction analytics
`profile_interactions` records public profile actions:
- profile view
- call click
- WhatsApp click
- appointment click
- map click

No IP/device identifier is stored. Raw rows are Admin-only; Doctor/Hospital use aggregate owner RPCs.

### Premium membership / ranking
`premium_memberships` supports exactly one Doctor or Provider per membership row and preserves history.

Normal Doctor/Hospital accounts cannot self-activate Premium. `admin_set_premium_membership` is Admin/Super Admin guarded and audited.

Ranking helper foundation:
- `doctor_public_rank_tier/score`
- `provider_public_rank_tier/score`
- tier order: Premium > Verified > New > Unverified

Premium/ranking never bypasses existing public-listing/account safety checks.

### Degree classification/search
No duplicate degree table was introduced. Existing `doctors.degree` remains source of truth and existing `p_degrees` filter remains. A trigram index was added to support degree text filtering efficiently. The designation parameter remains in the RPC for backward compatibility; the next UI phase will remove/hide designation filters.

## Known next-UI integration points

- `src/pages/DoctorProfile.tsx`: compact mobile-first profile, slider, follow, reviews, bilingual About, services/costs, CTA analytics, distance/map.
- `src/pages/PublicProviderProfilePage.tsx` and `ProviderWebsitePage.tsx`: matching Hospital profile, follow/reviews/stats/opening hours and analytics.
- `src/components/DoctorResultCard.tsx` / `ProviderCard.tsx`: ranking badges/stats and compact marketplace card treatment.
- `src/pages/DoctorDirectory.tsx`: remove/hide designation filter, retain Degree, apply ranking order.
- `src/pages/VisitorHomePage.tsx`: compact horizontal-scroll marketplace sections.
- `src/pages/DashboardPage.tsx`: merge Step 39 interaction aggregates with existing appointment analytics.
- `src/pages/DoctorProfessionalProfilePage.tsx`: bilingual About/services/costs/slider editor or a dedicated content section.
- `src/components/ProviderWebsiteContentTabs.tsx`: distinguish Provider-authored legacy testimonial vs Patient structured review; Patient reviews must not show destructive edit/delete controls, only reply/moderation-aware actions.
- `src/pages/SuperAdminPage.tsx` / Admin UI: Premium membership administration and review moderation UI.

## Exact conflict to handle next

Existing `ProviderWebsiteContentTabs.tsx` assumes every `provider_reviews` row is Provider-owned content and renders Edit/Delete controls. Step 39 preserves old Provider-authored rows but marks new Patient reviews `review_source='patient'` and database-protects them. Next UI step must branch on `review_source` so Patient reviews show Reply only, not content Edit/Delete. This is intentional to meet review ownership security without destroying the legacy Provider review/testimonial feature.

## Additional foundation safeguards finalized

- Doctor slider max-four enforcement locks the Doctor row before counting, so concurrent image inserts cannot race past the four-row limit.
- Provider opening hours support Closed, 24 Hours, normal daytime, and cross-midnight opening windows; Doctor chamber hours remain in `chamber_schedules`.
- Internal Premium/rank helper functions are not directly executable by public clients; public output is exposed only through the publication-gated `get_public_profile_stats` RPC.
- `directory_ranking_policy.new_entity_days` is consumed by rank-tier helpers (default 30, bounded 1–365) instead of being dead configuration.

## Additional exact architecture constraints

- Existing Hospital/Provider public policy still requires `status='approved' AND verified=true`. Therefore `new`/`unverified` Provider ranking tiers are data-foundation states but are not publicly visible under the current Hospital publication policy. Changing that policy would be a separate explicit requirement; Step 39 does not relax Hospital verification.
- Hospital Doctor cards already use `doctor_provider_links` and approved linked platform Doctors. If “Hospital adds doctor photo-card/list” later means arbitrary non-registered/external Doctors, that is not represented by the existing relation and needs a separately approved roster design rather than overloading `doctor_provider_links`.
- Existing `doctors.degree` is free-text/multi-degree data, not a normalized degree taxonomy. Step 39 deliberately keeps it as source of truth and indexes it; a new degree master table was not invented without a confirmed taxonomy/migration rule.
- Referral rows already exist (`referral_codes`, `referrals`). No reward/badge-progress table was added because reward thresholds/benefits have not been defined. Follower counts, review counts, premium status, and rank tier are derived from canonical data instead of duplicated counters.
- Public interaction analytics are event counters, not billing-grade metrics. Anonymous visitors have no stable server-side identity in the current privacy-preserving architecture, so a future edge/rate-limit layer may be needed if abuse-resistant analytics becomes a requirement.
