# Step 13 — Doctor Discovery and Public Profile

Step 13 turns the Step 12 homepage search into a dedicated, shareable doctor
directory and public profile experience.

## Run the database patch first

Run this once in the Supabase SQL Editor after Step 11B:

`supabase/12_public_doctor_profile_security.sql`

Expected result:

`STEP 12 PUBLIC DOCTOR PROFILE SECURITY PASSED`

This exposes only the approved doctor's explicit public-profile JSON shape. It
also removes any stale anonymous direct `profiles` table grant while retaining
authenticated own/admin access through the existing RLS policy.

## Included frontend routes

- `/doctors` — doctor directory
- `/doctors/:doctorId` — approved public doctor profile

## Directory features

- Search by doctor, disease, specialty, and location keywords
- District → upazila cascading filter
- Multi-select specialty, degree, and designation filters
- Minimum/maximum consultation fee
- Available-today filter
- Name, newest, fee-low, and fee-high sorting
- 12-result pagination
- URL query parameters for refresh-safe/shareable filters
- Responsive mobile filter drawer
- Approved and active doctors only

## Profile features

- Verified identity, degree, designation, and specialties
- Public BMDC number, experience, languages, headline, and bio
- Approved chamber/hospital list
- Visiting days, time, fee, and chamber phone
- Appointment availability state
- Safe not-found and environment-error states

## Vercel

`vercel.json` provides the SPA rewrite needed for direct visits to `/doctors`
and `/doctors/:doctorId`.

## Verification

```powershell
npm.cmd run typecheck
npm.cmd run build
npm.cmd run dev
```

Test direct navigation and refresh on both new routes after deploying to
Vercel. Use only approved staging doctor records.
