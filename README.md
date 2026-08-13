# Sirajganj Doctor — Step 22

Run now: `npm.cmd run dev`

Complete developer handoff: `PROJECT_HANDOFF_SUMMARY.md`

Database migrations:
`01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 11b, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21`

Step 22 adds the single-owner Super Admin control center: complete user search
and location filtering, audited full-detail views, privileged invitations,
role/status controls, profile correction, and self-protected permanent deletion.

Before testing, copy `.env.example` to `.env.local` and add the staging
Supabase URL and publishable key. Run
`supabase/21_super_admin_control_center.sql`, then follow `docs/STEP22.md`.
