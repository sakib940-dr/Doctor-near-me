import { requireSupabase } from '../lib/supabase';
import type {
  AmbulanceSearchRow,
  District,
  DoctorSearchRow,
  DoctorPublicProfile,
  HomepageConfiguration,
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

export async function getSpecialties() {
  const { data, error } = await requireSupabase()
    .from('specialties')
    .select('id,name_bn,name_en,slug,sort_order')
    .eq('is_active', true)
    .order('sort_order');
  if (error) throw error;
  return (data ?? []) as Specialty[];
}

export async function searchDoctors(input: {
  query?: string;
  districtId?: number | null;
  upazilaId?: number | null;
  specialtyIds?: number[];
  degrees?: string[];
  designations?: string[];
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
      p_designations: input.designations?.length
        ? input.designations
        : null,
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
  if (!rows.length) return rows;

  const ids = rows.map((row) => row.doctor_id);
  const { data: directoryRows } = await requireSupabase()
    .from('public_doctor_directory')
    .select('doctor_id,bmdc_registration_no')
    .in('doctor_id', ids);
  const bmdcByDoctor = new Map((directoryRows ?? []).map((row) => [String(row.doctor_id), row.bmdc_registration_no as string | null]));
  return rows.map((row) => ({ ...row, bmdc_registration_no: bmdcByDoctor.get(row.doctor_id) ?? null }));

}

export async function getPublicProviders(input: {
  districtId?: number | null;
  upazilaId?: number | null;
  limit?: number;
} = {}) {
  let query = requireSupabase()
    .from('public_provider_directory')
    .select('id,provider_type,name_bn,name_en,slug,logo_url,banner_url,phone,address,district_id,upazila_id,latitude,longitude,map_url,verified')
    .order('name_bn')
    .limit(input.limit ?? 20);
  if (input.districtId) query = query.eq('district_id', input.districtId);
  if (input.upazilaId) query = query.eq('upazila_id', input.upazilaId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as ProviderDirectoryRow[];
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
    .select('id,provider_type,name_bn,name_en,slug,logo_url,banner_url,phone,address,district_id,upazila_id,latitude,longitude,map_url,verified')
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
}

export async function getDoctorsForProvider(providerId: string) {
  const { data, error } = await requireSupabase().rpc(
    'get_public_provider_doctors',
    { p_provider_id: providerId },
  );
  if (error) throw error;

  const rows = (data ?? []) as PublicProviderDoctorRpcRow[];
  return rows.map((row): DoctorSearchRow => ({
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
    total_count: rows.length,
  }));
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
}) {
  const { data, error } = await requireSupabase().rpc('search_ambulances', {
    p_district_id: input.districtId ?? null,
    p_upazila_id: null,
    p_vehicle_types: null,
    p_available_only: true,
    p_latitude: null,
    p_longitude: null,
    p_radius_km: null,
    p_limit: 20,
    p_offset: 0,
  });
  if (error) throw error;
  return (data ?? []) as AmbulanceSearchRow[];
}
