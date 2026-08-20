# docbd.info — Phase 5 Push Notification Production Audit

Version: 0.26.0
Baseline: Phase 4 PWA Install Promotion ZIP
Database migration: `supabase/51_web_push_notification_center.sql`

## Preservation

The Phase 4 PWA/service-worker implementation and all existing application features remain in place. This phase reuses the existing `public.notifications` table and existing notification RPC/event architecture instead of creating a second in-app notification system.

## Files changed/added from Phase 4

- `.env.example`
- `package.json`
- `public/sw.js`
- `scripts/generate-vapid.mjs` (new)
- `scripts/validate-push-notifications.mjs` (new)
- `src/App.tsx`
- `src/components/DashboardShell.tsx`
- `src/components/NotificationBell.tsx` (new)
- `src/components/PublicHeader.tsx`
- `src/components/PushNotificationManager.tsx` (new)
- `src/components/PushPermissionPromotion.tsx` (new)
- `src/contexts/AuthContext.tsx`
- `src/pages/NotificationsPage.tsx` (new)
- `src/services/notifications.ts` (new)
- `src/styles.css`
- `src/vite-env.d.ts`
- `supabase/51_web_push_notification_center.sql` (new)
- `supabase/PUSH_NOTIFICATION_SETUP.md` (new)
- `supabase/functions/send-web-push/index.ts` (new)
- `PUSH_NOTIFICATION_PHASE_AUDIT.md` (new)

## Permission UX

- Browser `Notification.requestPermission()` is never called on page load.
- A custom Bengali prompt is shown only to authenticated users because subscriptions are bound to an account.
- Browser permission is requested only after the user presses `নোটিফিকেশন চালু করুন`.
- Denied permission suppresses subsequent custom permission prompts because the UI only appears while permission is `default`.
- `এখন নয়` snoozes the custom prompt for 7 days to avoid repeated interruption.

## Push subscription lifecycle

- Requires HTTPS/secure context, Service Worker and PushManager.
- Uses `VITE_WEB_PUSH_VAPID_PUBLIC_KEY` only in the browser.
- Push endpoint + `p256dh` + `auth` are stored in `web_push_subscriptions` via owner-only SECURITY DEFINER RPCs.
- Login/visibility refresh rebinds an already-granted browser subscription.
- VAPID application-server-key mismatch is detected; the old endpoint is detached and a fresh subscription is created.
- Logout removes the current browser endpoint before Supabase sign-out, preventing a shared device from receiving the previous user's push.
- User can disable Web Push for the current device from `/notifications`.
- 404/410 push endpoints are deactivated; old inactive subscriptions are deleted after 30 days.

## Single-record coordination

`public.notifications` remains the canonical in-app record. An AFTER INSERT trigger creates one `web_push_outbox` row keyed uniquely by the canonical notification ID. Push delivery therefore does not create a second notification record.

## Event coverage

Patient:
- appointment confirmed
- appointment reminder
- appointment changed
- appointment cancelled
- important saved-doctor update helper
- important system/account notification helper

Doctor:
- new appointment request
- new follower
- new review
- verification update
- premium status update
- premium progress update helper
- relevant system/account notification helper

Hospital/provider:
- new appointment request
- provider contact-request helper for a persisted/controlled contact workflow
- new follower
- new review
- verification update
- premium status/progress
- relevant system/account notification helper

Direct Call/WhatsApp button clicks are not converted into push notifications automatically because those existing CTAs do not represent a persisted contact request and doing so would create noisy/ambiguous alerts.

## Privacy

Push lock-screen payloads are generated server-side from notification type. The worker deliberately selects only canonical notification `id`, `type`, and routing `data`; it does not load the in-app Bengali body for push delivery. Diagnosis, prescription content, patient notes, and other medical detail are not included in push payloads.

## Security

- Notification reads/updates are scoped to `recipient_id = auth.uid()`.
- Direct authenticated table access to `notifications` and `web_push_subscriptions` is revoked; client operations use owner-scoped RPCs.
- Push outbox is backend-only.
- VAPID private key is Edge-Function-only.
- Scheduled worker calls use a dedicated `PUSH_WORKER_SECRET`, not a Supabase service-role key in transit.
- Edge Function prefers Supabase's current secret-key environment and keeps legacy service-role fallback for older projects.
- Cron worker secret comparison is digest-based before queue processing.

## Notification center

- Bell integrated into public authenticated header and dashboard shell.
- Unread badge/count.
- Latest notification list.
- Read/unread state.
- Mark one read on notification open.
- Mark all as read.
- `/notifications` mobile-first full center.
- Notification click deep-links to the relevant application route.
- Push receipt does NOT mark an item read; only an actual notification click/open does.

## Validation performed

PASS:
- `npm run pwa:validate`
- existing manifest/PWA validation
- existing once-per-day PWA install promotion validation
- push permission UX structural validation
- granted/denied/default flow guards
- subscription create/update/unsubscribe paths
- logout/login subscription ownership path
- service-worker `push` event
- service-worker `notificationclick` + deep-link path
- unread/read + mark-all integration
- appointment/follower/review event wiring
- privacy-safe push payload selection
- expired subscription cleanup and bounded retry
- RLS/ACL structural checks
- VAPID P-256 generator output validation
- changed TypeScript/TSX syntax transpilation (10 files)
- service-worker JavaScript syntax check
- migration dollar-quote/required-architecture structural sanity check

### Production build attempt

`npm run build` was executed. It could not reach Vite bundling because the uploaded Phase 4 source ZIP does not contain installed npm dependencies or a lockfile in this execution environment. TypeScript reports missing modules such as `react`, `react-router-dom`, and `lucide-react`. Registry access also timed out, so dependencies could not be fetched here. The changed files separately passed syntax transpilation.

A deployment environment with dependencies available must run:

```bash
npm install
npm run pwa:validate
npm run build
```

Do not report the current environment's build attempt as a successful production bundle.

## Live deployment tests still required

The following require real HTTPS deployment + Supabase migration + Edge Function + browser permission UI and cannot be truthfully simulated as a live browser push delivery in this isolated source environment:

1. Browser permission Default → custom UI → Granted.
2. Browser permission Denied and reload suppression.
3. Real PushManager endpoint creation against production VAPID keys.
4. Logout/login on the same physical browser/device.
5. Real new appointment push delivery.
6. Real new follower push delivery.
7. Real new review push delivery.
8. Lock-screen notification click/deep-link on Android/Desktop/iOS installed PWA where supported.
9. Read/unread synchronization after click.
10. Real 404/410 expired endpoint response and cleanup.

## Required production setup

See `supabase/PUSH_NOTIFICATION_SETUP.md` for exact commands and SQL. Required manual values:

Frontend/Vercel:
- `VITE_WEB_PUSH_VAPID_PUBLIC_KEY`

Supabase Edge Function secrets:
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT`
- `PUSH_WORKER_SECRET`

Hosted Supabase supplies the database API URL/backend key environment. Apply migration 51, deploy `send-web-push`, then schedule it with `pg_cron` + `pg_net` using the project URL and dedicated worker secret stored in Vault.
