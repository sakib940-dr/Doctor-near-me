import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowLeft, BriefcaseMedical, CalendarDays, CheckCircle2, Clock3, DoorOpen, ExternalLink, GraduationCap, LoaderCircle, MapPin, MessageCircle, Phone, ShieldCheck, Stethoscope, type LucideIcon } from 'lucide-react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import ProfileReportButton from '../../../components/ProfileReportButton';
import PublicHeader from '../../../components/PublicHeader';
import StructuredReviewSection from '../../../components/StructuredReviewSection';
import VisitorBottomNav from '../../../components/VisitorBottomNav';
import { useAuth } from '../../../contexts/AuthContext';
import { useVisitorLanguage } from '../../../contexts/VisitorLanguageContext';
import { makePageTitle } from '../../../lib/brand';
import { getImageUrl } from '../../../lib/storage';
import { isSupabaseConfigured } from '../../../lib/supabase';
import { buildWhatsAppAppointmentUrl } from '../../../lib/whatsapp';
import { recordProviderInteraction } from '../../../services/engagement';
import { createProviderReceptionAppointment } from '../../../services/providerReception';
import { getPublicHospitalDoctorProfile } from '../services/hospitalDoctors';
import type { PublicHospitalDoctorProfile } from '../types';

const cleanPhone=(value:string)=>value.replace(/[^0-9+]/g,'');
const localDate=(days=0)=>{const date=new Date();date.setDate(date.getDate()+days);return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,10)};

