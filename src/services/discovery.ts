import { requireSupabase } from '../lib/supabase';
import { publicCachedRequest } from '../lib/requestCache';
import type {
  AmbulanceSearchRow,
  DegreeMasterItem,
  District,
  DoctorSearchRow,
  DoctorPublicProfile,
  HomepageConfiguration,
  LocationResolution,
  ProviderDirectoryRow,
  Specialty,
  Upazila,
} from '../types';

const emptyHomepage: HomepageConfiguration = {
  sections: [],
  banners: [],
  topics: [],
  settings: {},
};

export async function getHomepageConfiguration(districtId?: number | null) {
  const key = `public:homepage:${districtId ?? 'all'}`;
  return publicCachedRequest(key, async () => {
    const { data, error } = await requireSupabase().rpc(
      'get_homepage_configuration',
      { p_district_id: districtId ?? null },
    );
    if (error) throw error;
    return (data ?? emptyHomepage) as HomepageConfiguration;
  }, 60_000);
}

export async function getDistricts() {
  return publicCachedRequest('public:districts', async () => {
    const { data, error } = await requireSupabase()
      .from('districts')
      .select('id,division_id,name_bn,name_en,slug')
      .eq('is_active', true)
      .order('name_bn');
    if (error) throw error;
    return (data ?? []) as District[];
  }, 15 * 60_000);
}

export async function getUpazilas(districtId: number) {
  return publicCachedRequest(`public:upazilas:${districtId}`, async () => {
    const { data, error } = await requireSupabase()
      .from('upazilas')
      .select('id,district_id,name_bn,name_en,slug')
      .eq('is_active', true)
      .eq('district_id', districtId)
      .order('name_bn');
    if (error) throw error;
    return (data ?? []) as Upazila[];
  }, 15 * 60_000);
}

export async function resolveLocationContext(latitude: number, longitude: number) {
  const key = `public:location-context:${latitude.toFixed(4)}:${longitude.toFixed(4)}`;
  return publicCachedRequest(key, async () => {
    const { data, error } = await requireSupabase().rpc('resolve_location_context', {
      p_lat: latitude,
      p_lon: longitude,
    });
    if (error) throw error;
    const rows = (data ?? []) as LocationResolution[];
    return rows[0] ?? null;
  }, 5 * 60_000);
}

export async function getSpecialties() {
  return publicCachedRequest('public:specialties', async () => {
    const { data, error } = await requireSupabase()
      .from('specialties')
      .select('id,name_bn,name_en,slug,icon_url,sort_order')
      .eq('is_active', true)
      .order('sort_order');
    if (error) throw error;
    return (data ?? []) as Specialty[];
  }, 15 * 60_000);
}

export async function getDegreeMaster() {
  return publicCachedRequest('public:degree-master', async () => {
    const { data, error } = await requireSupabase().rpc('get_active_degree_master');
    if (error) throw error;
    return (data ?? []) as DegreeMasterItem[];
  }, 30 * 60_000);
}


interface PublicSlugRow {
  target_type: 'doctor' | 'provider';
  target_id: string;
  slug: string;
}

export interface PublicProfileRoute {
  id: string;
  slug: string;
}

export async function getPublicProfileSlugs(input: { doctorIds?: string[]; providerIds?: string[] }) {
  const doctorIds = Array.from(new Set(input.doctorIds ?? [])).sort();
  const providerIds = Array.from(new Set(input.providerIds ?? [])).sort();
  if (!doctorIds.length && !providerIds.length) return [] as PublicSlugRow[];
  const key = `public:slugs:d=${doctorIds.join(',')}:p=${providerIds.join(',')}`;
  return publicCachedRequest(key, async () => {
    const { data, error } = await requireSupabase().rpc('get_public_profile_slugs', {
      p_doctor_ids: doctorIds.length ? doctorIds : null,
      p_provider_ids: providerIds.length ? providerIds : null,
    });
    if (error) throw error;
    return (data ?? []) as PublicSlugRow[];
  }, 5 * 60_000);
}

