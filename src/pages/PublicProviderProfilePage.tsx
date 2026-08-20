import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  BadgeCheck,
  Building2,
  CalendarDays,
  ChevronDown,
  Clock3,
  ExternalLink,
  LoaderCircle,
  MapPin,
  MessageCircle,
  Navigation,
  Phone,
  Star,
  Stethoscope,
  X,
} from 'lucide-react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useVisitorLanguage, type VisitorLanguage } from '../contexts/VisitorLanguageContext';
import DoctorResultCard from '../components/DoctorResultCard';
import ProfileShareButton from '../components/ProfileShareButton';
import FollowSaveButton from '../components/FollowSaveButton';
import PublicHeader from '../components/PublicHeader';
import StructuredReviewSection from '../components/StructuredReviewSection';
import VisitorBottomNav from '../components/VisitorBottomNav';
import { makePageTitle } from '../lib/brand';
import { providerPublicPath } from '../lib/publicRoutes';
import { captureCurrentCoordinates } from '../lib/geolocation';
import { getImageUrl } from '../lib/storage';
import { isSupabaseConfigured } from '../lib/supabase';
import { buildWhatsAppAppointmentUrl } from '../lib/whatsapp';
import { getDoctorsForProvider, getPublicProvider, resolvePublicProviderRoute } from '../services/discovery';
import { getProviderPublicStats, getPublicProfileStatsBatch, recordProviderInteraction } from '../services/engagement';
import { getProviderDistance, getProviderPublicPageContent, type ProviderOpeningHour, type ProviderPublicPageContent } from '../services/providerPublicContent';
import type { DoctorSearchRow, ProviderDirectoryRow, PublicProfileStats, PublicRankingTier } from '../types';

const daysBn = ['রবিবার','সোমবার','মঙ্গলবার','বুধবার','বৃহস্পতিবার','শুক্রবার','শনিবার'];
const daysEn = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const cleanTime = (value: string | null | undefined) => value ? value.slice(0,5) : '';
const cleanPhone = (value: string) => value.replace(/[^0-9+]/g,'');
const localText=(value:{bn?:string|null;en?:string|null}|null|undefined,language:VisitorLanguage)=>(language==='bn'?(value?.bn||value?.en):(value?.en||value?.bn))||'';
const numberText=(value:number,language:VisitorLanguage,digits=0)=>value.toLocaleString(language==='bn'?'bn-BD':'en-US',{minimumFractionDigits:digits,maximumFractionDigits:digits});

const copy={
  bn:{back:'হাসপাতাল/চেম্বার তালিকায় ফিরুন',hospital:'হাসপাতাল',chamber:'চেম্বার',call:'কল করুন',whatsapp:'WhatsApp',contact:'অ্যাপয়েন্টমেন্ট/যোগাযোগ',save:'সংরক্ষণ',direction:'দিকনির্দেশনা',followers:'মোট অনুসারী',reviews:'রিভিউ',rating:'গড় রেটিং',about:'হাসপাতাল সম্পর্কে',hours:'খোলার সময়',services:'সেবাসমূহ',treatment:'চিকিৎসা/সেবা খরচ',investigation:'পরীক্ষা/ইনভেস্টিগেশন খরচ',doctors:'এই হাসপাতালের ডাক্তারগণ',allDoctors:'সব দেখুন',map:'যোগাযোগ, ম্যাপ ও দূরত্ব',distance:'আপনার অবস্থান থেকে',showDistance:'আমার দূরত্ব দেখুন',locating:'Location নেওয়া হচ্ছে…',open:'এখন খোলা',closed:'এখন বন্ধ',hours24:'২৪ ঘণ্টা খোলা',noInfo:'তথ্য এখনো যোগ করা হয়নি।',noDoctors:'কোনো linked Doctor এখনো public নেই।',costDisclaimer:'খরচ সেবা, প্যাকেজ ও রোগীর প্রয়োজন অনুযায়ী পরিবর্তিত হতে পারে।',premium:'Premium',verified:'Verified',new:'নতুন',unverified:'যাচাই হয়নি',commonContact:'Hospital appointment contact'},
  en:{back:'Back to hospitals',hospital:'Hospital',chamber:'Chamber',call:'Call Now',whatsapp:'WhatsApp',contact:'Appointment / Contact',save:'Save',direction:'Directions',followers:'Followers',reviews:'Reviews',rating:'Average rating',about:'About Hospital',hours:'Opening Hours',services:'Services',treatment:'Treatment / Service Costs',investigation:'Investigation Costs',doctors:'Doctors at this hospital',allDoctors:'View all',map:'Contact, Map & Distance',distance:'From your location',showDistance:'Show my distance',locating:'Getting location…',open:'Open now',closed:'Closed now',hours24:'Open 24 hours',noInfo:'Information has not been added yet.',noDoctors:'No linked public Doctor is available yet.',costDisclaimer:'Costs may vary by service, package and patient requirements.',premium:'Premium',verified:'Verified',new:'New',unverified:'Unverified',commonContact:'Hospital appointment contact'},
} as const;

