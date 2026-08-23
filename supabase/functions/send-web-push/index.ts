import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import webpush from 'npm:web-push@3.6.7';

type OutboxClaim = {
  outbox_id: number;
  notification_id: string;
  recipient_id: string;
  attempt_count: number;
};

type NotificationRow = {
  id: string;
  type: string;
  data: Record<string, unknown> | null;
};

type PushSubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  expiration_time: number | null;
  failure_count: number;
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const LEGACY_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SUPABASE_SECRET_KEYS = Deno.env.get('SUPABASE_SECRET_KEYS') ?? '';
const PUSH_WORKER_SECRET = Deno.env.get('PUSH_WORKER_SECRET') ?? '';
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@docbd.info';

function resolveAdminKey() {
  try {
    const keys = JSON.parse(SUPABASE_SECRET_KEYS) as Record<string, string>;
    if (typeof keys.default === 'string' && keys.default) return keys.default;
  } catch { /* hosted projects without new secret keys can use the legacy fallback */ }
  return LEGACY_SERVICE_ROLE_KEY;
}

const ADMIN_KEY = resolveAdminKey();

if (!SUPABASE_URL || !ADMIN_KEY || PUSH_WORKER_SECRET.length < 32 || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.error('Missing required Web Push environment variables.');
}

const supabase = createClient(SUPABASE_URL, ADMIN_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

async function secureEqual(left: string, right: string) {
  const encoder = new TextEncoder();
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(left)),
    crypto.subtle.digest('SHA-256', encoder.encode(right)),
  ]);
  const a = new Uint8Array(leftHash);
  const b = new Uint8Array(rightHash);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a[index] ^ b[index];
  return diff === 0;
}

async function isAuthorized(req: Request) {
  const supplied = req.headers.get('x-docbd-push-secret') ?? '';
  return PUSH_WORKER_SECRET.length >= 32 && supplied.length >= 32 && await secureEqual(supplied, PUSH_WORKER_SECRET);
}

function safeDeepLink(value: unknown) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return '/dashboard';
  return value.slice(0, 500);
}

function lockScreenCopy(type: string) {
  switch (type) {
    case 'blood_request':
      return { title: 'জরুরি রক্তের অনুরোধ', body: 'আপনার রক্তের গ্রুপের একজন রোগীর জরুরি সহায়তা প্রয়োজন।' };
    case 'blood_direct_request':
      return { title: 'সরাসরি রক্তের অনুরোধ', body: 'একজন রোগী সরাসরি আপনার কাছে রক্তের অনুরোধ পাঠিয়েছেন।' };
    case 'blood_donor_response':
      return { title: 'রক্তদাতার সাড়া পাওয়া গেছে', body: 'আপনার রক্তের অনুরোধে একজন donor সাড়া দিয়েছেন।' };
    case 'appointment_new':
    case 'appointment_provider_new':
      return { title: 'নতুন অ্যাপয়েন্টমেন্ট', body: 'একটি নতুন অ্যাপয়েন্টমেন্ট অনুরোধ এসেছে।' };
    case 'provider_contact_request':
      return { title: 'নতুন যোগাযোগ অনুরোধ', body: 'আপনার প্রতিষ্ঠানে একটি নতুন যোগাযোগ অনুরোধ এসেছে।' };
    case 'appointment_confirmed':
      return { title: 'অ্যাপয়েন্টমেন্ট নিশ্চিত হয়েছে', body: 'আপনার অ্যাপয়েন্টমেন্ট আপডেট হয়েছে।' };
    case 'appointment_reminder':
      return { title: 'অ্যাপয়েন্টমেন্ট রিমাইন্ডার', body: 'আপনার একটি আসন্ন অ্যাপয়েন্টমেন্ট আছে।' };
    case 'appointment_changed':
    case 'appointment_cancelled':
    case 'appointment_patient_cancelled':
    case 'appointment_status':
      return { title: 'অ্যাপয়েন্টমেন্ট আপডেট', body: 'একটি অ্যাপয়েন্টমেন্ট আপডেট হয়েছে।' };
    case 'new_follower':
      return { title: 'নতুন follower', body: 'আপনার প্রোফাইলে একজন নতুন follower যুক্ত হয়েছে।' };
    case 'new_review':
      return { title: 'নতুন review', body: 'আপনার প্রোফাইলে একটি নতুন review এসেছে।' };
    case 'doctor_verification':
    case 'provider_verification':
      return { title: 'Verification আপডেট', body: 'আপনার verification status আপডেট হয়েছে।' };
    case 'premium_status':
    case 'premium_progress':
    case 'premium_request':
      return { title: 'Premium আপডেট', body: 'Premium Membership status-এ একটি আপডেট আছে।' };
    case 'saved_doctor_update':
      return { title: 'Saved Doctor আপডেট', body: 'আপনার saved Doctor-এর একটি গুরুত্বপূর্ণ আপডেট আছে।' };
    default:
      return { title: 'docbd.info আপডেট', body: 'আপনার অ্যাকাউন্টে একটি গুরুত্বপূর্ণ আপডেট আছে।' };
  }
}

function defaultDeepLink(type: string) {
  switch (type) {
    case 'blood_request':
    case 'blood_direct_request':
      return '/blood?tab=respond';
    case 'blood_donor_response':
      return '/blood?tab=request';
    default:
      return '/dashboard';
  }
}

function payloadFor(notification: NotificationRow) {
  const copy = lockScreenCopy(notification.type);
  const explicitDeepLink = notification.data?.deep_link;
  const deepLink = typeof explicitDeepLink === 'string'
    ? safeDeepLink(explicitDeepLink)
    : defaultDeepLink(notification.type);
  return JSON.stringify({
    title: copy.title,
    body: copy.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: `docbd-${notification.id}`,
    renotify: false,
    data: {
      notificationId: notification.id,
      type: notification.type,
      url: deepLink,
    },
  });
}

