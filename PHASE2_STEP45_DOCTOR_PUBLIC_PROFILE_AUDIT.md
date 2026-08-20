# docbd.info — Phase 2 Step 45 Doctor Public Profile Redesign

## Scope
The existing `/doctors/:doctorId` route is preserved. This step redesigns the public Doctor profile and adds an owner editor by reusing the existing Doctor, Provider/Chamber, slider/content, follow, review, analytics and location architecture.

## Reused canonical data
- Doctor identity/visiting card: `profiles`, `doctors`, `doctor_specialties`, `specialties`.
- Doctor images/content: Step39 `doctor_slider_images`, `doctor_services`, `doctor_treatment_costs`, `doctor_investigation_costs`.
- About: existing `doctors.bio_bn` / `doctors.bio_en`; legacy `doctors.bio` remains compatible. No duplicate `about_*` Doctor columns were added.
- Chamber/contact/location: `providers`, `doctor_provider_links`, `chamber_schedules`.
- Follow/save and follower count: `patient_follows` and existing Step39/42 RPCs.
- Reviews: Step39/44 structured review architecture.
- Analytics: existing `profile_interactions` and `record_public_profile_interaction` path.
- Distance: existing authoritative `location_distance_km`.
- Images: existing `public-images` storage bucket and owner-path policy.

## Migration 45
- Adds optional bilingual `chamber_schedules.note jsonb` only; no new profile/content/location table.
- Adds owner/public read RPCs for existing Doctor slider/services/cost content.
- Adds narrow Doctor-owned bilingual About RPC while mirroring Bangla into legacy `doctors.bio`.
- Adds schedule-note update RPC without breaking the old `save_my_chamber_schedule` signature.
- Adds publication-safe `get_public_doctor_chamber_distances` using existing Haversine helper; visitor coordinates are not persisted.
- Extends existing Doctor public/owner profile read models with bilingual About and schedule note.
- RLS remains enabled; public reads still require the existing Doctor publication policy.

## Public page order
1. Swipeable image slider (max 4; profile photo / neutral fallback).
2. Compact visiting card and global status badge.
3. Call, WhatsApp, Appointment, Save actions.
4. Follower, review and rating summary.
5. Bilingual About Doctor.
6. Accordion sections: chamber schedule, services, treatment costs, investigation costs.
7. Contact, current opening state, map and patient-to-chamber distance.
8. Existing structured review section.

## Doctor dashboard editor
New route: `/doctor/public-profile`.
- Slider: upload, browser-side optimization for large images, max 4 enforced again in DB, replace/delete/reorder, bilingual caption, visibility.
- About: Bangla + English.
- Services: bilingual name/description, active flag, add/edit/delete/reorder.
- Treatment costs: bilingual name, starting/min cost, optional maximum and notes, add/edit/delete/reorder.
- Investigation costs: bilingual name, amount and notes, add/edit/delete/reorder.
- Chamber schedule remains the canonical Schedule page; optional BN/EN note is added and active/closed state remains supported through the existing schedule activation flag.

## Security
- Doctor can mutate only own content via existing RLS / owner RPCs.
- Slider storage path continues to begin with the authenticated Doctor UUID.
- Public content is returned only for a Doctor accepted by `is_doctor_publicly_listable`.
- Public chamber/contact data only uses approved links and approved+verified Providers.
- Private profile phone is not exposed; Call/WhatsApp use the public Chamber/Provider phone.
- Public coordinates are used for distance calculation only and visitor GPS is not persisted by the new RPC.

## Performance
- First slider image is eager for LCP; later slides and map are lazy.
- Slider images use responsive crop, native horizontal scroll/snap and async decoding.
- Large supported uploads are browser-resized to a maximum 1920px edge and converted to WebP when that produces a smaller file; otherwise the original validated file is used.
- Public profile content is fetched as one compact JSON read model rather than per-row requests.

## Validation
- TypeScript AST parse: zero syntax errors.
- Relative import scan: zero missing relative imports.
- Modified-file no-resolve semantic scan: no non-dependency diagnostics.
- Prior migrations 01–44: byte-identical to Step44 baseline.
- Migration 45: no `DISABLE ROW LEVEL SECURITY`; dollar-quote/static checks pass.
- CSS braces balanced; mobile breakpoints include <=430px and desktop/tablet >=700px.
- `npm install --ignore-scripts --no-audit --no-fund` was attempted but timed out in the execution environment, so dependency-backed `npm run typecheck` / `npm run build` cannot complete locally because React/Vite/Lucide packages are unavailable. Both commands were still invoked and fail at dependency resolution, not at an identified Step45 syntax error.
