import { BadgeCheck, Building2, Crown, GraduationCap, Heart, MapPin, Sparkles, Star, Stethoscope } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { doctorPublicPath } from '../lib/publicRoutes';
import { getImageUrl } from '../lib/storage';
import type { DoctorSearchRow, PublicProfileStats } from '../types';
import FollowSaveButton from './FollowSaveButton';
import VerifiedBadge from './VerifiedBadge';
import { useVisitorLanguage } from '../contexts/VisitorLanguageContext';

interface Props {
  doctor: DoctorSearchRow;
  stats?: PublicProfileStats | null;
  onStatsChange?: (doctorId: string, stats: PublicProfileStats) => void;
  viewerLocation?: { latitude: number; longitude: number } | null;
  profileHref?: string | null;
  hideSave?: boolean;
  avatarBucket?: 'avatars' | 'public-images';
  cardBadge?: string;
}

function distanceKm(aLat: number, aLon: number, bLat: number, bLon: number) {
  const toRad = (value: number) => value * Math.PI / 180;
  const dLat = toRad(bLat - aLat); const dLon = toRad(bLon - aLon);
  const lat1 = toRad(aLat); const lat2 = toRad(bLat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function storedViewerLocation() {
  try {
    const raw = localStorage.getItem('docbd-current-location'); if (!raw) return null;
    const value = JSON.parse(raw) as { latitude?: number; longitude?: number; capturedAt?: number };
    if (typeof value.latitude !== 'number' || typeof value.longitude !== 'number') return null;
    if (value.capturedAt && Date.now() - value.capturedAt > 30 * 60 * 1000) return null;
    return { latitude: value.latitude, longitude: value.longitude };
  } catch { return null; }
}

export default function DoctorResultCard({ doctor, stats, onStatsChange, viewerLocation, profileHref, hideSave = false, avatarBucket = 'avatars', cardBadge }: Props) {
  const { language } = useVisitorLanguage();
  const tr = (bn: string, en: string) => language === 'bn' ? bn : en;
  const [imageFailed, setImageFailed] = useState(false);
  const [localStats, setLocalStats] = useState<PublicProfileStats | null>(stats ?? null);
  const avatar = getImageUrl(doctor.avatar_url, avatarBucket, 'thumbnail');
  const primarySpecialty = doctor.specialties.find((item) => item.is_primary) ?? doctor.specialties[0];
  const localizedSpecialty = language === 'bn' ? primarySpecialty?.name_bn : primarySpecialty?.name_en || primarySpecialty?.name_bn;
  const specialtyParts = Array.from(new Set([doctor.specialty_text, doctor.professional_title, localizedSpecialty].filter((value): value is string => Boolean(value?.trim()))));
  const specialtyLabel = specialtyParts.join(' · ') || tr('সাধারণ চিকিৎসক', 'General Practitioner');
  const institutionLabel = doctor.present_job || doctor.medical_college || doctor.nearest_provider_name;
  const secondaryInstitution = doctor.medical_college && doctor.present_job && doctor.medical_college !== doctor.present_job ? doctor.medical_college : null;
  const locationLabel = doctor.public_address || doctor.nearest_provider_address || [doctor.upazila_name_bn, doctor.district_name_bn].filter(Boolean).join(', ');
  const location = viewerLocation ?? storedViewerLocation();
  const computedDistance = doctor.distance_km ?? (location && doctor.nearest_provider_latitude != null && doctor.nearest_provider_longitude != null ? distanceKm(location.latitude, location.longitude, Number(doctor.nearest_provider_latitude), Number(doctor.nearest_provider_longitude)) : null);
  const distanceText = computedDistance != null ? tr(`${computedDistance.toFixed(1)} কিমি দূরে`, `${computedDistance.toFixed(1)} km away`) : null;
  const isVerified = doctor.verification_status === 'approved';
  const tier = localStats?.ranking_tier ?? (isVerified ? 'verified' : 'unverified');
  const publicHref = profileHref === undefined ? doctorPublicPath(doctor.profile_slug, doctor.doctor_id) : profileHref;
  const rankingLabel: Record<PublicProfileStats['ranking_tier'], string> = {
    premium: tr('প্রিমিয়াম', 'Premium'), verified: tr('ভেরিফায়েড', 'Verified'), new: tr('নতুন', 'New'), unverified: tr('যাচাই হয়নি', 'Unverified'),
  };

  useEffect(() => setLocalStats(stats ?? null), [stats]);

  function updateStats(next: PublicProfileStats) {
    setLocalStats(next);
    onStatsChange?.(doctor.doctor_id, next);
  }

  return (
    <article className="directory-doctor-card visitor-doctor-card marketplace-card marketplace-doctor-card-compact visitor-horizontal-profile-card">
      <div className="marketplace-card-media visitor-horizontal-profile-media">
        {publicHref ? <Link to={publicHref} aria-label={tr(`${doctor.doctor_name}-এর বিস্তারিত দেখুন`, `View ${doctor.doctor_name}'s details`)}>
          {avatar && !imageFailed ? (
            <img src={avatar} alt={doctor.doctor_name} loading="lazy" decoding="async" onError={() => setImageFailed(true)} />
          ) : (
            <div className="doctor-photo-fallback" aria-hidden="true"><Stethoscope /></div>
          )}
        </Link> : <div aria-label={tr(`${doctor.doctor_name}-এর হাসপাতাল ডাক্তার কার্ড`, `${doctor.doctor_name} hospital doctor card`)}>
          {avatar && !imageFailed ? <img src={avatar} alt={doctor.doctor_name} loading="lazy" decoding="async" onError={() => setImageFailed(true)} /> : <div className="doctor-photo-fallback" aria-hidden="true"><Stethoscope /></div>}
        </div>}
        <div className="marketplace-doctor-badges visitor-horizontal-badges">
          {tier === 'premium' ? <span className="rank-badge premium"><Crown /> {tr('প্রিমিয়াম', 'Premium')}</span> : null}
          {tier === 'new' ? <span className="rank-badge new"><Sparkles /> {tr('নতুন', 'New')}</span> : null}
          {tier !== 'premium' && tier !== 'new' ? <VerifiedBadge verified={isVerified} label={rankingLabel[tier]} /> : null}
          {cardBadge ? <span className="rank-badge hospital-card"><Building2 /> {cardBadge}</span> : null}
        </div>
      </div>

      {publicHref ? <Link className="visitor-doctor-main marketplace-doctor-body visitor-horizontal-profile-body" to={publicHref}>
        <div className="visitor-doctor-copy">
          <h2>{doctor.doctor_name}</h2>
          {doctor.degree && <p className="visitor-doctor-degree">{doctor.degree}</p>}
          <strong>{specialtyLabel}</strong>
          {doctor.bmdc_registration_no && <p className="visitor-doctor-bmdc"><BadgeCheck /><span>{tr('বিএমডিসি', 'BMDC')}: {doctor.bmdc_registration_no}</span></p>}
          {institutionLabel && <p className="visitor-doctor-work"><Building2 /><span>{institutionLabel}</span></p>}
          {secondaryInstitution && <p className="visitor-doctor-college"><GraduationCap /><span>{secondaryInstitution}</span></p>}
          <p className="visitor-doctor-location"><MapPin /><span>{locationLabel || tr('অবস্থানের তথ্য নেই', 'Location not available')}{distanceText && <b> · {distanceText}</b>}</span></p>
          <div className="marketplace-doctor-meta-row visitor-card-social-proof">
            {localStats?.average_rating != null ? <span><Star fill="currentColor" /> {localStats.average_rating.toFixed(1)} <small>({localStats.review_count})</small></span> : null}
            {localStats && localStats.follower_count > 0 ? <span><Heart /> {localStats.follower_count.toLocaleString(language === 'bn' ? 'bn-BD' : 'en-US')}</span> : null}
          </div>
        </div>
      </Link> : <div className="visitor-doctor-main marketplace-doctor-body visitor-horizontal-profile-body">
        <div className="visitor-doctor-copy"><h2>{doctor.doctor_name}</h2>{doctor.degree && <p className="visitor-doctor-degree">{doctor.degree}</p>}<strong>{specialtyLabel}</strong>{doctor.bmdc_registration_no && <p className="visitor-doctor-bmdc"><BadgeCheck /><span>{tr('বিএমডিসি', 'BMDC')}: {doctor.bmdc_registration_no}</span></p>}{institutionLabel && <p className="visitor-doctor-work"><Building2 /><span>{institutionLabel}</span></p>}<p className="visitor-doctor-location"><MapPin /><span>{locationLabel || tr('হাসপাতাল রিসেপশন', 'Hospital reception')}</span></p></div>
      </div>}

      {!hideSave && <FollowSaveButton
        targetType="doctor"
        targetId={doctor.doctor_id}
        stats={localStats}
        className="doctor-save-button visitor-horizontal-save-button"
        entityLabel={tr('ডাক্তার', 'doctor')}
        language={language}
        onStatsChange={updateStats}
      />}
    </article>
  );
}
