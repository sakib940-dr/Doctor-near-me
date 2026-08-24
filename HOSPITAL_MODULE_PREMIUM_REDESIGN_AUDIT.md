# Hospital / Provider Module — Premium Visual Redesign — Audit

Frontend-only visual refresh. No database migration, no RPC change, no
route/data-contract change. Every field, handler, and service call is
unchanged.

## Scope

Private Hospital/Chamber self-service dashboard (`role: hospital | chamber`),
reached from `/dashboard` → sidebar/bottom-nav:

- `/provider/profile` — `ProviderProfilePage.tsx` (+ embedded `ProviderWebsiteContentTabs.tsx`)
- `/provider/doctors` — `ProviderDoctorsPage.tsx`
- `/provider/appointments` — `ProviderAppointmentsPage.tsx`
- `/provider/ambulances` — `ProviderAmbulanceLinksPage.tsx` (hospital only)

Not touched: public visitor-facing directory (`/providers`, `/hospital/:id`,
`/chamber/:id`, `/providers/:slug/website`) — already on the v18 premium
marketplace design system. Doctor, Patient, Admin, Super Admin and
Verification Officer dashboards — untouched by design, see "Isolation"
below.

## What changed

- New CSS section in `src/styles.css`: "Hospital / Provider Module — Premium
  Redesign (Step 80)", reusing the existing global brand tokens
  (`--brand-*`, `--space-*`, `--radius-*`, `--shadow-*`,
  `--surface-*`/`--text-*`/`--border-*`) that already power the visitor
  premium marketplace, instead of the old hard-coded amber/brown palette and
  8–10px type scale.
- Page header, verification status banner, media/logo/banner uploader,
  form sections, gallery, buttons, tabs, list/article cards (appointments,
  reception doctor cards, ambulance link requests), status/link pill badges,
  and empty/loading/error states all restyled: consistent 16–24px radius,
  layered shadows, hover lift, gradient primary actions, teal/amber/rose
  status language.
- New reusable `.provider-stat-row` / `.provider-stat-card` component (quick
  glance counters) added to:
  - Doctors page — total / active / hidden reception doctor cards.
  - Appointments page — reception pending, reception total, doctor-schedule
    appointment total.
  - Ambulance Links page — pending, approved, total on record.
  All values are derived client-side from data already being fetched; no
  new API/RPC calls were added.
- `ProviderProfilePage.tsx`: added a "View Public Profile" quick link inside
  the verification banner (opens the existing `/hospital/:id` or
  `/chamber/:id` public route in a new tab) so an owner can jump straight to
  what patients see.
- `ProviderAmbulanceLinksPage.tsx` was reformatted from a single dense JSX
  line into readable multi-line JSX (identical logic/handlers) so the new
  stat row and future edits are maintainable.

## Isolation / safety

Every new and overridden CSS rule is namespaced under the
`.provider-dashboard-page` ancestor selector — the wrapper `<div>` rendered
only by the four pages above. Several base class names
(`.appointment-list`, `.status-*`, `.section-title`, `.empty-state`,
`.loading-box`, `.error-box`, `button.positive/.danger`, `.provider-empty`,
etc.) are shared with the Doctor, Patient, Admin and public Provider-website
pages; scoping guarantees none of those surfaces changed. Verified by
grepping for cross-page reuse of every touched class name before editing.

## Verification performed in this environment

```text
npm install
npx tsc -b --pretty false   # clean
npx vite build               # clean, dist/ produced
```

No Supabase/live-network checks were possible here (no project credentials in
this workspace); this is a static/typecheck/build verification only. Please
run the existing manual checklist (`docs/LIVE_TESTING.md`) against a staging
account before rolling to production, focusing on:

- `/provider/profile` — banner/logo upload, gallery add/remove, save,
  "View Public Profile" link opens the correct hospital/chamber route.
- `/provider/doctors` — stat row counts match card list; create/edit/remove
  reception doctor card still works.
- `/provider/appointments` — stat row counts match reception/doctor-schedule
  lists; confirm/reject/complete/no-show/cancel flows unchanged.
- `/provider/ambulances` (hospital only) — stat row counts match request
  list; approve/reject/remove flows unchanged.
- 360px / 768px / 1024px / 1440px — no overflow, stat row wraps to 2 columns
  on mobile.
