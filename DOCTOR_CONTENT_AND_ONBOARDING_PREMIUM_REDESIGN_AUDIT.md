# Doctor Public Content Management (Compact) + Onboarding — Premium Redesign — Audit

Frontend-only. No database migration, no RPC change, no route/data-contract
change. Every field, handler, and service call is unchanged.

## Scope

1. **Doctor Public Content Management** — `/doctor/public-content`
   (`DoctorPublicContentManagementPage.tsx`), which embeds:
   - Visiting Card (`DoctorVisitingCardPage.tsx`)
   - Chamber Details (`DoctorChamberDetailsPage.tsx`)
   - About / Slider / Services / Treatment Cost / Investigation Cost
     (`DoctorPublicProfileContentPage.tsx`)
2. **Registration onboarding** — `/onboarding` (`OnboardingPage.tsx`), all
   four roles (patient / doctor / hospital / ambulance).

Not touched: any other Doctor, Patient, Admin, Hospital or public-directory
page.

## Public Content Management — "optimize & compact"

The 6-step flow (Visiting Card → Chamber → About → Services → Treatment →
Investigation) was previously a tall, vertical, one-step-at-a-time wizard
with a large 6-card grid stepper, a duplicate "Step X of 6" banner, and
generous nav buttons — a lot of vertical scroll for what is really an
ongoing self-service editor, not a first-time-only onboarding flow.

Redesigned into a **compact single-page tab layout**:
- Header shrunk to one row: icon + title + inline progress pill
  (`4/6 steps saved`), no separate progress panel.
- The 6-card grid stepper became a single-row, horizontally-scrollable pill
  tab bar (each tab: check/dot + short label). Clicking any tab jumps
  straight there — this was already supported by the existing `move()`
  handler (non-linear by design), so no logic changed, only the visual
  affordance now matches the behavior.
- Removed the redundant "Step X of 6 / current step" banner — the active
  pill tab already communicates this.
- Bottom nav kept (Previous / current-step label / Next) but restyled
  compact and secondary, for people who prefer to click through
  sequentially.
- Net effect: same functionality, meaningfully less vertical space and
  fewer duplicate UI elements, faster to scan and jump between sections.

Also restyled premium (spacing, elevation, pill badges, gradient primary
actions, focus rings) and scoped so nothing else is affected:
- `.doctor-content-wizard-page-v2` — the wizard shell above
- `.doctor-public-editor-page` — About/Slider/Services/Treatment/
  Investigation editor cards (compact 2-col grid forms, unified list-row
  style with hover lift, consistent action icon buttons)
- `.visiting-card-page` — photo card, form sections, specialty chip picker
- `.doctor-chamber-details-page` — location guide, chamber cards, schedule
  rows

## Onboarding — premium redesign

`OnboardingPage.tsx` (patient/doctor/hospital/ambulance registration flow),
scoped under `.onboarding-page`:
- New premium intro card and a redesigned progress rail: connected dots
  with done/current/upcoming states instead of the previous plain list.
- Step cards (`.onboarding-card` / `.professional-step-card`) get a
  consistent icon-badge header, cleaner "public & optional" callouts, and
  unified spacing.
- Photo upload, specialty picker (chip style), GPS/location-guide card,
  verification-evidence uploader, inline service/cost editors, and the
  final "Complete & Open Dashboard" screen all restyled to match the same
  brand system used elsewhere in the app.
- Step action bar (Previous / Skip / Save & Continue / Complete) restyled
  with a clear primary action and de-emphasized skip.

## Isolation / safety

Every rule is namespaced under a page-exclusive wrapper class
(`.doctor-content-wizard-page-v2`, `.doctor-public-editor-page`,
`.visiting-card-page`, `.doctor-chamber-details-page`, `.onboarding-page`).
Class names that are shared with other pages (`.provider-text-field`,
`.specialty-picker`, `.provider-location-guide`, `.patient-form-grid`,
`.auth-field`, etc.) were verified by grep before styling and are only
touched via these scoped selectors — the base/shared rules used elsewhere
(e.g. `DoctorProfessionalProfilePage.tsx`, `AdminBmdcCorrectionPage.tsx`)
are untouched.

## Verification performed in this environment

```text
npm install
npx tsc -b --pretty false   # clean
npx vite build               # clean, dist/ produced
```

No Supabase/live-network checks were possible here. Please run the manual
checklist against staging before production:

- `/doctor/public-content` — tab jump navigation, Visiting Card save,
  Chamber save + schedule add/edit/delete, About save, Services/Treatment/
  Investigation add/edit/reorder/delete, slider image upload/reorder/
  delete — all still call the same functions as before.
- `/onboarding` — walk through patient, doctor (7 steps), and hospital
  (5 steps) flows end to end, including photo upload, GPS capture,
  verification evidence upload/delete, and Skip vs Save & Continue.
- 360px / 768px / 1024px / 1440px — no overflow; stepper tabs and progress
  rail scroll horizontally on narrow screens without breaking layout.
