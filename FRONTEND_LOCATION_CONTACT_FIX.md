# Frontend Location + Doctor Contact Fix

## Implemented without changing Supabase/SQL

- Visitor location button now captures real GPS latitude/longitude/accuracy.
- The GPS point is kept locally for a short period and reused after refresh.
- Existing `nearest_doctors` RPC is called from the frontend.
- Nearby doctor cards are sorted by the user's current location and show distance to the doctor's nearest approved chamber/hospital.
- Duplicate doctor rows caused by multiple chambers are collapsed to the nearest chamber for each doctor.
- After login, a previously consented GPS point is persisted through the existing `update_my_current_location` RPC.
- If browser geolocation permission is already granted, Dashboard refreshes and saves the current location without showing a surprise permission prompt.
- Doctor profile action area now supports compact Call + WhatsApp + Appointment actions next to visit fee.
- Direct doctor/assistant contact takes priority over chamber phone whenever the public doctor profile supplies it; chamber phone is fallback only.

## Existing backend limitation (not changed)

The current `get_doctor_public_profile` RPC does not return `profiles.phone`, `profiles.public_phone`, a doctor WhatsApp field, or a public-phone preference. Anonymous visitors are also intentionally blocked from selecting `profiles` directly.

Therefore a doctor cannot yet make their own phone publicly visible to anonymous visitors when they have no chamber using frontend code alone. The frontend is ready to display direct phone/WhatsApp as soon as the existing public RPC returns those fields, but persisting and safely exposing that preference requires a small backend/RPC change.
