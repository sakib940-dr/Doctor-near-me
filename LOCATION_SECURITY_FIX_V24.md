# Location Security Fix — v24

Changes on top of v23:

1. Added `supabase/25_nearest_doctors_security_fix.sql`.
   - Recreates `public.nearest_doctors(...)` as `SECURITY DEFINER`.
   - Adds `SET search_path=public`.
   - Revokes PUBLIC access and grants EXECUTE to `anon`, `authenticated`, and `service_role`.
   - Function body otherwise matches the existing `02_location_core.sql` implementation.

2. Updated `src/services/discovery.ts`.
   - `searchAmbulances()` now accepts optional `upazilaId`, `latitude`, `longitude`, and `radiusKm`.
   - These values are forwarded to `search_ambulances` RPC instead of always sending null coordinates.

3. Updated `src/pages/VisitorHomePage.tsx`.
   - The location-scoped refresh now passes the visitor's `currentLocation` to `searchAmbulances()`.
   - Uses a 100 km radius when GPS location is available.

Deployment:
- If migration 25 has already been run successfully in Supabase, do not run it again unless desired (it is safe to re-run).
- Push this v24 project to GitHub and redeploy Vercel.
