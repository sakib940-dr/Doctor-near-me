# Sirajganj Doctor — Step 14

Run now:
`npm.cmd run dev`

Database migrations:
01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 11b, 12, 13

Step 14 adds email/password authentication, safe public role registration,
profile onboarding, session persistence, protected routes, and a role-aware
dashboard foundation.

Before starting, copy `.env.example` to `.env.local` and add the staging
Supabase URL and publishable key. Run
`supabase/13_auth_onboarding_security.sql`, then follow `docs/STEP14.md`.
