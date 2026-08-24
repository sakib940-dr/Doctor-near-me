import { Building2, Crown, Heart, Hospital, MapPin, Navigation, Star } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { providerPublicPath } from '../lib/publicRoutes';
import { getImageUrl } from '../lib/storage';
import type { ProviderDirectoryRow, PublicProfileStats } from '../types';
import FollowSaveButton from './FollowSaveButton';
import VerifiedBadge from './VerifiedBadge';
import { useVisitorLanguage } from '../contexts/VisitorLanguageContext';

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

function storedViewerLocation(){try{const raw=localStorage.getItem('docbd-current-location');if(!raw)return null;const value=JSON.parse(raw) as {latitude?:number;longitude?:number;capturedAt?:number};if(typeof value.latitude!=='number'||typeof value.longitude!=='number')return null;if(value.capturedAt&&Date.now()-value.capturedAt>30*60*1000)return null;return{latitude:value.latitude,longitude:value.longitude}}catch{return null}}

export default function ProviderCard({ provider, stats, onStatsChange, viewerLocation }: Props) {
  const { language } = useVisitorLanguage();
  const tr = (bn: string, en: string) => language === 'bn' ? bn : en;
  const [localStats, setLocalStats] = useState<PublicProfileStats | null>(stats ?? null);
  const [imageFailed, setImageFailed] = useState(false);
  const image = getImageUrl(provider.banner_url || provider.logo_url, 'public-images', 'thumbnail');
  const TypeIcon = provider.provider_type === 'hospital' ? Hospital : Building2;
  const publicHref = providerPublicPath(provider.provider_type, provider.slug, provider.id);
  const location=viewerLocation??storedViewerLocation();
  const distance = location && provider.latitude != null && provider.longitude != null
    ? distanceKm(location.latitude, location.longitude, Number(provider.latitude), Number(provider.longitude))
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
        <Link to={publicHref} aria-label={tr(`${provider.name_bn} প্রোফাইল দেখুন`, `View ${provider.name_en || provider.name_bn} profile`)}>
          {image && !imageFailed ? <img src={image} alt={provider.name_bn} loading="lazy" decoding="async" onError={() => setImageFailed(true)} /> : <TypeIcon />}
        </Link>
        <div className="provider-card-badges visitor-horizontal-badges">
          {localStats?.is_premium ? <span className="rank-badge premium"><Crown /> {tr('প্রিমিয়াম', 'Premium')}</span> : provider.verified ? <VerifiedBadge label={tr('ভেরিফায়েড', 'Verified')} /> : null}
        </div>
      </div>

      <Link className="provider-card-primary visitor-horizontal-profile-body" to={publicHref}>
        <div className="provider-card-copy">
          <span className="provider-type-label">{provider.provider_type === 'hospital' ? tr('হাসপাতাল', 'Hospital') : tr('চেম্বার', 'Chamber')}</span>
          <h3>{language === 'bn' ? provider.name_bn : provider.name_en || provider.name_bn}</h3>
          {language === 'bn' && provider.name_en && provider.name_en !== provider.name_bn ? <small className="provider-card-english-name">{provider.name_en}</small> : null}
          <p><MapPin /><span>{provider.address || tr('ঠিকানা যোগ করা হয়নি', 'Address not added')}</span></p>
          {provider.opening_note ? <p className="provider-card-opening"><Building2 /><span>{provider.opening_note}</span></p> : null}
          <div className="marketplace-doctor-meta-row visitor-card-social-proof">
            {localStats?.average_rating != null ? <span><Star fill="currentColor" /> {localStats.average_rating.toFixed(1)} <small>({localStats.review_count})</small></span> : null}
            {localStats ? <span title={tr('মোট সংরক্ষণ','Total saves')}><Heart /> {localStats.follower_count.toLocaleString(language === 'bn' ? 'bn-BD' : 'en-US')}</span> : null}
            {distance!=null?<span className="visitor-card-distance"><Navigation/>{tr(`${distance.toFixed(1)} কিমি দূরে`,`${distance.toFixed(1)} km away`)}</span>:null}
          </div>
        </div>
      </Link>

      <FollowSaveButton
        targetType="provider"
        targetId={provider.id}
        stats={localStats}
        className="doctor-save-button provider-save-button visitor-horizontal-save-button"
        entityLabel={provider.provider_type === 'hospital' ? tr('হাসপাতাল', 'hospital') : tr('চেম্বার', 'chamber')}
        language={language}
        onStatsChange={updateStats}
      />
    </article>
  );
}