async function updateOutbox(
  notificationId: string,
  status: 'sent' | 'no_subscription' | 'failed',
  error: string | null,
  attemptCount: number,
) {
  const retryMinutes = Math.min(60, Math.max(2, 2 ** Math.min(attemptCount, 5)));
  const nextAttempt = new Date(Date.now() + retryMinutes * 60_000).toISOString();
  const values: Record<string, unknown> = {
    status,
    locked_at: null,
    last_error: error?.slice(0, 1000) ?? null,
    updated_at: new Date().toISOString(),
  };
  if (status === 'failed') values.next_attempt_at = nextAttempt;
  else values.processed_at = new Date().toISOString();

  const { error: updateError } = await supabase
    .from('web_push_outbox')
    .update(values)
    .eq('notification_id', notificationId);
  if (updateError) console.error('Failed to update push outbox', notificationId, updateError.message);
}

async function deactivateSubscription(row: PushSubscriptionRow, reason: string) {
  await supabase
    .from('web_push_subscriptions')
    .update({
      is_active: false,
      failure_count: row.failure_count + 1,
      last_error: reason.slice(0, 1000),
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.id);
}

async function markSubscriptionSuccess(row: PushSubscriptionRow) {
  await supabase
    .from('web_push_subscriptions')
    .update({
      is_active: true,
      failure_count: 0,
      last_success_at: new Date().toISOString(),
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.id);
}

async function markSubscriptionFailure(row: PushSubscriptionRow, reason: string) {
  await supabase
    .from('web_push_subscriptions')
    .update({
      failure_count: row.failure_count + 1,
      last_error: reason.slice(0, 1000),
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.id);
}

async function deliver(claim: OutboxClaim) {
  const { data: notification, error: notificationError } = await supabase
    .from('notifications')
    .select('id,type,data')
    .eq('id', claim.notification_id)
    .eq('recipient_id', claim.recipient_id)
    .maybeSingle<NotificationRow>();

  if (notificationError || !notification) {
    await updateOutbox(claim.notification_id, 'failed', notificationError?.message ?? 'Notification row not found', claim.attempt_count);
    return { sent: 0, expired: 0, failed: 1 };
  }

  const { data: rows, error: subscriptionError } = await supabase
    .from('web_push_subscriptions')
    .select('id,endpoint,p256dh,auth,expiration_time,failure_count')
    .eq('user_id', claim.recipient_id)
    .eq('is_active', true);

  if (subscriptionError) {
    await updateOutbox(claim.notification_id, 'failed', subscriptionError.message, claim.attempt_count);
    return { sent: 0, expired: 0, failed: 1 };
  }

  const subscriptions = (rows ?? []) as PushSubscriptionRow[];
  if (!subscriptions.length) {
    await updateOutbox(claim.notification_id, 'no_subscription', null, claim.attempt_count);
    return { sent: 0, expired: 0, failed: 0 };
  }

  let sent = 0;
  let expired = 0;
  let failed = 0;
  const errors: string[] = [];
  const now = Date.now();
  const payload = payloadFor(notification);

  for (const row of subscriptions) {
    if (row.expiration_time != null && row.expiration_time <= now) {
      await deactivateSubscription(row, 'Browser subscription expired');
      expired += 1;
      continue;
    }

    try {
      await webpush.sendNotification(
        { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
        payload,
        { TTL: 60 * 60 * 12, urgency: 'normal' },
      );
      sent += 1;
      await markSubscriptionSuccess(row);
    } catch (error) {
      const statusCode = Number((error as { statusCode?: number })?.statusCode ?? 0);
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${statusCode || 'send'}:${message}`);
      if (statusCode === 404 || statusCode === 410) {
        expired += 1;
        await deactivateSubscription(row, `Push endpoint expired (${statusCode})`);
      } else {
        failed += 1;
        await markSubscriptionFailure(row, message);
      }
    }
  }

  if (sent > 0) {
    await updateOutbox(claim.notification_id, 'sent', errors.length ? errors.join(' | ') : null, claim.attempt_count);
  } else if (failed > 0) {
    await updateOutbox(claim.notification_id, 'failed', errors.join(' | ') || 'Push delivery failed', claim.attempt_count);
  } else {
    await updateOutbox(claim.notification_id, 'no_subscription', errors.join(' | ') || null, claim.attempt_count);
  }

  return { sent, expired, failed };
}

async function cleanupInactiveSubscriptions() {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await supabase
    .from('web_push_subscriptions')
    .delete()
    .eq('is_active', false)
    .lt('updated_at', cutoff);
  if (error) console.error('Inactive push cleanup failed:', error.message);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!await isAuthorized(req)) return new Response('Unauthorized', { status: 401 });
  if (!SUPABASE_URL || !ADMIN_KEY || PUSH_WORKER_SECRET.length < 32 || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return Response.json({ error: 'Web Push server configuration is incomplete.' }, { status: 500 });
  }

  const { error: reminderError } = await supabase.rpc('enqueue_due_appointment_reminders', { p_window_minutes: 30 });
  if (reminderError) console.error('Appointment reminder enqueue failed:', reminderError.message);

  const { data, error } = await supabase.rpc('claim_web_push_outbox', { p_limit: 50 });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const claims = (data ?? []) as OutboxClaim[];
  const totals = { claimed: claims.length, sent: 0, expired: 0, failed: 0 };
  for (const claim of claims) {
    const result = await deliver(claim);
    totals.sent += result.sent;
    totals.expired += result.expired;
    totals.failed += result.failed;
  }

  await cleanupInactiveSubscriptions();
  return Response.json({ ok: true, ...totals });
});
