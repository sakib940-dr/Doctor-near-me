import { requireSupabase } from '../lib/supabase';
import { removeOptimizedImageVariants, uploadOptimizedImage } from './imageUpload';
import type { AdminCmsBanner, AdminCmsContentPage, AdminCmsSection, AdminCmsSnapshot, AdminCmsSpecialty, AdminCmsTopic, DegreeMasterItem } from '../types';

export async function getAdminCmsSnapshot() {
  const { data, error } = await requireSupabase().rpc('get_admin_cms_snapshot');
  if (error) throw error;
  return data as AdminCmsSnapshot;
}

export async function saveAdminSpecialty(item: Omit<AdminCmsSpecialty, 'id'> & { id?: number | null }) {
  const { data, error } = await requireSupabase().rpc('save_admin_specialty', {
    p_id: item.id ?? null, p_name_bn: item.name_bn, p_name_en: item.name_en,
    p_slug: item.slug, p_icon_url: item.icon_url || null,
    p_is_active: item.is_active, p_sort_order: item.sort_order,
  });
  if (error) throw error;
  return Number(data);
}

export async function saveAdminTopic(item: Omit<AdminCmsTopic, 'id'> & { id?: number | null }) {
  const { data, error } = await requireSupabase().rpc('save_admin_discovery_topic', {
    p_id: item.id ?? null, p_name_bn: item.name_bn, p_name_en: item.name_en || null,
    p_slug: item.slug, p_icon: null, p_description_bn: item.description_bn || null,
    p_search_keywords: item.search_keywords, p_specialty_ids: item.specialty_ids,
    p_is_active: item.is_active, p_sort_order: item.sort_order,
  });
  if (error) throw error;
  return Number(data);
}

export async function saveAdminSection(item: Omit<AdminCmsSection, 'id'> & { id?: string | null }) {
  const { data, error } = await requireSupabase().rpc('save_admin_homepage_section', {
    p_id: item.id ?? null, p_section_key: item.section_key, p_title_bn: item.title_bn,
    p_title_en: item.title_en || null, p_description_bn: item.description_bn || null,
    p_data_source: item.data_source, p_filter_config: item.filter_config,
    p_view_all_path: item.view_all_path || null, p_card_limit: item.card_limit,
    p_is_active: item.is_active, p_sort_order: item.sort_order,
  });
  if (error) throw error;
  return String(data);
}

export async function saveAdminBanner(item: Omit<AdminCmsBanner, 'id'> & { id?: string | null }) {
  const { data, error } = await requireSupabase().rpc('save_admin_homepage_banner', {
    p_id: item.id ?? null, p_title_bn: item.title_bn, p_title_en: item.title_en || null,
    p_subtitle_bn: item.subtitle_bn || null, p_subtitle_en: item.subtitle_en || null,
    p_image_path: item.image_path, p_image_alt_bn: item.image_alt_bn || null,
    p_target_url: item.target_url || null, p_district_id: item.district_id,
    p_starts_at: item.starts_at || null, p_ends_at: item.ends_at || null,
    p_is_active: item.is_active, p_sort_order: item.sort_order,
  });
  if (error) throw error;
  return String(data);
}

export async function uploadAdminBanner(file: File) {
  const client = requireSupabase();
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user) throw userError || new Error('Authentication required');
  const result = await uploadOptimizedImage({
    file,
    bucket: 'public-images',
    ownerPrefix: userData.user.id,
    folder: 'cms/banners',
    preset: 'banner',
  });
  return result.path;
}



const bannerImagePathPattern = /^[0-9a-f-]+\/cms\/banners\//i;

export async function deleteAdminBannerImage(path: string | null | undefined) {
  if (!path || /^https?:\/\//i.test(path) || !bannerImagePathPattern.test(path)) return false;
  await removeOptimizedImageVariants('public-images', path);
  return true;
}

export async function saveAdminContentPage(item: AdminCmsContentPage) {
  const { data, error } = await requireSupabase().rpc('save_admin_content_page', {
    p_slug: item.slug, p_title_bn: item.title_bn, p_title_en: item.title_en || null,
    p_body_bn: item.body_bn, p_body_en: item.body_en || null,
    p_seo_title: item.seo_title || null, p_meta_description: item.meta_description || null,
    p_is_published: item.is_published,
  });
  if (error) throw error;
  return String(data);
}

export async function saveAdminPublicSetting(key: string, value: Record<string, unknown>, isPublic: boolean) {
  const { data, error } = await requireSupabase().rpc('save_admin_public_setting', {
    p_setting_key: key, p_setting_value: value, p_is_public: isPublic,
  });
  if (error) throw error;
  return Boolean(data);
}

const specialtyImagePathPattern = /^[0-9a-f-]+\/cms\/specialties\//i;

export async function uploadAdminSpecialtyImage(file: File) {
  const client = requireSupabase();
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user) throw userError || new Error('Authentication required');
  const result = await uploadOptimizedImage({
    file,
    bucket: 'public-images',
    ownerPrefix: userData.user.id,
    folder: 'cms/specialties',
    preset: 'category',
  });
  return result.path;
}


export async function deleteAdminSpecialtyImage(path: string | null | undefined) {
  if (!path || /^https?:\/\//i.test(path) || !specialtyImagePathPattern.test(path)) return false;
  await removeOptimizedImageVariants('public-images', path);
  return true;
}


export async function getAdminPrescriptionFooter() {
  const { data, error } = await requireSupabase().rpc('get_prescription_footer');
  if (error) throw error;
  return typeof data === 'string' ? data : '';
}

export async function saveAdminPrescriptionFooter(text: string) {
  if (text.length > 500) throw new Error('Prescription footer সর্বোচ্চ 500 characters হতে পারবে।');
  const { data, error } = await requireSupabase().rpc('save_admin_prescription_footer', {
    p_text: text,
  });
  if (error) throw error;
  return Boolean(data);
}


export async function getAdminDegreeMaster() {
  const { data, error } = await requireSupabase().rpc('get_admin_degree_master');
  if (error) throw error;
  return (data ?? []) as DegreeMasterItem[];
}

export async function saveAdminDegreeMaster(item: DegreeMasterItem) {
  const { data, error } = await requireSupabase().rpc('save_admin_degree_master', {
    p_id: item.id || null,
    p_name: item.name,
    p_short_code: item.short_code,
    p_qualification_level: item.qualification_level,
    p_classification: item.classification,
    p_discipline: item.discipline,
    p_aliases: item.aliases,
    p_is_active: item.is_active ?? true,
    p_sort_order: item.sort_order,
  });
  if (error) throw error;
  return Number(data);
}

export async function getAdminDirectoryRankingPolicy() {
  const { data, error } = await requireSupabase().rpc('get_admin_directory_ranking_policy');
  if (error) throw error;
  const value = (data ?? {}) as Record<string, unknown>;
  return {
    new_entity_days: Number(value.new_entity_days ?? 30),
    near_me_distance_band_km: Number(value.near_me_distance_band_km ?? 5),
  };
}

export async function saveAdminDirectoryRankingPolicy(input: { newEntityDays: number; nearMeDistanceBandKm: number }) {
  const { data, error } = await requireSupabase().rpc('save_admin_directory_ranking_policy', {
    p_new_entity_days: input.newEntityDays,
    p_near_me_distance_band_km: input.nearMeDistanceBandKm,
  });
  if (error) throw error;
  return Boolean(data);
}
