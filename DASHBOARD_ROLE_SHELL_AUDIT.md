# Dashboard Role Shell Audit — v19

## Roles supported by shared shell
- doctor
- patient
- admin
- super_admin
- verification_officer
- hospital
- chamber
- ambulance

## Role menus
### Admin
Dashboard, Users, Appointments, Activity, CMS, Verification queue (pending badge), Logout.

### Super Admin
Dashboard/Control Center, Users control, Invites, Admin operations, Appointments, CMS, Verification queue (pending badge), Logout.

### Verification Officer
Dashboard, Verification queue (pending badge), Logout.

### Hospital
Dashboard, Profile & Website, Doctors, Appointments, Ambulance links, Verification evidence, Logout.

### Chamber
Dashboard, Profile & Website, Doctors, Appointments, Verification evidence, Logout.

### Ambulance
Dashboard, Service profile, Hospital links, Logout.

Doctor and patient menus are retained from the previous generic shell.

## Route shell wiring
- `/admin` -> actual authenticated role, allowed admin/super_admin
- `/admin/cms` -> actual authenticated role, allowed admin/super_admin
- `/super-admin` -> super_admin
- `/verification/reviews` -> verification_officer/admin/super_admin
- `/provider/profile`, `/provider/doctors`, `/provider/appointments` -> hospital/chamber
- `/provider/ambulances` -> hospital
- `/ambulance/services`, `/ambulance/hospitals` -> ambulance
- `/dashboard` -> DashboardPage now uses DashboardShell for every supported authenticated role

## Page chrome cleanup
Removed inner PublicHeader and Dashboard back-link from:
- AdminDashboardPage.tsx
- AdminCmsPage.tsx
- SuperAdminPage.tsx
- VerificationOfficerPage.tsx

## Navigation details
- Admin dashboard sidebar URLs use `?tab=users|appointments|activity`; AdminDashboardPage syncs them with its internal tabs.
- Super Admin sidebar uses `?tab=users|invites`; SuperAdminPage syncs them with its internal tabs.
- Mobile bottom navigation supports variable item counts using auto columns instead of a hard-coded 4-column grid.
- Pending verification count uses the existing `getVerificationReviewQueue(..., 'pending')` service and fails closed to badge count 0 if unavailable.
