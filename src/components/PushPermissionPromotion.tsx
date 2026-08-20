import { BellRing, LoaderCircle, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useVisitorLanguage } from '../contexts/VisitorLanguageContext';
import {
  enablePushNotifications,
  getPushPermission,
  isPushOptedOut,
  isPushSupported,
} from '../services/notifications';

const SHOW_DELAY_MS = 4200;
const SNOOZE_KEY = 'docbd_push_permission_prompt_snooze_until';
const SNOOZE_DAYS = 7;

function snoozed() {
  try {
    const value = Number(window.localStorage.getItem(SNOOZE_KEY) ?? 0);
    return Number.isFinite(value) && value > Date.now();
  } catch {
    return true;
  }
}

function snooze() {
  try {
    window.localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_DAYS * 24 * 60 * 60 * 1000));
  } catch { /* storage may be unavailable */ }
}

export default function PushPermissionPromotion() {
  const { user } = useAuth();
  const { language } = useVisitorLanguage();
  const [visible, setVisible] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setVisible(false);
    setError(null);
    if (!user || !isPushSupported() || getPushPermission() !== 'default' || isPushOptedOut() || snoozed()) return;
    if (!import.meta.env.VITE_WEB_PUSH_VAPID_PUBLIC_KEY?.trim()) return;
    const timer = window.setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [user?.id]);

  useEffect(() => {
    document.body.classList.toggle('push-permission-visible', visible);
    return () => document.body.classList.remove('push-permission-visible');
  }, [visible]);

  if (!visible) return null;

  const copy = language === 'bn'
    ? {
        text: 'অ্যাপয়েন্টমেন্ট ও গুরুত্বপূর্ণ আপডেটের নোটিফিকেশন পেতে নোটিফিকেশন চালু করুন।',
        enable: 'নোটিফিকেশন চালু করুন',
        later: 'এখন নয়',
        denied: 'Browser notification permission বন্ধ আছে। Browser settings থেকে অনুমতি পরিবর্তন করতে পারবেন।',
        failed: 'নোটিফিকেশন চালু করা যায়নি। আবার চেষ্টা করুন।',
      }
    : {
        text: 'Enable notifications for appointment and important account updates.',
        enable: 'Enable notifications',
        later: 'Not now',
        denied: 'Browser notification permission is blocked. You can change it in browser settings.',
        failed: 'Notifications could not be enabled. Please try again.',
      };

  async function enable() {
    if (working) return;
    setWorking(true);
    setError(null);
    const result = await enablePushNotifications();
    setWorking(false);
    if (result.status === 'enabled') {
      setVisible(false);
      return;
    }
    if (result.status === 'denied') {
      setError(copy.denied);
      window.setTimeout(() => setVisible(false), 3500);
      return;
    }
    setError(result.status === 'error' ? result.message : copy.failed);
  }

  function dismiss() {
    snooze();
    setVisible(false);
  }

  return (
    <aside className="push-permission-promotion" role="dialog" aria-label={language === 'bn' ? 'নোটিফিকেশন চালু করুন' : 'Enable notifications'}>
      <button type="button" className="push-permission-close" onClick={dismiss} aria-label={language === 'bn' ? 'বন্ধ করুন' : 'Close'}><X /></button>
      <span className="push-permission-icon"><BellRing aria-hidden="true" /></span>
      <div>
        <p>{copy.text}</p>
        {error && <small className="push-permission-error" role="status">{error}</small>}
        <div className="push-permission-actions">
          <button type="button" className="primary" onClick={() => void enable()} disabled={working}>
            {working ? <LoaderCircle className="spin" /> : <BellRing />} {copy.enable}
          </button>
          <button type="button" onClick={dismiss}>{copy.later}</button>
        </div>
      </div>
    </aside>
  );
}
