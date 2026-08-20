import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  markNotificationRead,
  NOTIFICATION_CENTER_REFRESH_EVENT,
  syncGrantedPushSubscription,
} from '../services/notifications';

interface PushWorkerMessage {
  type?: string;
  notificationId?: string;
  url?: string;
}

function refreshNotificationCenter() {
  window.dispatchEvent(new CustomEvent(NOTIFICATION_CENTER_REFRESH_EVENT));
}

export default function PushNotificationManager() {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;
    void syncGrantedPushSubscription();

    const syncWhenVisible = () => {
      if (document.visibilityState === 'visible') void syncGrantedPushSubscription();
    };
    document.addEventListener('visibilitychange', syncWhenVisible);
    return () => document.removeEventListener('visibilitychange', syncWhenVisible);
  }, [user?.id]);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onMessage = (event: MessageEvent<PushWorkerMessage>) => {
      const message = event.data;
      if (!message || !['DOCBD_PUSH_RECEIVED', 'DOCBD_PUSH_CLICKED'].includes(message.type ?? '')) return;
      refreshNotificationCenter();
      if (message.type === 'DOCBD_PUSH_CLICKED' && message.notificationId && user) {
        void markNotificationRead(message.notificationId).catch(() => undefined);
      }
      if (message.type === 'DOCBD_PUSH_CLICKED' && message.url?.startsWith('/') && !message.url.startsWith('//')) {
        navigate(message.url);
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [navigate, user]);

  useEffect(() => {
    if (!user) return;
    const params = new URLSearchParams(window.location.search);
    const notificationId = params.get('docbd_notification');
    if (!notificationId) return;

    void markNotificationRead(notificationId).catch(() => undefined);
    params.delete('docbd_notification');
    const next = `${window.location.pathname}${params.size ? `?${params.toString()}` : ''}${window.location.hash}`;
    window.history.replaceState(window.history.state, '', next);
  }, [user?.id]);

  return null;
}
