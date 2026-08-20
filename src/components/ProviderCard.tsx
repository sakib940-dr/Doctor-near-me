import { Building2, Crown, Heart, Hospital, MapPin, Star } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getImageUrl } from '../lib/storage';
import type { ProviderDirectoryRow, PublicProfileStats } from '../types';
import FollowSaveButton from './FollowSaveButton';
import VerifiedBadge from './VerifiedBadge';

interface Props {
  provider: ProviderDirectoryRow;
  stats?: PublicProfileStats | null;
  onStatsChange?: (providerId: string, stats: PublicProfileStats) => void;
  viewerLocation?: { latitude: number; longitude: number } | null;
}

function distanceKm(aLat: number, aLon: number, bLat: number, bLon: number) {
  const toRad = (value: number) => value * Math.PI / 180;
  const earthKm = 6371;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return earthKm * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export default function ProviderCard({ provider, stats, onStatsChange, viewerLocation }: Props) {
  const [localStats, setLocalStats] = useState<PublicProfileStats | null>(stats ?? null);
  const [imageFailed, setImageFailed] = useState(false);
  const image = getImageUrl(provider.banner_url || provider.logo_url, 'public-images');
  const TypeIcon = provider.provider_type === 'hospital' ? Hospital : Building2;
  const distance = viewerLocation && provider.latitude != null && provider.longitude != null
    ? distanceKm(viewerLocation.latitude, viewerLocation.longitude, Number(provider.latitude), Number(provider.longitude))
    : null;

  useEffect(() => setLocalStats(stats ?? null), [stats]);
  useEffect(() => setImageFailed(false), [image]);

  function updateStats(next: PublicProfileStats) {
    setLocalStats(next);
    onStatsChange?.(provider.id, next);
  }

  return (
    <article className="visitor-provider-card marketplace-card marketplace-provider-card-compact visitor-horizontal-profile-card provider-horizontal-profile-card">
      <div className="provider-logo visitor-horizontal-profile-media">
        <Link to={`/providers/${provider.id}`} aria-label={`${provider.name_bn} profile দেখুন`}>
          {image && !imageFailed ? <img src={image} alt={provider.name_bn} loading="lazy" decoding="async" onError={() => setImageFailed(true)} /> : <TypeIcon />}
        </Link>
        <div className="provider-card-badges visitor-horizontal-badges">
          {localStats?.is_premium ? <span className="rank-badge premium"><Crown /> Premium</span> : provider.verified ? <VerifiedBadge label="Verified" /> : null}
        </div>
      </div>

      <Link className="provider-card-primary visitor-horizontal-profile-body" to={`/providers/${provider.id}`}>
        <div className="provider-card-copy">
          <span className="provider-type-label">{provider.provider_type === 'hospital' ? 'হাসপাতাল' : 'চেম্বার'}</span>
          <h3>{provider.name_bn}</h3>
          {provider.name_en && provider.name_en !== provider.name_bn ? <small className="provider-card-english-name">{provider.name_en}</small> : null}
          <p><MapPin /><span>{provider.address || 'ঠিকানা যোগ করা হয়নি'}{distance != null ? <b> · {distance.toFixed(1)} km দূরে</b> : null}</span></p>
          {provider.opening_note ? <p className="provider-card-opening"><Building2 /><span>{provider.opening_note}</span></p> : null}
          <div className="marketplace-doctor-meta-row visitor-card-social-proof">
            {localStats?.average_rating != null ? <span><Star fill="currentColor" /> {localStats.average_rating.toFixed(1)} <small>({localStats.review_count})</small></span> : null}
            {localStats && localStats.follower_count > 0 ? <span><Heart /> {localStats.follower_count.toLocaleString('bn-BD')}</span> : null}
          </div>
        </div>
      </Link>

      <FollowSaveButton
        targetType="provider"
        targetId={provider.id}
        stats={localStats}
        className="doctor-save-button provider-save-button visitor-horizontal-save-button"
        entityLabel={provider.provider_type === 'hospital' ? 'হাসপাতাল' : 'চেম্বার'}
        onStatsChange={updateStats}
      />
    </article>
  );
}
