import { requireSupabase } from '../lib/supabase';
import { removeOptimizedImageVariants, uploadOptimizedImage } from './imageUpload';
import type { ProviderDashboardItem } from '../types';

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



export async function cleanupProviderMedia(path: string | null | undefined) {
  return removeOptimizedImageVariants('public-images', path);
}
