# Sirajganj Doctor — Step 18

Run now: `npm.cmd run dev`

Database migrations:
`01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 11b, 12, 13, 14, 15, 16, 17`

Step 18 adds Ambulance self-registration/profile editing, private verification
documents, approved-only live availability/GPS, consent-based Hospital links,
and Hospital-side link review.

Before testing, copy `.env.example` to `.env.local` and add the staging
Supabase URL and publishable key. Run
`supabase/17_ambulance_dashboard_security.sql`, then follow `docs/STEP18.md`.
