import { requireSupabase } from '../lib/supabase';
import { optimizeVerificationImageIfNeeded } from './imageUpload';
import type { AmbulanceDocument, AmbulanceDocumentType, AmbulanceVehicleType, ApprovedHospitalRow, HospitalAmbulanceLinkRequest, MyAmbulanceService } from '../types';

export interface AmbulanceProfileInput {
  ambulanceId: string | null;
  operatorName: string;
  phone: string;
  vehicleRegistrationNo: string;
  vehicleType: AmbulanceVehicleType;
  address: string;
  driverName: string | null;
  secondaryPhone: string | null;
  capabilities: string[];
  serviceArea: string | null;
  districtId: number | null;
  upazilaId: number | null;
  latitude: number | null;
  longitude: number | null;
  priceNote: string | null;
  operates24Hours: boolean;
}

export async function getMyAmbulanceServices() {
  const { data, error } = await requireSupabase().rpc('get_my_ambulance_services');
  if (error) throw error;
  return (data ?? []) as MyAmbulanceService[];
}

export async function saveMyAmbulanceService(input: AmbulanceProfileInput) {
  const { data, error } = await requireSupabase().rpc('save_my_ambulance_service', {
    p_ambulance_id: input.ambulanceId,
    p_operator_name: input.operatorName,
    p_phone: input.phone,
    p_vehicle_registration_no: input.vehicleRegistrationNo,
    p_vehicle_type: input.vehicleType,
    p_address: input.address,
    p_driver_name: input.driverName,
    p_secondary_phone: input.secondaryPhone,
    p_capabilities: input.capabilities,
    p_service_area: input.serviceArea,
    p_district_id: input.districtId,
    p_upazila_id: input.upazilaId,
    p_latitude: input.latitude,
    p_longitude: input.longitude,
    p_price_note: input.priceNote,
    p_operates_24_hours: input.operates24Hours,
  });
  if (error) throw error;
  return data as { ambulance_id: string; verification_reset: boolean };
}

export async function setMyAmbulanceAvailability(input: { ambulanceId: string; available: boolean; latitude?: number | null; longitude?: number | null; accuracy?: number | null }) {
  const { error } = await requireSupabase().rpc('set_my_ambulance_availability', {
    p_ambulance_id: input.ambulanceId,
    p_is_available: input.available,
    p_latitude: input.latitude ?? null,
    p_longitude: input.longitude ?? null,
    p_accuracy_meters: input.accuracy ?? null,
  });
  if (error) throw error;
}

export async function getMyAmbulanceDocuments(ambulanceId: string) {
  const { data, error } = await requireSupabase().rpc('get_my_ambulance_documents', { p_ambulance_id: ambulanceId });
  if (error) throw error;
  return (data ?? []) as AmbulanceDocument[];
}

export async function uploadAmbulanceDocument(input: { ambulanceId: string; documentType: AmbulanceDocumentType; file: File }) {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'application/pdf'];
  if (!allowed.includes(input.file.type)) throw new Error('JPG, PNG, WebP, AVIF অথবা PDF document দিন।');
  if (input.file.size > 10 * 1024 * 1024) throw new Error('Document সর্বোচ্চ ১০ MB হতে পারবে।');
  const prepared = await optimizeVerificationImageIfNeeded(input.file);
  const extension = prepared.name.split('.').pop()?.toLowerCase() || 'bin';
  const path = `ambulances/${input.ambulanceId}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${extension}`;
  const client = requireSupabase();
  const { error: uploadError } = await client.storage.from('verification-documents').upload(path, prepared, { contentType: prepared.type, upsert: false });
  if (uploadError) throw uploadError;
  const { error } = await client.rpc('add_my_ambulance_document', { p_ambulance_id: input.ambulanceId, p_document_type: input.documentType, p_storage_path: path });
  if (error) {
    await client.storage.from('verification-documents').remove([path]);
    throw error;
  }
}

export async function getAmbulanceDocumentUrl(path: string) {
  const { data, error } = await requireSupabase().storage.from('verification-documents').createSignedUrl(path, 300);
  if (error) throw error;
  return data.signedUrl;
}

export async function deleteAmbulanceDocument(documentId: string) {
  const client = requireSupabase();
  const { data, error } = await client.rpc('delete_my_ambulance_document', { p_document_id: documentId });
  if (error) throw error;
  const { error: storageError } = await client.storage.from('verification-documents').remove([data as string]);
  if (storageError) throw storageError;
}

export async function searchApprovedHospitalsForAmbulance(query: string, districtId?: number | null) {
  const { data, error } = await requireSupabase().rpc('search_approved_hospitals_for_ambulance', { p_query: query.trim() || null, p_district_id: districtId ?? null, p_limit: 30 });
  if (error) throw error;
  return (data ?? []) as ApprovedHospitalRow[];
}

export async function requestAmbulanceHospitalLink(ambulanceId: string, hospitalId: string) {
  const { error } = await requireSupabase().rpc('request_ambulance_hospital_link', { p_ambulance_id: ambulanceId, p_hospital_id: hospitalId });
  if (error) throw error;
}

export async function getHospitalAmbulanceLinkRequests(hospitalId: string, status?: string | null) {
  const { data, error } = await requireSupabase().rpc('get_hospital_ambulance_link_requests', { p_hospital_id: hospitalId, p_status: status ?? null });
  if (error) throw error;
  return (data ?? []) as HospitalAmbulanceLinkRequest[];
}

export async function respondToAmbulanceHospitalLink(input: { ambulanceId: string; hospitalId: string; status: 'approved' | 'rejected' | 'removed'; reviewNote?: string | null }) {
  const { error } = await requireSupabase().rpc('respond_to_ambulance_hospital_link', { p_ambulance_id: input.ambulanceId, p_hospital_id: input.hospitalId, p_status: input.status, p_review_note: input.reviewNote?.trim() || null });
  if (error) throw error;
}
