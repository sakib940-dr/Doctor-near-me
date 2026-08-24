import { requireSupabase } from '../lib/supabase';
import { clearPublicRequestCache, publicCachedRequest } from '../lib/requestCache';
import { removeOptimizedImageVariants, uploadOptimizedImage } from './imageUpload';

export type LocalizedText = { bn?: string; en?: string };
export type ProviderService = { id:number; provider_id:string; name:LocalizedText; description:LocalizedText|null; icon:string|null; image:string|null; is_active:boolean; sort_order:number; created_at:string; updated_at:string };
export type ProviderGalleryImage = { id:number; provider_id:string; category_id:string|null; image:string|null; caption:LocalizedText; is_active:boolean; sort_order:number; created_at:string };
export type ProviderSliderImage = { id:number; provider_id:string; image:string|null; icon:string|null; caption:LocalizedText; is_active:boolean; sort_order:number; created_at:string };
export type ProviderReview = { id:string; provider_id:string; name:string; rating:number; text:LocalizedText|null; comment:string|null; reply:LocalizedText|null; replied_at:string|null; is_published:boolean; sort_order:number; created_at:string; review_source?:'provider'|'patient'; q1_score?:number|null; q2_score?:number|null; q3_score?:number|null; q4_score?:number|null; q5_score?:number|null; structured_rating?:number|null; edited_at?:string|null };
export type ProviderCost = { id:number; provider_id:string; name:LocalizedText; cost:LocalizedText; sort_order:number; created_at:string; updated_at:string };
export type ProviderOpeningHour = { id:number; provider_id:string; day_of_week:number; open_time:string|null; close_time:string|null; is_closed:boolean; is_24_hours:boolean; note:LocalizedText; created_at:string; updated_at:string };

type Table = 'provider_services'|'provider_gallery_images'|'provider_slider_images'|'provider_reviews'|'provider_treatment_costs'|'provider_investigation_costs';
const TABLE_COLUMNS: Record<Table,string> = {
  provider_services:'id,provider_id,name,description,icon,image,is_active,sort_order,created_at,updated_at',
  provider_gallery_images:'id,provider_id,category_id,image,caption,is_active,sort_order,created_at',
  provider_slider_images:'id,provider_id,image,icon,caption,is_active,sort_order,created_at',
  provider_reviews:'id,provider_id,name,rating,text,comment,reply,replied_at,is_published,sort_order,created_at,review_source,q1_score,q2_score,q3_score,q4_score,q5_score,structured_rating,edited_at',
  provider_treatment_costs:'id,provider_id,name,cost,sort_order,created_at,updated_at',
  provider_investigation_costs:'id,provider_id,name,cost,sort_order,created_at,updated_at',
};

async function getAll<T>(table:Table, providerId:string, publicOnly?:{active?:boolean;published?:boolean}) {
  const load=async()=>{
    let q=requireSupabase().from(table).select(TABLE_COLUMNS[table]).eq('provider_id',providerId).order('sort_order').order('created_at');
    if(publicOnly?.active) q=q.eq('is_active',true);
    if(publicOnly?.published) q=q.eq('is_published',true);
    const {data,error}=await q; if(error) throw error; return (data??[]) as unknown as T[];
  };
  if(publicOnly?.active||publicOnly?.published){
    const mode=publicOnly.active?'active':'published';
    return publicCachedRequest(`public:provider-content:${providerId}:${table}:${mode}`,load,60_000);
  }
  return load();
}
function invalidatePublicProviderContent(providerId:string){clearPublicRequestCache(`public:provider-content:${providerId}:`);clearPublicRequestCache(`public:provider-page-base:`);}
async function create<T>(table:Table, providerId:string, input:Record<string,unknown>){ const {data,error}=await requireSupabase().from(table).insert({...input,provider_id:providerId}).select(TABLE_COLUMNS[table]).single(); if(error) throw error; invalidatePublicProviderContent(providerId); return data as unknown as T; }
async function update<T>(table:Table, providerId:string, id:string|number, input:Record<string,unknown>){ const {data,error}=await requireSupabase().from(table).update(input).eq('provider_id',providerId).eq('id',id).select(TABLE_COLUMNS[table]).single(); if(error) throw error; invalidatePublicProviderContent(providerId); return data as unknown as T; }
async function remove(table:Table, providerId:string, id:string|number){ const {data,error}=await requireSupabase().from(table).delete().eq('provider_id',providerId).eq('id',id).select(TABLE_COLUMNS[table]).single(); if(error) throw error; invalidatePublicProviderContent(providerId); const image=(data as {image?:string|null}|null)?.image; if(image) await removeOwnedProviderWebsiteImage(image).catch(()=>undefined); return data; }
async function reorder(table:Table, providerId:string, ids:Array<string|number>){ const {error}=await requireSupabase().rpc('reorder_my_provider_content',{p_table:table,p_provider_id:providerId,p_ids:ids.map(String)}); if(error) throw error; invalidatePublicProviderContent(providerId); }

