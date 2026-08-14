import { MapPin, Stethoscope, WalletCards } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { getImageUrl } from '../lib/storage';
import type { DoctorSearchRow } from '../types';
import VerifiedBadge from './VerifiedBadge';

export default function DoctorResultCard({ doctor }: { doctor: DoctorSearchRow }) {
  const [imageFailed, setImageFailed] = useState(false);
  const avatar = getImageUrl(doctor.avatar_url, 'avatars');
  const primarySpecialty = doctor.specialties.find((item) => item.is_primary) ?? doctor.specialties[0];
  const location = doctor.nearest_provider_name || [doctor.upazila_name_bn, doctor.district_name_bn].filter(Boolean).join(', ');
  const distanceText = doctor.distance_km != null ? `${doctor.distance_km.toFixed(1)} km দূরে` : null;

  return (
    <article className="directory-doctor-card visitor-doctor-card marketplace-card">
      <Link className="visitor-doctor-main" to={`/doctors/${doctor.doctor_id}`}>
        <div className="directory-avatar visitor-doctor-avatar">
          {avatar && !imageFailed ? (
            <img src={avatar} alt={doctor.doctor_name} loading="lazy" onError={() => setImageFailed(true)} />
          ) : (
            <div className="doctor-photo-fallback" aria-hidden="true"><Stethoscope /></div>
          )}
          <VerifiedBadge className="verified-badge" label="যাচাইকৃত" />
        </div>
        <div className="visitor-doctor-copy">
          <h2>{doctor.doctor_name}</h2>
          <strong>{primarySpecialty?.name_bn || doctor.designation || 'বিশেষজ্ঞ চিকিৎসক'}</strong>
          {doctor.degree && <p className="visitor-doctor-degree">{doctor.degree}</p>}
          {(doctor.designation || doctor.professional_title) && <p className="visitor-doctor-designation">{doctor.designation || doctor.professional_title}</p>}
          <p className="visitor-doctor-location"><MapPin /><span>{location || 'এলাকার তথ্য নেই'}{distanceText && <b className="visitor-doctor-distance"> · {distanceText}</b>}</span></p>
          {doctor.consultation_fee != null && (
            <div className="doctor-fee-highlight"><WalletCards /><span>কনসালটেশন</span><strong>৳{Number(doctor.consultation_fee).toLocaleString('bn-BD')}</strong></div>
          )}
        </div>
      </Link>
    </article>
  );
}
