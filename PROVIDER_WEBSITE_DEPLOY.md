# Provider Website Module — Deploy Notes

## What was added
- `supabase/22_provider_website_content.sql`
- `src/services/providerWebsiteContent.ts`
- `src/components/ProviderWebsiteContentTabs.tsx`
- `src/pages/ProviderWebsitePage.tsx`
- Route: `/providers/:slug/website`
- Provider card Website navigation for public approved/verified providers
- Provider profile dashboard content management UI for hospital/chamber accounts

## Database migration order
Your existing database must already have migrations 01–21 applied.

Then run **only this new migration** in Supabase SQL Editor:

`supabase/22_provider_website_content.sql`

The migration creates:
- `provider_services`
- `provider_gallery_images`
- `provider_slider_images`
- `provider_reviews`
- `provider_treatment_costs`
- `provider_investigation_costs`

It also updates `public_provider_directory` to expose the approved/verified provider fields required by the public website.

## RLS behavior
- Owner (`providers.owner_user_id = auth.uid()`) can read and mutate their own content.
- Public can read content only when parent provider is `status='approved'` and `verified=true`.
- Hidden services/gallery/slider rows are not public.
- Unpublished reviews are not public.
- Public cannot insert/update/delete.

## Image storage
Content images use existing bucket `public-images`.
Upload path:
`<auth-user-id>/<provider-id>/website/<service|gallery|slider>/<generated-filename>`

No new bucket is required.

## GitHub / Vercel deployment
1. Replace/upload this project to GitHub.
2. Run the SQL migration in Supabase first.
3. Confirm production environment variables match `.env.example` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
4. Deploy/redeploy the GitHub branch on Vercel.
5. Build command: `npm run build`
6. Output directory: `dist`

## Required smoke tests
- Approved + verified hospital/chamber card opens `/providers/<slug>/website`.
- Unapproved/unverified provider cannot be resolved through the public website route.
- Owner can create/edit/delete/reorder each content type.
- Provider A cannot mutate Provider B rows.
- Logged-out user cannot mutate content.
- Empty slider/services/gallery/reviews/costs render without crashes.
- Linked doctors appear and appointment links still use existing doctor booking route.
- Image upload works for service/gallery/slider and returns after refresh.
- Hidden content does not appear publicly.
- Mobile layout does not overflow.

## Validation note
The supplied ZIP contained empty `node_modules/@types/react` and `node_modules/@types/react-dom` directories. Syntax parsing and source/import checks were completed, but a clean dependency-based `npm run build` could not be completed in the packaging environment because fresh `npm ci` could not finish there. GitHub/Vercel will install dependencies from `package-lock.json`; verify the first production build log before promoting the deployment.
