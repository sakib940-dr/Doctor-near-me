import { BellOff, BellRing, CheckCheck, LoaderCircle, Settings2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useVisitorLanguage } from '../contexts/VisitorLanguageContext';
import {
  type AppNotification,
  disablePushNotifications,
  enablePushNotifications,
  getMyNotificationPage,
  getPushPermission,
  isPushOptedOut,
  isPushSupported,
  markAllNotificationsRead,
  markNotificationRead,
  notificationDeepLink,
  subscribeToNotificationRefresh,
} from '../services/notifications';

export default function NotificationsPage() {
  const { account } = useAuth();
  const { language } = useVisitorLanguage();
  const navigate = useNavigate();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [pushState, setPushState] = useState(() => getPushPermission());
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async (reset = true, pageOffset = 0) => {
    if (reset) setLoading(true); else setLoadingMore(true);
    try {
      const offset = reset ? 0 : Math.max(pageOffset, 0);
      const page = await getMyNotificationPage(20, offset, false);
      setItems((current) => reset ? page.items : [
        ...current,
        ...page.items.filter((row) => !current.some((existing) => existing.notification_id === row.notification_id)),
      ]);
      setUnread(page.unread_count);
      setHasMore(page.items.length === 20);
    } catch {
      if (reset) {
        setItems([]);
        setUnread(0);
        setHasMore(false);
      }
    } finally {
      if (reset) setLoading(false); else setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    void load(true);
    return subscribeToNotificationRefresh(() => void load(true));
  }, [load]);

  async function open(item: AppNotification) {
    if (!item.is_read) await markNotificationRead(item.notification_id).catch(() => undefined);
    navigate(notificationDeepLink(item, account?.role));
  }

  async function markAll() {
    setWorking(true);
    await markAllNotificationsRead().catch(() => undefined);
    setWorking(false);
    void load(true);
  }

  async function enablePush() {
    setWorking(true);
    setMessage(null);
    const result = await enablePushNotifications();
    setPushState(getPushPermission());
    setWorking(false);
    if (result.status === 'enabled') setMessage(language === 'bn' ? 'Push notification চালু হয়েছে।' : 'Push notifications are enabled.');
    else if (result.status === 'denied') setMessage(language === 'bn' ? 'Browser notification permission বন্ধ আছে। Browser settings থেকে অনুমতি দিন।' : 'Notification permission is blocked in browser settings.');
    else setMessage(language === 'bn' ? 'Push notification চালু করা যায়নি।' : 'Push notifications could not be enabled.');
  }

  async function disablePush() {
    setWorking(true);
    setMessage(null);
    await disablePushNotifications();
    setPushState(getPushPermission());
    setWorking(false);
    setMessage(language === 'bn' ? 'এই browser/device-এ Web Push বন্ধ করা হয়েছে।' : 'Web Push is disabled on this browser/device.');
  }

  const copy = language === 'bn'
    ? { title: 'নোটিফিকেশন', subtitle: 'অ্যাপয়েন্টমেন্ট, review, follower, verification ও account update', markAll: 'সব পড়া হিসেবে চিহ্নিত করুন', empty: 'এখনো কোনো নোটিফিকেশন নেই।', push: 'Web Push', enabled: 'এই browser/device-এ notification চালু আছে।', disabled: 'Web Push বন্ধ আছে।', blocked: 'Browser permission blocked.', enable: 'নোটিফিকেশন চালু করুন', disable: 'এই device-এ বন্ধ করুন' }
    : { title: 'Notifications', subtitle: 'Appointments, reviews, followers, verification and account updates', markAll: 'Mark all as read', empty: 'No notifications yet.', push: 'Web Push', enabled: 'Notifications are enabled on this browser/device.', disabled: 'Web Push is disabled.', blocked: 'Browser permission is blocked.', enable: 'Enable notifications', disable: 'Disable on this device' };

  const supported = isPushSupported();
  const optedOut = supported && isPushOptedOut();
  const effectiveEnabled = supported && pushState === 'granted' && !optedOut;

  return (
    <div className="notification-center-page">
      <header className="notification-center-heading">
        <div><small>docbd.info</small><h1><BellRing /> {copy.title}</h1><p>{copy.subtitle}</p></div>
        {unread > 0 && <button type="button" onClick={() => void markAll()} disabled={working}><CheckCheck /> {copy.markAll} ({unread})</button>}
      </header>

      <section className="push-settings-card">
        <span><Settings2 /></span>
        <div><strong>{copy.push}</strong><p>{!supported ? copy.disabled : pushState === 'denied' ? copy.blocked : effectiveEnabled ? copy.enabled : copy.disabled}</p>{message && <small role="status">{message}</small>}</div>
        {supported && pushState !== 'denied' && (effectiveEnabled
          ? <button type="button" className="secondary" onClick={() => void disablePush()} disabled={working}><BellOff /> {copy.disable}</button>
          : <button type="button" onClick={() => void enablePush()} disabled={working}>{working ? <LoaderCircle className="spin" /> : <BellRing />} {copy.enable}</button>)}
      </section>

      {loading ? <div className="loading-box"><LoaderCircle className="spin" /> Loading…</div> : items.length ? (
        <div className="notification-center-list">
          {items.map((item) => (
            <button type="button" key={item.notification_id} className={item.is_read ? 'read' : 'unread'} onClick={() => void open(item)}>
              <span className="notification-center-dot" aria-hidden="true" />
              <span><strong>{item.title_bn}</strong>{item.body_bn && <p>{item.body_bn}</p>}<time>{new Intl.DateTimeFormat(language === 'bn' ? 'bn-BD' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.created_at))}</time></span>
            </button>
          ))}
        </div>
      ) : <div className="empty-state"><span>🔔</span><h3>{copy.empty}</h3></div>}
      {!loading && items.length > 0 && hasMore && (
        <div className="public-load-more-wrap">
          <button type="button" className="secondary" onClick={() => void load(false, items.length)} disabled={loadingMore}>
            {loadingMore ? <LoaderCircle className="spin" /> : null}
            {language === 'bn' ? 'আরও দেখুন' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  );
}
