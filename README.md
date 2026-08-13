# Sirajganj Doctor — Step 17

Run now: `npm.cmd run dev`

Database migrations:
`01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 11b, 12, 13, 14, 15, 16`

Step 17 adds the Hospital/Chamber profile, media, departments/services,
consent-based Doctor invitations, Provider-managed chamber schedules, and the
shared reception appointment queue.

Before testing, copy `.env.example` to `.env.local` and add the staging
Supabase URL and publishable key. Run
`supabase/16_provider_dashboard_security.sql`, then follow `docs/STEP17.md`.
