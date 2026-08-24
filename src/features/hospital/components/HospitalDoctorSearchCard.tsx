import { BriefcaseMedical, Building2, Clock3, MapPin, Navigation, Stethoscope } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useVisitorLanguage } from '../../../contexts/VisitorLanguageContext';
import { getImageUrl } from '../../../lib/storage';
import type { HospitalDoctorSearchRow } from '../types';

export default function HospitalDoctorSearchCard({doctor}:{doctor:HospitalDoctorSearchRow}){
  const {language}=useVisitorLanguage();
  const tr=(bn:string,en:string)=>language==='bn'?bn:en;
  const photo=getImageUrl(doctor.photo_path,'public-images','thumbnail');
  let distance:number|null=null;
  try{const saved=JSON.parse(localStorage.getItem('docbd-current-location')||'null') as {latitude?:number;longitude?:number;capturedAt?:number}|null;if(saved&&typeof saved.latitude==='number'&&typeof saved.longitude==='number'&&(!saved.capturedAt||Date.now()-saved.capturedAt<30*60*1000)&&doctor.hospital_latitude!=null&&doctor.hospital_longitude!=null){const rad=(n:number)=>n*Math.PI/180,dLat=rad(Number(doctor.hospital_latitude)-saved.latitude),dLon=rad(Number(doctor.hospital_longitude)-saved.longitude),a=Math.sin(dLat/2)**2+Math.cos(rad(saved.latitude))*Math.cos(rad(Number(doctor.hospital_latitude)))*Math.sin(dLon/2)**2;distance=6371*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));}}catch{/* location is optional */}
  return <Link className="hospital-doctor-search-card" to={`/hospital-doctors/${doctor.id}`}>
    <div className="hospital-doctor-search-photo">{photo?<img src={photo} alt={doctor.doctor_name} loading="lazy"/>:<Stethoscope/>}<small>{tr('Hospital profile','Hospital profile')}</small></div>
    <div><h3>{doctor.doctor_name}</h3>{doctor.degree&&<strong>{doctor.degree}</strong>}{doctor.specialty&&<p><BriefcaseMedical/>{doctor.specialty}</p>}<p><Building2/>{doctor.hospital_name}</p>{doctor.hospital_address&&<p><MapPin/>{doctor.hospital_address}</p>}{doctor.visiting_schedule&&<small><Clock3/>{doctor.visiting_schedule}</small>}{distance!=null&&<small className="visitor-card-distance"><Navigation/>{tr(`${distance.toFixed(1)} কিমি দূরে`,`${distance.toFixed(1)} km away`)}</small>}</div>
  </Link>;
}
