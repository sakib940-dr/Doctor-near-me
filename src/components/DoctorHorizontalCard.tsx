import { ArrowRight, BadgeCheck, CalendarCheck, MapPin, ShieldCheck, Stethoscope } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getImageUrl } from '../lib/storage';
import type { DoctorSearchRow } from '../types';

// লক্ষ্য করুন: search_doctors_advanced() RPC (existing backend, অপরিবর্তিত)
// BMDC নম্বর রিটার্ন করে না — সেটা শুধু get_doctor_public_profile()-এ থাকে।
// তাই এই লিস্ট কার্ডে BMDC তখনই দেখানো হবে যখন ডেটাতে থাকবে; নাহলে সেই
// লাইনটি স্বয়ংক্রিয়ভাবে বাদ যাবে, প্রোফাইল পেজে ঠিকই দেখা যাবে।
export default function DoctorHorizontalCard({ doctor }: { doctor: DoctorSearchRow & { bmdc_registration_no?: string | null } }) {
  const avatar = getImageUrl(doctor.avatar_url, 'avatars');
  const location = [doctor.upazila_name_bn, doctor.district_name_bn].filter(Boolean).join(', ');

  return (
    <Link to={`/doctors/${doctor.doctor_id}`} className="doctor-h-card">
      <div className="doctor-h-photo">
        {avatar ? <img src={avatar} alt={doctor.doctor_name} /> : <Stethoscope size={34} />}
        {doctor.available_today && <span className="doctor-h-today"><CalendarCheck size={12} /> আজ আছে</span>}
      </div>
      <div className="doctor-h-body">
        <div className="doctor-h-verified"><BadgeCheck size={14} /> যাচাইকৃত চিকিৎসক</div>
        <h3>{doctor.doctor_name}</h3>
        {doctor.degree && <p className="doctor-h-degree">{doctor.degree}</p>}
        <div className="doctor-h-tags">
          {doctor.specialties.slice(0, 3).map((specialty) => <span key={specialty.id}>{specialty.name_bn}</span>)}
        </div>
        <p className="doctor-h-designation">{doctor.designation || doctor.professional_title || 'বিশেষজ্ঞ চিকিৎসক'}</p>
        {doctor.bmdc_registration_no && <p className="doctor-h-bmdc"><ShieldCheck size={13} /> BMDC: {doctor.bmdc_registration_no}</p>}
        <div className="doctor-h-meta">
          {location && <span><MapPin size={13} /> {location}</span>}
          {doctor.consultation_fee != null && <span className="doctor-h-fee">ভিজিট ৳{doctor.consultation_fee}</span>}
        </div>
      </div>
      <div className="doctor-h-arrow"><ArrowRight size={18} /></div>
    </Link>
  );
}
