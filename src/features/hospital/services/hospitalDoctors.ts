import { requireSupabase } from '../../../lib/supabase';
import { removeOptimizedImageVariants, uploadOptimizedImage } from '../../../services/imageUpload';
import type { HospitalDoctorCard, HospitalDoctorSearchRow, PublicHospitalDoctorProfile } from '../types';
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

export async function getPublicHospitalDoctorProfile(cardId: string) {
  const { data, error } = await requireSupabase().rpc('get_public_hospital_doctor_profile', { p_card_id: cardId });
  if (error) throw error;
  return (data ?? null) as PublicHospitalDoctorProfile | null;
}

export async function searchPublicHospitalDoctors(input: {
  query?: string; districtId?: number | null; upazilaId?: number | null; specialtyIds?: number[]; degrees?: string[];
  medicalTypes?: string[]; minFee?: number | null; maxFee?: number | null; availableToday?: boolean;
  sort?: string; limit?: number; offset?: number;
}) {
  const { data, error } = await requireSupabase().rpc('search_public_hospital_doctors', {
    p_query: input.query?.trim() || null,
    p_district_id: input.districtId ?? null,
    p_upazila_id: input.upazilaId ?? null,
    p_specialty_ids: input.specialtyIds?.length ? input.specialtyIds : null,
    p_degrees: input.degrees?.length ? input.degrees : null,
    p_medical_types: input.medicalTypes?.length ? input.medicalTypes : null,
    p_min_fee: input.minFee ?? null,
    p_max_fee: input.maxFee ?? null,
    p_available_today: input.availableToday ?? false,
    p_sort: input.sort ?? 'name',
    p_limit: Math.min(Math.max(input.limit ?? 20, 1), 20),
    p_offset: Math.max(input.offset ?? 0, 0),
  });
  if (error) throw error;
  return (data ?? []) as HospitalDoctorSearchRow[];
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

export async function uploadHospitalDoctorPhoto(file: File, providerId: string) {
  try {
    const { data: { user } } = await requireSupabase().auth.getUser();
    if (!user) throw new Error('UPLOAD_SESSION_REQUIRED');
    const result = await uploadOptimizedImage({
      file, bucket: 'public-images', ownerPrefix: user.id, folder: `${providerId}/hospital-doctors`, preset: 'profile', memorySafeDecode: true,
    });
    return result.path;
  } catch (error) {
    console.error('Hospital doctor photo compression/storage upload failed', error);
    const wrapped = new Error('Unable to upload photo. Please try again.');
    (wrapped as Error & { cause?: unknown }).cause = error;
    throw wrapped;
  }
}

export async function cleanupHospitalDoctorPhoto(path: string | null | undefined) {
  return removeOptimizedImageVariants('public-images', path);
}
