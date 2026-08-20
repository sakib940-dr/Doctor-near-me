# Phase 2 — Step 44 Structured Review Audit

## Reused canonical data
- `doctor_reviews` + `doctor_review_authors` from Step 39.
- `provider_reviews` + `provider_review_authors` from Step 39.
- `site_settings.structured_review_questions` for bilingual question configuration.
- Existing `upsert_my_doctor_review`, `upsert_my_provider_review`, `get_my_structured_review`, public review list RPCs and `moderate_structured_review` are preserved/replaced in-place where hardening was needed.

## No duplicate review system
Step 44 creates no review table. Patient identity remains private in authorship tables; public review content does not expose Patient UUIDs.

## One Patient = one review per target
- `doctor_review_authors unique(patient_id, doctor_id)`.
- `provider_review_authors unique(patient_id, provider_id)`.
- Step 44 adds Patient-row locking to review upserts so concurrent tabs/devices serialize before insert/update; the unique constraints remain the final database guarantee.

## Question model
Question text is not copied into review rows. `site_settings.structured_review_questions` version 2 uses stable semantic keys and maps each key to `q1..q5` score slots. Bengali is the public UI default; English is available from the same setting.

## Server calculation
`get_public_structured_review_summary(doctor_id, provider_id)` calculates in the database:
- valid published review count,
- overall average,
- q1..q5 category averages.

Only published structured Patient reviews are included for Providers; legacy Provider-authored testimonials are excluded from the structured aggregate.

## Security
- Patient writes remain RPC-only.
- Patient may edit their own answers/comment; there is no Patient delete RPC.
- Doctor cannot edit/delete Patient review content.
- Provider cannot edit/delete Patient score/comment; Provider may only reply/reorder through the existing guarded architecture.
- Admin moderation RPC remains available.
- No RLS disable was added.

## Frontend
`StructuredReviewSection.tsx` is reusable for Doctor and Provider detail surfaces. It includes:
- total count + overall average,
- five category averages,
- Bengali/English toggle,
- 44px mobile star controls,
- first-review and edit-review flows,
- preload of the Patient's existing review,
- public review list,
- login return-flow for logged-out visitors.

Provider website admin review UI now separates structured Patient reviews from legacy Provider testimonials. Patient review edit/delete controls are not rendered; only Provider reply is offered.
