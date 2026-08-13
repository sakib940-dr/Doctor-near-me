# Sirajganj Doctor — Step 20

Run now: `npm.cmd run dev`

Database migrations:
`01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 11b, 12, 13, 14, 15, 16, 17, 18, 19`

Step 20 adds the Admin operations dashboard: platform summary, operational user
directory, safe suspend/restore controls, verification oversight, appointment
dispute overrides, notifications, and scoped audit activity.

Before testing, copy `.env.example` to `.env.local` and add the staging
Supabase URL and publishable key. Run
`supabase/19_admin_operations_dashboard.sql`, then follow `docs/STEP20.md`.
