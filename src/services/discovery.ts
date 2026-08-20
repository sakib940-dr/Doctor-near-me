import { requireSupabase } from '../lib/supabase';
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
  const { data, error } = await requireSupabase().rpc(
    'get_homepage_configuration',
    { p_district_id: districtId ?? null },
  );
  if (error) throw error;
  return (data ?? emptyHomepage) as HomepageConfiguration;
}

export async function getDistricts() {
  const { data, error } = await requireSupabase()
    .from('districts')
    .select('id,division_id,name_bn,name_en,slug')
    .eq('is_active', true)
    .order('name_bn');
  if (error) throw error;
  return (data ?? []) as District[];
}

export async function getUpazilas(districtId: number) {
  const { data, error } = await requireSupabase()
    .from('upazilas')
    .select('id,district_id,name_bn,name_en,slug')
    .eq('is_active', true)
    .eq('district_id', districtId)
    .order('name_bn');
  if (error) throw error;
  return (data ?? []) as Upazila[];
}

export async function resolveLocationContext(latitude: number, longitude: number) {
  const { data, error } = await requireSupabase().rpc('resolve_location_context', {
    p_lat: latitude,
    p_lon: longitude,
  });
  if (error) throw error;
  const rows = (data ?? []) as LocationResolution[];
  return rows[0] ?? null;
}

export async function getSpecialties() {
  const { data, error } = await requireSupabase()
    .from('specialties')
    .select('id,name_bn,name_en,slug,icon_url,sort_order')
    .eq('is_active', true)
    .order('sort_order');
  if (error) throw error;
  return (data ?? []) as Specialty[];
}


export async function getDegreeMaster() {
  const { data, error } = await requireSupabase().rpc('get_active_degree_master');
  if (error) throw error;
  return (data ?? []) as DegreeMasterItem[];
}


interface PublicDoctorVisitingCardRow {
  doctor_id: string;
  doctor_name: string;
  avatar_url: string | null;
  degree: string | null;
  professional_title: string | null;
  designation: string | null;
  bmdc_registration_no: string | null;
  medical_college: string | null;
  present_job: string | null;
  verification_status: 'pending' | 'approved' | 'rejected' | 'expired';
}

interface PublicDoctorCardContextRow {
  doctor_id: string;
  provider_id: string | null;
  provider_name: string | null;
  provider_type: string | null;
  provider_address: string | null;
  provider_latitude: number | null;
  provider_longitude: number | null;
}

async function hydrateDoctorVisitingCards(rows: DoctorSearchRow[]) {
  if (!rows.length) return rows;
  const ids = Array.from(new Set(rows.map((row) => row.doctor_id)));
  const client = requireSupabase();
  const [cardResult, contextResult] = await Promise.all([
    client.rpc('get_public_doctor_visiting_cards', { p_doctor_ids: ids }),
    client.rpc('get_public_doctor_card_context', { p_doctor_ids: ids }),
  ]);

  // Never infer a Verified badge client-side. If canonical hydration is
  // temporarily unavailable, fail closed while keeping the directory usable.
  const byDoctor = new Map(
    cardResult.error ? [] : ((cardResult.data ?? []) as PublicDoctorVisitingCardRow[]).map((item) => [item.doctor_id, item]),
  );
  const byContext = new Map(
    contextResult.error ? [] : ((contextResult.data ?? []) as PublicDoctorCardContextRow[]).map((item) => [item.doctor_id, item]),
  );

  return rows.map((row) => {
    const card = byDoctor.get(row.doctor_id);
    const context = byContext.get(row.doctor_id);
    return {
      ...row,
      doctor_name: card?.doctor_name || row.doctor_name,
      avatar_url: card?.avatar_url ?? row.avatar_url,
      degree: card?.degree ?? row.degree,
      professional_title: card?.professional_title ?? row.professional_title,
      designation: card?.designation ?? row.designation,
      bmdc_registration_no: card?.bmdc_registration_no ?? row.bmdc_registration_no ?? null,
      medical_college: card?.medical_college ?? row.medical_college ?? null,
      present_job: card?.present_job ?? row.present_job ?? null,
      verification_status: card?.verification_status ?? row.verification_status ?? 'pending',
      nearest_provider_id: row.nearest_provider_id ?? context?.provider_id ?? null,
      nearest_provider_name: row.nearest_provider_name ?? context?.provider_name ?? null,
      nearest_provider_type: row.nearest_provider_type ?? context?.provider_type ?? null,
      nearest_provider_address: row.nearest_provider_address ?? context?.provider_address ?? null,
      nearest_provider_latitude: row.nearest_provider_latitude ?? context?.provider_latitude ?? null,
      nearest_provider_longitude: row.nearest_provider_longitude ?? context?.provider_longitude ?? null,
    };
  });
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
  const { data, error } = await requireSupabase().rpc(
    'search_doctors_advanced',
    {
      p_query: input.query?.trim() || null,
      p_district_id: input.districtId ?? null,
      p_upazila_id: input.upazilaId ?? null,
      p_specialty_ids: input.specialtyIds?.length
        ? input.specialtyIds
        : null,
      p_degrees: input.degrees?.length ? input.degrees : null,
      p_designations: null,
      p_min_fee: input.minFee ?? null,
      p_max_fee: input.maxFee ?? null,
      p_available_today: input.availableToday ?? false,
      p_sort: input.sort ?? 'name',
      p_limit: input.limit ?? 20,
      p_offset: input.offset ?? 0,
    },
  );
  if (error) throw error;
  const rows = (data ?? []) as DoctorSearchRow[];
  return hydrateDoctorVisitingCards(rows);

}


