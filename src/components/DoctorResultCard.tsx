import { Building2, Crown, Heart, MapPin, Sparkles, Star, Stethoscope, WalletCards } from 'lucide-react';
import { MouseEvent, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getImageUrl } from '../lib/storage';
import { setDoctorFollow } from '../services/engagement';
import type { DoctorSearchRow, PublicProfileStats } from '../types';
import VerifiedBadge from './VerifiedBadge';

interface Props {
  doctor: DoctorSearchRow;
  stats?: PublicProfileStats | null;
  onStatsChange?: (doctorId: string, stats: PublicProfileStats) => void;
}

const rankingLabel: Record<PublicProfileStats['ranking_tier'], string> = {
  premium: 'Premium',
  verified: 'Verified',
  new: 'New',
  unverified: 'Unverified',
};

export default function DoctorResultCard({ doctor, stats, onStatsChange }: Props) {
  const [imageFailed, setImageFailed] = useState(false);
  const [localStats, setLocalStats] = useState<PublicProfileStats | null>(stats ?? null);
  const [followBusy, setFollowBusy] = useState(false);
  const { user, account } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const avatar = getImageUrl(doctor.avatar_url, 'avatars');
  const primarySpecialty = doctor.specialties.find((item) => item.is_primary) ?? doctor.specialties[0];
  const locationLabel = doctor.nearest_provider_name || [doctor.upazila_name_bn, doctor.district_name_bn].filter(Boolean).join(', ');
  const distanceText = doctor.distance_km != null ? `${doctor.distance_km.toFixed(1)} km দূরে` : null;
  const isVerified = doctor.verification_status === 'approved';
  const tier = localStats?.ranking_tier ?? (isVerified ? 'verified' : 'unverified');
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
      const result = await setDoctorFollow(doctor.doctor_id, nextFollowing);
      const next: PublicProfileStats = {
        follower_count: result.follower_count,
        review_count: localStats?.review_count ?? 0,
        average_rating: localStats?.average_rating ?? null,
        is_following: result.following,
        ranking_tier: localStats?.ranking_tier ?? (isVerified ? 'verified' : 'unverified'),
        is_premium: localStats?.is_premium ?? false,
      };
      setLocalStats(next);
      onStatsChange?.(doctor.doctor_id, next);
    } finally {
      setFollowBusy(false);
    }
  }

  return (
    <article className="directory-doctor-card visitor-doctor-card marketplace-card marketplace-doctor-card-compact">
      <div className="marketplace-card-media">
        <Link to={`/doctors/${doctor.doctor_id}`} aria-label={`${doctor.doctor_name} Doctor Details দেখুন`}>
          {avatar && !imageFailed ? (
            <img src={avatar} alt={doctor.doctor_name} loading="lazy" decoding="async" onError={() => setImageFailed(true)} />
          ) : (
            <div className="doctor-photo-fallback" aria-hidden="true"><Stethoscope /></div>
          )}
        </Link>
        <div className="marketplace-doctor-badges">
          {tier === 'premium' ? <span className="rank-badge premium"><Crown /> Premium</span> : null}
          {tier === 'new' ? <span className="rank-badge new"><Sparkles /> New</span> : null}
          {tier !== 'premium' && tier !== 'new' ? <VerifiedBadge verified={isVerified} label={rankingLabel[tier]} /> : null}
        </div>
        {canShowFollow && (
          <button
            className={`doctor-save-button ${localStats?.is_following ? 'is-saved' : ''}`}
            type="button"
            aria-label={localStats?.is_following ? 'সংরক্ষিত থেকে সরান' : 'ডাক্তার সংরক্ষণ করুন'}
            aria-pressed={localStats?.is_following ?? false}
            disabled={followBusy}
            onClick={handleFollow}
          >
            <Heart fill={localStats?.is_following ? 'currentColor' : 'none'} />
          </button>
        )}
      </div>

      <Link className="visitor-doctor-main marketplace-doctor-body" to={`/doctors/${doctor.doctor_id}`}>
        <div className="visitor-doctor-copy">
          <h2>{doctor.doctor_name}</h2>
          {doctor.degree && <p className="visitor-doctor-degree">{doctor.degree}</p>}
          <strong>{primarySpecialty?.name_bn || doctor.professional_title || 'General Practitioner'}</strong>
          {(doctor.nearest_provider_name || doctor.present_job) && (
            <p className="visitor-doctor-work"><Building2 /><span>{doctor.nearest_provider_name || doctor.present_job}</span></p>
          )}
          <p className="visitor-doctor-location"><MapPin /><span>{locationLabel || 'লোকেশন তথ্য নেই'}{distanceText && <b> · {distanceText}</b>}</span></p>
          <div className="marketplace-doctor-meta-row">
            {localStats?.average_rating != null ? <span><Star fill="currentColor" /> {localStats.average_rating.toFixed(1)} <small>({localStats.review_count})</small></span> : <span className="muted-stat">নতুন প্রোফাইল</span>}
            {localStats && localStats.follower_count > 0 ? <span><Heart /> {localStats.follower_count.toLocaleString('bn-BD')}</span> : null}
            {doctor.consultation_fee != null ? <span className="compact-fee"><WalletCards /> ৳{Number(doctor.consultation_fee).toLocaleString('bn-BD')}</span> : null}
          </div>
        </div>
      </Link>
    </article>
  );
}
