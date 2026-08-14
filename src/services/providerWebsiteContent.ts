import { requireSupabase } from '../lib/supabase';

export type LocalizedText = { bn?: string; en?: string };
export type ProviderService = { id:number; provider_id:string; name:LocalizedText; description:LocalizedText|null; icon:string|null; image:string|null; is_active:boolean; sort_order:number; created_at:string; updated_at:string };
export type ProviderGalleryImage = { id:number; provider_id:string; category_id:string|null; image:string|null; caption:LocalizedText; is_active:boolean; sort_order:number; created_at:string };
export type ProviderSliderImage = { id:number; provider_id:string; image:string|null; icon:string|null; caption:LocalizedText; is_active:boolean; sort_order:number; created_at:string };
export type ProviderReview = { id:string; provider_id:string; name:string; rating:number; text:LocalizedText|null; comment:string|null; reply:LocalizedText|null; replied_at:string|null; is_published:boolean; sort_order:number; created_at:string };
export type ProviderCost = { id:number; provider_id:string; name:LocalizedText; cost:LocalizedText; sort_order:number; created_at:string; updated_at:string };

type Table = 'provider_services'|'provider_gallery_images'|'provider_slider_images'|'provider_reviews'|'provider_treatment_costs'|'provider_investigation_costs';

async function getAll<T>(table:Table, providerId:string, publicOnly?:{active?:boolean;published?:boolean}) {
  let q=requireSupabase().from(table).select('*').eq('provider_id',providerId).order('sort_order').order('created_at');
  if(publicOnly?.active) q=q.eq('is_active',true);
  if(publicOnly?.published) q=q.eq('is_published',true);
  const {data,error}=await q; if(error) throw error; return (data??[]) as T[];
}
async function create<T>(table:Table, providerId:string, input:Record<string,unknown>){ const {data,error}=await requireSupabase().from(table).insert({...input,provider_id:providerId}).select('*').single(); if(error) throw error; return data as T; }
async function update<T>(table:Table, providerId:string, id:string|number, input:Record<string,unknown>){ const {data,error}=await requireSupabase().from(table).update(input).eq('provider_id',providerId).eq('id',id).select('*').single(); if(error) throw error; return data as T; }
async function remove(table:Table, providerId:string, id:string|number){ const {error}=await requireSupabase().from(table).delete().eq('provider_id',providerId).eq('id',id); if(error) throw error; }
async function reorder(table:Table, providerId:string, ids:Array<string|number>){ await Promise.all(ids.map((id,index)=>update(table,providerId,id,{sort_order:index}))); }

export const providerServices={ getAll:(p:string,publicOnly=false)=>getAll<ProviderService>('provider_services',p,publicOnly?{active:true}:undefined), create:(p:string,i:Omit<Partial<ProviderService>,'id'|'provider_id'>)=>create<ProviderService>('provider_services',p,i), update:(p:string,id:number,i:Partial<ProviderService>)=>update<ProviderService>('provider_services',p,id,i), remove:(p:string,id:number)=>remove('provider_services',p,id), reorder:(p:string,ids:number[])=>reorder('provider_services',p,ids)};
export const providerGallery={ getAll:(p:string,publicOnly=false)=>getAll<ProviderGalleryImage>('provider_gallery_images',p,publicOnly?{active:true}:undefined), create:(p:string,i:Omit<Partial<ProviderGalleryImage>,'id'|'provider_id'>)=>create<ProviderGalleryImage>('provider_gallery_images',p,i), update:(p:string,id:number,i:Partial<ProviderGalleryImage>)=>update<ProviderGalleryImage>('provider_gallery_images',p,id,i), remove:(p:string,id:number)=>remove('provider_gallery_images',p,id), reorder:(p:string,ids:number[])=>reorder('provider_gallery_images',p,ids)};
export const providerSlider={ getAll:(p:string,publicOnly=false)=>getAll<ProviderSliderImage>('provider_slider_images',p,publicOnly?{active:true}:undefined), create:(p:string,i:Omit<Partial<ProviderSliderImage>,'id'|'provider_id'>)=>create<ProviderSliderImage>('provider_slider_images',p,i), update:(p:string,id:number,i:Partial<ProviderSliderImage>)=>update<ProviderSliderImage>('provider_slider_images',p,id,i), remove:(p:string,id:number)=>remove('provider_slider_images',p,id), reorder:(p:string,ids:number[])=>reorder('provider_slider_images',p,ids)};
export const providerReviews={ getAll:(p:string,publicOnly=false)=>getAll<ProviderReview>('provider_reviews',p,publicOnly?{published:true}:undefined), create:(p:string,i:Omit<Partial<ProviderReview>,'id'|'provider_id'>)=>create<ProviderReview>('provider_reviews',p,i), update:(p:string,id:string,i:Partial<ProviderReview>)=>update<ProviderReview>('provider_reviews',p,id,i), remove:(p:string,id:string)=>remove('provider_reviews',p,id), reorder:(p:string,ids:string[])=>reorder('provider_reviews',p,ids)};
function costs(table:'provider_treatment_costs'|'provider_investigation_costs'){ return { getAll:(p:string)=>getAll<ProviderCost>(table,p), create:(p:string,i:Omit<Partial<ProviderCost>,'id'|'provider_id'>)=>create<ProviderCost>(table,p,i), update:(p:string,id:number,i:Partial<ProviderCost>)=>update<ProviderCost>(table,p,id,i), remove:(p:string,id:number)=>remove(table,p,id), reorder:(p:string,ids:number[])=>reorder(table,p,ids)}; }
export const providerTreatmentCosts=costs('provider_treatment_costs');
export const providerInvestigationCosts=costs('provider_investigation_costs');

export async function uploadProviderWebsiteImage(providerId:string,file:File,kind:'service'|'gallery'|'slider'){
  if(!['image/jpeg','image/png','image/webp','image/avif'].includes(file.type)) throw new Error('JPG, PNG, WebP অথবা AVIF ছবি দিন।');
  if(file.size>6*1024*1024) throw new Error('ছবির আকার সর্বোচ্চ ৬ MB হতে পারবে।');
  const {data:{user}}=await requireSupabase().auth.getUser(); if(!user) throw new Error('Authentication required');
  const ext=file.name.split('.').pop()?.toLowerCase()||'jpg'; const path=`${user.id}/${providerId}/website/${kind}/${Date.now()}-${crypto.randomUUID().slice(0,8)}.${ext}`;
  const {error}=await requireSupabase().storage.from('public-images').upload(path,file,{cacheControl:'3600',upsert:false}); if(error) throw error; return path;
}
