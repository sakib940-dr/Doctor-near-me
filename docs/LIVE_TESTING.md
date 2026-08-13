# Live Testing Milestones

## Staging database test — available after Step 11

Use a new Supabase staging project, not the production database.

1. Run migrations `01` through `11`, then `11b` and `12`, in filename order.
2. Run `tests/step11_smoke.sql`.
3. Confirm the final `STEP 11 SMOKE TEST PASSED` result.
4. Test public RPCs from the Supabase API panel:
   - `get_homepage_configuration`
   - `search_doctors_advanced`
   - `search_ambulances`
5. Create separate test users for Patient, Doctor, Hospital, Ambulance,
   Verification Officer, Admin, and Super Admin.
6. Never use real patient, phone, location, or identity-document data in staging.

## Browser testing — available after Step 12

1. Copy `.env.example` to `.env.local` and add the staging project URL and
   publishable key. Never use the service-role key in the browser app.
2. Run `npm.cmd install` and `npm.cmd run dev`.
3. Open `http://127.0.0.1:5173/`.
4. Confirm topics and all 64 districts load from Supabase.
5. Search approved doctors by name/topic/district.
6. Switch to ambulance mode and search available approved ambulances.
7. Open `/doctors`, combine district/upazila/specialty filters, and refresh to
   verify the URL retains the filters.
8. Open an approved doctor's `/doctors/:doctorId` page and verify only public
   fields, approved chambers, and active schedules appear.

## Full end-to-end testing

Full appointment, blood request, verification, and role-dashboard testing
starts after the public UI and dashboards are connected in later frontend steps.
