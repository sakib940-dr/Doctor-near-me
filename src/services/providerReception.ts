import { requireSupabase } from '../lib/supabase';
import { uploadOptimizedImage } from './imageUpload';
import type { AppointmentStatus, ProviderManagedDoctorCard, ProviderReceptionAppointment, PublicContentPage } from '../types';

export async function getMyProviderManagedDoctorCards(providerId: string) {
  const { data, error } = await requireSupabase().rpc('get_my_provider_managed_doctor_cards', { p_provider_id: providerId });
  if (error) throw error;
  return (data ?? []) as ProviderManagedDoctorCard[];
}

export async function getPublicProviderManagedDoctorCards(providerId: string) {
  const { data, error } = await requireSupabase().rpc('get_public_provider_managed_doctor_cards', { p_provider_id: providerId });
  if (error) throw error;
  return (data ?? []) as ProviderManagedDoctorCard[];
}

export async function saveMyProviderManagedDoctorCard(input: Omit<ProviderManagedDoctorCard, 'id' | 'created_at' | 'updated_at'> & { id: string | null }) {
  const { data, error } = await requireSupabase().rpc('save_my_provider_managed_doctor_card', {
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
    p_is_active: input.is_active ?? true,
    p_sort_order: input.sort_order,
  });
  if (error) throw error;
  return data as string;
}

export async function deactivateMyProviderManagedDoctorCard(providerId: string, cardId: string) {
  const { data, error } = await requireSupabase().rpc('deactivate_my_provider_managed_doctor_card', { p_provider_id: providerId, p_card_id: cardId });
  if (error) throw error;
  return Boolean(data);
}

export async function uploadProviderManagedDoctorPhoto(file: File, ownerUserId: string) {
  const result = await uploadOptimizedImage({ file, bucket: 'public-images', ownerPrefix: ownerUserId, folder: 'provider-doctor-cards', preset: 'profile' });
  return result.path;
}

export async function createProviderReceptionAppointment(input: { doctorCardId: string; appointmentDate: string; preferredTime?: string | null; patientNote?: string | null }) {
  const { data, error } = await requireSupabase().rpc('create_provider_reception_appointment', {
    p_doctor_card_id: input.doctorCardId,
    p_appointment_date: input.appointmentDate,
    p_preferred_time: input.preferredTime || null,
    p_patient_note: input.patientNote?.trim() || null,
  });
  if (error) throw error;
  return data as string;
}

export async function getMyProviderReceptionAppointments(status?: AppointmentStatus | null) {
  const { data, error } = await requireSupabase().rpc('get_my_provider_reception_appointments', { p_status: status || null });
  if (error) throw error;
  return (data ?? []) as ProviderReceptionAppointment[];
}

export async function updateProviderReceptionAppointment(input: { appointmentId: string; status: AppointmentStatus; serialNumber?: number | null }) {
  const { data, error } = await requireSupabase().rpc('update_provider_reception_appointment', {
    p_appointment_id: input.appointmentId,
    p_status: input.status,
    p_serial_number: input.serialNumber ?? null,
  });
  if (error) throw error;
  return Boolean(data);
}

export async function getPublicContentPage(slug: 'terms' | 'privacy') {
  const { data, error } = await requireSupabase().rpc('get_public_content_page', { p_slug: slug });
  if (error) throw error;
  return (data ?? null) as PublicContentPage | null;
}
