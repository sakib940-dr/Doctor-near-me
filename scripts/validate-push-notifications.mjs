import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const expect = (condition, message) => { if (!condition) throw new Error(message); };

const service = read('src/services/notifications.ts');
const permission = read('src/components/PushPermissionPromotion.tsx');
const manager = read('src/components/PushNotificationManager.tsx');
const bell = read('src/components/NotificationBell.tsx');
const page = read('src/pages/NotificationsPage.tsx');
const auth = read('src/contexts/AuthContext.tsx');
const app = read('src/App.tsx');
const sw = read('public/sw.js');
const migration = read('supabase/51_web_push_notification_center.sql');
const bloodMigration = read('supabase/70_blood_push_and_expiry_scheduler.sql');
const worker = read('supabase/functions/send-web-push/index.ts');
const bloodService = read('src/services/bloodBank.ts');
const bloodPage = read('src/pages/BloodBankPage.tsx');
const env = read('.env.example');

// Permission default: browser permission request must be user-initiated through custom UI.
expect(permission.includes('অ্যাপয়েন্টমেন্ট ও গুরুত্বপূর্ণ আপডেটের নোটিফিকেশন পেতে নোটিফিকেশন চালু করুন।'), 'Bengali permission UX copy missing');
expect(permission.includes('নোটিফিকেশন চালু করুন'), 'permission CTA missing');
expect(permission.includes('onClick={() => void enable()}'), 'permission request must be user initiated');
expect(!permission.includes('Notification.requestPermission'), 'custom UI must not request browser permission on mount');
expect(service.includes("if (permission === 'default') permission = await Notification.requestPermission()"), 'browser permission request flow missing');
expect(permission.includes("getPushPermission() !== 'default'"), 'denied/granted users must not be repeatedly prompted');

// Subscription lifecycle + logout/login safety.
for (const token of [
  'registration.pushManager.getSubscription()',
  'registration.pushManager.subscribe',
  'existing.options.applicationServerKey',
  'upsert_my_web_push_subscription',
  'remove_my_web_push_subscription',
  'deactivate_my_web_push_subscriptions',
  'syncGrantedPushSubscription',
  'docbd_push_opt_out',
]) expect(service.includes(token), `subscription lifecycle missing ${token}`);
expect(auth.includes('await unsubscribeCurrentBrowserPush();') && auth.indexOf('await unsubscribeCurrentBrowserPush();') < auth.indexOf("await requireSupabase().auth.signOut()"), 'logout must detach browser subscription before sign out');
expect(manager.includes('syncGrantedPushSubscription()'), 'granted subscription refresh on login/visibility missing');
expect(manager.includes("message.type === 'DOCBD_PUSH_CLICKED' && message.notificationId"), 'push receipt must not auto-mark unread notifications as read');

// Service Worker receives push and deep-links notification clicks.
for (const token of ["addEventListener('push'", 'showNotification', "addEventListener('notificationclick'", 'docbd_notification', 'clients.openWindow', 'DOCBD_PUSH_RECEIVED', 'DOCBD_PUSH_CLICKED']) {
  expect(sw.includes(token), `service worker push handling missing ${token}`);
}

// In-app center: unread count, read state, mark all and relevant navigation.
for (const token of ['getMyNotificationUnreadCount', 'markNotificationRead', 'markAllNotificationsRead', 'notificationDeepLink']) expect(service.includes(token), `notification service missing ${token}`);
expect(bell.includes('notification-bell-button') && bell.includes("navigate('/notifications')"), 'notification bell/center integration missing');
expect(page.includes('Web Push') && page.includes('disablePushNotifications') && page.includes('enablePushNotifications'), 'notification center push settings missing');
expect(app.includes('path="/notifications"') && app.includes('<PushNotificationManager />') && app.includes('<PushPermissionPromotion />'), 'notification route/global managers missing');