function rankLabel(tier:PublicRankingTier|undefined,language:VisitorLanguage,verified:boolean){const t=copy[language];if(tier==='premium')return t.premium;if(tier==='verified'||verified)return t.verified;if(tier==='new')return t.new;return t.unverified;}

function openingStatus(hours:ProviderOpeningHour[],language:VisitorLanguage,fallback:string|null|undefined){
  const t=copy[language],now=new Date(),today=hours.find(x=>x.day_of_week===now.getDay());
  if(!hours.length)return{open:null as boolean|null,label:fallback||t.noInfo};
  if(!today)return{open:null as boolean|null,label:fallback||t.noInfo}; if(today.is_closed)return{open:false,label:t.closed}; if(today.is_24_hours)return{open:true,label:t.hours24};
  if(!today.open_time||!today.close_time)return{open:false,label:t.closed};
  const [sh,sm]=cleanTime(today.open_time).split(':').map(Number),[eh,em]=cleanTime(today.close_time).split(':').map(Number),minutes=now.getHours()*60+now.getMinutes(),start=sh*60+sm,end=eh*60+em;
  const open=end>start?(minutes>=start&&minutes<=end):(minutes>=start||minutes<=end);
  return{open,label:`${open?t.open:t.closed} • ${cleanTime(today.open_time)}–${cleanTime(today.close_time)}`};
}

function todayDoctorSchedule(doctor:DoctorSearchRow,language:VisitorLanguage){
  const rows=(doctor.provider_schedules||[]).filter(x=>x.day_of_week===new Date().getDay());
  if(!rows.length)return''; return `${language==='bn'?'আজ':'Today'} ${rows.map(x=>`${cleanTime(x.start_time)}–${cleanTime(x.end_time)}`).join(', ')}`;
}

