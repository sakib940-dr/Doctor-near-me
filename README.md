# docbd.info — Step 27

Run locally: `npm.cmd run dev`

Current application package version: `0.23.0`.

Database migrations are under `supabase/`. For an existing database already on Step 26, run:

`supabase/27_docbd_global_branding.sql`

Step 27 standardizes the public and authenticated application brand as `docbd.info`, removes duplicate dashboard headers/navigation, and updates browser metadata without replacing existing feature architecture.

Complete developer handoff: `PROJECT_HANDOFF_SUMMARY.md`

Before testing, copy `.env.example` to `.env.local` and add the Supabase URL and publishable key.
