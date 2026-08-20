import { requireSupabase } from '../lib/supabase';
import type { UserRole } from '../types';

export const NOTIFICATION_CENTER_REFRESH_EVENT = 'docbd:notifications-refresh';
const PUSH_OPT_OUT_KEY = 'docbd_push_opt_out';

export interface AppNotification {
  notification_id: string;
  type: string;
  title_bn: string;
  body_bn: string | null;
  data: Record<string, unknown>;
  is_read: boolean;
  created_at: string;
}

export type PushEnableResult =
  | { status: 'enabled'; subscription: PushSubscription }
  | { status: 'denied' }
  | { status: 'unsupported' }
  | { status: 'misconfigured' }
  | { status: 'error'; message: string };

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : 'Push notification সেটআপ করা যায়নি।';
}

function dispatchNotificationRefresh() {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(NOTIFICATION_CENTER_REFRESH_EVENT));
}

export function subscribeToNotificationRefresh(listener: () => void) {
  window.addEventListener(NOTIFICATION_CENTER_REFRESH_EVENT, listener);
  return () => window.removeEventListener(NOTIFICATION_CENTER_REFRESH_EVENT, listener);
}

export async function getMyNotifications(limit = 20, offset = 0, unreadOnly = false) {
  const { data, error } = await requireSupabase().rpc('get_my_notifications', {
    p_unread_only: unreadOnly,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw error;
  return (data ?? []) as AppNotification[];
}

export async function getMyNotificationUnreadCount() {
  const { data, error } = await requireSupabase().rpc('get_my_notification_unread_count');
  if (error) throw error;
  return Number(data ?? 0);
}

export async function markNotificationRead(notificationId: string) {
  const { data, error } = await requireSupabase().rpc('mark_notification_read', {
    p_notification_id: notificationId,
  });
  if (error) throw error;
  dispatchNotificationRefresh();
  return Boolean(data);
}

export async function markAllNotificationsRead() {
  const { data, error } = await requireSupabase().rpc('mark_all_notifications_read');
  if (error) throw error;
  dispatchNotificationRefresh();
  return Number(data ?? 0);
}

function dataText(data: Record<string, unknown> | null | undefined, key: string) {
  const value = data?.[key];
  return typeof value === 'string' ? value : null;
}

export function notificationDeepLink(notification: Pick<AppNotification, 'type' | 'data'>, role?: UserRole | null) {
  const explicit = dataText(notification.data, 'deep_link');
  if (explicit?.startsWith('/') && !explicit.startsWith('//')) return explicit;

  switch (notification.type) {
    case 'appointment_new': return '/doctor/appointments';
    case 'appointment_provider_new': return '/provider/appointments';
    case 'appointment_confirmed':
    case 'appointment_changed':
    case 'appointment_cancelled':
    case 'appointment_reminder':
    case 'appointment_status': return '/appointments';
    case 'appointment_patient_cancelled':
      return role === 'hospital' || role === 'chamber' ? '/provider/appointments' : '/doctor/appointments';
    case 'new_follower':
    case 'new_review':
      return role === 'hospital' || role === 'chamber' ? '/provider/analytics' : '/doctor/analytics';
    case 'doctor_verification': return '/doctor/verification';
    case 'provider_verification': return '/verification/evidence';
    case 'premium_status':
    case 'premium_progress':
      return role === 'hospital' || role === 'chamber' ? '/provider/premium' : '/doctor/premium';
    default: return '/dashboard';
  }
}

export function isPushSupported() {
  return typeof window !== 'undefined'
    && window.isSecureContext
    && 'Notification' in window
    && 'serviceWorker' in navigator
    && 'PushManager' in window;
}

export function getPushPermission(): NotificationPermission | 'unsupported' {
  return isPushSupported() ? Notification.permission : 'unsupported';
}

function base64UrlToUint8Array(base64Url: string) {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

function deviceLabel() {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS Safari/PWA';
  if (/Edg\//i.test(ua)) return 'Microsoft Edge';
  if (/Chrome|CriOS/i.test(ua)) return 'Google Chrome';
  if (/Firefox|FxiOS/i.test(ua)) return 'Firefox';
  return 'Web browser';
}

async function persistSubscription(subscription: PushSubscription) {
  const json = subscription.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!p256dh || !auth) throw new Error('Browser push subscription keys are unavailable.');

  const { error } = await requireSupabase().rpc('upsert_my_web_push_subscription', {
    p_endpoint: subscription.endpoint,
    p_p256dh: p256dh,
    p_auth: auth,
    p_expiration_time: subscription.expirationTime == null ? null : Math.round(subscription.expirationTime),
    p_user_agent: navigator.userAgent,
    p_device_label: deviceLabel(),
  });
  if (error) throw error;
}

function sameApplicationServerKey(current: ArrayBuffer | null, expected: Uint8Array) {
  if (!current) return false;
  const actual = new Uint8Array(current);
  if (actual.length !== expected.length) return false;
  return actual.every((value, index) => value === expected[index]);
}

async function getOrCreateBrowserSubscription() {
  const vapidPublicKey = import.meta.env.VITE_WEB_PUSH_VAPID_PUBLIC_KEY?.trim();
  if (!vapidPublicKey) throw new Error('VAPID_PUBLIC_KEY_MISSING');
  const registration = await navigator.serviceWorker.ready;
  const expectedKey = base64UrlToUint8Array(vapidPublicKey);
  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    if (sameApplicationServerKey(existing.options.applicationServerKey, expectedKey)) return existing;
    try {
      await requireSupabase().rpc('remove_my_web_push_subscription', { p_endpoint: existing.endpoint });
    } catch { /* server-side expired endpoint cleanup remains a fallback */ }
    await existing.unsubscribe().catch(() => false);
  }
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: expectedKey,
  });
}

