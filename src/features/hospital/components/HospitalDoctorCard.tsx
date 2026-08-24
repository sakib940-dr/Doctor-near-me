import { BriefcaseMedical, Clock3, DoorOpen, Stethoscope } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getImageUrl } from '../../../lib/storage';
import type { ProviderDirectoryRow } from '../../../types';
import type { HospitalDoctorCard as HospitalDoctor } from '../types';
import { bi, useHospitalLanguage } from '../i18n';

export default function HospitalDoctorCard({doctor}:{doctor:HospitalDoctor;hospital:ProviderDirectoryRow}){
  const { text } = useHospitalLanguage();
  const photo=getImageUrl(doctor.photo_path,'public-images','thumbnail');
  return <Link className="hospital-public-doctor-card" to={`/hospital-doctors/${doctor.id}`} aria-label={`${doctor.doctor_name} profile`}>
      {photo?<img className="hospital-public-doctor-photo" src={photo} alt={doctor.doctor_name} loading="lazy"/>:<span className="hospital-doctor-photo-fallback hospital-public-doctor-photo"><Stethoscope/></span>}
      <span className="hospital-public-doctor-copy"><h3>{doctor.doctor_name}</h3>{doctor.degree&&<strong>{doctor.degree}</strong>}{doctor.specialty&&<p><BriefcaseMedical size={15}/> {doctor.specialty}</p>}{doctor.experience_years!=null&&<p><BriefcaseMedical size={14}/> {doctor.experience_years} {text(bi('বছরের অভিজ্ঞতা','years experience'))}</p>}{doctor.room_information&&<p><DoorOpen size={14}/> {doctor.room_information}</p>}<small><Clock3 size={14}/> {doctor.visiting_schedule||text(bi('ভিজিটিং সময়ের জন্য রিসেপশনে যোগাযোগ করুন','Contact reception for visiting time'))}</small></span>
    </Link>;
}
