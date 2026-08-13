# Step 14 — Authentication and Role-Aware Onboarding

Step 14 adds the public account entry flow and the protected dashboard
foundation.

## Run the database patch first

Run after Step 12:

`supabase/13_auth_onboarding_security.sql`

Expected result:

`STEP 13 AUTH ONBOARDING SECURITY PASSED`

The patch:

- allows self-registration only as Patient, Doctor, Hospital, or Ambulance;
- prevents self-registration as Admin, Super Admin, or Verification Officer;
- creates a pending doctor row for Doctor accounts;
- blocks direct authenticated updates to sensitive `profiles` columns;
- exposes a field-safe onboarding RPC to authenticated users only;
- explicitly restricts account/dashboard RPCs to authenticated/service roles.

## Routes

- `/auth` — login
- `/auth?mode=register` — registration and role choice
- `/onboarding` — protected profile completion
- `/dashboard` — protected role-aware account home

## Supabase Auth dashboard setup

In Supabase Dashboard → Authentication → URL Configuration:

1. Set **Site URL** to the production Vercel domain.
2. Add both production and preview/local URLs to **Redirect URLs** as needed.
3. Local development redirect: `http://127.0.0.1:5173/**`
4. Production example: `https://YOUR-DOMAIN.vercel.app/**`

Email confirmation can remain enabled. With confirmation enabled, registration
shows a check-email message and the user logs in after confirming.

## Environment variables

Vercel must contain:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Never expose a service-role key in the browser project.

## Staging test accounts

Use separate fictional accounts for:

- Patient
- Doctor
- Hospital
- Ambulance

Never use real patient, medical, identity-document, or phone data in staging.
Admin and Verification Officer roles must be assigned only through the secure
admin workflow/database bootstrap, never from registration.

## Verification

```powershell
npm.cmd run typecheck
npm.cmd run build
npm.cmd run dev
```

For each test role, register, confirm email if enabled, finish onboarding,
refresh `/dashboard`, then log out. Doctor/provider profiles must remain
non-public until verification is approved.

## Next frontend slice

Step 15 will implement Patient profile editing and the appointment request and
history workflow using the existing protected appointment RPCs.
