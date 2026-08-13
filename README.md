# Sirajganj Doctor — Step 19

Run now: `npm.cmd run dev`

Database migrations:
`01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 11b, 12, 13, 14, 15, 16, 17, 18`

Step 19 adds a least-privilege Verification Officer dashboard with a unified
Doctor, Provider, and Ambulance queue, private evidence inspection, auditable
approve/reject decisions, and owner-facing review notes/evidence submission.

Before testing, copy `.env.example` to `.env.local` and add the staging
Supabase URL and publishable key. Run
`supabase/18_verification_officer_dashboard.sql`, then follow `docs/STEP19.md`.
