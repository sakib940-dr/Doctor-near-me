# Stable Public Slugs + Profile Sharing

Baseline: Phase 5 Push Notifications. The held Technical SEO phase and its SQL were not merged.

Deployment order: run `supabase/52_stable_public_slugs_and_share_analytics.sql` once in Supabase SQL Editor, then deploy this project ZIP.

Implemented: stable unique Doctor/Provider slugs, legacy route aliases, clean `/doctor/:slug`, `/hospital/:slug`, `/chamber/:slug` public routes, native Web Share with copy fallback, and share analytics using the existing `profile_interactions` system.

Domain-independent: share URLs use `window.location.origin`. No canonical, sitemap, Search Console, SEO server-rendering, or custom-domain configuration was added. Existing `index.html`, `vercel.json`, and `public/sw.js` remain byte-identical to Phase 5.

Validation passed: PWA, install promotion, push notification regression, slug/share architecture, changed TS/TSX transpilation, and SQL structural/domain-independence checks. Full TypeScript/build was attempted but could not resolve project dependencies because the source ZIP has no installed dependencies/lockfile and package installation timed out in the execution environment.
