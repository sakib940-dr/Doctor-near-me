# Admin 30-Day Trend Chart

## Added
- `supabase/24_admin_operational_trends.sql`
- `get_admin_operational_trends()` admin/super-admin guarded RPC
- `getAdminOperationalTrends()` in `src/services/adminDashboard.ts`
- `AdminOperationalTrendRow` in `src/types.ts`
- Recharts 30-day grouped bar chart in Admin Dashboard Overview

## RPC output
One row per calendar day for the last 30 days, including zero-count days:
- `day`
- `new_users` from `profiles.created_at`
- `appointments` from `appointments.created_at`

The RPC is `SECURITY DEFINER`, checks `is_admin_or_above()` before reading, revokes `anon` execute access, and grants execute only to authenticated/service_role. The authenticated grant does not expose data to non-admin users because the function itself enforces the role check.

## Deployment
If migrations 01–23 are already applied, run only:

`supabase/24_admin_operational_trends.sql`

Then deploy the frontend.
