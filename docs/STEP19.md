# Step 19 — Verification Officer Dashboard

Step 19 connects the least-privilege verification workflow for Doctor,
Hospital/Chamber Provider, and Ambulance applications. Officers can inspect
submitted data and private evidence, then approve or reject with an auditable
review note. They cannot edit an applicant's profile or use Admin CMS/user
management capabilities.

## Run the database patch first

Run after `supabase/17_ambulance_dashboard_security.sql`:

`supabase/18_verification_officer_dashboard.sql`

Expected result:

`STEP 18 VERIFICATION OFFICER SECURITY PASSED`

The patch:

- adds review note, reviewer, and review time to Doctor and Provider records;
- creates RPC-only Doctor/Provider evidence metadata;
- extends the private `verification-documents` bucket to `doctors/{id}` and
  `providers/{id}` folders without exposing direct table access;
- permits owners to change evidence only while pending or rejected;
- provides one oldest-first Doctor/Provider/Ambulance review queue;
- exposes full review details only to Verification Officer, Admin, and Super Admin;
- enforces approved/rejected decisions server-side and requires rejection reasons;
- sends the owner a notification and records every decision in `admin_audit_logs`;
- turns Ambulance availability off immediately after rejection.

## Routes

- `/verification/evidence` — Doctor and Hospital/Chamber owner evidence upload,
  signed viewing, deletion, status, and rejection note
- `/verification/reviews` — authorized review queue, filters, read-only details,
  signed evidence viewing, and two-step approve/reject decisions

## Live test sequence

1. Use fictional Doctor, Hospital/Chamber, and Ambulance accounts only.
2. Upload Doctor BMDC/degree and Provider trade-license/organization evidence.
3. Create or use a staging `verification_officer` account; this role must never
   be offered by public registration.
4. Open `/verification/reviews` and confirm all three pending entity types appear
   in oldest-first order.
5. Open each review and confirm submitted data cannot be edited and evidence
   opens with a signed private URL.
6. Reject one application. Confirm a meaningful reason is mandatory and appears
   to the owner on `/verification/evidence` or the Ambulance service screen.
7. Correct and re-submit as the owner; confirm the item returns to pending.
8. Approve it and verify the public directory reflects the approved state.
9. Confirm the Officer cannot use Admin CMS/user management or direct table
   mutation, and confirm the notification plus audit-log records were created.

Never upload real NID, license, registration, or medical/patient data to staging.

## Verification

```powershell
npm.cmd run typecheck
npm.cmd run build
npm.cmd run dev
```

## Next frontend slice

Step 20 will implement the Admin dashboard: role-aware user management,
verification oversight, account controls, operational summaries, and audit-log
visibility without granting Super Admin-only authority.
