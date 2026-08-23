import { FormEvent, useEffect, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Clock3, ImagePlus, LoaderCircle, Pencil, Plus, Trash2 } from 'lucide-react';
import { getImageUrl } from '../lib/storage';
import { deleteProviderSliderImage, getProviderOpeningHours, providerGallery, providerInvestigationCosts, providerReviews, providerServices, providerSlider, providerTreatmentCosts, removeOwnedProviderWebsiteImage, replaceProviderSliderImage, saveProviderOpeningHour, uploadProviderWebsiteImage, type ProviderCost, type ProviderGalleryImage, type ProviderOpeningHour, type ProviderReview, type ProviderService, type ProviderSliderImage } from '../services/providerWebsiteContent';
import { replyToMyProviderReview } from '../services/engagement';

type Tab='services'|'hours'|'slider'|'gallery'|'costs'|'reviews';
export default function ProviderWebsiteContentTabs({providerId}:{providerId:string}){const [tab,setTab]=useState<Tab>('services');const labels:Record<Tab,string>={services:'Services',hours:'Opening Hours',slider:'Public Slider',gallery:'Gallery',costs:'Treatment / Investigation Costs',reviews:'Reviews'};return <div className="provider-web-admin"><nav className="provider-web-tabs">{(['services','hours','slider','costs','gallery','reviews'] as Tab[]).map(t=><button type="button" className={tab===t?'active':''} onClick={()=>setTab(t)} key={t}>{labels[t]}</button>)}</nav>{tab==='services'&&<Services providerId={providerId}/>} {tab==='hours'&&<OpeningHours providerId={providerId}/>} {tab==='slider'&&<Slider providerId={providerId}/>} {tab==='gallery'&&<Gallery providerId={providerId}/>} {tab==='costs'&&<Costs providerId={providerId}/>} {tab==='reviews'&&<Reviews providerId={providerId}/>}</div>}
const msg=(e:unknown)=>e instanceof Error?e.message:typeof e==='object'&&e!==null&&'message' in e&&typeof e.message==='string'?e.message:'কাজটি সম্পন্ন করা যায়নি';
function Controls({up,down,edit,del}:{up:()=>void;down:()=>void;edit:()=>void;del:()=>void}){return <div className="provider-row-controls"><button type="button" onClick={up}><ArrowUp/></button><button type="button" onClick={down}><ArrowDown/></button><button type="button" onClick={edit}><Pencil/></button><button type="button" onClick={del}><Trash2/></button></div>}
function Services({providerId}:{providerId:string}){
  const [rows,setRows]=useState<ProviderService[]>([]),[edit,setEdit]=useState<ProviderService|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
  const load=()=>providerServices.getAll(providerId).then(setRows).catch(e=>setError(msg(e)));
  useEffect(()=>{ void load(); },[providerId]);
  async function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault();const formElement=e.currentTarget;setBusy(true);setError(null);const f=new FormData(formElement);const file=f.get('imageFile');let uploaded:string|null=null;
    try{
      let image=edit?.image||null;
      if(file instanceof File&&file.size){uploaded=await uploadProviderWebsiteImage(providerId,file,'service');image=uploaded;}
      const input={name:{bn:String(f.get('bn')||''),en:String(f.get('en')||'')},description:{bn:String(f.get('dbn')||''),en:String(f.get('den')||'')},icon:String(f.get('icon')||'')||null,image,is_active:f.get('active')==='on',sort_order:edit?.sort_order??rows.length};
      if(edit){await providerServices.update(providerId,edit.id,input);if(uploaded&&edit.image&&edit.image!==uploaded)await removeOwnedProviderWebsiteImage(edit.image).catch(()=>undefined);}
      else await providerServices.create(providerId,input);
      await load();setEdit(null);formElement.reset();
    }catch(x){if(uploaded)await removeOwnedProviderWebsiteImage(uploaded).catch(()=>undefined);setError(msg(x));}finally{setBusy(false)}
  }
  async function move(i:number,d:number){const a=[...rows],j=i+d;if(j<0||j>=a.length)return;[a[i],a[j]]=[a[j],a[i]];setRows(a);await providerServices.reorder(providerId,a.map(x=>x.id));}
  return <Panel title="Services"><ContentForm submit={submit} edit={edit} busy={busy} image recommended="1000×1000"/><div className="provider-admin-list">{rows.map((x,i)=><article key={x.id}>{x.image&&<img src={getImageUrl(x.image,'public-images','thumbnail')||x.image} alt=""/>}<div><h3>{x.name.bn||x.name.en}</h3><p>{x.description?.bn||x.description?.en}</p><small>{x.is_active?'Active':'Hidden'}</small></div><Controls up={()=>move(i,-1)} down={()=>move(i,1)} edit={()=>setEdit(x)} del={async()=>{await providerServices.remove(providerId,x.id);await load()}}/></article>)}</div>{error&&<p className="auth-message error">{error}</p>}</Panel>
}
function Gallery({providerId}:{providerId:string}){
  const [rows,setRows]=useState<ProviderGalleryImage[]>([]),[edit,setEdit]=useState<ProviderGalleryImage|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
  const load=()=>providerGallery.getAll(providerId).then(setRows).catch(e=>setError(msg(e)));
  useEffect(()=>{ void load(); },[providerId]);
  async function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault();const formElement=e.currentTarget;setBusy(true);setError(null);const f=new FormData(formElement);const file=f.get('imageFile');let uploaded:string|null=null;
    try{
      let image=edit?.image||null;
      if(file instanceof File&&file.size){uploaded=await uploadProviderWebsiteImage(providerId,file,'gallery');image=uploaded;}
      const input={category_id:String(f.get('category')||'hospital'),caption:{bn:String(f.get('bn')||''),en:String(f.get('en')||'')},image,is_active:f.get('active')==='on',sort_order:edit?.sort_order??rows.length};
      if(edit){await providerGallery.update(providerId,edit.id,input);if(uploaded&&edit.image&&edit.image!==uploaded)await removeOwnedProviderWebsiteImage(edit.image).catch(()=>undefined);}
      else await providerGallery.create(providerId,input);
      await load();setEdit(null);formElement.reset();
    }catch(x){if(uploaded)await removeOwnedProviderWebsiteImage(uploaded).catch(()=>undefined);setError(msg(x));}finally{setBusy(false)}
  }
  async function move(i:number,d:number){const a=[...rows],j=i+d;if(j<0||j>=a.length)return;[a[i],a[j]]=[a[j],a[i]];setRows(a);await providerGallery.reorder(providerId,a.map(x=>x.id))}
  return <Panel title="Gallery"><ContentForm submit={submit} edit={edit} busy={busy} image category recommended="1400×1400"/><div className="provider-admin-list gallery">{rows.map((x,i)=><article key={x.id}>{x.image&&<img src={getImageUrl(x.image,'public-images','thumbnail')||x.image} alt=""/>}<div><h3>{x.caption.bn||x.caption.en||'Gallery image'}</h3><small>{x.category_id} • {x.is_active?'Active':'Hidden'}</small></div><Controls up={()=>move(i,-1)} down={()=>move(i,1)} edit={()=>setEdit(x)} del={async()=>{await providerGallery.remove(providerId,x.id);await load()}}/></article>)}</div>{error&&<p className="auth-message error">{error}</p>}</Panel>
}
function Slider({providerId}:{providerId:string}){
  const [rows,setRows]=useState<ProviderSliderImage[]>([]),[edit,setEdit]=useState<ProviderSliderImage|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
  const load=()=>providerSlider.getAll(providerId).then(setRows).catch(e=>setError(msg(e)));
  useEffect(()=>{ void load(); },[providerId]);
  async function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault(); if(!edit&&rows.length>=4){setError('সর্বোচ্চ ৪টি slider image রাখা যাবে।');return;}
    const formElement=e.currentTarget;setBusy(true);setError(null);const f=new FormData(formElement);
    try{
      let image=edit?.image||null; const file=f.get('imageFile');
      if(edit&&file instanceof File&&file.size){await replaceProviderSliderImage(providerId,edit,file);image=edit.image;}
      else if(!edit&&file instanceof File&&file.size) image=await uploadProviderWebsiteImage(providerId,file,'slider');
      if(!edit&&!image)throw new Error('নতুন slider-এর জন্য ছবি নির্বাচন করুন।');
      const input={caption:{bn:String(f.get('bn')||''),en:String(f.get('en')||'')},icon:null,image,is_active:f.get('active')==='on',sort_order:edit?.sort_order??rows.length};
      if(edit)await providerSlider.update(providerId,edit.id,{caption:input.caption,is_active:input.is_active,sort_order:input.sort_order});
      else {
        try { await providerSlider.create(providerId,input); }
        catch (createError) { if(image) await removeOwnedProviderWebsiteImage(image).catch(()=>undefined); throw createError; }
      }
      await load();setEdit(null);formElement.reset();
    }catch(e2){setError(msg(e2))}finally{setBusy(false)}
  }
  async function move(i:number,d:number){const a=[...rows],j=i+d;if(j<0||j>=a.length)return;[a[i],a[j]]=[a[j],a[i]];setRows(a);try{await providerSlider.reorder(providerId,a.map(x=>x.id));}catch(e){setError(msg(e));await load();}}
  return <Panel title={`Public Image Slider (${rows.length}/4)`}>
    <p className="provider-content-help">Public Hospital page-এ সর্বোচ্চ ৪টি ছবি swipe carousel হিসেবে দেখাবে। প্রস্তাবিত সাইজ: 1600×900 px • সর্বোচ্চ 3 MB • আপলোডের পর ছবি স্বয়ংক্রিয়ভাবে অপটিমাইজ হবে।</p>
    <ContentForm submit={submit} edit={edit} busy={busy} image textRequired={false} recommended="1600×900"/>
    {!edit&&rows.length>=4&&<p className="provider-content-limit">৪টি image পূর্ণ হয়েছে। নতুন image যোগ করতে একটি delete/replace করুন।</p>}
    <div className="provider-admin-list gallery">{rows.map((x,i)=><article key={x.id}>{x.image&&<img src={getImageUrl(x.image,'public-images','thumbnail')||x.image} alt="" loading="lazy"/>}<div><h3>{x.caption.bn||x.caption.en||'Slide'}</h3><small>{x.is_active?'Active':'Hidden'}</small></div><Controls up={()=>void move(i,-1)} down={()=>void move(i,1)} edit={()=>setEdit(x)} del={async()=>{try{await deleteProviderSliderImage(providerId,x);if(edit?.id===x.id)setEdit(null);await load();}catch(e){setError(msg(e))}}}/></article>)}</div>
    {error&&<p className="auth-message error">{error}</p>}
  </Panel>
}

