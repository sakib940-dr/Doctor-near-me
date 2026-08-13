# Visitor / Patient Landing Frontend Update

Frontend-only refresh. Existing Supabase SQL, RLS, RPC, authentication backend and dashboard backend were not modified.

## Added / updated
- Mobile-first visitor landing page with compact district, upazila, browser location permission and search controls.
- "আপনার এলাকার ডাক্তার" horizontal discovery section.
- "জনপ্রিয় / সকল ডাক্তার" discovery section.
- Speciality category section.
- Public Hospital / Chamber cards and list page.
- Public provider detail page with vertical doctor list, location box and Google Maps direction link.
- Blood Bank and Ambulance quick-access sections.
- Wider horizontal doctor card showing profile photo, name, degree, speciality, designation, BMDC (when available), and area.
- Existing `/doctors` directory remains the 20-per-page vertical "সব দেখুন" listing.
- Doctor cards continue to open the existing professional public doctor profile.
- Logged-in users visiting `/` are redirected to their existing role dashboard; dashboard logout already returns to `/`.
- Mobile visitor bottom navigation added.

## Backend status
No files under `supabase/` were changed.

## Build note
The supplied archive had incomplete extracted `node_modules` folders (notably empty `@types/react` and `@types/react-dom`). Changed TypeScript source files pass syntax transpilation checks. Run a clean dependency install before production build:

```bash
rm -rf node_modules
npm install
npm run build
```
