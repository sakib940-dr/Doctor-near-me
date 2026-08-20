# docbd.info — Production PWA Phase Audit

Version: 0.24.0

## Scope

This phase adds a production-oriented installable PWA layer on top of the existing completed application. Existing visitor, doctor, hospital, patient, admin, Supabase, RLS, analytics, premium, follow/save, review and prescription implementations were preserved. No SQL migration is required for this PWA phase.

## PWA implementation

- Manifest: `public/manifest.webmanifest`
- Service worker: `public/sw.js`
- Offline fallback: `public/offline.html`
- Registration/update lifecycle: `src/lib/pwa.ts`
- Offline/update UI: `src/components/PwaUpdatePrompt.tsx`
- Standard icons: `public/icons/icon-192.png`, `public/icons/icon-512.png`
- Maskable icons: `public/icons/maskable-192.png`, `public/icons/maskable-512.png`
- Apple touch icon: `public/icons/apple-touch-icon.png`
- Favicon: `public/favicon.ico` plus scalable `public/icons/app-icon.svg`

The icon visual is based on the application's existing green HeartPulse brand mark, rather than a generic placeholder.

## Manifest

Configured with:

- `name`: `docbd.info`
- `short_name`: `docbd`
- `id`: `/`
- `start_url`: `/`
- `scope`: `/`
- `display`: `standalone`
- `background_color`: `#f7f9fb`
- `theme_color`: `#0b8467`
- 192×192 and 512×512 standard PNG icons
- 192×192 and 512×512 maskable PNG icons

No orientation lock is applied because the application should remain usable in both portrait and landscape layouts.

## Cache policy

The service worker uses an allowlist approach.

1. **Navigations:** network-first. No personalized HTML page is stored. If navigation fails because the user is offline, `offline.html` is returned.
2. **Vite hashed `/assets/` resources:** cache-first. Only same-origin script/style/font/image resources under the production hashed asset directory are cached.
3. **PWA public assets:** stale-while-revalidate for manifest/favicon/icons.
4. **Cross-origin requests:** network only. This includes the existing Supabase auth/database/storage traffic.
5. **Private application routes/data:** not precached and not dynamically cached. Prescription, patient private data, dashboard responses, appointments and authentication data are not in Cache Storage.

## Offline behavior

- A Bengali offline fallback page is cached during service-worker installation.
- If connectivity drops while the app is already open, an in-app Bengali offline notice is displayed.
- Full offline medical-directory data is intentionally not implemented.

## Service-worker update behavior

- `sw.js` is served with no-store/no-cache headers on Vercel so browser update checks are not blocked by CDN caching.
- Registration uses `updateViaCache: 'none'`.
- Update checks occur when the page becomes visible, when connectivity returns and periodically while the app is open.
- A waiting worker triggers an in-app Bengali update notice.
- The user can activate the waiting worker with `SKIP_WAITING`; the page reloads only after the new worker takes control.
- Existing Supabase/localStorage session state is not cleared by the update path.

Future releases that materially change service-worker cache behavior should increment `SW_VERSION` in `public/sw.js`.

## Deep links and routing

- Existing `BrowserRouter` routing is preserved.
- Vercel static PWA files are excluded from the SPA fallback, then all application deep links fall back to `index.html`.
- `/doctors/:doctorId` now accepts either the existing UUID or an approved doctor's existing `profile_slug`; the slug is resolved through the existing public/RLS-protected doctors table before existing public-profile RPCs run.
- Existing hospital/provider routes remain unchanged.
- Supabase auth still has `persistSession: true`, `autoRefreshToken: true`, and `detectSessionInUrl: true`.

## Hosting requirements

Production hosting must:

1. Use HTTPS. Service workers are available only in secure contexts (localhost is allowed for development/testing).
2. Serve `/sw.js`, `/manifest.webmanifest`, `/offline.html`, `/favicon.ico` and `/icons/*` as real static files rather than rewriting them to `index.html`.
3. Rewrite unknown application routes to `/index.html` so BrowserRouter refresh/deep links do not return 404.
4. Avoid long-lived caching for `/sw.js`; hashed `/assets/*` may be cached immutably.

`vercel.json` is configured for these requirements.

## Validation performed

`npm run pwa:validate` passes and checks:

- required manifest fields
- required standard/maskable icon files and PNG dimensions
- manifest/favicon links in `index.html`
- service-worker strategy markers
- absence of sensitive app routes from the precache shell
- Vercel PWA-file exceptions and SPA fallback
- public doctor UUID/slug resolver wiring
- Supabase session persistence settings

Additional validation performed:

- `node --check public/sw.js`: PASS
- Changed TS/TSX files parsed/transpiled with the available global TypeScript compiler: PASS

## Production build limitation in this execution environment

`npm run build` was invoked as requested. The uploaded ZIP does not contain installed dependencies (`node_modules`) or a package lock. Installing dependencies from npm was attempted, but this execution environment could not fetch the npm registry; offline npm cache was empty. The build therefore stops at dependency resolution with missing-module errors such as React/Vite, before a meaningful project typecheck or Vite bundle can run.

This is an environment/dependency availability limitation, not a successful runtime/browser test. On a normal development/CI/Vercel environment with npm registry access, run:

```bash
npm install
npm run pwa:validate
npm run build
```

Then verify install/standalone/update behavior in deployed HTTPS Chrome/Edge DevTools/Application or Lighthouse.

## Browser-test status

The code/configuration for Mobile Chrome and Desktop Chrome/Edge installability is present, but an actual browser install test could not be completed in this container because a production bundle could not be created without dependencies. This should be the final deployment smoke test, not silently treated as passed.
