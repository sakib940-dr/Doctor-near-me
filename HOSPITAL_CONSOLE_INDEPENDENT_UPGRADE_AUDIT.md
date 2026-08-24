# Hospital Console Independent Upgrade — Step 81

## Outcome

The Hospital Module now has a dedicated `/hospital-console/*` frontend boundary,
Hospital-only database RPCs, reception-managed Doctor profiles, individual-contact
fallback, a four-image premium gallery manager, staff directory and a
reception-only appointment queue.

The Doctor Module and canonical `public.appointments` backend were not changed.

## Deployment order

1. Run `supabase/81_hospital_console_independent_upgrade.sql` in Supabase SQL Editor.
2. Deploy the frontend from this package.
3. Hard refresh the browser/PWA.

The SQL migration must be deployed first because the new public Hospital pages use
`get_public_hospital_page_base` and `get_public_hospital_doctor_cards`.

## Hospital isolation

- Hospital Console feature code lives under `src/features/hospital/`.
- Hospital navigation uses `/hospital-console/*`.
- Public Hospital pages no longer hydrate legacy `doctor_provider_links`.
- Hospital Doctor cards do not reuse `DoctorResultCard`, Doctor verification badges,
  Doctor profile routes or Doctor booking.
- Appointment requests continue to use `provider_reception_appointments` and the
  existing reception booking/status RPCs.
- Existing `/provider/*` pages remain available for backward compatibility.

## Database changes

- Additive fields on `provider_managed_doctor_cards`: contact mode, individual phone,
  individual WhatsApp, room information and archive timestamp.
- New private `hospital_staff_members` directory table.
- Hospital-owner-only Doctor/staff RPCs.
- Public Hospital-only Doctor/page-base RPCs.
- Narrow Storage insert policy for `{auth.uid()}/hospital-doctors/*`.
- Storage cleanup reference counting now includes Hospital Doctor photos.

## Verification performed

```text
node scripts/validate-hospital-only-directory.mjs  PASS
npm run hospital:console:validate                 PASS
npm run typecheck                                 PASS
npm run build                                     PASS
```

Local browser smoke testing found no console warnings/errors. Authenticated visual
testing requires a configured Supabase staging project and Hospital test account.

## Required staging tests

- Hospital login redirects `/dashboard` to `/hospital-console`.
- Add/edit/hide/archive/restore a Hospital Doctor.
- Upload, replace and delete a Doctor photo.
- Confirm reception fallback and individual phone/WhatsApp override.
- Submit an appointment from a Patient account and confirm/serial it from Hospital.
- Upload/replace/delete all four top-gallery slots.
- Confirm Doctor Module routes and canonical Doctor appointments are unchanged.
