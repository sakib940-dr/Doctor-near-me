# Step 12 — React Frontend Foundation

Step 12 starts the browser-testable public application using the stack selected
in the master plan: React, Vite, TypeScript, Tailwind CSS, and Supabase.

## Included

- Bangla-first responsive public homepage
- Desktop and mobile navigation
- CMS homepage configuration through `get_homepage_configuration`
- Live district list
- Disease/organ discovery topics
- Doctor search through `search_doctors_advanced`
- Available ambulance search through `search_ambulances`
- Public image URL abstraction in `src/lib/storage.ts`
- Safe missing-environment state instead of an application crash
- Production TypeScript build

## Connect the staging Supabase project

1. Copy `.env.example` to `.env.local`.
2. Open Supabase Dashboard → Project Settings → API.
3. Set `VITE_SUPABASE_URL` to the project URL.
4. Set `VITE_SUPABASE_PUBLISHABLE_KEY` to the publishable key.
   A legacy anon key can instead use `VITE_SUPABASE_ANON_KEY`.
5. Never put the service-role key in a Vite environment file.

## Run locally

```powershell
npm.cmd install
npm.cmd run dev
```

Open `http://127.0.0.1:5173/`.

## Verify

```powershell
npm.cmd run typecheck
npm.cmd run build
```

Expected production output is written to `dist/`.

## Live browser checks

- Homepage topics load from Step 11 seed data.
- The district dropdown contains the 64 districts.
- Doctor search returns only approved, active doctors.
- Topic clicks pass mapped specialty IDs into doctor search.
- Ambulance search returns only approved listings and defaults to currently
  available services.
- Clicking an ambulance phone number opens the device dialer.
- With no approved doctor/ambulance records, the empty state is expected.

## Next frontend slice

Step 13 will add dedicated doctor discovery routes, cascading
district/upazila filters, complete advanced filters, pagination, and doctor
profile navigation.
