import { useEffect, useState } from 'react';
import { ArrowLeft, Building2, Clock3, LoaderCircle, MessageCircle, Phone } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import DoctorResultCard from '../components/DoctorResultCard';
import PublicHeader from '../components/PublicHeader';
import VisitorBottomNav from '../components/VisitorBottomNav';
import { providerPublicPath } from '../lib/publicRoutes';
import { buildWhatsAppAppointmentUrl } from '../lib/whatsapp';
import { getDoctorsForProvider, getPublicProvider } from '../services/discovery';
import { getPublicProfileStatsBatch, recordProviderInteraction } from '../services/engagement';
import type { DoctorSearchRow, ProviderDirectoryRow, PublicProfileStats } from '../types';

const PAGE_SIZE = 20;
const cleanPhone=(value:string)=>value.replace(/[^0-9+]/g,'');
const todaySchedule=(doctor:DoctorSearchRow)=>{const rows=(doctor.provider_schedules||[]).filter(x=>x.day_of_week===new Date().getDay());return rows.length?`আজ ${rows.map(x=>`${x.start_time.slice(0,5)}–${x.end_time.slice(0,5)}`).join(', ')}`:'';};

function toStatsMap(items: Awaited<ReturnType<typeof getPublicProfileStatsBatch>>) {
  const next:Record<string,PublicProfileStats>={};
  for(const item of items) if(item.target_type==='doctor') next[item.target_id]={
    follower_count:Number(item.follower_count||0),review_count:Number(item.review_count||0),average_rating:item.average_rating==null?null:Number(item.average_rating),is_following:Boolean(item.is_following),ranking_tier:item.ranking_tier,is_premium:Boolean(item.is_premium)
  };
  return next;
}

export default function ProviderDoctorsPublicPage(){
  const {providerId=''}=useParams();
  const [provider,setProvider]=useState<ProviderDirectoryRow|null>(null);
  const [doctors,setDoctors]=useState<DoctorSearchRow[]>([]);
  const [stats,setStats]=useState<Record<string,PublicProfileStats>>({});
  const [loading,setLoading]=useState(true);
  const [loadingMore,setLoadingMore]=useState(false);
  const [hasMore,setHasMore]=useState(false);
  const [error,setError]=useState<string|null>(null);

  useEffect(()=>{
    let alive=true;
    setLoading(true);setError(null);setDoctors([]);setStats({});
    Promise.all([getPublicProvider(providerId),getDoctorsForProvider(providerId,PAGE_SIZE,0)]).then(async([p,d])=>{
      if(!alive)return;
      setProvider(p);setDoctors(d);
      const items=d.length?await getPublicProfileStatsBatch({doctorIds:d.map(x=>x.doctor_id)}):[];
      if(!alive)return;
      setStats(toStatsMap(items));
      const total=Number(d[0]?.total_count??d.length);
      setHasMore(d.length===PAGE_SIZE&&d.length<total);
    }).catch(e=>alive&&setError(e instanceof Error?e.message:'Doctor list লোড করা যায়নি।')).finally(()=>alive&&setLoading(false));
    return()=>{alive=false};
  },[providerId]);

  async function loadMore(){
    if(loadingMore||!hasMore)return;
    setLoadingMore(true);setError(null);
    try{
      const page=await getDoctorsForProvider(providerId,PAGE_SIZE,doctors.length);
      const items=page.length?await getPublicProfileStatsBatch({doctorIds:page.map(x=>x.doctor_id)}):[];
      const total=Number(page[0]?.total_count??(doctors.length+page.length));
      setDoctors(current=>[...current,...page.filter(item=>!current.some(existing=>existing.doctor_id===item.doctor_id))]);
      setStats(current=>({...current,...toStatsMap(items)}));
      setHasMore(page.length===PAGE_SIZE&&doctors.length+page.length<total);
    }catch(e){setError(e instanceof Error?e.message:'আরও Doctor লোড করা যায়নি।')}finally{setLoadingMore(false)}
  }

  const phone=provider?.phone?cleanPhone(provider.phone):null,whatsappSource=provider?.whatsapp||provider?.phone||null,whatsappUrl=whatsappSource?buildWhatsAppAppointmentUrl(whatsappSource,provider?.name_bn):null;
  function track(type:'call_click'|'whatsapp_click'){if(provider?.id)void recordProviderInteraction(provider.id,type,'provider_doctors_all').catch(()=>undefined)}
  return <div className="app-shell provider-doctors-public-page"><PublicHeader mobileBottomNav/><main className="container provider-doctors-public-main"><Link className="back-link" to={provider ? providerPublicPath(provider.provider_type, provider.slug, provider.id) : `/providers/${providerId}`}><ArrowLeft/> Hospital profile</Link>{loading?<div className="loading-box"><LoaderCircle className="spin"/> Doctor list লোড হচ্ছে…</div>:error&&!provider?<div className="error-box">{error}</div>:!provider?<div className="visitor-empty">Hospital পাওয়া যায়নি।</div>:<><div className="provider-doctors-public-heading"><Building2/><div><small>{provider.provider_type==='hospital'?'Hospital':'Chamber'}</small><h1>{provider.name_bn}</h1><p>এই প্রতিষ্ঠানের linked public Doctors</p></div></div>{error&&<div className="error-box">{error}</div>}<div className="provider-doctors-all-grid">{doctors.map(doctor=><article className="provider-doctor-card-shell-v2" key={doctor.doctor_id}><DoctorResultCard doctor={doctor} stats={stats[doctor.doctor_id]} onStatsChange={(id,next)=>setStats(current=>({...current,[id]:next}))}/>{todaySchedule(doctor)&&<div className="provider-doctor-schedule-v2"><Clock3/>{todaySchedule(doctor)}</div>}<div className="provider-doctor-common-contact-v2">{phone&&<a href={`tel:${phone}`} onClick={()=>track('call_click')}><Phone/>কল করুন</a>}{whatsappUrl&&<a href={whatsappUrl} target="_blank" rel="noreferrer" onClick={()=>track('whatsapp_click')}><MessageCircle/>WhatsApp</a>}</div></article>)}</div>{!doctors.length&&<div className="visitor-empty">কোনো linked Doctor নেই।</div>}{hasMore&&<div className="public-load-more-wrap"><button className="public-load-more-button" type="button" disabled={loadingMore} onClick={()=>void loadMore()}>{loadingMore?<><LoaderCircle className="spin"/> লোড হচ্ছে…</>:'আরও দেখুন'}</button></div>}</>}</main><VisitorBottomNav/></div>;
}
