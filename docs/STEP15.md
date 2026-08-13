# Step 15 — Patient Profile and Appointment Workflow

Step 15 implements the first complete signed-in patient workflow: maintain a
patient profile, request an appointment from an approved doctor schedule, view
appointment history, and cancel a pending/confirmed request.

## Run the database patch first

Run after Step 13:

`supabase/14_patient_appointment_security.sql`

Expected result:

`STEP 14 PATIENT APPOINTMENT SECURITY PASSED`

The patch:

- removes direct authenticated insert/update/delete grants on appointments;
- exposes appointment mutations only through authenticated RPCs;
- validates active Patient role and completed profile;
- accepts only approved doctors, approved/verified chambers, and exact active
  visiting schedules;
- restricts dates to today through the next 180 days;
- prevents duplicate active requests for the same patient and schedule;
- allows patients to cancel only pending or confirmed appointments;
- provides a private Patient profile RPC without exposing other users.

## Routes

- `/profile` — Patient profile editing
- `/appointments` — Patient appointment history and status filters
- `/doctors/:doctorId/book` — appointment request flow

All three routes require an authenticated Patient account.

## Booking flow

1. Open an approved doctor's public profile.
2. Select **অ্যাপয়েন্টমেন্ট নিন**.
3. Log in if required.
4. Select an approved chamber/hospital.
5. Select a date.
6. Select one of that weekday's active visiting schedules.
7. Add an optional note of at most 500 characters.
8. Submit the request.

The initial status is `pending`. The request becomes `confirmed` only after a
Doctor/Hospital workflow accepts it in a later dashboard step.

## Staging data requirements

To test a successful booking, staging needs:

- one completed Patient account;
- one approved, active Doctor with `accepting_appointments=true`;
- one approved Doctor ↔ Provider link;
- one approved and verified chamber/hospital;
- at least one active chamber schedule.

Use fictional data only.

## Verification

```powershell
npm.cmd run typecheck
npm.cmd run build
npm.cmd run dev
```

Test request creation, page refresh, status filtering, cancellation confirmation,
and rejection of a duplicate request. Also verify a Doctor/Hospital account
cannot open the Patient-only pages.

## Next frontend slice

Step 16 will implement the Doctor dashboard: profile details, chamber schedule
management, appointment confirmation/rejection/completion, and verification
submission status.