export async function getMarketplaceDoctors(input: {
  districtId?: number | null;
  upazilaId?: number | null;
  mode?: 'ranked' | 'premium' | 'new' | 'general' | 'general_dental' | 'specialist';
  limit?: number;
}) {
  const { data, error } = await requireSupabase().rpc('get_public_marketplace_doctors', {
    p_district_id: input.districtId ?? null,
    p_upazila_id: input.upazilaId ?? null,
    p_mode: input.mode ?? 'ranked',
    p_limit: input.limit ?? 10,
  });
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    doctor_id: String(row.doctor_id),
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
    available_today: false,
    total_count: Number(row.total_count ?? 0),
    distance_km: null,
    nearest_provider_id: (row.nearest_provider_id as string | null) ?? null,
    nearest_provider_name: (row.nearest_provider_name as string | null) ?? null,
    nearest_provider_type: null,
    nearest_provider_address: (row.nearest_provider_address as string | null) ?? null,
    nearest_provider_latitude: null,
    nearest_provider_longitude: null,
    verification_status: (row.verification_status as DoctorSearchRow['verification_status']) ?? 'pending',
  })) satisfies DoctorSearchRow[];
}

export async function getPublicProviders(input: {
  districtId?: number | null;
  upazilaId?: number | null;
  limit?: number;
  offset?: number;
} = {}) {
  const { data, error } = await requireSupabase().rpc('get_public_ranked_providers', {
    p_district_id: input.districtId ?? null,
    p_upazila_id: input.upazilaId ?? null,
    p_limit: input.limit ?? 20,
    p_offset: input.offset ?? 0,
  });
  if (error) throw error;
  return ((data ?? []) as ProviderDirectoryRow[]).map((row) => ({
    ...row,
    latitude: row.latitude == null ? null : Number(row.latitude),
    longitude: row.longitude == null ? null : Number(row.longitude),
    district_id: row.district_id == null ? null : Number(row.district_id),
    upazila_id: row.upazila_id == null ? null : Number(row.upazila_id),
  }));
}

export async function getPublicProviderBySlug(slug: string) {
  const { data, error } = await requireSupabase()
    .from('public_provider_directory')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as ProviderDirectoryRow | null;
}

export async function getPublicProvider(providerId: string) {
  const { data, error } = await requireSupabase()
    .from('public_provider_directory')
    .select('*')
    .eq('id', providerId)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as ProviderDirectoryRow | null;
}

interface PublicProviderDoctorRpcRow {
  doctor_id: string;
  doctor_name: string;
  avatar_url: string | null;
  degree: string | null;
  designation: string | null;
  professional_title: string | null;
  bmdc_registration_no: string | null;
  consultation_fee: number | null;
  experience_years: number | null;
  district_id: number | null;
  district_name_bn: string | null;
  upazila_id: number | null;
  upazila_name_bn: string | null;
  specialties: DoctorSearchRow['specialties'] | null;
  available_today: boolean;
  schedules?: Array<{ day_of_week: number; start_time: string; end_time: string; fee: number | null; note?: { bn?: string | null; en?: string | null } | null }> | null;
  total_count?: number;
}