export default function HospitalDoctorPublicPage(){
  const {cardId=''}=useParams();
  const {language}=useVisitorLanguage();
  const tr=(bn:string,en:string)=>language==='bn'?bn:en;
  const {user,account}=useAuth();
  const navigate=useNavigate();
  const location=useLocation();
  const [profile,setProfile]=useState<PublicHospitalDoctorProfile|null>(null);
  const [loading,setLoading]=useState(isSupabaseConfigured),[error,setError]=useState<string|null>(null);
  const [booking,setBooking]=useState(false),[date,setDate]=useState(''),[time,setTime]=useState(''),[note,setNote]=useState(''),[busy,setBusy]=useState(false),[success,setSuccess]=useState(false),[bookingError,setBookingError]=useState<string|null>(null);

  useEffect(()=>{if(!cardId||!isSupabaseConfigured)return;let active=true;setLoading(true);getPublicHospitalDoctorProfile(cardId).then(value=>{if(!active)return;setProfile(value);document.title=makePageTitle(value?.doctor.doctor_name||tr('ডাক্তার পাওয়া যায়নি','Doctor not found'))}).catch(reason=>active&&setError(reason instanceof Error?reason.message:tr('প্রোফাইল লোড করা যায়নি।','Could not load profile.'))).finally(()=>active&&setLoading(false));return()=>{active=false}},[cardId]);
  useEffect(()=>{if(!profile)return;void recordProviderInteraction(profile.hospital.id,'profile_view','hospital_doctor_profile').catch(()=>undefined)},[profile?.doctor.id]);

  const doctor=profile?.doctor,hospital=profile?.hospital;
  const photo=getImageUrl(doctor?.photo_path,'public-images');
  const individual=doctor?.contact_mode==='individual';
  const phone=cleanPhone((individual&&doctor?.individual_phone)||hospital?.phone||'');
  const whatsapp=(individual&&doctor?.individual_whatsapp)||hospital?.whatsapp||hospital?.phone||'';
  const whatsappUrl=whatsapp&&doctor&&hospital?buildWhatsAppAppointmentUrl(whatsapp,`${doctor.doctor_name}, ${hospital.name_bn}`):null;
  const mapQuery=hospital?.latitude!=null&&hospital.longitude!=null?`${hospital.latitude},${hospital.longitude}`:hospital?.address||'';
  const mapHref=hospital?.map_url||(mapQuery?`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`:'');
  const details=useMemo<Array<[LucideIcon,string,string|number]>>(()=>{
    if(!doctor)return [];
    const rows:Array<[LucideIcon,string,string|number|null|undefined]>=[
      [GraduationCap,tr('ডিগ্রি','Degree'),doctor.degree],[Stethoscope,tr('বিশেষজ্ঞ','Specialty'),doctor.specialty],
      [BriefcaseMedical,tr('পদবি','Designation'),doctor.designation],[ShieldCheck,tr('বিএমডিসি','BMDC'),doctor.bmdc_registration_no],
      [Clock3,tr('ভিজিটিং সময়','Visiting time'),doctor.visiting_schedule],[DoorOpen,tr('চেম্বার / রুম','Chamber / Room'),doctor.room_information],
      [MapPin,tr('হাসপাতাল','Hospital'),hospital?.name_bn]
    ];
    return rows.filter((row):row is [LucideIcon,string,string|number]=>row[2]!==null&&row[2]!==undefined&&row[2]!=='');
  },[doctor,hospital?.name_bn,language]);
  const track=(event:'call_click'|'whatsapp_click'|'appointment_click'|'map_click')=>hospital&&void recordProviderInteraction(hospital.id,event,'hospital_doctor_profile').catch(()=>undefined);
  function beginBooking(){track('appointment_click');if(!user){navigate('/auth',{state:{from:`${location.pathname}${location.search}`}});return}setBooking(true);setBookingError(account?.role==='patient'?null:tr('শুধু Patient account থেকে appointment request করা যায়।','Only Patient accounts can request appointments.'))}
  async function submit(event:FormEvent){event.preventDefault();if(!doctor)return;setBusy(true);setBookingError(null);try{await createProviderReceptionAppointment({doctorCardId:doctor.id,appointmentDate:date,preferredTime:time||null,patientNote:note||null});setSuccess(true)}catch(reason){const value=reason instanceof Error?reason.message:'';setBookingError(value.includes('DUPLICATE')?tr('এই তারিখে একটি active request আগে থেকেই আছে।','An active request already exists for this date.'):value.includes('COMPLETE_PATIENT_PROFILE')?tr('আগে Patient profile সম্পূর্ণ করুন।','Complete the Patient profile first.'):tr('অনুরোধ পাঠানো যায়নি। আবার চেষ্টা করুন।','Could not send the request. Please try again.'))}finally{setBusy(false)}}

  return <div className="app-shell hospital-doctor-public-page"><PublicHeader mobileBottomNav/><main className="container hospital-doctor-public">
    <Link className="doctor-public-back" to={hospital?`/hospital/${hospital.slug||hospital.id}`:'/doctors'}><ArrowLeft/> {tr('ফিরে যান','Go back')}</Link>
    {loading&&<div className="loading-box"><LoaderCircle className="spin"/> {tr('প্রোফাইল লোড হচ্ছে…','Loading profile…')}</div>}
    {error&&<div className="error-box">{error}</div>}
    {!loading&&!error&&!profile&&<div className="empty-state"><Stethoscope/><h3>{tr('ডাক্তার পাওয়া যায়নি','Doctor not found')}</h3></div>}
    {doctor&&hospital&&<>
      <section className="hospital-doctor-hero">{photo?<img src={photo} alt={doctor.doctor_name}/>:<div><Stethoscope/></div>}</section>
      <section className="hospital-doctor-info-card">
        <header><div><small>{tr('হাসপাতাল পরিচালিত প্রোফাইল','Hospital managed profile')}</small><h1>{doctor.doctor_name}</h1><p>{doctor.degree||doctor.specialty}</p></div>{photo&&<img src={photo} alt=""/>}</header>
        <div className="hospital-doctor-detail-list">{details.map(([Icon,label,value])=><div key={String(label)}><span><Icon size={19}/>{label}</span><strong>{String(value)}</strong></div>)}</div>
        <footer>{doctor.experience_years!=null&&<span><Clock3/> {doctor.experience_years} {tr('বছর অভিজ্ঞতা','years experience')}</span>}{doctor.consultation_fee!=null&&<span>৳{doctor.consultation_fee} {tr('ভিজিট ফি','visit fee')}</span>}</footer>
      </section>
      <section className="hospital-doctor-action-grid">
        {phone?<a href={`tel:${phone}`} onClick={()=>track('call_click')}><Phone/><b>{tr('কল করুন','Call')}</b></a>:<span className="disabled"><Phone/><b>{tr('কল নেই','No call')}</b></span>}
        {whatsappUrl?<a href={whatsappUrl} target="_blank" rel="noreferrer" onClick={()=>track('whatsapp_click')}><MessageCircle/><b>WhatsApp</b></a>:<span className="disabled"><MessageCircle/><b>WhatsApp</b></span>}
        <button type="button" onClick={beginBooking}><CalendarDays/><b>{tr('অ্যাপয়েন্টমেন্ট','Appointment')}</b></button>
        <div className="hospital-doctor-report"><ProfileReportButton targetType="provider" targetId={hospital.id} entityLabel={tr('হাসপাতালের ডাক্তার তালিকা','Hospital Doctor listing')}/></div>
      </section>
      {booking&&<section className="hospital-doctor-booking">{success?<div className="hospital-notice"><CheckCircle2/>{tr('অনুরোধ Hospital reception-এ পাঠানো হয়েছে।','Request sent to Hospital reception.')}</div>:<form onSubmit={submit}><h2>{tr('অ্যাপয়েন্টমেন্ট অনুরোধ','Appointment request')}</h2>{bookingError&&<div className="hospital-error">{bookingError}</div>}{account?.role==='patient'&&<><label>{tr('তারিখ','Date')}<input required type="date" min={localDate()} max={localDate(180)} value={date} onChange={e=>setDate(e.target.value)}/></label><label>{tr('পছন্দের সময় (ঐচ্ছিক)','Preferred time (optional)')}<input type="time" value={time} onChange={e=>setTime(e.target.value)}/></label><label>{tr('নোট (ঐচ্ছিক)','Note (optional)')}<textarea maxLength={500} rows={3} value={note} onChange={e=>setNote(e.target.value)}/></label><button disabled={busy||!date}>{busy?<LoaderCircle className="spin"/>:<CalendarDays/>}{tr('অনুরোধ পাঠান','Send request')}</button></>}</form>}</section>}
      <section className="doctor-contact-map-v2"><div className="doctor-section-title"><span><MapPin/></span><div><small>{tr('Hospital location','Hospital location')}</small><h2>{tr('যোগাযোগ ও ম্যাপ','Contact & map')}</h2></div></div>{mapQuery?<div className="doctor-public-map-block"><div className="doctor-map-frame"><iframe title={tr('হাসপাতালের ম্যাপ','Hospital map')} loading="lazy" referrerPolicy="no-referrer-when-downgrade" src={`https://www.google.com/maps?q=${encodeURIComponent(mapQuery)}&z=15&output=embed`}/></div>{mapHref&&<a className="doctor-open-google-map" href={mapHref} target="_blank" rel="noreferrer" onClick={()=>track('map_click')}><ExternalLink/>{tr('Google Maps-এ খুলুন','Open in Google Maps')}</a>}</div>:<div className="doctor-map-unavailable"><MapPin/><p>{tr('Hospital location এখনো যোগ করা হয়নি।','Hospital location has not been added yet.')}</p></div>}<article className="hospital-doctor-location-card"><h3>{hospital.name_bn}</h3><p><MapPin/>{hospital.address||tr('ঠিকানা পাওয়া যায়নি','Address unavailable')}</p></article></section>
      <StructuredReviewSection targetType="provider" targetId={hospital.id} entityLabel={tr('হাসপাতাল','Hospital')} language={language}/>
    </>}
  </main><VisitorBottomNav/></div>;
}
