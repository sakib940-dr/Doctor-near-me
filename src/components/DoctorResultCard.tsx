import { ArrowRight, BadgeCheck, MapPin, ShieldCheck, Stethoscope } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getImageUrl } from '../lib/storage';
import type { DoctorSearchRow } from '../types';

export default function DoctorResultCard({ doctor }: { doctor: DoctorSearchRow }) {
  const avatar = getImageUrl(doctor.avatar_url, 'avatars');
  const primarySpecialty = doctor.specialties.find((item) => item.is_primary) ?? doctor.specialties[0];
  return (
    <article className="directory-doctor-card visitor-doctor-card">
      <Link className="visitor-doctor-main" to={`/doctors/${doctor.doctor_id}`}>
        <div className="directory-avatar visitor-doctor-avatar">
          {avatar ? <img src={avatar} alt={doctor.doctor_name} /> : <Stethoscope size={34} />}
        </div>
        <div className="visitor-doctor-copy">
          <div className="verified-line"><BadgeCheck size={15} /> যাচাইকৃত চিকিৎসক</div>
          <h2>{doctor.doctor_name}</h2>
          {doctor.degree && <p className="visitor-doctor-degree">{doctor.degree}</p>}
          <strong>{primarySpecialty?.name_bn || 'বিশেষজ্ঞ চিকিৎসক'}</strong>
          <p>{doctor.designation || doctor.professional_title || 'বিশেষজ্ঞ চিকিৎসক'}</p>
          <div className="visitor-doctor-meta">
            {doctor.bmdc_registration_no && <span><ShieldCheck /> BMDC: {doctor.bmdc_registration_no}</span>}
            <span><MapPin /> {[doctor.upazila_name_bn, doctor.district_name_bn].filter(Boolean).join(', ') || 'এলাকার তথ্য নেই'}</span>
          </div>
        </div>
        <span className="visitor-doctor-arrow"><ArrowRight /></span>
      </Link>
    </article>
  );
}
