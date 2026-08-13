import { requireSupabase } from '../lib/supabase';
import type {
  AmbulanceSearchRow,
  District,
  DoctorSearchRow,
  HomepageConfiguration,
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

export async function searchDoctors(input: {
  query?: string;
  districtId?: number | null;
  specialtyIds?: number[];
}) {
  const { data, error } = await requireSupabase().rpc(
    'search_doctors_advanced',
    {
      p_query: input.query?.trim() || null,
      p_district_id: input.districtId ?? null,
      p_upazila_id: null,
      p_specialty_ids: input.specialtyIds?.length
        ? input.specialtyIds
        : null,
      p_degrees: null,
      p_designations: null,
      p_min_fee: null,
      p_max_fee: null,
      p_available_today: false,
      p_sort: 'name',
      p_limit: 20,
      p_offset: 0,
    },
  );
  if (error) throw error;
  return (data ?? []) as DoctorSearchRow[];
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
