import { requireSupabase } from '../lib/supabase';
import type {
  AmbulanceSearchRow,
  District,
  DoctorSearchRow,
  DoctorPublicProfile,
  HomepageConfiguration,
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
  return (data ?? []) as DoctorSearchRow[];
}

export async function getDoctorPublicProfile(doctorId: string) {
  const { data, error } = await requireSupabase().rpc(
    'get_doctor_public_profile',
    { p_doctor_id: doctorId },
  );
  if (error) throw error;
  return (data ?? null) as DoctorPublicProfile | null;
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
