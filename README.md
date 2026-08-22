# docbd.info — Step 27

Run locally: `npm.cmd run dev`

Current application package version: `0.31.3`.

Database migrations are under `supabase/`. For an existing database already on Step 68, run:

`supabase/69_blood_alert_notification_enrichment.sql`

Step 69 enriches the `blood_request` / `blood_direct_request` notification payloads (patient name, hospital label, units needed, and — for direct donor requests — the donor's own district/upazila) so the new in-app "আমার কাছে অনুরোধ" donor respond screen can render context without an extra round trip. RPC names and parameter signatures are unchanged; safe to re-run against an existing database.

Complete developer handoff: `PROJECT_HANDOFF_SUMMARY.md`

Before testing, copy `.env.example` to `.env.local` and add the Supabase URL and publishable key.
