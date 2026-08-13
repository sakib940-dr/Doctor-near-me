# Step 18 — Ambulance Self-Service Dashboard

Step 18 implements the Ambulance/Others workflow from the master plan: create
and maintain an Ambulance listing, submit private verification evidence, expose
availability only after approval, and request an optional Hospital affiliation.

## Run the database patch first

Run after `supabase/16_provider_dashboard_security.sql`:

`supabase/17_ambulance_dashboard_security.sql`

Expected result:

`STEP 17 AMBULANCE DASHBOARD SECURITY PASSED`

The patch:

- requires an active Ambulance role for browser self-registration and editing;
- prevents legacy Patient-to-Ambulance role changes from browser RPC calls;
- allows only one Ambulance listing per Ambulance account;
- validates vehicle, phone, district/upazila, capabilities, and map coordinates;
- makes listing, availability, link, and document metadata writes RPC-only;
- stores evidence in the private `verification-documents` bucket;
- permits document changes only while pending/rejected;
- allows availability/GPS updates only for approved, verified, active listings;
- limits Hospital requests to approved and verified Hospitals;
- requires Hospital owner approval before a link appears publicly.

## Routes

- `/ambulance/services` — listing registration/edit, verification state,
  private documents, and live availability/GPS
- `/ambulance/hospitals` — approved Hospital search and link status
- `/provider/ambulances` — Hospital-side request approval/rejection/removal

## Live test sequence

1. Register a fictional Ambulance account and complete onboarding.
2. Create the listing with a fictional vehicle registration, contact, location,
   vehicle type, capabilities, and service area.
3. Confirm the listing starts pending and is absent from public search.
4. Upload fictional vehicle registration/driver-license/vehicle-photo files.
5. Confirm files use signed URLs and another Ambulance account cannot read them.
6. Approve the listing with an authorized Verification Officer/Admin workflow.
7. Turn availability on with GPS and confirm it appears in public Ambulance
   search without exposing exact live coordinates.
8. Edit profile data and confirm verification returns to pending and availability
   automatically turns off.
9. Re-approve, search an approved Hospital, and send a link request.
10. As that Hospital owner, approve from `/provider/ambulances`.
11. Confirm the approved Hospital name appears with the public Ambulance result.
12. Turn availability off and confirm available-only search no longer returns it.

Use fictional data only. Never upload real NID, driver license, registration, or
medical/patient information to staging.

## Verification

```powershell
npm.cmd run typecheck
npm.cmd run build
npm.cmd run dev
```

## Next frontend slice

Step 19 will implement the Verification Officer dashboard: Doctor, Provider,
and Ambulance review queues, evidence inspection, approve/reject actions, and
auditable review notes.
