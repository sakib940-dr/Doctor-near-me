# Step 20 — Admin Operations Dashboard

Step 20 connects daily platform operations for Admin and Super Admin. It adds a
platform summary, operational user directory, safe account suspension/restoration,
verification oversight, appointment dispute overrides, notifications, and an
auditable activity view.

## Run the database patch first

Run after `supabase/18_verification_officer_dashboard.sql`:

`supabase/19_admin_operations_dashboard.sql`

Expected result:

`STEP 19 ADMIN OPERATIONS SECURITY PASSED`

The patch:

- returns aggregate user, service, verification, and appointment counts;
- gives Admin a searchable operational user directory while hiding privileged
  Admin/Super Admin records from ordinary Admin users;
- permits only active/suspended transitions, requires a suspension reason, and
  prevents self-suspension or privileged-account management;
- keeps banned-account restoration and all role changes outside Admin authority;
- disables live Ambulance availability when its owner is suspended;
- adds a searchable appointment directory and reason-required status override;
- notifies affected users and records mutations in `admin_audit_logs`;
- shows Admin only their own activity while Super Admin can see the full trail;
- keeps direct Profile and Appointment table mutation revoked.

## Route

- `/admin` — Overview, Users, Appointments, and Activity tabs
- `/verification/reviews` — linked verification oversight queue

## Live test sequence

1. Use staging and fictional accounts/data only.
2. Sign in as Admin and compare Overview counts with staging records.
3. Search/filter users and suspend a fictional Patient, Doctor, Provider,
   Ambulance, or Verification Officer with a meaningful reason.
4. Confirm the target is notified and loses active operational access. For an
   Ambulance owner, confirm availability is immediately disabled.
5. Restore the suspended account and confirm an audit record is created.
6. Confirm Admin cannot act on self, Admin, Super Admin, banned status, or roles.
7. In Appointments, select a fictional dispute case and choose a new status.
8. Confirm a reason and second confirmation are mandatory; then verify Patient
   and Doctor notifications plus updated histories.
9. Confirm Admin Activity shows only the signed-in Admin's mutations.
10. Sign in as Super Admin and confirm the Activity tab displays all privileged
    actions while role changes remain outside this Step 20 interface.

## Verification

```powershell
npm.cmd run typecheck
npm.cmd run build
npm.cmd run dev
```

## Next frontend slice

Step 21 will implement Admin reference/CMS controls: specialties, discovery
topics, homepage sections/banners, and site content/settings with ordering,
activation, validation, and audit records.