export default function PublicProviderProfilePage(){
  const {providerId=''}=useParams();
  const navigate=useNavigate(),location=useLocation();
  const [provider,setProvider]=useState<ProviderDirectoryRow|null>(null),[publicSlug,setPublicSlug]=useState(''),[content,setContent]=useState<ProviderPublicPageContent|null>(null),[doctors,setDoctors]=useState<DoctorSearchRow[]>([]),[doctorStats,setDoctorStats]=useState<Record<string,PublicProfileStats>>({}),[providerStats,setProviderStats]=useState<PublicProfileStats|null>(null);
  const {language}=useVisitorLanguage();
  const [loading,setLoading]=useState(isSupabaseConfigured),[error,setError]=useState<string|null>(null),[activeSlide,setActiveSlide]=useState(0),[contactOpen,setContactOpen]=useState(false),[distance,setDistance]=useState<number|null>(null),[distanceBusy,setDistanceBusy]=useState(false),[distanceError,setDistanceError]=useState<string|null>(null);
  const sliderRef=useRef<HTMLDivElement>(null),trackedView=useRef<string|null>(null);

  useEffect(()=>{if(!isSupabaseConfigured||!providerId)return;let alive=true;setLoading(true);setError(null);setProvider(null);setContent(null);setDoctors([]);setProviderStats(null);setPublicSlug('');
    resolvePublicProviderRoute(providerId).then(async route=>{
      if(!route)return [null,null,[],null,null] as const;
      const p=await getPublicProvider(route.id);
      if(!p)return [null,null,[],null,null] as const;
      const canonicalPath=providerPublicPath(p.provider_type,route.slug,route.id);
      if(location.pathname!==canonicalPath)navigate(canonicalPath,{replace:true});
      const [c,d,s]=await Promise.all([getProviderPublicPageContent(route.id),getDoctorsForProvider(route.id),getProviderPublicStats(route.id)]);
      return [p,c,d,s,route.slug] as const;
    })
    .then(([p,c,d,s,slug])=>{if(!alive)return;setProvider(p);setContent(c);setDoctors([...d]);setProviderStats(s);setPublicSlug(slug||'');document.title=makePageTitle(p?.name_bn||'Hospital');})
    .catch((e:unknown)=>alive&&setError(e instanceof Error?e.message:'প্রতিষ্ঠানের তথ্য লোড করা যায়নি।')).finally(()=>alive&&setLoading(false));return()=>{alive=false}},[providerId,location.pathname,navigate]);

  useEffect(()=>{if(!provider?.id||trackedView.current===provider.id)return;trackedView.current=provider.id;void recordProviderInteraction(provider.id,'profile_view','provider_profile_v2').catch(()=>undefined)},[provider?.id]);
  useEffect(()=>{if(!doctors.length){setDoctorStats({});return;}let alive=true;void getPublicProfileStatsBatch({doctorIds:doctors.map(x=>x.doctor_id)}).then(items=>{if(!alive)return;const next:Record<string,PublicProfileStats>={};for(const item of items)if(item.target_type==='doctor')next[item.target_id]={follower_count:Number(item.follower_count||0),review_count:Number(item.review_count||0),average_rating:item.average_rating==null?null:Number(item.average_rating),is_following:Boolean(item.is_following),ranking_tier:item.ranking_tier,is_premium:Boolean(item.is_premium)};setDoctorStats(next)}).catch(()=>undefined);return()=>{alive=false}},[doctors]);
  useEffect(()=>{if(!provider?.id)return;try{const raw=localStorage.getItem('docbd-current-location');if(!raw)return;const saved=JSON.parse(raw) as {latitude?:number;longitude?:number;capturedAt?:number};if(typeof saved.latitude!=='number'||typeof saved.longitude!=='number')return;if(saved.capturedAt&&Date.now()-saved.capturedAt>30*60*1000)return;void getProviderDistance(provider.id,saved.latitude,saved.longitude).then(setDistance).catch(()=>undefined)}catch{/* optional */}},[provider?.id]);

  const t=copy[language],typeLabel=provider?.provider_type==='hospital'?t.hospital:t.chamber,phone=provider?.phone?cleanPhone(provider.phone):null,whatsappSource=provider?.whatsapp||provider?.phone||null,whatsappUrl=whatsappSource?buildWhatsAppAppointmentUrl(whatsappSource,language==='bn'?provider?.name_bn:(provider?.name_en||provider?.name_bn)):null,status=openingStatus(content?.opening_hours||[],language,provider?.opening_note);
  const directionUrl=useMemo(()=>{if(!provider)return'';if(provider.map_url)return provider.map_url;if(provider.latitude!=null&&provider.longitude!=null)return`https://www.google.com/maps/dir/?api=1&destination=${provider.latitude},${provider.longitude}`;if(provider.address)return`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(provider.address)}`;return''},[provider]);
  const sliderImages=useMemo(()=>{const rows=(content?.slider_images||[]).map(x=>({id:`s-${x.id}`,src:getImageUrl(x.image,'public-images')||x.image||'',caption:localText(x.caption,language)})).filter(x=>x.src);if(rows.length)return rows.slice(0,4);const banner=getImageUrl(provider?.banner_url,'public-images')||provider?.banner_url||'';return banner?[{id:'banner',src:banner,caption:''}]:[]},[content?.slider_images,language,provider?.banner_url]);
  const rank=rankLabel(providerStats?.ranking_tier,language,Boolean(provider?.verified)),about=language==='bn'?(content?.about_bn||provider?.about_bn||provider?.short_description||content?.about_en):(content?.about_en||provider?.about_en||content?.about_bn||provider?.short_description);

  function track(type:'call_click'|'whatsapp_click'|'appointment_click'|'map_click',source='provider_profile_v2'){if(provider?.id)void recordProviderInteraction(provider.id,type,source).catch(()=>undefined)}
  async function captureDistance(){if(!provider?.id)return;setDistanceBusy(true);setDistanceError(null);try{const c=await captureCurrentCoordinates();const d=await getProviderDistance(provider.id,c.latitude,c.longitude);setDistance(d);try{localStorage.setItem('docbd-current-location',JSON.stringify({latitude:c.latitude,longitude:c.longitude,capturedAt:Date.now()}))}catch{/* optional */}}catch(e){setDistanceError(e instanceof Error?e.message:'Distance পাওয়া যায়নি।')}finally{setDistanceBusy(false)}}
  function scrollSlide(index:number){const el=sliderRef.current;if(!el)return;const child=el.children[index] as HTMLElement|undefined;child?.scrollIntoView({behavior:'smooth',block:'nearest',inline:'start'})}

  if(loading)return <div className="app-shell provider-public-v2"><PublicHeader mobileBottomNav/><main className="container public-provider-v2-main"><div className="loading-box"><LoaderCircle className="spin"/> তথ্য লোড হচ্ছে…</div></main><VisitorBottomNav/></div>;
  if(error||!provider)return <div className="app-shell provider-public-v2"><PublicHeader mobileBottomNav/><main className="container public-provider-v2-main"><div className="error-box">{error||'প্রতিষ্ঠানটি পাওয়া যায়নি।'}</div></main><VisitorBottomNav/></div>;

  return <div className="app-shell provider-public-v2"><PublicHeader mobileBottomNav/><main className="container public-provider-v2-main">
    <div className="provider-public-v2-topline"><Link className="back-link" to="/providers"><ArrowLeft/>{t.back}</Link></div>

    <section className="provider-slider-v2">
      {sliderImages.length?<><div className="provider-slider-track-v2" ref={sliderRef} onScroll={e=>{const el=e.currentTarget;const width=el.clientWidth||1;setActiveSlide(Math.max(0,Math.min(sliderImages.length-1,Math.round(el.scrollLeft/width))))}}>{sliderImages.map((img,index)=><figure key={img.id}><img src={img.src} alt={img.caption||provider.name_bn} loading={index===0?'eager':'lazy'} decoding="async"/>{img.caption&&<figcaption>{img.caption}</figcaption>}</figure>)}</div>{sliderImages.length>1&&<div className="provider-slider-dots-v2">{sliderImages.map((x,i)=><button type="button" key={x.id} className={i===activeSlide?'active':''} onClick={()=>scrollSlide(i)} aria-label={`Slide ${i+1}`}/>)}</div>}</>:<div className="provider-slider-fallback-v2">{provider.logo_url?<img src={getImageUrl(provider.logo_url,'public-images')||provider.logo_url} alt={provider.name_bn}/>:<Building2/>}</div>}
    </section>

    <section className="provider-summary-card-v2">
      <div className="provider-summary-logo-v2">{provider.logo_url?<img src={getImageUrl(provider.logo_url,'public-images')||provider.logo_url} alt=""/>:<Building2/>}</div>
      <div className="provider-summary-copy-v2"><div className="provider-summary-kicker-v2"><span>{typeLabel}</span><span className={`provider-rank-pill-v2 ${providerStats?.ranking_tier||'verified'}`}>{providerStats?.is_premium?'★ ':''}{rank}</span></div><h1>{language==='bn'?provider.name_bn:(provider.name_en||provider.name_bn)}</h1><p><MapPin/>{provider.address||t.noInfo}</p><span className={`provider-open-state ${status.open===true?'open':status.open===false?'closed':'neutral'}`}><Clock3/>{status.label}</span></div>
    </section>

    <section className="provider-primary-actions-v2">
      {phone?<a href={`tel:${phone}`} onClick={()=>track('call_click')}><Phone/><span>{t.call}</span></a>:<button disabled><Phone/><span>{t.call}</span></button>}
      {whatsappUrl?<a href={whatsappUrl} target="_blank" rel="noreferrer" onClick={()=>track('whatsapp_click')}><MessageCircle/><span>{t.whatsapp}</span></a>:<button disabled><MessageCircle/><span>{t.whatsapp}</span></button>}
      <button type="button" disabled={!phone&&!whatsappUrl} onClick={()=>{track('appointment_click');setContactOpen(true)}}><CalendarDays/><span>{t.contact}</span></button>
      <FollowSaveButton targetType="provider" targetId={provider.id} stats={providerStats} variant="button" entityLabel={typeLabel} onStatsChange={setProviderStats} language={language}/>
      {publicSlug&&<ProfileShareButton targetType="provider" targetId={provider.id} slug={publicSlug} title={language==='bn'?provider.name_bn:(provider.name_en||provider.name_bn)} language={language} providerType={provider.provider_type} className="provider-profile-share-action"/>}
      {directionUrl?<a href={directionUrl} target="_blank" rel="noreferrer" onClick={()=>track('map_click')}><Navigation/><span>{t.direction}</span></a>:<button disabled><Navigation/><span>{t.direction}</span></button>}
    </section>

    <section className="provider-social-summary-v2"><div><strong>{numberText(providerStats?.follower_count||0,language)}</strong><span>{t.followers}</span></div><div><strong>{numberText(providerStats?.review_count||0,language)}</strong><span>{t.reviews}</span></div><div><strong>{providerStats?.average_rating!=null?numberText(providerStats.average_rating,language,1):'—'}</strong><span><Star/>{t.rating}</span></div></section>

    <section className="provider-about-v2"><div className="provider-section-title-v2"><Building2/><div><small>{typeLabel}</small><h2>{t.about}</h2></div></div><p>{about||t.noInfo}</p></section>

    <section className="provider-accordion-stack-v2">
      <details className="provider-profile-accordion-v2"><summary><span><Clock3/>{t.hours}</span><ChevronDown/></summary><div className="provider-accordion-body-v2">{content?.opening_hours.length?<div className="provider-hours-public-v2">{content.opening_hours.map(row=><div key={row.day_of_week}><strong>{(language==='bn'?daysBn:daysEn)[row.day_of_week]}</strong><span>{row.is_closed?t.closed:row.is_24_hours?t.hours24:`${cleanTime(row.open_time)}–${cleanTime(row.close_time)}`}</span>{localText(row.note,language)&&<small>{localText(row.note,language)}</small>}</div>)}</div>:<p>{provider.opening_note||t.noInfo}</p>}</div></details>
      <details className="provider-profile-accordion-v2"><summary><span><Stethoscope/>{t.services}</span><ChevronDown/></summary><div className="provider-accordion-body-v2 provider-service-public-v2">{content?.services.length?content.services.map(s=><article key={s.id}><strong>{localText(s.name,language)}</strong>{localText(s.description,language)&&<p>{localText(s.description,language)}</p>}</article>):<p>{t.noInfo}</p>}</div></details>
      <details className="provider-profile-accordion-v2"><summary><span><BadgeCheck/>{t.treatment}</span><ChevronDown/></summary><div className="provider-accordion-body-v2 provider-cost-public-v2">{content?.treatment_costs.length?content.treatment_costs.map(c=><article key={c.id}><strong>{localText(c.name,language)}</strong><b>{localText(c.cost,language)||'—'}</b></article>):<p>{t.noInfo}</p>}<small className="provider-cost-disclaimer-v2">{t.costDisclaimer}</small></div></details>
      <details className="provider-profile-accordion-v2"><summary><span><BadgeCheck/>{t.investigation}</span><ChevronDown/></summary><div className="provider-accordion-body-v2 provider-cost-public-v2">{content?.investigation_costs.length?content.investigation_costs.map(c=><article key={c.id}><strong>{localText(c.name,language)}</strong><b>{localText(c.cost,language)||'—'}</b></article>):<p>{t.noInfo}</p>}<small className="provider-cost-disclaimer-v2">{t.costDisclaimer}</small></div></details>
    </section>

    <section className="provider-doctors-v2"><div className="visitor-section-head"><div><span>{typeLabel}</span><h2>{t.doctors}</h2></div>{doctors.length>10&&<Link to={`/providers/${provider.id}/doctors`}>{t.allDoctors} →</Link>}</div>{doctors.length?<div className="provider-doctor-rail-v2">{doctors.slice(0,10).map(doctor=><article className="provider-doctor-card-shell-v2" key={doctor.doctor_id}><DoctorResultCard doctor={doctor} stats={doctorStats[doctor.doctor_id]} onStatsChange={(id,next)=>setDoctorStats(current=>({...current,[id]:next}))}/>{todayDoctorSchedule(doctor,language)&&<div className="provider-doctor-schedule-v2"><Clock3/>{todayDoctorSchedule(doctor,language)}</div>}<div className="provider-doctor-common-contact-v2">{phone&&<a href={`tel:${phone}`} onClick={()=>track('call_click','provider_doctor_card')}><Phone/>{t.call}</a>}{whatsappUrl&&<a href={whatsappUrl} target="_blank" rel="noreferrer" onClick={()=>track('whatsapp_click','provider_doctor_card')}><MessageCircle/>{t.whatsapp}</a>}</div></article>)}</div>:<div className="visitor-empty">{t.noDoctors}</div>}</section>

    <section className="provider-contact-map-v2"><div className="provider-section-title-v2"><MapPin/><div><small>{typeLabel}</small><h2>{t.map}</h2></div></div><div className="provider-contact-grid-v2"><div><h3>{language==='bn'?provider.name_bn:(provider.name_en||provider.name_bn)}</h3><p><MapPin/>{provider.address||t.noInfo}</p>{provider.phone&&<a href={`tel:${phone}`} onClick={()=>track('call_click')}><Phone/>{provider.phone}</a>}{whatsappUrl&&<a href={whatsappUrl} target="_blank" rel="noreferrer" onClick={()=>track('whatsapp_click')}><MessageCircle/>WhatsApp</a>}{distance!=null&&<strong><Navigation/>{t.distance} {numberText(distance,language,1)} {language==='bn'?'কিমি':'km'}</strong>}</div><button className="provider-distance-button-v2" type="button" disabled={distanceBusy} onClick={()=>void captureDistance()}>{distanceBusy?<LoaderCircle className="spin"/>:<Navigation/>}{distanceBusy?t.locating:t.showDistance}</button></div>{distanceError&&<p className="provider-distance-error-v2">{distanceError}</p>}{provider.latitude!=null&&provider.longitude!=null&&<div className="provider-map-frame-v2"><iframe title={`${provider.name_bn} map`} loading="lazy" referrerPolicy="no-referrer-when-downgrade" src={`https://www.google.com/maps?q=${encodeURIComponent(`${provider.latitude},${provider.longitude}`)}&z=15&output=embed`}/></div>}{directionUrl&&<a className="provider-map-direction-v2" href={directionUrl} target="_blank" rel="noreferrer" onClick={()=>track('map_click')}><ExternalLink/>{t.direction}</a>}</section>

    <StructuredReviewSection targetType="provider" targetId={provider.id} entityLabel={typeLabel} language={language}/>
  </main><VisitorBottomNav/>
  {contactOpen&&<div className="appointment-sheet-backdrop" role="presentation" onClick={()=>setContactOpen(false)}><section className="appointment-sheet" role="dialog" aria-modal="true" onClick={e=>e.stopPropagation()}><div className="appointment-sheet-handle"/><div className="appointment-sheet-head"><div><small>{typeLabel}</small><h2>{t.commonContact}</h2></div><button type="button" onClick={()=>setContactOpen(false)} aria-label="Close"><X/></button></div><div className="appointment-contact-grid">{phone&&<a href={`tel:${phone}`} onClick={()=>track('call_click')}><span><Phone/></span><strong>{t.call}</strong></a>}{whatsappUrl&&<a href={whatsappUrl} target="_blank" rel="noreferrer" onClick={()=>track('whatsapp_click')}><span><MessageCircle/></span><strong>WhatsApp</strong></a>}</div></section></div>}
  </div>;
}
