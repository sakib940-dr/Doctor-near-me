import { BadgeCheck, Building2, Crown, GraduationCap, Heart, MapPin, Sparkles, Star, Stethoscope } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { doctorPublicPath } from '../lib/publicRoutes';
import { getImageUrl } from '../lib/storage';
import type { DoctorSearchRow, PublicProfileStats } from '../types';
import FollowSaveButton from './FollowSaveButton';
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
  const avatar = getImageUrl(doctor.avatar_url, 'avatars', 'thumbnail');
  const primarySpecialty = doctor.specialties.find((item) => item.is_primary) ?? doctor.specialties[0];
  const specialtyLabel = doctor.professional_title || primarySpecialty?.name_bn || 'General Practitioner';
  const institutionParts = Array.from(new Set([doctor.nearest_provider_name, doctor.present_job].filter((value): value is string => Boolean(value))));
  const institutionLabel = institutionParts.join(' · ') || doctor.medical_college;
  const secondaryInstitution = doctor.medical_college && doctor.medical_college !== institutionLabel ? doctor.medical_college : null;
  const locationLabel = doctor.nearest_provider_address || [doctor.upazila_name_bn, doctor.district_name_bn].filter(Boolean).join(', ');
  const distanceText = doctor.distance_km != null ? `${doctor.distance_km.toFixed(1)} km দূরে` : null;
  const isVerified = doctor.verification_status === 'approved';
  const tier = localStats?.ranking_tier ?? (isVerified ? 'verified' : 'unverified');
  const publicHref = doctorPublicPath(doctor.profile_slug, doctor.doctor_id);

  useEffect(() => setLocalStats(stats ?? null), [stats]);

  function updateStats(next: PublicProfileStats) {
    setLocalStats(next);
    onStatsChange?.(doctor.doctor_id, next);
  }

  return (
    <article className="directory-doctor-card visitor-doctor-card marketplace-card marketplace-doctor-card-compact visitor-horizontal-profile-card">
      <div className="marketplace-card-media visitor-horizontal-profile-media">
        <Link to={publicHref} aria-label={`${doctor.doctor_name} Doctor Details দেখুন`}>
          {avatar && !imageFailed ? (
            <img src={avatar} alt={doctor.doctor_name} loading="lazy" decoding="async" onError={() => setImageFailed(true)} />
          ) : (
            <div className="doctor-photo-fallback" aria-hidden="true"><Stethoscope /></div>
          )}
        </Link>
        <div className="marketplace-doctor-badges visitor-horizontal-badges">
          {tier === 'premium' ? <span className="rank-badge premium"><Crown /> Premium</span> : null}
          {tier === 'new' ? <span className="rank-badge new"><Sparkles /> New</span> : null}
          {tier !== 'premium' && tier !== 'new' ? <VerifiedBadge verified={isVerified} label={rankingLabel[tier]} /> : null}
        </div>
      </div>

      <Link className="visitor-doctor-main marketplace-doctor-body visitor-horizontal-profile-body" to={publicHref}>
        <div className="visitor-doctor-copy">
          <h2>{doctor.doctor_name}</h2>
          {doctor.degree && <p className="visitor-doctor-degree">{doctor.degree}</p>}
          <strong>{specialtyLabel}</strong>
          {doctor.bmdc_registration_no && <p className="visitor-doctor-bmdc"><BadgeCheck /><span>বিএমডিসি: {doctor.bmdc_registration_no}</span></p>}
          {institutionLabel && <p className="visitor-doctor-work"><Building2 /><span>{institutionLabel}</span></p>}
          {secondaryInstitution && <p className="visitor-doctor-college"><GraduationCap /><span>{secondaryInstitution}</span></p>}
          <p className="visitor-doctor-location"><MapPin /><span>{locationLabel || 'লোকেশন তথ্য নেই'}{distanceText && <b> · {distanceText}</b>}</span></p>
          <div className="marketplace-doctor-meta-row visitor-card-social-proof">
            {localStats?.average_rating != null ? <span><Star fill="currentColor" /> {localStats.average_rating.toFixed(1)} <small>({localStats.review_count})</small></span> : null}
            {localStats && localStats.follower_count > 0 ? <span><Heart /> {localStats.follower_count.toLocaleString('bn-BD')}</span> : null}
          </div>
        </div>
      </Link>

      <FollowSaveButton
        targetType="doctor"
        targetId={doctor.doctor_id}
        stats={localStats}
        className="doctor-save-button visitor-horizontal-save-button"
        entityLabel="ডাক্তার"
        onStatsChange={updateStats}
      />
    </article>
  );
}
