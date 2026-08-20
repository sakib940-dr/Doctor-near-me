import { RefreshCw, WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { applyPwaUpdate, subscribeToPwaUpdate } from '../lib/pwa';

export default function PwaUpdatePrompt() {
  const [available, setAvailable] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const unsubscribe = subscribeToPwaUpdate(() => setAvailable(true));
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      unsubscribe();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!online) {
    return (
      <aside className="pwa-offline-notice" role="status" aria-live="polite">
        <WifiOff size={18} aria-hidden="true" />
        <span><strong>আপনি অফলাইনে আছেন</strong> ইন্টারনেট সংযোগ ফিরে এলে তথ্য আবার আপডেট হবে।</span>
      </aside>
    );
  }

  if (!available) return null;

  const updateNow = () => {
    setUpdating(true);
    const started = applyPwaUpdate();
    if (!started) setUpdating(false);
  };

  return (
    <aside className="pwa-update-prompt" role="status" aria-live="polite">
      <div>
        <strong>docbd.info-এর নতুন সংস্করণ প্রস্তুত</strong>
        <span>আপনার লগইন সেশন ঠিক রেখে নিরাপদভাবে আপডেট করা যাবে।</span>
      </div>
      <button type="button" onClick={updateNow} disabled={updating}>
        <RefreshCw size={16} aria-hidden="true" />
        {updating ? 'আপডেট হচ্ছে…' : 'এখন আপডেট করুন'}
      </button>
    </aside>
  );
}