function mapDoctorSearchRow(row: Record<string, unknown>): DoctorSearchRow {
  return {
    doctor_id: String(row.doctor_id),
    profile_slug: (row.profile_slug as string | null) ?? null,
    doctor_name: String(row.doctor_name ?? ''),
    avatar_url: (row.avatar_url as string | null) ?? null,
    degree: (row.degree as string | null) ?? null,
    designation: (row.designation as string | null) ?? null,
    professional_title: (row.professional_title as string | null) ?? null,
    bmdc_registration_no: (row.bmdc_registration_no as string | null) ?? null,
    medical_college: (row.medical_college as string | null) ?? null,
    present_job: (row.present_job as string | null) ?? null,
    consultation_fee: row.consultation_fee == null ? null : Number(row.consultation_fee),
    experience_years: row.experience_years == null ? null : Number(row.experience_years),
    district_id: row.district_id == null ? null : Number(row.district_id),
    district_name_bn: (row.district_name_bn as string | null) ?? null,
    upazila_id: row.upazila_id == null ? null : Number(row.upazila_id),
    upazila_name_bn: (row.upazila_name_bn as string | null) ?? null,
    specialties: Array.isArray(row.specialties) ? row.specialties as DoctorSearchRow['specialties'] : [],
    available_today: Boolean(row.available_today),
    total_count: Number(row.total_count ?? 0),
    distance_km: row.distance_km == null ? null : Number(row.distance_km),
    nearest_provider_id: (row.nearest_provider_id as string | null) ?? null,
    nearest_provider_name: (row.nearest_provider_name as string | null) ?? null,
    nearest_provider_type: (row.nearest_provider_type as string | null) ?? null,
    nearest_provider_address: (row.nearest_provider_address as string | null) ?? null,
    nearest_provider_latitude: row.nearest_provider_latitude == null ? null : Number(row.nearest_provider_latitude),
    nearest_provider_longitude: row.nearest_provider_longitude == null ? null : Number(row.nearest_provider_longitude),
    verification_status: (row.verification_status as DoctorSearchRow['verification_status']) ?? 'pending',
    provider_schedules: Array.isArray(row.schedules) ? row.schedules as DoctorSearchRow['provider_schedules'] : [],
  };
}

export async function searchDoctors(input: {
  query?: string;
  districtId?: number | null;
  upazilaId?: number | null;
  specialtyIds?: number[];
  degrees?: string[];
  minFee?: number | null;
  maxFee?: number | null;
  availableToday?: boolean;
  sort?: 'name' | 'newest' | 'fee_low' | 'fee_high';
  limit?: number;
  offset?: number;
}) {
  const normalized = {
    ...input,
    query: input.query?.trim() || '',
    specialtyIds: [...(input.specialtyIds ?? [])].sort((a,b)=>a-b),
    degrees: [...(input.degrees ?? [])].sort(),
    limit: Math.min(Math.max(input.limit ?? 20, 1), 20),
    offset: Math.max(input.offset ?? 0, 0),
  };
  const key = `public:doctor-search:${JSON.stringify(normalized)}`;
  return publicCachedRequest(key, async () => {
    const { data, error } = await requireSupabase().rpc(
      'get_public_doctor_search_cards',
      {
        p_query: normalized.query || null,
        p_district_id: input.districtId ?? null,
        p_upazila_id: input.upazilaId ?? null,
        p_specialty_ids: normalized.specialtyIds.length ? normalized.specialtyIds : null,
        p_degrees: normalized.degrees.length ? normalized.degrees : null,
        p_min_fee: input.minFee ?? null,
        p_max_fee: input.maxFee ?? null,
        p_available_today: input.availableToday ?? false,
        p_sort: input.sort ?? 'name',
        p_limit: normalized.limit,
        p_offset: normalized.offset,
      },
    );
    if (error) throw error;
    return ((data ?? []) as Array<Record<string, unknown>>).map(mapDoctorSearchRow);
  }, 20_000);
}


export async function getHomepagePrimaryDoctorSections(input: {
  districtId?: number | null;
  upazilaId?: number | null;
  limit?: number;
}) {
  const limit = Math.min(Math.max(input.limit ?? 8, 1), 8);
  const key = `public:homepage-primary-doctors:${input.districtId ?? 'all'}:${input.upazilaId ?? 'all'}:${limit}`;
  return publicCachedRequest(key, async () => {
    const { data, error } = await requireSupabase().rpc('get_public_homepage_primary_doctors', {
      p_district_id: input.districtId ?? null,
      p_upazila_id: input.upazilaId ?? null,
      p_limit: limit,
    });
    if (error) throw error;
    const raw = (data ?? {}) as { ranked?: Array<Record<string, unknown>>; general?: Array<Record<string, unknown>>; specialist?: Array<Record<string, unknown>> };
    return {
      ranked: (raw.ranked ?? []).map(mapDoctorSearchRow),
      general: (raw.general ?? []).map(mapDoctorSearchRow),
      specialist: (raw.specialist ?? []).map(mapDoctorSearchRow),
    };
  }, 30_000);
}

