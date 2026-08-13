# Step 17 — Hospital / Chamber Dashboard

Step 17 implements the Provider-side workflow from the master plan: maintain an
organization profile, manage departments/services/gallery, invite verified
Doctors with explicit consent, manage chamber-level schedules, and operate a
shared appointment reception queue.

## Run the database patch first

Run after `supabase/15_doctor_dashboard_security.sql`:

`supabase/16_provider_dashboard_security.sql`

Expected result:

`STEP 16 PROVIDER DASHBOARD SECURITY PASSED`

The patch:

- makes Provider, Doctor-link, and chamber-schedule writes RPC-only;
- supports Hospital/Chamber profile creation and owner-safe editing;
- resets Provider verification when its name or location changes;
- validates owner-scoped logo, banner, and gallery storage paths;
- replaces automatic Provider-owner Doctor approval with pending invitations;
- requires the Doctor to accept before Provider schedule management;
- prevents Provider owners from editing Doctor personal/profile fields;
- deactivates schedules when a Doctor link is removed;
- retains strict appointment status transitions from Step 15.

## Routes

- `/provider/profile` — organization profile, contacts, location, departments,
  services, logo/banner/gallery, and verification status
- `/provider/doctors` — approved Doctor search, invitations, link state, and
  chamber-level schedule management
- `/provider/appointments` — shared reception appointment queue
- `/doctor/invitations` — Doctor consent inbox for Hospital/Chamber links

## Live test sequence

1. Sign in with a fictional Hospital account and create a Provider profile.
2. Confirm it is `pending`, then approve/verify it with an authorized staging
   Admin workflow.
3. Search for an approved fictional Doctor and send an invitation.
4. Confirm schedule controls remain unavailable while the link is `pending`.
5. Sign in as that Doctor, open `/doctor/invitations`, and accept.
6. Sign back in as the Provider and add a visiting schedule.
7. Book that exact schedule from a fictional Patient account.
8. Confirm the request appears in both Doctor and Provider appointment queues.
9. Confirm it from the Provider queue and complete it after consultation.
10. Remove the Doctor link and verify its schedules become inactive.

Use fictional data only. Never use real patient or identity-document data in
staging.

## Verification

```powershell
npm.cmd run typecheck
npm.cmd run build
npm.cmd run dev
```

## Next frontend slice

Step 18 will implement Ambulance account self-service: service registration,
vehicle/contact/capability editing, availability control, hospital link status,
and verification state using the existing secure ambulance foundation.
