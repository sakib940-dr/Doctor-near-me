# Privileged Responsive Audit — v23

## Pages audited
- AdminDashboardPage.tsx
- AdminCmsPage.tsx
- SuperAdminPage.tsx
- VerificationOfficerPage.tsx

## Breakpoints
- 360px: stacked cards/forms/dialog actions; admin appointments become full card rows; Super Admin detail/JSON records become one-column; verification sheet uses bottom-sheet geometry.
- 768px: dashboard shell mobile boundary; filters/editors collapse to one column; sticky/modal content gets touch-sized controls; bottom padding protects mobile navigation.
- 1024px: tablet two-column/three-column dense layouts collapse before crowding; CMS workspace becomes one column; verification detail uses one-column definition list.
- 1440px: privileged content is capped at 1280px and centered; dense lists retain readable line length.

## Dense-layout changes
- `admin-appointment-list`: desktop row -> mobile stacked appointment card with status + full-width override control.
- `super-detail`: desktop modal -> mobile near-fullscreen bottom sheet.
- `JsonSection`: arrays render as individual records instead of one JSON blob; fields become stacked key/value cards on mobile.
- CMS: list/editor and content/settings workspace collapse to one column; tabs remain horizontally scrollable.
- Verification queue/detail: rows stack cleanly; dialog becomes mobile sheet; bulk actions become full-width controls.

## Unified admin search feasibility
Existing `getAdminUserDirectory` can search accounts by name/email/phone/role, but it is not a true entity search: provider business names and ambulance service names can differ from account names. Public discovery services would also omit unapproved/non-public records, which is incorrect for an admin tool.

Recommended implementation: an admin-only `get_admin_global_search(p_query, p_limit)` RPC returning a normalized union of `user`, `doctor`, `provider`, and `ambulance` entities with `entity_type`, `entity_id`, `title`, `subtitle`, `status`, and `target_path`. Gate it with `is_admin_or_above()`/admin RLS semantics, then mount a debounced `AdminShellSearch` inside `DashboardShell` only for `admin` and `super_admin`. No incomplete client-side global search was added in this pass.
