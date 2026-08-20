# PWA Install Promotion Phase Audit

Baseline: Phase 3 production PWA (`0.24.0`). This phase preserves the existing manifest, service worker, offline fallback, update mechanism, application routing, Supabase authentication/session persistence, dashboards, public profiles, and medical/private-data cache exclusions.

## Implementation

- Version: `0.25.0`
- Install UX component: `src/components/PwaInstallPromotion.tsx`
- Existing PWA utility extended: `src/lib/pwa.ts`
- Global mount: `src/App.tsx`
- Responsive/safe-area styling: `src/styles.css`
- Validation: `scripts/validate-pwa-install-promotion.mjs`
- No SQL migration required.

## Once per calendar day

The browser promotion uses `localStorage` key `pwa_install_prompt_last_shown`. The value is a local-calendar `YYYY-MM-DD` key. The day is claimed synchronously before `setVisible(true)`, so React StrictMode, rerenders, route changes, and reloads cannot produce a second prompt that calendar day. If persistent local storage is unavailable, the promotion is suppressed rather than risking repeated prompts.

Pressing `এখন নয়`/`Not now` simply closes the already-claimed daily promotion. On the next local calendar day, the date comparison makes the browser eligible again if the PWA is still not installed and the current platform offers a supported install path.

## Installed detection

The shared PWA utility checks:

- `window.matchMedia('(display-mode: standalone)')`
- iOS `navigator.standalone`
- the `appinstalled` event
- a local installed marker written only after a native install is accepted/confirmed

If Chrome later emits `beforeinstallprompt` again (for example after an uninstall), the stale installed marker is removed because the browser itself has confirmed install eligibility again.

## Android / Chrome and desktop Chrome / Edge

`beforeinstallprompt` is captured early by the existing `registerPwaServiceWorker()` startup path and `preventDefault()` is called. The event is deferred in the shared PWA utility. No native prompt is opened automatically. It is opened only from the user's `Install` button click, then `userChoice` is processed. Accepted install closes the promotion, updates installed state, and prevents future promotion.

Desktop uses the same native deferred event but renders as a compact bottom-right card rather than an oversized mobile modal.

## iPhone / iPad

For iOS Safari, no fake native prompt is attempted. The initial install button expands the compact card into localized manual instructions:

1. Tap Safari Share.
2. Choose Add to Home Screen.
3. Tap Add.

Bangla is shown when the global visitor language is Bangla; English is shown when English is selected. iOS Chrome/Firefox/Edge do not receive Safari-specific instructions.

## UX guards

- 2.2 second presentation delay after supported install eligibility is known.
- Non-modal fixed card; no full-screen backdrop and no content lock.
- Mobile offset sits above the existing bottom navigation and respects safe-area insets.
- Desktop is a compact bottom-right card.
- Clear close control and `এখন নয়` / `Not now` action.
- Existing PWA update notice takes precedence; install promotion is hidden while an update prompt is visible.
- Promotion is hidden in standalone display mode.
- Offline state hides the install promotion; existing offline notice remains authoritative.
- No AuthContext, Supabase session, patient data, prescription data, or dashboard data is changed by this feature.

## Validation coverage

`npm run pwa:validate` validates both the previous PWA production checks and this phase. The install-promotion validator covers:

1. First visit today eligibility.
2. Same-day dismissal policy.
3. Same-day reload suppression.
4. Next-day simulation.
5. Native accepted-install wiring and `appinstalled` handling.
6. Standalone detection.
7. Android/Chromium deferred native install wiring.
8. iPhone/iPad Safari manual fallback and iOS alternate-browser exclusion.
9. Desktop native install wiring and desktop compact CSS.
10. Auth/session isolation for existing logged-in users.

Real browser install UI still depends on HTTPS and Chrome/Edge installability criteria at deployment time. The native install dialog itself cannot be forced or emulated by application code when the browser does not emit `beforeinstallprompt`.

## Build environment note

A full `npm run build` was attempted. The uploaded project does not include `node_modules` or a lockfile, and this execution environment cannot resolve the declared React/Vite dependencies, so TypeScript stops at missing-package/module declarations before a meaningful application build can run. The changed `pwa.ts`, `PwaInstallPromotion.tsx`, `PwaUpdatePrompt.tsx`, and `App.tsx` files separately passed TypeScript transpile/syntax validation, and `npm run pwa:validate` passes without external dependencies.