function setPushOptOut(value: boolean) {
  try {
    if (value) window.localStorage.setItem(PUSH_OPT_OUT_KEY, '1');
    else window.localStorage.removeItem(PUSH_OPT_OUT_KEY);
  } catch { /* storage may be unavailable */ }
}

export function isPushOptedOut() {
  try { return window.localStorage.getItem(PUSH_OPT_OUT_KEY) === '1'; } catch { return false; }
}

export async function enablePushNotifications(): Promise<PushEnableResult> {
  if (!isPushSupported()) return { status: 'unsupported' };
  if (!import.meta.env.VITE_WEB_PUSH_VAPID_PUBLIC_KEY?.trim()) return { status: 'misconfigured' };

  try {
    let permission = Notification.permission;
    if (permission === 'default') permission = await Notification.requestPermission();
    if (permission !== 'granted') return { status: 'denied' };

    const subscription = await getOrCreateBrowserSubscription();
    await persistSubscription(subscription);
    setPushOptOut(false);
    dispatchNotificationRefresh();
    return { status: 'enabled', subscription };
  } catch (error) {
    if (messageFrom(error).includes('VAPID_PUBLIC_KEY_MISSING')) return { status: 'misconfigured' };
    return { status: 'error', message: messageFrom(error) };
  }
}

export async function syncGrantedPushSubscription() {
  if (!isPushSupported() || Notification.permission !== 'granted' || isPushOptedOut()) return false;
  if (!import.meta.env.VITE_WEB_PUSH_VAPID_PUBLIC_KEY?.trim()) return false;
  try {
    const subscription = await getOrCreateBrowserSubscription();
    await persistSubscription(subscription);
    return true;
  } catch {
    return false;
  }
}

export async function unsubscribeCurrentBrowserPush() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;
    try {
      await requireSupabase().rpc('remove_my_web_push_subscription', { p_endpoint: subscription.endpoint });
    } finally {
      await subscription.unsubscribe().catch(() => false);
    }
  } catch {
    // Logout/privacy flow should continue even if the network is unavailable.
  }
}

export async function deactivateMyServerPushSubscriptions() {
  const { error } = await requireSupabase().rpc('deactivate_my_web_push_subscriptions');
  if (error) throw error;
}

export async function disablePushNotifications() {
  setPushOptOut(true);
  await unsubscribeCurrentBrowserPush();
  try { await deactivateMyServerPushSubscriptions(); } catch { /* expired endpoints are cleaned server-side too */ }
  dispatchNotificationRefresh();
}
