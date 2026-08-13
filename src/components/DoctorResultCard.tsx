import { ArrowRight, BadgeCheck, CalendarCheck, MapPin, Stethoscope } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getImageUrl } from '../lib/storage';
import type { DoctorSearchRow } from '../types';

export default function DoctorResultCard({ doctor }: { doctor: DoctorSearchRow }) {
  const avatar = getImageUrl(doctor.avatar_url, 'avatars');
  return (
    <article className="directory-doctor-card">
      <div className="directory-card-head">
        <div className="directory-avatar">
          {avatar ? <img src={avatar} alt={doctor.doctor_name} /> : <Stethoscope size={30} />}
        </div>
        <div>
          <div className="verified-line"><BadgeCheck size={15} /> যাচাইকৃত চিকিৎসক</div>
          <h2>{doctor.doctor_name}</h2>
          <p>{doctor.designation || doctor.professional_title || 'বিশেষজ্ঞ চিকিৎসক'}</p>
        </div>
      </div>
      <div className="directory-tags">
        {doctor.specialties.slice(0, 3).map((specialty) => <span key={specialty.id}>{specialty.name_bn}</span>)}
      </div>
      {doctor.degree && <p className="directory-degree">{doctor.degree}</p>}
      <div className="directory-meta">
        <span><MapPin size={16} />{[doctor.upazila_name_bn, doctor.district_name_bn].filter(Boolean).join(', ') || 'এলাকার তথ্য নেই'}</span>
        {doctor.available_today && <span className="today"><CalendarCheck size={16} /> আজ চেম্বার আছে</span>}
      </div>
      <div className="directory-card-footer">
        <div><small>ভিজিট ফি</small><strong>{doctor.consultation_fee == null ? 'যোগাযোগ করুন' : `৳${doctor.consultation_fee}`}</strong></div>
        <Link to={`/doctors/${doctor.doctor_id}`}>প্রোফাইল দেখুন <ArrowRight size={17} /></Link>
      </div>
    </article>
  );
}