export async function getHomepageSecondaryDoctorSections(input: {
  districtId?: number | null;
  upazilaId?: number | null;
  topics: Array<{ id: number; name_bn: string; specialty_ids: number[] }>;
  marketplaceLimit?: number;
  topicLimit?: number;
}) {
  const topics = input.topics.slice(0, 5);
  const positiveTopicIds = topics.filter((topic) => topic.id > 0).map((topic) => topic.id);
  const marketplaceLimit = Math.min(Math.max(input.marketplaceLimit ?? 8, 1), 8);
  const topicLimit = Math.min(Math.max(input.topicLimit ?? 7, 1), 7);
  const key = `public:homepage-secondary-doctors:${input.districtId ?? 'all'}:${input.upazilaId ?? 'all'}:${positiveTopicIds.join(',')}:${marketplaceLimit}:${topicLimit}`;
  const bundled = await publicCachedRequest(key, async () => {
    const { data, error } = await requireSupabase().rpc('get_public_homepage_secondary_doctors', {
      p_district_id: input.districtId ?? null,
      p_upazila_id: input.upazilaId ?? null,
      p_topic_ids: positiveTopicIds,
      p_marketplace_limit: marketplaceLimit,
      p_topic_limit: topicLimit,
    });
    if (error) throw error;
    const raw = (data ?? {}) as { premium?: Array<Record<string, unknown>>; new?: Array<Record<string, unknown>>; topics?: Record<string, Array<Record<string, unknown>>> };
    const topicRows: Record<number, DoctorSearchRow[]> = {};
    Object.entries(raw.topics ?? {}).forEach(([topicId, rows]) => { topicRows[Number(topicId)] = (rows ?? []).map(mapDoctorSearchRow); });
    return { premium: (raw.premium ?? []).map(mapDoctorSearchRow), new: (raw.new ?? []).map(mapDoctorSearchRow), topics: topicRows };
  }, 30_000);

  const fallbackTopics = topics.filter((topic) => topic.id <= 0);
  if (!fallbackTopics.length) return bundled;
  const fallbackEntries = await Promise.all(fallbackTopics.map(async (topic) => [topic.id, await searchDoctors({
    query: topic.specialty_ids.length ? undefined : topic.name_bn,
    specialtyIds: topic.specialty_ids,
    districtId: input.districtId ?? null,
    upazilaId: input.upazilaId ?? null,
    limit: topicLimit,
    sort: 'name',
  })] as const));
  const mergedTopics = { ...bundled.topics };
  fallbackEntries.forEach(([topicId, rows]) => { mergedTopics[topicId] = rows; });
  return { ...bundled, topics: mergedTopics };
}

export async function getMarketplaceDoctors(input: {
  districtId?: number | null;
  upazilaId?: number | null;
  mode?: 'ranked' | 'premium' | 'new' | 'general' | 'general_dental' | 'specialist';
  limit?: number;
}) {
  const limit = Math.min(Math.max(input.limit ?? 8, 1), 12);
  const key = `public:marketplace:${input.districtId ?? 'all'}:${input.upazilaId ?? 'all'}:${input.mode ?? 'ranked'}:${limit}`;
  return publicCachedRequest(key, async () => {
    const { data, error } = await requireSupabase().rpc('get_public_marketplace_doctors_v2', {
      p_district_id: input.districtId ?? null,
      p_upazila_id: input.upazilaId ?? null,
      p_mode: input.mode ?? 'ranked',
      p_limit: limit,
    });
    if (error) throw error;
    return ((data ?? []) as Array<Record<string, unknown>>).map(mapDoctorSearchRow);
  }, 30_000);
}

