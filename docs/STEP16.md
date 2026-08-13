# Step 16 — Doctor Dashboard

Step 16 completes the first signed-in Doctor workflow: maintain a professional
profile, see verification state, manage schedules at approved chambers, and
process patient appointment requests.

## Run the database patch first

Run after `supabase/14_patient_appointment_security.sql`:

`supabase/15_doctor_dashboard_security.sql`

Expected result:

`STEP 15 DOCTOR DASHBOARD SECURITY PASSED`

The patch:

- makes Doctor/profile/specialty/schedule/link mutations RPC-only;
- prevents Doctors from approving their verification or chamber link;
- resets Doctor verification to `pending` when degree, designation, or BMDC
  registration changes;
- accepts schedule changes only for the signed-in Doctor at an approved,
  verified, linked provider;
- enforces appointment transitions: pending → confirmed/rejected/cancelled and
  confirmed → completed/no-show/cancelled;
- notifies the Patient when a Doctor changes appointment status.

## Routes

- `/doctor/profile` — professional details, specialty, location, photo,
  verification state, and booking preference
- `/doctor/schedules` — visiting schedule management for approved chambers
- `/doctor/appointments` — request confirmation, rejection, completion,
  no-show, and cancellation

All routes require an authenticated active Doctor account. Other roles are
redirected to their dashboard.

## Staging data requirements

- one fictional completed Doctor account;
- one approved and verified chamber/hospital;
- one approved Doctor ↔ Provider link;
- one fictional completed Patient account for appointment tests.

## Verification

```powershell
npm.cmd run typecheck
npm.cmd run build
npm.cmd run dev
```

Verify profile persistence, credential-change re-verification, image type/size
validation, schedule add/edit/delete, unverified-chamber denial, status filters,
two-step destructive actions, and invalid appointment-transition denial.

## Next frontend slice

Step 17 will implement the Hospital/Chamber dashboard: organization profile,
Doctor link/invitation review, schedules, and shared appointment operations.
