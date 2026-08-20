import { Building2, Crown, Heart, Hospital, MapPin, Star } from 'lucide-react';
import { MouseEvent, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getImageUrl } from '../lib/storage';
import { setProviderFollow } from '../services/engagement';
import type { ProviderDirectoryRow, PublicProfileStats } from '../types';
import VerifiedBadge from './VerifiedBadge';

interface Props {
  provider: ProviderDirectoryRow;
  stats?: PublicProfileStats | null;
  onStatsChange?: (providerId: string, stats: PublicProfileStats) => void;
}

export default function ProviderCard({ provider, stats, onStatsChange }: Props) {
  const [localStats, setLocalStats] = useState<PublicProfileStats | null>(stats ?? null);
  const [followBusy, setFollowBusy] = useState(false);
  const { user, account } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const logo = getImageUrl(provider.logo_url, 'public-images');
  const TypeIcon = provider.provider_type === 'hospital' ? Hospital : Building2;
  const canShowFollow = !user || account?.role === 'patient';

  useEffect(() => setLocalStats(stats ?? null), [stats]);

  async function handleFollow(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (!user) {
      navigate('/auth', { state: { from: `${location.pathname}${location.search}${location.hash}` } });
      return;
    }
    if (account?.role !== 'patient' || followBusy) return;
    setFollowBusy(true);
    try {
      const nextFollowing = !(localStats?.is_following ?? false);
      const result = await setProviderFollow(provider.id, nextFollowing);
      const next: PublicProfileStats = {
        follower_count: result.follower_count,
        review_count: localStats?.review_count ?? 0,
        average_rating: localStats?.average_rating ?? null,
        is_following: result.following,
        ranking_tier: localStats?.ranking_tier ?? 'verified',
        is_premium: localStats?.is_premium ?? false,
      };
      setLocalStats(next);
      onStatsChange?.(provider.id, next);
    } finally {
      setFollowBusy(false);
    }
  }

  return (
    <article className="visitor-provider-card marketplace-card marketplace-provider-card-compact">
      <div className="provider-logo">
        <Link to={`/providers/${provider.id}`} aria-label={`${provider.name_bn} profile দেখুন`}>
          {logo ? <img src={logo} alt={provider.name_bn} loading="lazy" decoding="async" /> : <TypeIcon />}
        </Link>
        <div className="provider-card-badges">
          {localStats?.is_premium ? <span className="rank-badge premium"><Crown /> Premium</span> : provider.verified ? <VerifiedBadge label="Verified" /> : null}
        </div>
        {canShowFollow && (
          <button
            className={`doctor-save-button provider-save-button ${localStats?.is_following ? 'is-saved' : ''}`}
            type="button"
            aria-label={localStats?.is_following ? 'সংরক্ষিত থেকে সরান' : 'প্রতিষ্ঠান সংরক্ষণ করুন'}
            aria-pressed={localStats?.is_following ?? false}
            disabled={followBusy}
            onClick={handleFollow}
          >
            <Heart fill={localStats?.is_following ? 'currentColor' : 'none'} />
          </button>
        )}
      </div>
      <Link className="provider-card-primary" to={`/providers/${provider.id}`}>
        <div className="provider-card-copy">
          <span className="provider-type-label">{provider.provider_type === 'hospital' ? 'হাসপাতাল' : 'চেম্বার'}</span>
          <h3>{provider.name_bn}</h3>
          <p><MapPin /> <span>{provider.address || 'ঠিকানা যোগ করা হয়নি'}</span></p>
          <div className="marketplace-doctor-meta-row">
            {localStats?.average_rating != null ? <span><Star fill="currentColor" /> {localStats.average_rating.toFixed(1)} <small>({localStats.review_count})</small></span> : null}
            {localStats && localStats.follower_count > 0 ? <span><Heart /> {localStats.follower_count.toLocaleString('bn-BD')}</span> : null}
          </div>
        </div>
      </Link>
    </article>
  );
}