const providerDaysBn=['রবিবার','সোমবার','মঙ্গলবার','বুধবার','বৃহস্পতিবার','শুক্রবার','শনিবার'];
type HourDraft={mode:'hours'|'closed'|'24';open:string;close:string;bn:string;en:string};
function draftFrom(row:ProviderOpeningHour|undefined):HourDraft{
  if(!row)return{mode:'closed',open:'09:00',close:'17:00',bn:'',en:''};
  return{mode:row.is_closed?'closed':row.is_24_hours?'24':'hours',open:(row.open_time||'09:00').slice(0,5),close:(row.close_time||'17:00').slice(0,5),bn:row.note?.bn||'',en:row.note?.en||''};
}
function OpeningHours({providerId}:{providerId:string}){
  const [rows,setRows]=useState<ProviderOpeningHour[]>([]),[drafts,setDrafts]=useState<Record<number,HourDraft>>({}),[busy,setBusy]=useState<number|null>(null),[error,setError]=useState<string|null>(null);
  async function load(){try{const next=await getProviderOpeningHours(providerId);setRows(next);const map:Record<number,HourDraft>={};for(let day=0;day<7;day++)map[day]=draftFrom(next.find(x=>x.day_of_week===day));setDrafts(map);}catch(e){setError(msg(e))}}
  useEffect(()=>{void load()},[providerId]);
  function patch(day:number,next:Partial<HourDraft>){setDrafts(current=>({...current,[day]:{...(current[day]||draftFrom(rows.find(x=>x.day_of_week===day))),...next}}))}
  async function save(day:number){const d=drafts[day]||draftFrom(undefined);setBusy(day);setError(null);try{await saveProviderOpeningHour(providerId,{day_of_week:day,open_time:d.mode==='hours'?d.open:null,close_time:d.mode==='hours'?d.close:null,is_closed:d.mode==='closed',is_24_hours:d.mode==='24',note:{bn:d.bn.trim(),en:d.en.trim()}});await load();}catch(e){setError(msg(e))}finally{setBusy(null)}}
  return <Panel title="Opening Hours"><p className="provider-content-help">প্রতিদিন Closed, 24 Hours অথবা structured opening time দিন। Note বাংলা/English দুটো ভাষায় দেওয়া যায়।</p><div className="provider-hours-admin">{providerDaysBn.map((name,day)=>{const d=drafts[day]||draftFrom(undefined);return <article key={day}><header><Clock3/><strong>{name}</strong><select value={d.mode} onChange={e=>patch(day,{mode:e.target.value as HourDraft['mode']})}><option value="hours">Open hours</option><option value="24">24 hours</option><option value="closed">Closed</option></select></header>{d.mode==='hours'&&<div className="provider-hours-time"><input type="time" value={d.open} onChange={e=>patch(day,{open:e.target.value})}/><span>–</span><input type="time" value={d.close} onChange={e=>patch(day,{close:e.target.value})}/></div>}<input value={d.bn} onChange={e=>patch(day,{bn:e.target.value})} placeholder="বাংলা note (optional)"/><input value={d.en} onChange={e=>patch(day,{en:e.target.value})} placeholder="English note (optional)"/><button type="button" disabled={busy===day} onClick={()=>void save(day)}>{busy===day?<LoaderCircle className="spin"/>:<Plus/>} Save</button></article>})}</div>{error&&<p className="auth-message error">{error}</p>}</Panel>
}
function Reviews({providerId}:{providerId:string}){
  const [rows,setRows]=useState<ProviderReview[]>([]),[edit,setEdit]=useState<ProviderReview|null>(null),[busyReply,setBusyReply]=useState<string|null>(null),[error,setError]=useState<string|null>(null);
  const load=()=>providerReviews.getAll(providerId).then(setRows).catch(e=>setError(msg(e)));
  useEffect(()=>{ void load(); },[providerId]);
  const testimonials=rows.filter(x=>x.review_source!=='patient');
  const patientReviews=rows.filter(x=>x.review_source==='patient');
  async function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault(); const formElement=e.currentTarget;const f=new FormData(formElement);
    const input={name:String(f.get('name')||''),rating:Number(f.get('rating')||5),comment:String(f.get('comment')||''),reply:{bn:String(f.get('reply')||''),en:''},replied_at:f.get('reply')?new Date().toISOString():null,is_published:f.get('active')==='on',sort_order:edit?.sort_order??testimonials.length,review_source:'provider' as const};
    try{if(edit)await providerReviews.update(providerId,edit.id,input);else await providerReviews.create(providerId,input);await load();setEdit(null);formElement.reset();}catch(e2){setError(msg(e2))}
  }
  async function move(i:number,d:number){const a=[...testimonials],j=i+d;if(j<0||j>=a.length)return;[a[i],a[j]]=[a[j],a[i]];await providerReviews.reorder(providerId,a.map(x=>x.id));await load();}
  async function saveReply(review:ProviderReview,bn:string,en:string){setBusyReply(review.id);setError(null);try{await replyToMyProviderReview(review.id,bn,en);await load();}catch(e){setError(msg(e))}finally{setBusyReply(null)}}
  return <Panel title="Reviews">
    <div className="provider-patient-review-note">Patient structured reviews বর্তমানে rating-only। Provider rating edit/delete করতে পারে না; existing reply workflow preserve আছে।</div>
    {patientReviews.length?<div className="provider-admin-list provider-patient-review-list">{patientReviews.map(x=><article key={x.id}><div><h3>{x.name} • {Number(x.structured_rating??x.rating).toFixed(1)}/5</h3><p>Patient rating-only review</p><small>Structured Patient review • {x.is_published?'Published':'Hidden by moderation'}</small><div className="provider-review-five-scores"><span>Q1 {x.q1_score}</span><span>Q2 {x.q2_score}</span><span>Q3 {x.q3_score}</span><span>Q4 {x.q4_score}</span><span>Q5 {x.q5_score}</span></div><ReplyEditor review={x} busy={busyReply===x.id} save={saveReply}/></div></article>)}</div>:<p className="provider-empty">কোনো Patient structured review নেই।</p>}
    <h3 className="provider-review-subtitle">Legacy / Provider testimonials</h3>
    <form className="provider-content-form" onSubmit={submit}><input name="name" defaultValue={edit?.name||''} required placeholder="Reviewer name"/><input name="rating" type="number" min="1" max="5" defaultValue={edit?.rating||5}/><textarea name="comment" defaultValue={edit?.comment||''} placeholder="Testimonial"/><textarea name="reply" defaultValue={edit?.reply?.bn||''} placeholder="Provider reply"/><label><input name="active" type="checkbox" defaultChecked={edit?.is_published??true}/> Published</label><button><Plus/> Save testimonial</button></form>
    <div className="provider-admin-list">{testimonials.map((x,i)=><article key={x.id}><div><h3>{x.name} • {x.rating}/5</h3><p>{x.comment||x.text?.bn}</p><small>{x.is_published?'Published':'Pending/hidden'}</small></div><Controls up={()=>void move(i,-1)} down={()=>void move(i,1)} edit={()=>setEdit(x)} del={async()=>{await providerReviews.remove(providerId,x.id);await load()}}/></article>)}</div>
    {error&&<p className="auth-message error">{error}</p>}
  </Panel>
}
function ReplyEditor({review,busy,save}:{review:ProviderReview;busy:boolean;save:(review:ProviderReview,bn:string,en:string)=>Promise<void>}){const [bn,setBn]=useState(review.reply?.bn||''),[en,setEn]=useState(review.reply?.en||'');useEffect(()=>{setBn(review.reply?.bn||'');setEn(review.reply?.en||'')},[review.id,review.reply?.bn,review.reply?.en]);return <div className="provider-patient-review-reply"><textarea rows={2} value={bn} onChange={e=>setBn(e.target.value)} placeholder="বাংলা উত্তর (optional)"/><textarea rows={2} value={en} onChange={e=>setEn(e.target.value)} placeholder="English reply (optional)"/><button type="button" disabled={busy} onClick={()=>void save(review,bn,en)}>{busy?<LoaderCircle className="spin"/>:<Plus/>} Reply save</button></div>}
function Costs({providerId}:{providerId:string}){return <div className="provider-cost-admin-grid"><CostEditor providerId={providerId} title="Treatment Costs" api={providerTreatmentCosts}/><CostEditor providerId={providerId} title="Investigation Costs" api={providerInvestigationCosts}/></div>}
function CostEditor({providerId,title,api}:{providerId:string;title:string;api:typeof providerTreatmentCosts}){const [rows,setRows]=useState<ProviderCost[]>([]),[edit,setEdit]=useState<ProviderCost|null>(null);const load=()=>api.getAll(providerId).then(setRows);useEffect(()=>{ void load(); },[providerId]);async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();const formElement=e.currentTarget;const f=new FormData(formElement),input={name:{bn:String(f.get('bn')||''),en:String(f.get('en')||'')},cost:{bn:String(f.get('costbn')||''),en:String(f.get('costen')||'')},sort_order:edit?.sort_order??rows.length};if(edit)await api.update(providerId,edit.id,input);else await api.create(providerId,input);await load();setEdit(null);formElement.reset()}async function move(i:number,d:number){const a=[...rows],j=i+d;if(j<0||j>=a.length)return;[a[i],a[j]]=[a[j],a[i]];setRows(a);await api.reorder(providerId,a.map(x=>x.id))}return <Panel title={title}><form className="provider-content-form" onSubmit={submit}><input name="bn" defaultValue={edit?.name.bn||''} required placeholder="বাংলা নাম"/><input name="en" defaultValue={edit?.name.en||''} placeholder="English name"/><input name="costbn" defaultValue={edit?.cost.bn||''} required placeholder="খরচ"/><input name="costen" defaultValue={edit?.cost.en||''} placeholder="Cost English"/><button><Plus/> Save</button></form><div className="provider-admin-list">{rows.map((x,i)=><article key={x.id}><div><h3>{x.name.bn||x.name.en}</h3><p>{x.cost.bn||x.cost.en}</p></div><Controls up={()=>move(i,-1)} down={()=>move(i,1)} edit={()=>setEdit(x)} del={async()=>{await api.remove(providerId,x.id);load()}}/></article>)}</div></Panel>}
function Panel({title,children}:{title:string;children:ReactNode}){return <section className="provider-form-section provider-content-panel"><h2>{title}</h2>{children}</section>}
function ContentForm({submit,edit,busy=false,image=false,category=false,textRequired=true,recommended='1000×1000'}:{submit:(e:FormEvent<HTMLFormElement>)=>void;edit:any;busy?:boolean;image?:boolean;category?:boolean;textRequired?:boolean;recommended?:string}){return <form className="provider-content-form" onSubmit={submit}><input name="bn" defaultValue={edit?.name?.bn||edit?.caption?.bn||''} required={textRequired} placeholder="বাংলা নাম / caption"/><input name="en" defaultValue={edit?.name?.en||edit?.caption?.en||''} placeholder="English name / caption"/>{edit?.description!==undefined&&<><textarea name="dbn" defaultValue={edit?.description?.bn||''} placeholder="বাংলা description"/><textarea name="den" defaultValue={edit?.description?.en||''} placeholder="English description"/></>}<input name="icon" defaultValue={edit?.icon||''} placeholder="Icon name (optional)"/>{category&&<select name="category" defaultValue={edit?.category_id||'hospital'}><option value="hospital">Hospital</option><option value="doctors">Doctors</option><option value="staff">Staff</option><option value="ot">Operation Theatre</option><option value="success">Success</option></select>}{image&&<label className="provider-file"><ImagePlus/> Upload image<input name="imageFile" type="file" accept="image/jpeg,image/png,image/webp,image/avif"/><small className="image-upload-hint">প্রস্তাবিত সাইজ: {recommended} px • সর্বোচ্চ 3 MB • আপলোডের পর ছবি স্বয়ংক্রিয়ভাবে অপটিমাইজ হবে</small></label>}<label><input name="active" type="checkbox" defaultChecked={edit?.is_active??true}/> Active</label><button disabled={busy}>{busy?<LoaderCircle className="spin"/>:<Plus/>} Save</button></form>}
