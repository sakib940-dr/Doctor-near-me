import { requireSupabase } from '../lib/supabase';
import type {
  DoctorChamberDistance,
  DoctorInvestigationCostItem,
  DoctorPublicContent,
  DoctorServiceItem,
  DoctorSliderImage,
  DoctorTreatmentCostItem,
  LocalizedProfileText,
} from '../types';

type ContentTable = 'doctor_services' | 'doctor_treatment_costs' | 'doctor_investigation_costs';

type Reorderable = { id: number; sort_order: number };

export async function getDoctorPublicContent(doctorId: string) {
  const { data, error } = await requireSupabase().rpc('get_doctor_public_content', {
    p_doctor_id: doctorId,
  });
  if (error) throw error;
  return (data ?? null) as DoctorPublicContent | null;
}

export async function getMyDoctorPublicContent() {
  const { data, error } = await requireSupabase().rpc('get_my_doctor_public_content');
  if (error) throw error;
  return (data ?? null) as DoctorPublicContent | null;
}

export async function saveMyDoctorAbout(bioBn: string, bioEn: string) {
  const { data, error } = await requireSupabase().rpc('update_my_doctor_public_content', {
    p_bio_bn: bioBn.trim() || null,
    p_bio_en: bioEn.trim() || null,
  });
  if (error) throw error;
  return Boolean(data);
}

function ensureDoctorImage(file: File) {
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(file.type)) {
    throw new Error('JPG, PNG, WebP অথবা AVIF ছবি দিন।');
  }
  if (file.size > 5 * 1024 * 1024) throw new Error('Slider ছবির আকার সর্বোচ্চ ৫ MB হতে পারবে।');
}

async function optimizeDoctorSliderFile(file: File) {
  ensureDoctorImage(file);
  if (typeof document === 'undefined' || typeof createImageBitmap !== 'function') return file;
  try {
    const bitmap = await createImageBitmap(file);
    const maxEdge = 1920;
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) { bitmap.close(); return file; }
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.84));
    if (!blob || blob.size >= file.size) return file;
    const basename = file.name.replace(/\.[^.]+$/, '') || 'doctor-slider';
    return new File([blob], `${basename}.webp`, { type: 'image/webp', lastModified: file.lastModified });
  } catch {
    return file;
  }
}

export async function uploadDoctorSliderImage(file: File) {
  const optimized = await optimizeDoctorSliderFile(file);
  const client = requireSupabase();
  const { data: { user } } = await client.auth.getUser();
  if (!user) throw new Error('Authentication required');
  const extension = optimized.name.split('.').pop()?.toLowerCase() || 'jpg';
  const path = `${user.id}/doctor-public/slider/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${extension}`;
  const { error } = await client.storage.from('public-images').upload(path, optimized, {
    cacheControl: '86400',
    contentType: optimized.type,
    upsert: false,
  });
  if (error) throw error;
  return path;
}