export async function getPublicProviders(input: {
  districtId?: number | null;
  upazilaId?: number | null;
  limit?: number;
  offset?: number;
} = {}) {
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 20);
  const offset = Math.max(input.offset ?? 0, 0);
  const key = `public:providers:${input.districtId ?? 'all'}:${input.upazilaId ?? 'all'}:${limit}:${offset}`;
  return publicCachedRequest(key, async () => {
    const { data, error } = await requireSupabase().rpc('get_public_ranked_providers', {
      p_district_id: input.districtId ?? null,
      p_upazila_id: input.upazilaId ?? null,
      p_limit: limit,
      p_offset: offset,
    });
    if (error) throw error;
    return ((data ?? []) as ProviderDirectoryRow[]).map((row) => ({
      ...row,
      latitude: row.latitude == null ? null : Number(row.latitude),
      longitude: row.longitude == null ? null : Number(row.longitude),
      district_id: row.district_id == null ? null : Number(row.district_id),
      upazila_id: row.upazila_id == null ? null : Number(row.upazila_id),
    }));
  }, 30_000);
}

const PUBLIC_PROVIDER_COLUMNS = 'id,provider_type,name_bn,name_en,slug,logo_url,banner_url,phone,address,district_id,upazila_id,latitude,longitude,map_url,verified,short_description,whatsapp,email,facebook_url,website_url,opening_note,emergency_available';

export async function getPublicProviderBySlug(slug: string) {
  const value = slug.trim().toLowerCase();
  return publicCachedRequest(`public:provider-by-slug:${value}`, async () => {
    const { data, error } = await requireSupabase().from('public_provider_directory').select(PUBLIC_PROVIDER_COLUMNS).eq('slug', value).maybeSingle();
    if (error) throw error;
    return (data ?? null) as unknown as ProviderDirectoryRow | null;
  }, 60_000);
}

export async function getPublicProvider(providerId: string) {
  return publicCachedRequest(`public:provider-by-id:${providerId}`, async () => {
    const { data, error } = await requireSupabase().from('public_provider_directory').select(PUBLIC_PROVIDER_COLUMNS).eq('id', providerId).maybeSingle();
    if (error) throw error;
    return (data ?? null) as unknown as ProviderDirectoryRow | null;
  }, 60_000);
}

export async function getDoctorsForProvider(providerId: string, limit = 20, offset = 0) {
  const safeLimit = Math.min(Math.max(limit, 1), 50);
  const safeOffset = Math.max(offset, 0);
  const key = `public:provider-doctors:${providerId}:${safeLimit}:${safeOffset}`;
  return publicCachedRequest(key, async () => {
    const { data, error } = await requireSupabase().rpc('get_public_provider_doctors_v3', {
      p_provider_id: providerId,
      p_limit: safeLimit,
      p_offset: safeOffset,
    });
    if (error) throw error;
    return ((data ?? []) as Array<Record<string, unknown>>).map(mapDoctorSearchRow);
  }, 30_000);
}

export async function resolvePublicDoctorRoute(identifier: string) {
  const value = identifier.trim().toLowerCase();
  if (!value) return null;
  return publicCachedRequest(`public:doctor-route:${value}`, async () => {
    const { data, error } = await requireSupabase().rpc('resolve_public_doctor_route', { p_identifier: value });
    if (error) throw error;
    const route = (data ?? null) as { id?: string; slug?: string } | null;
    if (!route?.id || !route.slug) return null;
    return { id: route.id, slug: route.slug } as PublicProfileRoute;
  }, 5 * 60_000);
}

export async function resolvePublicDoctorId(identifier: string) {
  return (await resolvePublicDoctorRoute(identifier))?.id ?? null;
}

export async function resolvePublicProviderRoute(identifier: string) {
  const value = identifier.trim().toLowerCase();
  if (!value) return null;
  return publicCachedRequest(`public:provider-route:${value}`, async () => {
    const { data, error } = await requireSupabase().rpc('resolve_public_provider_route', { p_identifier: value });
    if (error) throw error;
    const route = (data ?? null) as { id?: string; slug?: string } | null;
    if (!route?.id || !route.slug) return null;
    return { id: route.id, slug: route.slug } as PublicProfileRoute;
  }, 5 * 60_000);
}

export async function getDoctorPublicProfile(doctorId: string) {
  return publicCachedRequest(`public:doctor-profile:${doctorId}`, async () => {
    const { data, error } = await requireSupabase().rpc('get_doctor_public_profile', { p_doctor_id: doctorId });
    if (error) throw error;
    return (data ?? null) as DoctorPublicProfile | null;
  }, 60_000);
}

export interface PublicDoctorPageBase {
  route: PublicProfileRoute;
  profile: DoctorPublicProfile | null;
  content: import('../types').DoctorPublicContent | null;
}

