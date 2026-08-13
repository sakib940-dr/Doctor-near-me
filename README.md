# Sirajganj Doctor — Step 21

Run now: `npm.cmd run dev`

Database migrations:
`01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 11b, 12, 13, 14, 15, 16, 17, 18, 19, 20`

Step 21 adds audited Admin CMS and reference management for specialties,
discovery topics, homepage sections, scheduled/district banners, bilingual
content pages, and public brand/social/default-location settings.

Before testing, copy `.env.example` to `.env.local` and add the staging
Supabase URL and publishable key. Run
`supabase/20_admin_cms_security.sql`, then follow `docs/STEP21.md`.
