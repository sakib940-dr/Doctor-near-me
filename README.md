# Sirajganj Doctor — Step 16

Run now: `npm.cmd run dev`

Database migrations:
`01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 11b, 12, 13, 14, 15`

Step 16 adds the protected Doctor professional profile, verification status,
approved-chamber schedule management, and strict appointment processing.

Before testing, copy `.env.example` to `.env.local` and add the staging
Supabase URL and publishable key. Run
`supabase/15_doctor_dashboard_security.sql`, then follow `docs/STEP16.md`.
