import { Check, Copy, Share2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { VisitorLanguage } from '../contexts/VisitorLanguageContext';
import { doctorPublicPath, providerPublicPath } from '../lib/publicRoutes';
import { recordDoctorInteraction, recordProviderInteraction } from '../services/engagement';

type ShareTarget = 'doctor' | 'provider';

interface Props {
  targetType: ShareTarget;
  targetId: string;
  slug: string;
  title: string;
  language: VisitorLanguage;
  providerType?: 'hospital' | 'chamber';
  className?: string;
}

const copy = {
  bn: { share: 'শেয়ার করুন', copy: 'লিংক কপি করুন', copied: 'লিংক কপি হয়েছে', failed: 'লিংক কপি করা যায়নি' },
  en: { share: 'Share', copy: 'Copy link', copied: 'Link copied', failed: 'Could not copy link' },
} as const;

function publicPath(targetType: ShareTarget, slug: string, targetId: string, providerType?: 'hospital' | 'chamber') {
  return targetType === 'doctor'
    ? doctorPublicPath(slug, targetId)
    : providerPublicPath(providerType, slug, targetId);
}

function record(targetType: ShareTarget, targetId: string, event: 'share_click' | 'share_native' | 'share_copy') {
  const source = targetType === 'doctor' ? 'doctor_profile_share' : 'hospital_profile_share';
  return targetType === 'doctor'
    ? recordDoctorInteraction(targetId, event, source)
    : recordProviderInteraction(targetId, event, source);
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // Fall through to the legacy copy path for browsers that expose the API
      // but deny clipboard access outside a supported context.
    }
  }

  const node = document.createElement('textarea');
  node.value = value;
  node.setAttribute('readonly', '');
  node.style.position = 'fixed';
  node.style.opacity = '0';
  node.style.pointerEvents = 'none';
  document.body.appendChild(node);
  node.select();
  node.setSelectionRange(0, value.length);
  let copied = false;
  try { copied = document.execCommand('copy'); } catch { copied = false; }
  node.remove();
  return copied;
}

export default function ProfileShareButton({ targetType, targetId, slug, title, language, providerType, className = '' }: Props) {
  const [nativeShare, setNativeShare] = useState(false);
  const [feedback, setFeedback] = useState<'copied' | 'failed' | null>(null);
  const t = copy[language];

  useEffect(() => {
    setNativeShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function');
  }, []);

  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(null), 2200);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  async function handleShare() {
    if (!slug) return;
    const url = new URL(publicPath(targetType, slug, targetId, providerType), window.location.origin).toString();
    void record(targetType, targetId, 'share_click').catch(() => undefined);

    if (nativeShare && navigator.share) {
      // Browsers do not expose which receiving app the user selects. We only
      // record that the native share UI was intentionally invoked.
      void record(targetType, targetId, 'share_native').catch(() => undefined);
      try {
        await navigator.share({ title, url });
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
      }
      return;
    }

    const copied = await copyText(url);
    if (copied) {
      setFeedback('copied');
      void record(targetType, targetId, 'share_copy').catch(() => undefined);
    } else {
      setFeedback('failed');
    }
  }

  return (
    <div className={`profile-share-control ${className}`.trim()}>
      <button type="button" className="profile-share-button" onClick={() => void handleShare()}>
        {feedback === 'copied' ? <Check /> : nativeShare ? <Share2 /> : <Copy />}
        <span>{nativeShare ? t.share : t.copy}</span>
      </button>
      {feedback && <span className={`profile-share-feedback ${feedback}`} role="status">{feedback === 'copied' ? t.copied : t.failed}</span>}
    </div>
  );
}
