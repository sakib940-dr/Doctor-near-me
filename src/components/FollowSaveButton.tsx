import { Heart, LoaderCircle } from 'lucide-react';
import { MouseEvent, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  getDoctorPublicStats,
  getProviderPublicStats,
  setDoctorFollow,
  setProviderFollow,
} from '../services/engagement';
import type { PublicProfileStats } from '../types';

interface Props {
  targetType: 'doctor' | 'provider';
  targetId: string;
  stats?: PublicProfileStats | null;
  initialFollowing?: boolean;
  autoLoadStats?: boolean;
  variant?: 'icon' | 'button';
  className?: string;
  entityLabel?: string;
  onStatsChange?: (stats: PublicProfileStats) => void;
  onFollowingChange?: (following: boolean) => void;
  language?: 'bn' | 'en';
}

const defaultStats = (following = false): PublicProfileStats => ({
  follower_count: 0,
  review_count: 0,
  average_rating: null,
  is_following: following,
  ranking_tier: 'unverified',
  is_premium: false,
});

export default function FollowSaveButton({
  targetType,
  targetId,
  stats,
  initialFollowing = false,
  autoLoadStats = false,
  variant = 'icon',
  className = '',
  entityLabel,
  onStatsChange,
  onFollowingChange,
  language = 'bn',
}: Props) {
  const { user, account } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [localStats, setLocalStats] = useState<PublicProfileStats | null>(stats ?? (initialFollowing ? defaultStats(true) : null));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (stats !== undefined) setLocalStats(stats ?? null);
  }, [stats]);

  useEffect(() => {
    if (!autoLoadStats || stats !== undefined || !targetId) return;
    let active = true;
    const request = targetType === 'doctor' ? getDoctorPublicStats(targetId) : getProviderPublicStats(targetId);
    request.then((result) => {
      if (!active || !result) return;
      setLocalStats(result);
      onStatsChange?.(result);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [autoLoadStats, onStatsChange, stats, targetId, targetType]);

  // Primary follower role is Patient. Logged-out visitors still see the action
  // so the existing login/signup flow can resume from the same public page.
  if (user && account?.role !== 'patient') return null;

  const following = localStats?.is_following ?? initialFollowing;
  const readableTarget = entityLabel || (language === 'bn' ? (targetType === 'doctor' ? 'ডাক্তার' : 'হাসপাতাল') : (targetType === 'doctor' ? 'doctor' : 'hospital'));
  const saveText = language === 'bn' ? 'সংরক্ষণ' : 'Save';
  const savedText = language === 'bn' ? 'সংরক্ষিত' : 'Saved';

  async function toggle(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (!user) {
      navigate('/auth', { state: { from: `${location.pathname}${location.search}${location.hash}` } });
      return;
    }
    if (account?.role !== 'patient' || busy) return;

    setBusy(true);
    setError(null);
    try {
      const nextFollowing = !following;
      const result = targetType === 'doctor'
        ? await setDoctorFollow(targetId, nextFollowing)
        : await setProviderFollow(targetId, nextFollowing);
      const next: PublicProfileStats = {
        ...(localStats ?? defaultStats()),
        follower_count: Number(result.follower_count ?? 0),
        is_following: Boolean(result.following),
      };
      setLocalStats(next);
      onStatsChange?.(next);
      onFollowingChange?.(next.is_following);
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : 'সংরক্ষণ করা যায়নি।');
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      className={`follow-save-button ${variant === 'button' ? 'follow-save-button-labeled' : 'follow-save-button-icon'} ${following ? 'is-saved' : ''} ${className}`.trim()}
      aria-label={following ? (language === 'bn' ? `${readableTarget} সংরক্ষিত থেকে সরান` : `Remove ${readableTarget} from saved`) : (language === 'bn' ? `${readableTarget} সংরক্ষণ করুন` : `Save ${readableTarget}`)}
      aria-pressed={following}
      title={error || (following ? (language === 'bn' ? 'সংরক্ষিত থেকে সরান' : 'Remove from saved') : saveText)}
      disabled={busy}
      onClick={toggle}
    >
      {busy ? <LoaderCircle className="spin" /> : <Heart fill={following ? 'currentColor' : 'none'} />}
      {variant === 'button' ? <span>{following ? savedText : saveText}</span> : null}
    </button>
  );
}
