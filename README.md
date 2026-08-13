# Sirajganj Doctor — Step 15

Run now:
`npm.cmd run dev`

Database migrations:
01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 11b, 12, 13, 14

Step 15 adds the protected Patient profile, schedule-validated appointment
request flow, appointment history/status filters, and safe cancellation.

Before starting, copy `.env.example` to `.env.local` and add the staging
Supabase URL and publishable key. Run
`supabase/14_patient_appointment_security.sql`, then follow `docs/STEP15.md`.
