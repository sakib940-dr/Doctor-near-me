import { useEffect, useRef, useState, type FormEvent } from 'react';
import { BriefcaseMedical, CalendarDays, CheckCircle2, Clock3, DoorOpen, LoaderCircle, MessageCircle, Phone, Stethoscope, X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { getImageUrl } from '../../../lib/storage';
import { buildWhatsAppAppointmentUrl } from '../../../lib/whatsapp';
import { recordProviderInteraction } from '../../../services/engagement';
import { createProviderReceptionAppointment } from '../../../services/providerReception';
import type { ProviderDirectoryRow } from '../../../types';
import type { HospitalDoctorCard as HospitalDoctor } from '../types';
import { bi, useHospitalLanguage } from '../i18n';

const phoneValue = (value: string) => value.replace(/[^0-9+]/g,'');
const localDate = (offsetDays=0) => { const date=new Date();date.setDate(date.getDate()+offsetDays);const offset=date.getTimezoneOffset();return new Date(date.getTime()-offset*60000).toISOString().slice(0,10); };

export default function HospitalDoctorCard({doctor,hospital}:{doctor:HospitalDoctor;hospital:ProviderDirectoryRow}){
  const { text } = useHospitalLanguage();
  const [open,setOpen]=useState(false);
  const photo=getImageUrl(doctor.photo_path,'public-images','thumbnail');
  return <>
    <button className="hospital-public-doctor-card" type="button" onClick={()=>setOpen(true)}>
      {photo?<img src={photo} alt={doctor.doctor_name} loading="lazy"/>:<span className="hospital-doctor-photo-fallback"><Stethoscope/></span>}
      <span><h3>{doctor.doctor_name}</h3>{doctor.degree&&<p>{doctor.degree}</p>}{doctor.specialty&&<p><BriefcaseMedical size={15}/> {doctor.specialty}</p>}{doctor.experience_years!=null&&<p>{doctor.experience_years} {text(bi('বছরের অভিজ্ঞতা','years experience'))}</p>}{doctor.room_information&&<p><DoorOpen size={14}/> {doctor.room_information}</p>}<small><Clock3 size={14}/> {doctor.visiting_schedule||text(bi('ভিজিটিং সময়ের জন্য রিসেপশনে যোগাযোগ করুন','Contact reception for visiting time'))}</small></span>
    </button>
    {open&&<HospitalDoctorProfileModal doctor={doctor} hospital={hospital} onClose={()=>setOpen(false)}/>} 
  </>;
}

function HospitalDoctorProfileModal({doctor,hospital,onClose}:{doctor:HospitalDoctor;hospital:ProviderDirectoryRow;onClose:()=>void}){
  const { text } = useHospitalLanguage();
  const {user,account}=useAuth();
  const navigate=useNavigate();
  const location=useLocation();
  const closeRef=useRef<HTMLButtonElement>(null);
  const [booking,setBooking]=useState(false),[date,setDate]=useState(''),[time,setTime]=useState(''),[note,setNote]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[success,setSuccess]=useState(false);
  const individual=doctor.contact_mode==='individual';
  const phone=phoneValue((individual&&doctor.individual_phone)||hospital.phone||'');
  const whatsapp=(individual&&doctor.individual_whatsapp)||hospital.whatsapp||hospital.phone||'';
  const whatsappUrl=whatsapp?buildWhatsAppAppointmentUrl(whatsapp,`${doctor.doctor_name}, ${hospital.name_bn}`):null;
  const photo=getImageUrl(doctor.photo_path,'public-images');

  useEffect(()=>{const previous=document.body.style.overflow;document.body.style.overflow='hidden';closeRef.current?.focus();const key=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!busy)onClose()};window.addEventListener('keydown',key);return()=>{document.body.style.overflow=previous;window.removeEventListener('keydown',key)}},[busy,onClose]);
  function track(type:'call_click'|'whatsapp_click'|'appointment_click'){void recordProviderInteraction(hospital.id,type,'hospital_doctor_modal').catch(()=>undefined)}
  function begin(){track('appointment_click');if(!user){navigate('/auth',{state:{from:`${location.pathname}${location.search}`}});return}if(account?.role!=='patient'){setError(text(bi('শুধু Patient account থেকে অ্যাপয়েন্টমেন্ট অনুরোধ করা যায়।','Appointment requests are available from Patient accounts only.')));setBooking(true);return}setBooking(true);setError(null)}
  async function submit(event:FormEvent){event.preventDefault();setBusy(true);setError(null);try{await createProviderReceptionAppointment({doctorCardId:doctor.id,appointmentDate:date,preferredTime:time||null,patientNote:note||null});setSuccess(true)}catch(reason){const reasonText=reason instanceof Error?reason.message:'';setError(reasonText.includes('DUPLICATE')?text(bi('এই ডাক্তার ও তারিখের জন্য আপনার একটি সক্রিয় অনুরোধ আছে।','You already have an active request for this Doctor and date.')):reasonText.includes('COMPLETE_PATIENT_PROFILE')?text(bi('অ্যাপয়েন্টমেন্টের আগে Patient profile সম্পূর্ণ করুন।','Complete your Patient profile before requesting an appointment.')):text(bi('অনুরোধ পাঠানো যায়নি। আবার চেষ্টা করুন।','Appointment request could not be sent. Please try again.')))}finally{setBusy(false)}}
  return <div className="hospital-doctor-modal-backdrop" role="presentation" onMouseDown={(event)=>{if(event.target===event.currentTarget&&!busy)onClose()}}><section className="hospital-doctor-modal" role="dialog" aria-modal="true" aria-labelledby={`hospital-doctor-${doctor.id}`}>
    <header><button ref={closeRef} type="button" onClick={onClose} aria-label={text(bi('ডাক্তার প্রোফাইল বন্ধ করুন','Close Doctor profile'))}><X/></button><div className="hospital-doctor-modal-profile">{photo?<img src={photo} alt={doctor.doctor_name}/>:<span className="hospital-doctor-photo-fallback"><Stethoscope/></span>}<div><small>{hospital.name_bn}</small><h2 id={`hospital-doctor-${doctor.id}`}>{doctor.doctor_name}</h2>{doctor.degree&&<p>{doctor.degree}</p>}{doctor.specialty&&<p><BriefcaseMedical size={16}/> {doctor.specialty}</p>}{doctor.experience_years!=null&&<p>{doctor.experience_years} {text(bi('বছরের অভিজ্ঞতা','years experience'))}</p>}</div></div></header>
    <div className="hospital-doctor-modal-body">
      {doctor.visiting_schedule&&<p><Clock3/> <strong>{text(bi('ভিজিটিং:','Visiting:'))}</strong> {doctor.visiting_schedule}</p>}
      {doctor.room_information&&<p><DoorOpen/> <strong>{text(bi('রুম:','Room:'))}</strong> {doctor.room_information}</p>}
      {doctor.appointment_note&&<p>{doctor.appointment_note}</p>}
      <small>{text(bi('যোগাযোগ:','Contact:'))} {individual&&(doctor.individual_phone||doctor.individual_whatsapp)?text(bi('ডাক্তারের ব্যক্তিগত যোগাযোগ','Individual Doctor contact')):text(bi('হাসপাতাল রিসেপশন','Hospital reception'))}</small>
      <div className="hospital-doctor-modal-actions">{phone?<a href={`tel:${phone}`} onClick={()=>track('call_click')}><Phone/> {text(bi('কল করুন','Call'))}</a>:<span/>}<button type="button" onClick={begin}><CalendarDays/> {text(bi('অ্যাপয়েন্টমেন্ট নিন','Appointment'))}</button>{whatsappUrl&&<a href={whatsappUrl} target="_blank" rel="noreferrer" onClick={()=>track('whatsapp_click')}><MessageCircle/> WhatsApp</a>}</div>
      {booking&&<>{success?<div className="hospital-notice"><CheckCircle2/> {text(bi('অ্যাপয়েন্টমেন্ট অনুরোধ হাসপাতাল রিসেপশনে পাঠানো হয়েছে।','Appointment request sent to Hospital reception.'))}</div>:<form className="hospital-appointment-form" onSubmit={submit}>{error&&<div className="hospital-error">{error}</div>}{account?.role==='patient'&&<><label>{text(bi('অ্যাপয়েন্টমেন্টের তারিখ','Appointment date'))}<input required type="date" min={localDate()} max={localDate(180)} value={date} onChange={event=>setDate(event.target.value)}/></label><label>{text(bi('পছন্দের সময়','Preferred time'))} <small>{text(bi('ঐচ্ছিক','Optional'))}</small><input type="time" value={time} onChange={event=>setTime(event.target.value)}/></label><label>{text(bi('রোগীর নোট','Patient note'))} <small>{text(bi('ঐচ্ছিক','Optional'))}</small><textarea rows={3} maxLength={500} value={note} onChange={event=>setNote(event.target.value)}/></label><button className="hospital-primary-button" disabled={busy||!date}>{busy?<LoaderCircle className="spin"/>:<CalendarDays/>} {text(bi('অনুরোধ পাঠান','Send request'))}</button></>}</form>}</>}
    </div>
  </section></div>;
}
