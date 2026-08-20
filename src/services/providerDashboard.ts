import { requireSupabase } from '../lib/supabase';
import { uploadOptimizedImage } from './imageUpload';
import type { DoctorProviderInvitation, ProviderDashboardItem, ProviderDoctorSearchRow } from '../types';

export interface ProviderProfileInput {
  providerId: string | null;
  nameBn: string;
  nameEn: string | null;
  shortDescription: string | null;
  aboutBn: string | null;
  aboutEn: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  facebookUrl: string | null;
  websiteUrl: string | null;
  address: string | null;
  districtId: number | null;
  upazilaId: number | null;
  latitude: number | null;
  longitude: number | null;
  googleMapsUrl: string | null;
  openingNote: string | null;
  emergencyAvailable: boolean;
  departments: string[];
  services: string[];
  galleryPaths: string[];
}

export async function getMyProviderDashboard() {
  const { data, error } = await requireSupabase().rpc('get_my_provider_dashboard');
  if (error) throw error;
  return (data ?? []) as ProviderDashboardItem[];
}

export async function saveMyProviderProfile(input: ProviderProfileInput) {
  const { data, error } = await requireSupabase().rpc('save_my_provider_profile', {
    p_provider_id: input.providerId,
    p_name_bn: input.nameBn,
    p_name_en: input.nameEn,
    p_short_description: input.shortDescription,
    p_logo_url: input.logoUrl,
    p_banner_url: input.bannerUrl,
    p_phone: input.phone,
    p_whatsapp: input.whatsapp,
    p_email: input.email,
    p_facebook_url: input.facebookUrl,
    p_website_url: input.websiteUrl,
    p_address: input.address,
    p_district_id: input.districtId,
    p_upazila_id: input.upazilaId,
    p_latitude: input.latitude,
    p_longitude: input.longitude,
    p_google_maps_url: input.googleMapsUrl,
    p_opening_note: input.openingNote,
    p_emergency_available: input.emergencyAvailable,
    p_departments: input.departments,
    p_services: input.services,
    p_gallery_paths: input.galleryPaths,
  });
  if (error) throw error;
  const result = data as { provider_id: string; verification_reset: boolean };
  const { error: aboutError } = await requireSupabase().rpc('update_my_provider_about', {
    p_provider_id: result.provider_id,
    p_about_bn: input.aboutBn?.trim() || null,
    p_about_en: input.aboutEn?.trim() || null,
  });
  if (aboutError) throw aboutError;
  return result;
}

export async function uploadProviderMedia(file: File, userId: string, kind: 'logo' | 'banner' | 'gallery') {
  const preset = kind === 'logo' ? 'logo' : kind === 'banner' ? 'banner' : 'gallery';
  const result = await uploadOptimizedImage({
    file,
    bucket: 'public-images',
    ownerPrefix: userId,
    folder: `provider-${kind}`,
    preset,
  });
  return result.path;
}


export async function searchApprovedDoctorsForProvider(query: string) {
  const { data, error } = await requireSupabase().rpc('search_approved_doctors_for_provider', { p_query: query.trim() || null, p_limit: 20 });
  if (error) throw error;
  return (data ?? []) as ProviderDoctorSearchRow[];
}

export async function inviteDoctorToMyProvider(providerId: string, doctorId: string) {
  const { error } = await requireSupabase().rpc('invite_doctor_to_my_provider', { p_provider_id: providerId, p_doctor_id: doctorId });
  if (error) throw error;
}

export async function removeDoctorFromMyProvider(providerId: string, doctorId: string) {
  const { error } = await requireSupabase().rpc('remove_doctor_from_my_provider', { p_provider_id: providerId, p_doctor_id: doctorId });
  if (error) throw error;
}

export async function getMyDoctorProviderInvitations() {
  const { data, error } = await requireSupabase().rpc('get_my_doctor_provider_invitations');
  if (error) throw error;
  return (data ?? []) as DoctorProviderInvitation[];
}

export async function respondToProviderInvitation(providerId: string, accept: boolean) {
  const { error } = await requireSupabase().rpc('respond_to_provider_invitation', { p_provider_id: providerId, p_accept: accept });
  if (error) throw error;
}

export async function saveProviderDoctorSchedule(input: { providerId: string; doctorId: string; dayOfWeek: number; startTime: string; endTime: string; fee: number | null; isActive: boolean; scheduleId: string | null }) {
  const { data, error } = await requireSupabase().rpc('save_provider_doctor_schedule', {
    p_provider_id: input.providerId,
    p_doctor_id: input.doctorId,
    p_day_of_week: input.dayOfWeek,
    p_start_time: input.startTime,
    p_end_time: input.endTime,
    p_fee: input.fee,
    p_is_active: input.isActive,
    p_schedule_id: input.scheduleId,
  });
  if (error) throw error;
  return data as string;
}

export async function deleteProviderDoctorSchedule(providerId: string, scheduleId: string) {
  const { error } = await requireSupabase().rpc('delete_provider_doctor_schedule', { p_provider_id: providerId, p_schedule_id: scheduleId });
  if (error) throw error;
}
