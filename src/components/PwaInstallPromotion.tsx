import { Download, ExternalLink, Share2, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useVisitorLanguage } from '../contexts/VisitorLanguageContext';
import {
  claimPwaInstallPromotionForToday,
  getPwaInstallTarget,
  isPwaInstalled,
  promptPwaInstall,
  subscribeToPwaInstallAvailability,
  subscribeToPwaInstalled,
  type PwaInstallTarget,
} from '../lib/pwa';

const SHOW_DELAY_MS = 2200;

const copy = {
  bn: {
    title: 'অ্যাপের মতো সহজে ব্যবহার করতে docbd.info ইনস্টল করুন',
    support: 'হোম স্ক্রিন থেকে দ্রুত ডাক্তার ও হাসপাতাল খুঁজুন।',
    install: 'ইনস্টল করুন',
    notNow: 'এখন নয়',
    playStore: 'Google Play অ্যাপ শীঘ্রই আসছে',
    close: 'ইনস্টল সাজেশন বন্ধ করুন',
    iosTitle: 'iPhone বা iPad-এ ইনস্টল করুন',
    iosIntro: 'Safari থেকে নিচের ধাপগুলো অনুসরণ করুন:',
    step1: 'Safari-এর Share button চাপুন',
    step2: '“Add to Home Screen” নির্বাচন করুন',
    step3: 'Add চাপুন',
    done: 'ঠিক আছে',
  },
  en: {
    title: 'Install docbd.info for easy app-like access',
    support: 'Find doctors and hospitals faster from your Home Screen.',
    install: 'Install',
    notNow: 'Not now',
    playStore: 'Google Play app coming soon',
    close: 'Dismiss install suggestion',
    iosTitle: 'Install on iPhone or iPad',
    iosIntro: 'In Safari, follow these steps:',
    step1: 'Tap Safari’s Share button',
    step2: 'Choose “Add to Home Screen”',
    step3: 'Tap Add',
    done: 'Done',
  },
} as const;

export default function PwaInstallPromotion() {
  const { language } = useVisitorLanguage();
  const [visible, setVisible] = useState(false);
  const [target, setTarget] = useState<PwaInstallTarget>(() => getPwaInstallTarget());
  const [showIosInstructions, setShowIosInstructions] = useState(false);
  const [installing, setInstalling] = useState(false);
  const showTimerRef = useRef<number | null>(null);
  const text = copy[language];

  const clearShowTimer = useCallback(() => {
    if (showTimerRef.current !== null) {
      window.clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
  }, []);

  const considerPromotion = useCallback(() => {
    clearShowTimer();
    if (!navigator.onLine || document.visibilityState === 'hidden' || isPwaInstalled()) {
      setVisible(false);
      setTarget(null);
      return;
    }

    const nextTarget = getPwaInstallTarget();
    setTarget(nextTarget);
    if (!nextTarget) return;

    showTimerRef.current = window.setTimeout(() => {
      const currentTarget = getPwaInstallTarget();
      if (!navigator.onLine || isPwaInstalled() || !currentTarget) return;
      // Synchronous localStorage claim prevents StrictMode/rerenders/reloads from showing twice today.
      if (!claimPwaInstallPromotionForToday()) return;
      setTarget(currentTarget);
      setVisible(true);
    }, SHOW_DELAY_MS);
  }, [clearShowTimer]);

  useEffect(() => {
    considerPromotion();
    const unsubscribeAvailability = subscribeToPwaInstallAvailability(considerPromotion);
    const unsubscribeInstalled = subscribeToPwaInstalled(() => {
      clearShowTimer();
      setInstalling(false);
      setShowIosInstructions(false);
      setVisible(false);
      setTarget(null);
    });
    const handleOnline = () => considerPromotion();
    const handleOffline = () => {
      clearShowTimer();
      setVisible(false);
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') considerPromotion();
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      clearShowTimer();
      unsubscribeAvailability();
      unsubscribeInstalled();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [clearShowTimer, considerPromotion]);

  if (!visible || !target) return null;

  const dismiss = () => {
    setInstalling(false);
    setShowIosInstructions(false);
    setVisible(false);
  };

  const install = async () => {
    if (target === 'ios-safari') {
      setShowIosInstructions(true);
      return;
    }

    setInstalling(true);
    const outcome = await promptPwaInstall();
    setInstalling(false);
    if (outcome === 'accepted' || outcome === 'dismissed' || outcome === 'unavailable') dismiss();
  };

  return (
    <aside className={`pwa-install-promotion${showIosInstructions ? ' show-ios-help' : ''}`} aria-label={text.title}>
      <button type="button" className="pwa-install-close" onClick={dismiss} aria-label={text.close}>
        <X size={16} aria-hidden="true" />
      </button>

      <div className="pwa-install-brand" aria-hidden="true">
        <img src="/icons/icon-192.png" alt="" width="44" height="44" />
      </div>

      {!showIosInstructions ? (
        <div className="pwa-install-content">
          <strong>{text.title}</strong>
          <p>{text.support}</p>
          <div className="pwa-install-actions">
            <button type="button" className="primary" onClick={() => void install()} disabled={installing}>
              <Download size={16} aria-hidden="true" />
              {installing ? (language === 'bn' ? 'খোলা হচ্ছে…' : 'Opening…') : text.install}
            </button>
            <button type="button" className="secondary" onClick={dismiss}>{text.notNow}</button>
          </div>
          <small>{text.playStore}</small>
        </div>
      ) : (
        <div className="pwa-install-content pwa-ios-help" aria-live="polite">
          <strong>{text.iosTitle}</strong>
          <p>{text.iosIntro}</p>
          <ol>
            <li><Share2 size={15} aria-hidden="true" /><span>{text.step1}</span></li>
            <li><ExternalLink size={15} aria-hidden="true" /><span>{text.step2}</span></li>
            <li><Download size={15} aria-hidden="true" /><span>{text.step3}</span></li>
          </ol>
          <button type="button" className="pwa-ios-done" onClick={dismiss}>{text.done}</button>
          <small>{text.playStore}</small>
        </div>
      )}
    </aside>
  );
}