// Canonical notification coordination + strict ownership/RLS.
expect(migration.includes('Reuses public.notifications as the single canonical in-app record'), 'migration must explicitly reuse existing notifications');
for (const token of ['web_push_subscriptions', 'web_push_outbox', 'trg_notifications_enqueue_web_push', 'recipient_id=auth.uid()', 'claim_web_push_outbox']) expect(migration.includes(token), `database push architecture missing ${token}`);
expect(migration.includes('revoke all on table public.notifications from anon,authenticated'), 'direct client notification table access must be revoked');
expect(migration.includes('revoke all on table public.web_push_subscriptions from anon,authenticated'), 'direct subscription table access must be revoked');

// Required business events.
for (const event of [
  'appointment_new', 'appointment_provider_new', 'appointment_confirmed', 'appointment_reminder',
  'appointment_changed', 'appointment_cancelled', 'provider_contact_request', 'new_follower', 'new_review',
  'doctor_verification', 'provider_verification', 'premium_status', 'premium_progress', 'saved_doctor_update', 'system_notification',
  'blood_request', 'blood_direct_request', 'blood_donor_response',
]) expect(migration.includes(event) || worker.includes(event), `required notification event missing ${event}`);

// Blood events reuse the canonical outbox worker and deep-link to their existing tabs.
for (const token of ["'/blood?tab=respond'", "'/blood?tab=request'", 'defaultDeepLink']) {
  expect(worker.includes(token), `blood push routing missing ${token}`);
}
expect(!worker.includes('contact_phone'), 'blood push worker must not expose contact_phone');

// Expiry is system-only, scheduled, and stale alerts are filtered by active request status.
for (const token of [
  'create extension if not exists pg_cron',
  "'*/15 * * * *'",
  'select public.expire_old_blood_requests()',
  'if auth.uid() is not null',
  "revoke all on function public.expire_old_blood_requests() from public,anon,authenticated",
  "r.status in ('open','partially_fulfilled')",
  'get_my_active_blood_alerts',
]) expect(bloodMigration.includes(token), `blood expiry/alert hardening missing ${token}`);
expect(bloodService.includes("rpc('get_my_active_blood_alerts'"), 'blood service must use active-alert RPC');
expect(bloodPage.includes('getMyActiveBloodAlerts'), 'blood response tab must load active alerts only');

// Privacy: lock-screen payload must be server-generated generic copy, not private DB body/patient note/prescription content.
expect(worker.includes('lockScreenCopy'), 'privacy-safe lock-screen mapping missing');
expect(worker.includes(".select('id,type,data')"), 'worker should not load notification body for push lock-screen payload');
for (const sensitive of ['patient_note', 'prescription', 'diagnosis']) expect(!worker.includes(sensitive), `push worker must not expose ${sensitive}`);
expect(!service.includes('VAPID_PRIVATE_KEY') && !permission.includes('VAPID_PRIVATE_KEY') && !manager.includes('VAPID_PRIVATE_KEY'), 'private VAPID key leaked into frontend');
expect(worker.includes('PUSH_WORKER_SECRET') && worker.includes("x-docbd-push-secret"), 'dedicated cron worker authentication missing');
expect(worker.includes('SUPABASE_SECRET_KEYS') && worker.includes('LEGACY_SERVICE_ROLE_KEY'), 'current Supabase secret key with legacy fallback missing');
expect(!worker.includes("authorization === `Bearer ${SERVICE_ROLE_KEY}`"), 'worker must not require exposing the full service-role key to cron transport');
expect(env.includes('VITE_WEB_PUSH_VAPID_PUBLIC_KEY') && !env.includes('VAPID_PRIVATE_KEY='), 'frontend env example must contain public key only');

// Expired endpoint cleanup + bounded retry.
for (const token of ['statusCode === 404 || statusCode === 410', 'is_active: false', "attempt_count<6", "interval '10 minutes'", "30 * 24 * 60 * 60 * 1000"]) {
  expect(worker.includes(token) || migration.includes(token), `expired/retry cleanup missing ${token}`);
}

console.log('Push notification validation passed: permission UX, subscription lifecycle, SW push/click, in-app center, canonical outbox coordination, RLS, privacy-safe payloads, business events, logout/login, and expired cleanup.');
