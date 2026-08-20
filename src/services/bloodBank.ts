import { requireSupabase } from '../lib/supabase';
import type { BloodDonorProfile, BloodDonorSearchRow, BloodRequestResponseRow, BloodRequestRow } from '../types';

export async function getMyBloodDonorProfile() {
  const { data, error } = await requireSupabase().rpc('get_my_blood_donor_profile');
  if (error) throw error;
  const rows = (data ?? []) as BloodDonorProfile[];
  return rows[0] ?? null;
}

export async function saveMyBloodDonorProfile(input: {
  bloodGroup: string;
  isVolunteer: boolean;
  phonePublic: boolean;
  lastDonationDate?: string | null;
  availableForRequests: boolean;
  districtId?: number | null;
  upazilaId?: number | null;
  latitude?: number | null;
  longitude?: number | null;
}) {
  const { data, error } = await requireSupabase().rpc('upsert_my_blood_donor_profile', {
    p_blood_group: input.bloodGroup,
    p_is_volunteer: input.isVolunteer,
    p_phone_public: input.phonePublic,
    p_last_donation_date: input.lastDonationDate || null,
    p_available_for_requests: input.availableForRequests,
    p_district_id: input.districtId ?? null,
    p_upazila_id: input.upazilaId ?? null,
    p_latitude: input.latitude ?? null,
    p_longitude: input.longitude ?? null,
  });
  if (error) throw error;
  return Boolean(data);
}

export async function searchBloodDonors(input: {
  bloodGroup: string;
  districtId?: number | null;
  upazilaId?: number | null;
  limit?: number;
}) {
  const { data, error } = await requireSupabase().rpc('search_blood_donors', {
    p_blood_group: input.bloodGroup,
    p_district_id: input.districtId ?? null,
    p_upazila_id: input.upazilaId ?? null,
    p_limit: input.limit ?? 50,
    p_offset: 0,
  });
  if (error) throw error;
  return (data ?? []) as BloodDonorSearchRow[];
}

export async function createBloodRequest(input: {
  patientName: string;
  bloodGroup: string;
  unitsNeeded: number;
  hospitalName?: string | null;
  hospitalAddress?: string | null;
  districtId?: number | null;
  upazilaId?: number | null;
  neededAt?: string | null;
  reason?: string | null;
  contactPhone?: string | null;
}) {
  const { data, error } = await requireSupabase().rpc('create_blood_request_and_notify', {
    p_patient_name: input.patientName,
    p_blood_group: input.bloodGroup,
    p_units_needed: input.unitsNeeded,
    p_hospital_name: input.hospitalName?.trim() || null,
    p_hospital_address: input.hospitalAddress?.trim() || null,
    p_district_id: input.districtId ?? null,
    p_upazila_id: input.upazilaId ?? null,
    p_needed_at: input.neededAt || null,
    p_reason: input.reason?.trim() || null,
    p_contact_phone: input.contactPhone?.trim() || null,
  });
  if (error) throw error;
  return String(data);
}

export async function getMyBloodRequests() {
  const { data, error } = await requireSupabase().rpc('get_my_blood_requests');
  if (error) throw error;
  return ((data ?? []) as BloodRequestRow[]).map((row) => ({ ...row, response_count: Number(row.response_count ?? 0) }));
}

export async function getMyBloodRequestResponses(requestId: string) {
  const { data, error } = await requireSupabase().rpc('get_my_blood_request_responses', { p_request_id: requestId });
  if (error) throw error;
  return (data ?? []) as BloodRequestResponseRow[];
}

export async function cancelMyBloodRequest(requestId: string) {
  const { data, error } = await requireSupabase().rpc('cancel_my_blood_request', { p_request_id: requestId });
  if (error) throw error;
  return Boolean(data);
}
