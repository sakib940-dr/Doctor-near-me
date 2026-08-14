import { requireSupabase } from '../lib/supabase';
import type {
  AmbulanceSearchRow,
  District,
  DoctorSearchRow,
  DoctorPublicProfile,
  HomepageConfiguration,
  ProviderPublicDoctorRow,
  ProviderPublicRow,
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

// providers টেবিলে anon-এর জন্য "status = approved" রো সরাসরি select করার
// RLS পলিসি আগে থেকেই আছে (providers_public_approved_select), তাই এখানে
// নতুন কোনো RPC/স্কিমা ছাড়াই সরাসরি টেবিল query করা হচ্ছে।
export async function searchProviders(input: {
  providerType?: 'chamber' | 'hospital' | null;
  districtId?: number | null;
  upazilaId?: number | null;
  query?: string;
  limit?: number;
  offset?: number;
}) {
  let request = requireSupabase()
    .from('providers')
    .select(
      'id,provider_type,name_bn,name_en,short_description,logo_url,banner_url,phone,address,district_id,upazila_id,latitude,longitude,google_maps_url,map_url,emergency_available,verified',
      { count: 'exact' },
    )
    .eq('status', 'approved');

  if (input.providerType) request = request.eq('provider_type', input.providerType);
  if (input.districtId) request = request.eq('district_id', input.districtId);
  if (input.upazilaId) request = request.eq('upazila_id', input.upazilaId);
  if (input.query?.trim()) {
    request = request.or(
      `name_bn.ilike.%${input.query.trim()}%,name_en.ilike.%${input.query.trim()}%,address.ilike.%${input.query.trim()}%`,
    );
  }

  const from = input.offset ?? 0;
  const to = from + (input.limit ?? 20) - 1;
  const { data, error, count } = await request
    .order('verified', { ascending: false })
    .order('name_bn')
    .range(from, to);
  if (error) throw error;
  return { rows: (data ?? []) as ProviderPublicRow[], total: count ?? 0 };
}

export async function getProviderById(providerId: string) {
  const { data, error } = await requireSupabase()
    .from('providers')
    .select(
      'id,provider_type,name_bn,name_en,short_description,logo_url,banner_url,phone,address,district_id,upazila_id,latitude,longitude,google_maps_url,map_url,emergency_available,verified',
    )
    .eq('id', providerId)
    .eq('status', 'approved')
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as ProviderPublicRow | null;
}

// get_provider_doctors() আগে থেকেই বিদ্যমান একটি RPC (security invoker)।
// লগইন ছাড়া ভিজিটরদের (anon role) জন্য profiles টেবিলে SELECT আগে থেকেই
// বন্ধ করা আছে (Step 12), তাই এই কলটি অ্যানোনিমাস ভিজিটরে ব্যর্থ হতে পারে —
// সেক্ষেত্রে খালি লিস্ট রিটার্ন করে UI-কে গ্রেসফুলি ফলব্যাক করানো হচ্ছে।
export async function getProviderDoctors(providerId: string) {
  const { data, error } = await requireSupabase().rpc('get_provider_doctors', {
    p_provider_id: providerId,
  });
  if (error) {
    if (error.code === '42501' || /permission denied/i.test(error.message)) return [];
    throw error;
  }
  return (data ?? []) as ProviderPublicDoctorRow[];
}

// nearest_doctors() আগে থেকেই বিদ্যমান একটি RPC (security invoker, profiles জয়েন করে)।
// অ্যানোনিমাস ভিজিটরের জন্য এটি ব্যর্থ হতে পারে (Step 12-এর profiles RLS-এর কারণে);
// সেক্ষেত্রে caller (UI) সাধারণ জেলা/উপজেলা-ভিত্তিক সার্চে ফলব্যাক করবে।
export async function getNearestDoctors(input: {
  latitude: number;
  longitude: number;
  radiusKm?: number;
  districtId?: number | null;
  upazilaId?: number | null;
  limit?: number;
}) {
  const { data, error } = await requireSupabase().rpc('nearest_doctors', {
    p_lat: input.latitude,
    p_lon: input.longitude,
    p_radius_km: input.radiusKm ?? 50,
    p_district_id: input.districtId ?? null,
    p_upazila_id: input.upazilaId ?? null,
    p_limit: input.limit ?? 20,
    p_offset: 0,
  });
  if (error) {
    if (error.code === '42501' || /permission denied/i.test(error.message)) return [];
    throw error;
  }
  return (data ?? []) as Array<{
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
  }>;
}

// search_blood_donors() আগে থেকেই বিদ্যমান একটি RPC (security invoker, profiles
// জয়েন করে)। get_provider_doctors()-এর মতো এটিও অ্যানোনিমাস ভিজিটরের জন্য
// ব্যর্থ হতে পারে (backend-এর বিদ্যমান RLS ডিজাইন, Step 12) — সেক্ষেত্রে
// UI-কে খালি লিস্ট দিয়ে গ্রেসফুলি ফলব্যাক করানো হচ্ছে।
export async function searchBloodDonors(input: {
  bloodGroup: string;
  districtId?: number | null;
  upazilaId?: number | null;
  limit?: number;
  offset?: number;
}) {
  const { data, error } = await requireSupabase().rpc('search_blood_donors', {
    p_blood_group: input.bloodGroup,
    p_district_id: input.districtId ?? null,
    p_upazila_id: input.upazilaId ?? null,
    p_limit: input.limit ?? 20,
    p_offset: input.offset ?? 0,
  });
  if (error) {
    if (error.code === '42501' || /permission denied/i.test(error.message)) return [];
    throw error;
  }
  return (data ?? []) as Array<{
    donor_id: string;
    donor_name: string;
    phone: string | null;
    blood_group: string;
    district_id: number | null;
    upazila_id: number | null;
    last_donation_date: string | null;
  }>;
}

export async function searchAmbulances(input: {
  districtId?: number | null;
  upazilaId?: number | null;
  availableOnly?: boolean;
  limit?: number;
  offset?: number;
}) {
  const { data, error } = await requireSupabase().rpc('search_ambulances', {
    p_district_id: input.districtId ?? null,
    p_upazila_id: input.upazilaId ?? null,
    p_vehicle_types: null,
    p_available_only: input.availableOnly ?? false,
    p_latitude: null,
    p_longitude: null,
    p_radius_km: null,
    p_limit: input.limit ?? 20,
    p_offset: input.offset ?? 0,
  });
  if (error) throw error;
  return (data ?? []) as AmbulanceSearchRow[];
}
