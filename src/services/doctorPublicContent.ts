import { requireSupabase } from '../lib/supabase';
import { removeOptimizedImageVariants, uploadOptimizedImage } from './imageUpload';
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
const CONTENT_COLUMNS: Record<ContentTable,string> = {
  doctor_services:'id,doctor_id,name,description,icon,is_active,sort_order,created_at,updated_at',
  doctor_treatment_costs:'id,doctor_id,name,cost,sort_order,created_at,updated_at',
  doctor_investigation_costs:'id,doctor_id,name,cost,sort_order,created_at,updated_at',
};

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

export async function uploadDoctorSliderImage(file: File) {
  const client = requireSupabase();
  const { data: { user } } = await client.auth.getUser();
  if (!user) throw new Error('Authentication required');
  const result = await uploadOptimizedImage({
    file,
    bucket: 'public-images',
    ownerPrefix: user.id,
    folder: 'doctor-public/slider',
    preset: 'slider',
  });
  return result.path;
}


async function removeOwnedPublicImage(path: string) {
  if (!path || /^https?:\/\//i.test(path)) return;
  const client = requireSupabase();
  const { data: { user } } = await client.auth.getUser();
  if (!user || !path.startsWith(`${user.id}/`)) return;
  await removeOptimizedImageVariants('public-images', path);
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
  }).select('id,doctor_id,image,caption,is_active,sort_order,created_at,updated_at').single();
  if (error) {
    await removeOwnedPublicImage(input.image);
    throw error;
  }
  return data as DoctorSliderImage;
}

export async function updateDoctorSliderImage(id: number, input: Partial<Pick<DoctorSliderImage, 'image' | 'caption' | 'is_active' | 'sort_order'>>) {
  const { data, error } = await requireSupabase().from('doctor_slider_images').update(input).eq('id', id).select('id,doctor_id,image,caption,is_active,sort_order,created_at,updated_at').single();
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
  const { error } = await requireSupabase().rpc('reorder_my_doctor_public_content', { p_table: 'doctor_slider_images', p_ids: rows.map((row) => row.id) });
  if (error) throw error;
}

async function createContentRow<T>(table: ContentTable, input: Record<string, unknown>) {
  const client = requireSupabase();
  const { data: { user } } = await client.auth.getUser();
  if (!user) throw new Error('Authentication required');
  const { data, error } = await client.from(table).insert({ ...input, doctor_id: user.id }).select(CONTENT_COLUMNS[table]).single();
  if (error) throw error;
  return data as T;
}

async function updateContentRow<T>(table: ContentTable, id: number, input: Record<string, unknown>) {
  const { data, error } = await requireSupabase().from(table).update(input).eq('id', id).select(CONTENT_COLUMNS[table]).single();
  if (error) throw error;
  return data as T;
}

async function deleteContentRow(table: ContentTable, id: number) {
  const { error } = await requireSupabase().from(table).delete().eq('id', id);
  if (error) throw error;
}

async function reorderContentRows(table: ContentTable, rows: Reorderable[]) {
  const { error } = await requireSupabase().rpc('reorder_my_doctor_public_content', { p_table: table, p_ids: rows.map((row) => row.id) });
  if (error) throw error;
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
