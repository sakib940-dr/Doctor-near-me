import { Bell, BellRing, CheckCheck, LoaderCircle } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useVisitorLanguage } from '../contexts/VisitorLanguageContext';
import {
  type AppNotification,
  getMyNotifications,
  getMyNotificationUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
  notificationDeepLink,
  subscribeToNotificationRefresh,
} from '../services/notifications';

export default function NotificationBell({ placement = 'header' }: { placement?: 'header' | 'sidebar' | 'mobile' }) {
  const { user, account } = useAuth();
  const { language } = useVisitorLanguage();
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [rows, count] = await Promise.all([getMyNotifications(8), getMyNotificationUnreadCount()]);
      setItems(rows);
      setUnread(count);
    } catch {
      // Keep the shell usable if notification retrieval is temporarily unavailable.
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user) {
      setItems([]);
      setUnread(0);
      return;
    }
    void load();
    const interval = window.setInterval(() => void load(), 45_000);
    const unsubscribe = subscribeToNotificationRefresh(() => void load());
    const visible = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', visible);
    return () => {
      window.clearInterval(interval);
      unsubscribe();
      document.removeEventListener('visibilitychange', visible);
    };
  }, [load, user?.id]);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  if (!user) return null;

  async function openNotification(item: AppNotification) {
    if (!item.is_read) {
      setItems((current) => current.map((row) => row.notification_id === item.notification_id ? { ...row, is_read: true } : row));
      setUnread((value) => Math.max(0, value - 1));
      await markNotificationRead(item.notification_id).catch(() => undefined);
    }
    setOpen(false);
    navigate(notificationDeepLink(item, account?.role));
  }

  async function markAll() {
    setLoading(true);
    await markAllNotificationsRead().catch(() => undefined);
    setItems((current) => current.map((item) => ({ ...item, is_read: true })));
    setUnread(0);
    setLoading(false);
  }

  const labels = language === 'bn'
    ? { title: 'নোটিফিকেশন', all: 'সব পড়া হয়েছে', empty: 'নতুন নোটিফিকেশন নেই', view: 'সব নোটিফিকেশন দেখুন' }
    : { title: 'Notifications', all: 'Mark all read', empty: 'No notifications yet', view: 'View all notifications' };

  return (
    <div className={`notification-bell notification-bell-${placement}`} ref={rootRef}>
      <button
        type="button"
        className="notification-bell-button"
        aria-label={`${labels.title}${unread ? ` (${unread})` : ''}`}
        aria-expanded={open}
        onClick={() => { setOpen((value) => !value); if (!open) void load(); }}
      >
        {unread ? <BellRing aria-hidden="true" /> : <Bell aria-hidden="true" />}
        {unread > 0 && <b>{unread > 99 ? '99+' : unread}</b>}
      </button>

      {open && (
        <section className="notification-popover" aria-label={labels.title}>
          <header>
            <div><strong>{labels.title}</strong>{unread > 0 && <small>{unread} unread</small>}</div>
            {unread > 0 && <button type="button" onClick={() => void markAll()} disabled={loading}>{loading ? <LoaderCircle className="spin" /> : <CheckCheck />} {labels.all}</button>}
          </header>
          <div className="notification-popover-list">
            {items.length ? items.map((item) => (
              <button type="button" key={item.notification_id} className={item.is_read ? 'read' : 'unread'} onClick={() => void openNotification(item)}>
                <span className="notification-unread-dot" aria-hidden="true" />
                <span><strong>{item.title_bn}</strong>{item.body_bn && <small>{item.body_bn}</small>}<time>{new Intl.DateTimeFormat(language === 'bn' ? 'bn-BD' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.created_at))}</time></span>
              </button>
            )) : <p className="notification-empty">{labels.empty}</p>}
          </div>
          <button type="button" className="notification-view-all" onClick={() => { setOpen(false); navigate('/notifications'); }}>{labels.view}</button>
        </section>
      )}
    </div>
  );
}
