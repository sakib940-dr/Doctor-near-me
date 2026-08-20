import { requireSupabase } from '../lib/supabase';
import type { LocalizedText, ProviderCost, ProviderService, ProviderSliderImage } from './providerWebsiteContent';

export interface ProviderOpeningHour {
  id: number;
  provider_id?: string;
  day_of_week: number;
  open_time: string | null;
  close_time: string | null;
  is_closed: boolean;
  is_24_hours: boolean;
  note: LocalizedText;
}

export interface ProviderPublicPageContent {
  provider_id: string;
  about_bn: string | null;
  about_en: string | null;
  slider_images: Array<Pick<ProviderSliderImage, 'id' | 'image' | 'caption' | 'sort_order'>>;
  opening_hours: ProviderOpeningHour[];
  services: Array<Pick<ProviderService, 'id' | 'name' | 'description' | 'icon' | 'image' | 'sort_order'>>;
  treatment_costs: Array<Pick<ProviderCost, 'id' | 'name' | 'cost' | 'sort_order'>>;
  investigation_costs: Array<Pick<ProviderCost, 'id' | 'name' | 'cost' | 'sort_order'>>;
}

export async function getProviderPublicPageContent(providerId: string) {
  const { data, error } = await requireSupabase().rpc('get_public_provider_page_content', {
    p_provider_id: providerId,
  });
  if (error) throw error;
  return (data ?? null) as ProviderPublicPageContent | null;
}

export async function getProviderDistance(providerId: string, latitude: number, longitude: number) {
  const { data, error } = await requireSupabase().rpc('get_public_provider_distance', {
    p_provider_id: providerId,
    p_lat: latitude,
    p_lon: longitude,
  });
  if (error) throw error;
  return data == null ? null : Number(data);
}
