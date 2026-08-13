# Live Testing Milestones

## Staging database test — available after Step 11

Use a new Supabase staging project, not the production database.

1. Run migrations `01` through `11`, then `11b`, `12`, `13`, `14`, and `15`, in filename order.
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
9. Register fictional Patient, Doctor, Hospital, and Ambulance accounts.
10. Confirm privileged roles are absent from the public registration page.
11. Confirm email when enabled, complete onboarding, refresh the protected
    dashboard, and log out for every test role.
12. Confirm a new Doctor account remains pending and absent from public search.
13. Complete a fictional Patient profile with district/upazila and emergency
    contact details.
14. Book an approved doctor's exact active chamber schedule.
15. Confirm the request appears as pending under `/appointments` after refresh.
16. Confirm duplicate active booking and arbitrary schedule payloads fail.
17. Cancel the pending request through the two-step confirmation UI.
18. Sign in as the fictional Doctor and save `/doctor/profile`; verify degree,
    designation, BMDC, specialty, location, photo, and appointment preference.
19. Change a credential and confirm the Doctor returns to pending verification.
20. At `/doctor/schedules`, add/edit/delete a schedule only for an approved and
    verified linked chamber. Confirm a pending/unverified link stays read-only.
21. Book again as the Patient, then as the Doctor confirm the pending request,
    mark it completed, and verify both Patient and Doctor history after refresh.
22. Verify pending → completed and completed → confirmed are rejected by the
    server, even if attempted outside the UI.

## Full end-to-end testing

Patient ↔ Doctor appointment testing is now available end to end. Full provider,
blood request, verification-officer, and admin workflow testing starts after the
remaining role dashboards are connected.
