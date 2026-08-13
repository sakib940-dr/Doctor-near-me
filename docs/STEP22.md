# Step 22 — Super Admin Control Center

Step 22 contains only powers unique to the single Super Admin. Existing Admin,
Verification, and CMS features are linked instead of rebuilt.

## Run the database patch first

Run after `supabase/20_admin_cms_security.sql`:

`supabase/21_super_admin_control_center.sql`

Expected result:

`STEP 21 SUPER ADMIN SECURITY PASSED`

Before running, the migration checks that the database has zero or one Super
Admin. If more than one already exists, it stops without choosing which account
to demote. Resolve that intentionally, then run it again.

The patch:

- enforces at most one `super_admin` through a partial unique index;
- adds full user search by name/email/phone plus role, status, district, and
  upazila filters;
- returns profile/address, safe Auth timestamps, role-specific records,
  appointment summary, target audit history, and exact last recorded location;
- audits every sensitive user-detail view;
- permits reason-required core profile correction while keeping Auth email and
  password read-only;
- promotes/demotes every non-Super-Admin role and safely disables incompatible
  Doctor/Provider/Ambulance resources;
- allows active/suspended/banned transitions with notifications and audit logs;
- creates time-limited Admin/Verification Officer invitations consumed by the
  normal Auth signup trigger for the exact invited email;
- permanently deletes disposable users only after reason, typed confirmation,
  and a second confirmation step;
- prevents self role/status/delete actions and removes browser access to legacy,
  less-constrained Super Admin RPCs.

## Route

- `/super-admin` — Users, Privileged Invites, and Existing Controls

## Privileged account creation

1. Open `Privileged invites` and enter name, exact email, role, and expiry.
2. Copy the generated registration link to the intended email owner.
3. The person registers with that exact email and confirms it when required.
4. The database trigger consumes the open invite, sets Admin/Verification
   Officer, completes the profile, and writes the audit record.
5. If an account already exists, open it in Users and promote it instead.

No service-role key is placed in the browser and no password is created or read
by the Super Admin interface.

## Destructive-action test

Use a disposable fictional account only. Open its popup, select Delete, provide
a reason, type `DELETE user@example.com`, and complete the second confirmation.
The action deletes the Auth user, Profile, owned Provider records, and cascading
role records. The pre-deletion audit snapshot remains without a user foreign key.

Never test deletion against real data. Exact location is sensitive personal data;
open it only for a legitimate operational need and review its audit record.

## Verification

```powershell
npm.cmd run typecheck
npm.cmd run build
npm.cmd run dev
```

## Paused work

Admin-equivalent features were intentionally not duplicated. Remaining platform
features such as full blood-request UI, targeted broadcasts, PWA, and extended
analytics can be continued later when requested.