export async function getPublicDoctorPageBase(identifier: string) {
  const value = identifier.trim().toLowerCase();
  if (!value) return null;
  return publicCachedRequest(`public:doctor-page-base:${value}`, async () => {
    const { data, error } = await requireSupabase().rpc('get_public_doctor_page_base', { p_identifier: value });
    if (error) throw error;
    return (data ?? null) as PublicDoctorPageBase | null;
  }, 60_000);
}

export interface PublicProviderPageBase {
  route: PublicProfileRoute;
  provider: ProviderDirectoryRow;
  content: import('./providerPublicContent').ProviderPublicPageContent | null;
  doctors: DoctorSearchRow[];
}

export async function getPublicProviderPageBase(identifier: string, doctorLimit = 10) {
  const value = identifier.trim().toLowerCase();
  if (!value) return null;
  const limit = Math.min(Math.max(doctorLimit, 1), 20);
  return publicCachedRequest(`public:provider-page-base:${value}:${limit}`, async () => {
    const { data, error } = await requireSupabase().rpc('get_public_provider_page_base', { p_identifier: value, p_doctor_limit: limit });
    if (error) throw error;
    const raw = (data ?? null) as { route?: PublicProfileRoute; provider?: ProviderDirectoryRow; content?: import('./providerPublicContent').ProviderPublicPageContent | null; doctors?: Array<Record<string, unknown>> } | null;
    if (!raw?.route || !raw.provider) return null;
    const doctors = (raw.doctors ?? []).map(mapDoctorSearchRow);
    return { route: raw.route, provider: raw.provider, content: raw.content ?? null, doctors } as PublicProviderPageBase;
  }, 60_000);
}



export async function findNearestDoctors(input: {
  latitude: number;
  longitude: number;
  radiusKm?: number;
  districtId?: number | null;
  upazilaId?: number | null;
  limit?: number;
  offset?: number;
}) {
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 20);
  const offset = Math.max(input.offset ?? 0, 0);
  const key = `public:near:${input.latitude.toFixed(4)}:${input.longitude.toFixed(4)}:${input.radiusKm ?? 50}:${input.districtId ?? 'all'}:${input.upazilaId ?? 'all'}:${limit}:${offset}`;
  return publicCachedRequest(key, async () => {
    const { data, error } = await requireSupabase().rpc('get_public_nearest_doctors_v2', {
      p_lat: input.latitude,
      p_lon: input.longitude,
      p_radius_km: input.radiusKm ?? 50,
      p_district_id: input.districtId ?? null,
      p_upazila_id: input.upazilaId ?? null,
      p_limit: limit,
      p_offset: offset,
    });
    if (error) throw error;
    return ((data ?? []) as Array<Record<string, unknown>>).map(mapDoctorSearchRow);
  }, 20_000);
}

export async function saveMyCurrentLocation(input: {
  latitude: number;
  longitude: number;
  accuracyMeters?: number | null;
  districtId?: number | null;
  upazilaId?: number | null;
  saveHistory?: boolean;
}) {
  const { data, error } = await requireSupabase().rpc('update_my_current_location', {
    p_latitude: input.latitude,
    p_longitude: input.longitude,
    p_district_id: input.districtId ?? null,
    p_upazila_id: input.upazilaId ?? null,
    p_accuracy_meters: input.accuracyMeters ?? null,
    p_source: 'gps',
    p_save_history: input.saveHistory ?? true,
  });
  if (error) throw error;
  return Boolean(data);
}

export async function searchAmbulances(input: {
  districtId?: number | null;
  upazilaId?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  radiusKm?: number | null;
}) {
  const key = `public:ambulances:${input.districtId ?? 'all'}:${input.upazilaId ?? 'all'}:${input.latitude?.toFixed(4) ?? 'none'}:${input.longitude?.toFixed(4) ?? 'none'}:${input.radiusKm ?? 'default'}`;
  return publicCachedRequest(key, async () => {
    const { data, error } = await requireSupabase().rpc('search_ambulances', {
      p_district_id: input.districtId ?? null,
      p_upazila_id: input.upazilaId ?? null,
      p_vehicle_types: null,
      p_available_only: true,
      p_latitude: input.latitude ?? null,
      p_longitude: input.longitude ?? null,
      p_radius_km: input.radiusKm ?? null,
      p_limit: 20,
      p_offset: 0,
    });
    if (error) throw error;
    return (data ?? []) as AmbulanceSearchRow[];
  }, 10_000);
}
