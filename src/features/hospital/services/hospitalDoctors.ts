import { requireSupabase } from '../../../lib/supabase';
import { removeOptimizedImageVariants, uploadOptimizedImage } from '../../../services/imageUpload';
import type { HospitalDoctorCard } from '../types';
import type { ProviderDirectoryRow } from '../../../types';
import type { ProviderPublicPageContent } from '../../../services/providerPublicContent';

export interface PublicHospitalPageBase {
  route: { id: string; slug: string };
  provider: ProviderDirectoryRow;
  content: ProviderPublicPageContent | null;
}

export async function getPublicHospitalPageBase(identifier: string) {
  const { data, error } = await requireSupabase().rpc('get_public_hospital_page_base', { p_identifier: identifier.trim() });
  if (error) throw error;
  return (data ?? null) as PublicHospitalPageBase | null;
}

export async function getMyHospitalDoctors(providerId: string) {
  const { data, error } = await requireSupabase().rpc('get_my_hospital_doctor_cards', { p_provider_id: providerId });
  if (error) throw error;
  return (data ?? []) as HospitalDoctorCard[];
}

export async function getPublicHospitalDoctors(providerId: string) {
  const { data, error } = await requireSupabase().rpc('get_public_hospital_doctor_cards', { p_provider_id: providerId });
  if (error) throw error;
  return (data ?? []) as HospitalDoctorCard[];
}

export async function saveMyHospitalDoctor(input: Omit<HospitalDoctorCard, 'id' | 'created_at' | 'updated_at' | 'archived_at'> & { id: string | null }) {
  const { data, error } = await requireSupabase().rpc('save_my_hospital_doctor_card', {
    p_provider_id: input.provider_id,
    p_card_id: input.id,
    p_doctor_name: input.doctor_name.trim(),
    p_photo_path: input.photo_path,
    p_degree: input.degree,
    p_designation: input.designation,
    p_specialty: input.specialty,
    p_bmdc_registration_no: input.bmdc_registration_no,
    p_experience_years: input.experience_years,
    p_consultation_fee: input.consultation_fee,
    p_visiting_schedule: input.visiting_schedule,
    p_appointment_note: input.appointment_note,
    p_room_information: input.room_information,
    p_contact_mode: input.contact_mode,
    p_individual_phone: input.individual_phone,
    p_individual_whatsapp: input.individual_whatsapp,
    p_is_active: input.is_active ?? true,
    p_sort_order: input.sort_order,
  });
  if (error) throw error;
  return data as string;
}

export async function setHospitalDoctorVisibility(providerId: string, cardId: string, active: boolean) {
  const { error } = await requireSupabase().rpc('set_my_hospital_doctor_visibility', {
    p_provider_id: providerId, p_card_id: cardId, p_is_active: active,
  });
  if (error) throw error;
}

export async function archiveHospitalDoctor(providerId: string, cardId: string, restore = false) {
  const { error } = await requireSupabase().rpc('archive_my_hospital_doctor_card', {
    p_provider_id: providerId, p_card_id: cardId, p_restore: restore,
  });
  if (error) throw error;
}

export async function uploadHospitalDoctorPhoto(file: File, ownerUserId: string) {
  try {
    const { data: { user } } = await requireSupabase().auth.getUser();
    if (!user || user.id !== ownerUserId) throw new Error('UPLOAD_SESSION_REQUIRED');
    const result = await uploadOptimizedImage({
      file, bucket: 'public-images', ownerPrefix: ownerUserId, folder: 'hospital-doctors', preset: 'profile',
    });
    return result.path;
  } catch (error) {
    const wrapped = new Error('Unable to upload photo. Please try again.');
    (wrapped as Error & { cause?: unknown }).cause = error;
    throw wrapped;
  }
}

export async function cleanupHospitalDoctorPhoto(path: string | null | undefined) {
  return removeOptimizedImageVariants('public-images', path);
}