export async function getDoctorsForProvider(providerId: string) {
  const { data, error } = await requireSupabase().rpc(
    'get_public_provider_doctors_v2',
    { p_provider_id: providerId },
  );
  if (error) throw error;

  const rows = (data ?? []) as PublicProviderDoctorRpcRow[];
  const mapped = rows.map((row): DoctorSearchRow => ({
    doctor_id: row.doctor_id,
    doctor_name: row.doctor_name,
    avatar_url: row.avatar_url,
    degree: row.degree,
    designation: row.designation,
    professional_title: row.professional_title,
    bmdc_registration_no: row.bmdc_registration_no,
    consultation_fee: row.consultation_fee,
    experience_years: row.experience_years,
    district_id: row.district_id,
    district_name_bn: row.district_name_bn,
    upazila_id: row.upazila_id,
    upazila_name_bn: row.upazila_name_bn,
    specialties: row.specialties ?? [],
    available_today: row.available_today,
    total_count: Number(row.total_count ?? rows.length),
    provider_schedules: row.schedules ?? [],
  }));
  return hydrateDoctorVisitingCards(mapped);
}

export async function getDoctorPublicProfile(doctorId: string) {
  const { data, error } = await requireSupabase().rpc(
    'get_doctor_public_profile',
    { p_doctor_id: doctorId },
  );
  if (error) throw error;
  return (data ?? null) as DoctorPublicProfile | null;
}



interface NearestDoctorRpcRow {
  doctor_id: string;
  provider_id: string;
  doctor_name: string;
  degree: string | null;
  designation: string | null;
  consultation_fee: number | null;
  provider_name: string;
  provider_type: string;
  address: string | null;
  district_id: number | null;
  upazila_id: number | null;
  latitude: number | null;
  longitude: number | null;
  distance_km: number;
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
  const { data, error } = await requireSupabase().rpc('nearest_doctors', {
    p_lat: input.latitude,
    p_lon: input.longitude,
    p_radius_km: input.radiusKm ?? 50,
    p_district_id: input.districtId ?? null,
    p_upazila_id: input.upazilaId ?? null,
    p_limit: Math.min((input.limit ?? 20) * 4, 100),
    p_offset: input.offset ?? 0,
  });
  if (error) throw error;
  const rawRows = (data ?? []) as NearestDoctorRpcRow[];
  // One doctor can have multiple approved chambers. The RPC is distance-sorted,
  // so keep only the first row per doctor = that doctor's nearest chamber.
  const seen = new Set<string>();
  const rows = rawRows.filter((row) => {
    if (seen.has(row.doctor_id)) return false;
    seen.add(row.doctor_id);
    return true;
  }).slice(0, input.limit ?? 20);

  // The location RPC intentionally returns only location-safe core fields.
  // Reuse the existing public-profile RPC to hydrate photo/specialty/BMDC
  // without changing any SQL or exposing private profile data.
  return Promise.all(rows.map(async (row): Promise<DoctorSearchRow> => {
    let profile: DoctorPublicProfile | null = null;
    try { profile = await getDoctorPublicProfile(row.doctor_id); } catch { profile = null; }
    return {
      doctor_id: row.doctor_id,
      doctor_name: profile?.doctor.name || row.doctor_name,
      avatar_url: profile?.doctor.avatar_url ?? null,
      degree: profile?.doctor.degree ?? row.degree,
      designation: profile?.doctor.designation ?? row.designation,
      professional_title: profile?.doctor.professional_title ?? null,
      bmdc_registration_no: profile?.doctor.bmdc_registration_no ?? null,
      medical_college: profile?.doctor.medical_college ?? null,
      present_job: profile?.doctor.present_job ?? null,
      consultation_fee: profile?.doctor.consultation_fee ?? row.consultation_fee,
      experience_years: profile?.doctor.experience_years ?? null,
      district_id: row.district_id,
      district_name_bn: null,
      upazila_id: row.upazila_id,
      upazila_name_bn: null,
      specialties: (profile?.specialties ?? []).map((item, index) => ({
        id: item.id,
        name_bn: item.name_bn,
        name_en: item.name_en,
        slug: '',
        is_primary: index === 0,
      })),
      available_today: false,
      total_count: rows.length,
      distance_km: row.distance_km,
      nearest_provider_id: row.provider_id,
      nearest_provider_name: row.provider_name,
      nearest_provider_type: row.provider_type,
      nearest_provider_address: row.address,
      nearest_provider_latitude: row.latitude,
      nearest_provider_longitude: row.longitude,
      verification_status: profile?.doctor.verification_status ?? 'pending',
    };
  }));
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
}
