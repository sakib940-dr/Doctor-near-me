import { BadgeCheck, MapPin, Stethoscope } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getImageUrl } from '../lib/storage';
import { getDoctorPublicProfile } from '../services/discovery';
import type { DoctorSearchRow } from '../types';

export default function DoctorResultCard({ doctor }: { doctor: DoctorSearchRow }) {
  const [resolvedPhoto, setResolvedPhoto] = useState<string | null>(doctor.avatar_url);
  const [imageFailed, setImageFailed] = useState(false);
  const avatar = getImageUrl(resolvedPhoto, 'avatars');
  const primarySpecialty = doctor.specialties.find((item) => item.is_primary) ?? doctor.specialties[0];
  const location = [doctor.upazila_name_bn, doctor.district_name_bn].filter(Boolean).join(', ');

  useEffect(() => {
    let active = true;
    setResolvedPhoto(doctor.avatar_url);
    setImageFailed(false);
    // The search RPC returns the legacy profiles.avatar_url. The existing
    // public-profile RPC already coalesces doctors.profile_photo_url first,
    // so use it to show the doctor's real professional profile photo here.
    getDoctorPublicProfile(doctor.doctor_id)
      .then((profile) => {
        if (active && profile?.doctor.avatar_url) setResolvedPhoto(profile.doctor.avatar_url);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [doctor.doctor_id, doctor.avatar_url]);

  return (
    <article className="directory-doctor-card visitor-doctor-card">
      <Link className="visitor-doctor-main" to={`/doctors/${doctor.doctor_id}`}>
        <div className="directory-avatar visitor-doctor-avatar">
          {avatar && !imageFailed ? (
            <img src={avatar} alt={doctor.doctor_name} loading="lazy" onError={() => setImageFailed(true)} />
          ) : (
            <div className="doctor-photo-fallback" aria-hidden="true"><Stethoscope /></div>
          )}
        </div>
        <div className="visitor-doctor-copy">
          <span className="verified-line"><BadgeCheck /> যাচাইকৃত চিকিৎসক</span>
          <h2>{doctor.doctor_name}</h2>
          {doctor.degree && <p className="visitor-doctor-degree">{doctor.degree}</p>}
          <strong>{primarySpecialty?.name_bn || doctor.designation || 'বিশেষজ্ঞ চিকিৎসক'}</strong>
          {(doctor.designation || doctor.professional_title) && (
            <p className="visitor-doctor-designation">{doctor.designation || doctor.professional_title}</p>
          )}
          <p className="visitor-doctor-location"><MapPin /> {location || 'এলাকার তথ্য নেই'}</p>
        </div>
      </Link>
    </article>
  );
}
