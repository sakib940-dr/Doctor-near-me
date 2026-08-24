# Doctor "My Profile" — Compact Premium Redesign — Audit

Frontend-only (`/doctor/profile`, `DoctorProfessionalProfilePage.tsx`). No
database/RPC/data-contract change — every field and save handler is
unchanged.

## Problems addressed

- **Small photo** — preview grew from 150px to 168px with a proper premium
  ring + a circular overlay edit-button (replacing the separate text
  "ছবি পরিবর্তন" label row), so it reads as a real profile photo, not a
  small placeholder.
- **Inconsistent/oversized font sizes** — page heading, section titles,
  field labels, and helper text now follow one consistent compact scale
  (19px heading / 14.5px section title / 11.5px label / ~10–10.5px helper),
  scoped to this page only.
- **Duplicate/unnecessary text removed:**
  - Page heading's generic paragraph ("Personal Information, Study
    Information, phone, address...") removed — the section titles already
    say this.
  - Verification banner's long explanatory paragraph (which repeated what
    the Study Information section already shows) removed; banner is now
    one compact status line.
  - Each section's large "note" box (icon + strong + small, several lines)
    replaced with a single short muted hint line under the section title —
    same information, far less space and repetition.
  - Redundant per-field `<small>` helper captions on read-only fields
    (Login Phone, BMDC number) removed since the field already being
    read-only/disabled makes that self-evident.
  - "Study Information" section's explanatory footer paragraph replaced
    with a small "Locked" badge next to the heading.
- **Layout** — photo card and form sections now share one consistent card
  style (radius/shadow/padding), tighter grid gaps, and a premium gradient
  Save button.

## Isolation / safety

All rules scoped under a new `.doctor-my-profile-page` class added to this
page's existing wrapper `<div>` (previously unscoped, sharing
`.doctor-dashboard-page` with every other Doctor page). Shared class names
touched here (`.verification-banner`, `.doctor-photo-card`,
`.specialty-picker`, `.patient-form-grid`, `.auth-field`, `.doctor-text-field`)
are only overridden through this scope, so Visiting Card, Chamber Details,
Onboarding, and every other page keep their existing look.

## Verification performed in this environment

```text
npm install
npx tsc -b --pretty false   # clean
npx vite build               # clean, dist/ produced
```

No Supabase/live-network checks were possible here. Please spot-check on
staging: photo upload/replace, all field edits, Save, and 360px/768px/1440px
layout (photo card goes horizontal on tablet, stacked on mobile).