export const providerServices={ getAll:(p:string,publicOnly=false)=>getAll<ProviderService>('provider_services',p,publicOnly?{active:true}:undefined), create:(p:string,i:Omit<Partial<ProviderService>,'id'|'provider_id'>)=>create<ProviderService>('provider_services',p,i), update:(p:string,id:number,i:Partial<ProviderService>)=>update<ProviderService>('provider_services',p,id,i), remove:(p:string,id:number)=>remove('provider_services',p,id), reorder:(p:string,ids:number[])=>reorder('provider_services',p,ids)};
export const providerGallery={ getAll:(p:string,publicOnly=false)=>getAll<ProviderGalleryImage>('provider_gallery_images',p,publicOnly?{active:true}:undefined), create:(p:string,i:Omit<Partial<ProviderGalleryImage>,'id'|'provider_id'>)=>create<ProviderGalleryImage>('provider_gallery_images',p,i), update:(p:string,id:number,i:Partial<ProviderGalleryImage>)=>update<ProviderGalleryImage>('provider_gallery_images',p,id,i), remove:(p:string,id:number)=>remove('provider_gallery_images',p,id), reorder:(p:string,ids:number[])=>reorder('provider_gallery_images',p,ids)};
export const providerSlider={ getAll:(p:string,publicOnly=false)=>getAll<ProviderSliderImage>('provider_slider_images',p,publicOnly?{active:true}:undefined), create:(p:string,i:Omit<Partial<ProviderSliderImage>,'id'|'provider_id'>)=>create<ProviderSliderImage>('provider_slider_images',p,i), update:(p:string,id:number,i:Partial<ProviderSliderImage>)=>update<ProviderSliderImage>('provider_slider_images',p,id,i), remove:(p:string,id:number)=>remove('provider_slider_images',p,id), reorder:(p:string,ids:number[])=>reorder('provider_slider_images',p,ids)};
export const providerReviews={ getAll:(p:string,publicOnly=false)=>getAll<ProviderReview>('provider_reviews',p,publicOnly?{published:true}:undefined), create:(p:string,i:Omit<Partial<ProviderReview>,'id'|'provider_id'>)=>create<ProviderReview>('provider_reviews',p,i), update:(p:string,id:string,i:Partial<ProviderReview>)=>update<ProviderReview>('provider_reviews',p,id,i), remove:(p:string,id:string)=>remove('provider_reviews',p,id), reorder:(p:string,ids:string[])=>reorder('provider_reviews',p,ids)};
function costs(table:'provider_treatment_costs'|'provider_investigation_costs'){ return { getAll:(p:string)=>getAll<ProviderCost>(table,p), create:(p:string,i:Omit<Partial<ProviderCost>,'id'|'provider_id'>)=>create<ProviderCost>(table,p,i), update:(p:string,id:number,i:Partial<ProviderCost>)=>update<ProviderCost>(table,p,id,i), remove:(p:string,id:number)=>remove(table,p,id), reorder:(p:string,ids:number[])=>reorder(table,p,ids)}; }
export const providerTreatmentCosts=costs('provider_treatment_costs');
export const providerInvestigationCosts=costs('provider_investigation_costs');

export async function uploadProviderWebsiteImage(providerId:string,file:File,kind:'service'|'gallery'|'slider',options?:{memorySafeDecode?:boolean}){
  const {data:{user}}=await requireSupabase().auth.getUser();
  if(!user) throw new Error('Authentication required');
  const preset=kind==='slider'?'slider':kind==='service'?'service':'gallery';
  const result=await uploadOptimizedImage({
    file,
    bucket:'public-images',
    ownerPrefix:user.id,
    folder:`${providerId}/website/${kind}`,
    preset,
    memorySafeDecode:options?.memorySafeDecode,
  });
  return result.path;
}


export async function removeOwnedProviderWebsiteImage(path:string|null|undefined){
  if(!path||/^https?:\/\//i.test(path))return; const client=requireSupabase(); const {data:{user}}=await client.auth.getUser();
  if(!user||!path.startsWith(`${user.id}/`))return; await removeOptimizedImageVariants('public-images',path);
}

export async function replaceProviderSliderImage(providerId:string,row:ProviderSliderImage,file:File,options?:{memorySafeDecode?:boolean}){
  const next=await uploadProviderWebsiteImage(providerId,file,'slider',options);
  try{const updated=await providerSlider.update(providerId,row.id,{image:next});await removeOwnedProviderWebsiteImage(row.image);return updated;}
  catch(error){await removeOwnedProviderWebsiteImage(next);throw error;}
}

export async function deleteProviderSliderImage(providerId:string,row:ProviderSliderImage){
  await providerSlider.remove(providerId,row.id);
}


export async function getProviderOpeningHours(providerId:string){
  const {data,error}=await requireSupabase().from('provider_opening_hours').select('id,provider_id,day_of_week,open_time,close_time,is_closed,is_24_hours,note,created_at,updated_at').eq('provider_id',providerId).order('day_of_week');
  if(error)throw error; return (data??[]) as ProviderOpeningHour[];
}

export async function saveProviderOpeningHour(providerId:string,input:Omit<ProviderOpeningHour,'id'|'provider_id'|'created_at'|'updated_at'>){
  const payload={provider_id:providerId,...input};
  const {data,error}=await requireSupabase().from('provider_opening_hours').upsert(payload,{onConflict:'provider_id,day_of_week'}).select('id,provider_id,day_of_week,open_time,close_time,is_closed,is_24_hours,note,created_at,updated_at').single();
  if(error)throw error; return data as ProviderOpeningHour;
}