async function removeOwnedPublicImage(path: string) {
  if (!path || /^https?:\/\//i.test(path)) return;
  const client = requireSupabase();
  const { data: { user } } = await client.auth.getUser();
  if (!user || !path.startsWith(`${user.id}/`)) return;
  await client.storage.from('public-images').remove([path]);
}

export async function createDoctorSliderImage(input: {
  image: string;
  caption: LocalizedProfileText;
  active?: boolean;
  sortOrder: number;
}) {
  const client = requireSupabase();
  const { data: { user } } = await client.auth.getUser();
  if (!user) throw new Error('Authentication required');
  const { data, error } = await client.from('doctor_slider_images').insert({
    doctor_id: user.id,
    image: input.image,
    caption: input.caption,
    is_active: input.active ?? true,
    sort_order: input.sortOrder,
  }).select('*').single();
  if (error) {
    await removeOwnedPublicImage(input.image);
    throw error;
  }
  return data as DoctorSliderImage;
}

export async function updateDoctorSliderImage(id: number, input: Partial<Pick<DoctorSliderImage, 'image' | 'caption' | 'is_active' | 'sort_order'>>) {
  const { data, error } = await requireSupabase().from('doctor_slider_images').update(input).eq('id', id).select('*').single();
  if (error) throw error;
  return data as DoctorSliderImage;
}

export async function deleteDoctorSliderImage(row: DoctorSliderImage) {
  const { error } = await requireSupabase().from('doctor_slider_images').delete().eq('id', row.id);
  if (error) throw error;
  await removeOwnedPublicImage(row.image);
}

export async function replaceDoctorSliderImage(row: DoctorSliderImage, file: File) {
  const nextPath = await uploadDoctorSliderImage(file);
  try {
    const updated = await updateDoctorSliderImage(row.id, { image: nextPath });
    await removeOwnedPublicImage(row.image);
    return updated;
  } catch (error) {
    await removeOwnedPublicImage(nextPath);
    throw error;
  }
}

export async function reorderDoctorSliderImages(rows: DoctorSliderImage[]) {
  await Promise.all(rows.map((row, index) => updateDoctorSliderImage(row.id, { sort_order: index })));
}

async function createContentRow<T>(table: ContentTable, input: Record<string, unknown>) {
  const client = requireSupabase();
  const { data: { user } } = await client.auth.getUser();
  if (!user) throw new Error('Authentication required');
  const { data, error } = await client.from(table).insert({ ...input, doctor_id: user.id }).select('*').single();
  if (error) throw error;
  return data as T;
}

async function updateContentRow<T>(table: ContentTable, id: number, input: Record<string, unknown>) {
  const { data, error } = await requireSupabase().from(table).update(input).eq('id', id).select('*').single();
  if (error) throw error;
  return data as T;
}

async function deleteContentRow(table: ContentTable, id: number) {
  const { error } = await requireSupabase().from(table).delete().eq('id', id);
  if (error) throw error;
}

async function reorderContentRows(table: ContentTable, rows: Reorderable[]) {
  await Promise.all(rows.map((row, index) => updateContentRow(table, row.id, { sort_order: index })));
}

export const doctorServices = {
  create: (input: { name: LocalizedProfileText; description: LocalizedProfileText; is_active: boolean; sort_order: number }) => createContentRow<DoctorServiceItem>('doctor_services', input),
  update: (id: number, input: Partial<DoctorServiceItem>) => updateContentRow<DoctorServiceItem>('doctor_services', id, input),
  remove: (id: number) => deleteContentRow('doctor_services', id),
  reorder: (rows: DoctorServiceItem[]) => reorderContentRows('doctor_services', rows),
};

export const doctorTreatmentCosts = {
  create: (input: { name: LocalizedProfileText; cost: DoctorTreatmentCostItem['cost']; sort_order: number }) => createContentRow<DoctorTreatmentCostItem>('doctor_treatment_costs', input),
  update: (id: number, input: Partial<DoctorTreatmentCostItem>) => updateContentRow<DoctorTreatmentCostItem>('doctor_treatment_costs', id, input),
  remove: (id: number) => deleteContentRow('doctor_treatment_costs', id),
  reorder: (rows: DoctorTreatmentCostItem[]) => reorderContentRows('doctor_treatment_costs', rows),
};

export const doctorInvestigationCosts = {
  create: (input: { name: LocalizedProfileText; cost: DoctorInvestigationCostItem['cost']; sort_order: number }) => createContentRow<DoctorInvestigationCostItem>('doctor_investigation_costs', input),
  update: (id: number, input: Partial<DoctorInvestigationCostItem>) => updateContentRow<DoctorInvestigationCostItem>('doctor_investigation_costs', id, input),
  remove: (id: number) => deleteContentRow('doctor_investigation_costs', id),
  reorder: (rows: DoctorInvestigationCostItem[]) => reorderContentRows('doctor_investigation_costs', rows),
};

export async function getDoctorChamberDistances(doctorId: string, latitude: number, longitude: number) {
  const { data, error } = await requireSupabase().rpc('get_public_doctor_chamber_distances', {
    p_doctor_id: doctorId,
    p_lat: latitude,
    p_lon: longitude,
  });
  if (error) throw error;
  return ((data ?? []) as DoctorChamberDistance[]).map((row) => ({
    ...row,
    distance_km: Number(row.distance_km),
  }));
}
