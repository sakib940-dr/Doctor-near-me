# Super Admin — User Management: Compact Photo Card

## What changed

### 1. Database (new, additive-only)
- `supabase/80_super_admin_user_directory_avatar.sql`
- Adds `super_admin_user_directory_v4(...)` — same filters/permissions as v3, plus one new
  output column: `avatar_url` (doctor's `profile_photo_url`, falling back to `profiles.avatar_url`
  for non-doctors — same pattern already used elsewhere in the app).
- No existing function touched, no RLS change. v3/v2 kept as-is for safe rollback.

### 2. Service (`src/services/superAdmin.ts`)
- `getSuperAdminUserDirectory` now calls `v4` first, falls back to `v3`, then `v2` — same
  fallback safety net as before, just one more rung.

### 3. Type (`src/types.ts`)
- `SuperAdminUserRow.avatar_url?: string | null` added.

### 4. User Management card (`src/pages/SuperAdminPage.tsx` + `src/styles.css`)
Card redesigned to match the public visitor/doctor directory card style — a real photo strip
on the left, info on the right — but more compact:
- Grid: `minmax(230px, 1fr)` columns (was 280px), card height ~100px (was a taller stacked card).
- Left: actual profile photo via `avatars` bucket (`getImageUrl(..., 'avatars', 'thumbnail')`),
  falling back to the existing role-colored initials avatar when no photo is set.
- Super Admin gets a small crown badge overlaid on the photo corner (kept from before).
- Right: name, role (+ medical type for doctors), email/phone on one line, location on one line,
  and a footer row with status pill + last-login time — same data as before, tighter layout.
- Cleaned up now-dead responsive CSS rules that targeted the old card's direct-child structure
  (`> b`, `> .super-status`, `> time`), which no longer applied after this restructuring.

## Scope & safety
- Only the User Management (`tab === 'users'`) card markup/CSS and the directory RPC changed.
- Bottom nav (Analytics / Verification / Admin / Premium / Inbox), invites, controls, and the
  user detail drawer are untouched.

## Verification performed in this environment
```
npm install
npx tsc -b --pretty false   # clean
npx vite build               # clean, dist/ produced
```
No Supabase access in this environment — please run migration `80_super_admin_user_directory_avatar.sql`
on staging, then check:
- `/super-admin` → Admin tab → Users: cards show real photos where `avatar_url`/doctor
  `profile_photo_url` is set, initials fallback otherwise.
- Card grid is visibly more compact than before, responsive at 360 / 768 / 1440px.
- Clicking a card still opens the same detail drawer with no regression.
