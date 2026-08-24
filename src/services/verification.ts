import { requireSupabase } from '../lib/supabase';
import { optimizeVerificationImageIfNeeded } from './imageUpload';
import { friendlyImageUploadError } from '../lib/imageOptimization';
import type { DoctorVerificationProfile, MedicalType, OwnerVerificationEvidence, VerificationEntityType, VerificationQueueRow, VerificationReviewDetail } from '../types';

export async function getMyEntityVerificationEvidence(entityType: 'doctor' | 'provider', entityId: string) {
  const { data, error } = await requireSupabase().rpc('get_my_entity_verification_evidence', { p_entity_type: entityType, p_entity_id: entityId });
  if (error) throw error;
  return data as OwnerVerificationEvidence;
}

export async function uploadEntityVerificationDocument(input: { entityType: 'doctor' | 'provider'; entityId: string; documentType: string; file: File }) {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'application/pdf'];
  if (!allowed.includes(input.file.type)) throw new Error('JPG, PNG, WebP, AVIF অথবা PDF document দিন।');
  if (input.file.type.startsWith('image/') && input.file.size > 5 * 1024 * 1024) throw new Error('ছবির সর্বোচ্চ সাইজ 5 MB।');
  if (input.file.type === 'application/pdf' && input.file.size > 10 * 1024 * 1024) throw new Error('PDF সর্বোচ্চ ১০ MB হতে পারবে।');
  const prepared = await optimizeVerificationImageIfNeeded(input.file);
  const extension = prepared.name.split('.').pop()?.toLowerCase() || 'bin';
  const folder = input.entityType === 'doctor' ? 'doctors' : 'providers';
  const path = `${folder}/${input.entityId}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${extension}`;
  const client = requireSupabase();
  const { error: uploadError } = await client.storage.from('verification-documents').upload(path, prepared, { contentType: prepared.type, upsert: false });
  if (uploadError) throw new Error(input.file.type.startsWith('image/') ? friendlyImageUploadError(uploadError) : uploadError.message);
  const { error } = await client.rpc('add_my_entity_verification_document', { p_entity_type: input.entityType, p_entity_id: input.entityId, p_document_type: input.documentType, p_storage_path: path });
  if (error) { await client.storage.from('verification-documents').remove([path]); throw error; }
}

export async function deleteEntityVerificationDocument(documentId: string) {
  const client = requireSupabase();
  const { data, error } = await client.rpc('delete_my_entity_verification_document', { p_document_id: documentId });
  if (error) throw error;
  const { error: storageError } = await client.storage.from('verification-documents').remove([data as string]);
  if (storageError) throw storageError;
}

export async function getVerificationDocumentUrl(path: string) {
  const { data, error } = await requireSupabase().storage.from('verification-documents').createSignedUrl(path, 300);
  if (error) throw error;
  return data.signedUrl;
}

export async function getVerificationReviewQueue(entityType?: VerificationEntityType | null, status?: string | null, limit = 30, offset = 0) {
  const safeLimit = Math.min(Math.max(limit, 1), 50);
  const safeOffset = Math.max(offset, 0);
  const { data, error } = await requireSupabase().rpc('get_verification_review_queue', { p_entity_type: entityType ?? null, p_status: status ?? 'pending', p_limit: safeLimit, p_offset: safeOffset });
  if (error) throw error;
  return (data ?? []) as VerificationQueueRow[];
}

export async function getMyPendingVerificationCount() {
  const { data, error } = await requireSupabase().rpc('get_my_pending_verification_count');
  if (error) throw error;
  return Number(data ?? 0);
}

export async function getVerificationReviewDetail(entityType: VerificationEntityType, entityId: string) {
  const { data, error } = await requireSupabase().rpc('get_verification_review_detail', { p_entity_type: entityType, p_entity_id: entityId });
  if (error) throw error;
  return data as VerificationReviewDetail;
}

export async function decideVerificationReview(input: { entityType: VerificationEntityType; entityId: string; status: 'approved' | 'rejected'; reviewNote?: string | null }) {
  const { error } = await requireSupabase().rpc('decide_verification_review', { p_entity_type: input.entityType, p_entity_id: input.entityId, p_status: input.status, p_review_note: input.reviewNote?.trim() || null });
  if (error) throw error;
}

export async function adminUpdateDoctorBmdc(input: { doctorId: string; bmdcRegistrationNo: string; reason: string }) {
  const { data, error } = await requireSupabase().rpc('admin_update_doctor_bmdc', {
    p_doctor_id: input.doctorId,
    p_bmdc_registration_no: input.bmdcRegistrationNo.trim(),
    p_reason: input.reason.trim(),
  });
  if (error) throw error;
  return data === true;
}


export async function getMyDoctorVerificationProfile() {
  const { data, error } = await requireSupabase().rpc('get_my_doctor_verification_profile');
  if (error) throw error;
  return data as DoctorVerificationProfile;
}

export async function submitMyDoctorVerificationApplication() {
  const { data, error } = await requireSupabase().rpc('submit_my_doctor_verification_application');
  if (error) throw error;
  return data as { status: 'pending'; submitted_at: string };
}

export async function updateMyDoctorVerificationInfo(input: {
  medicalType: MedicalType;
  medicalCollege: string;
  medicalSession: string;
  medicalBatch: string;
  bmdcRegistrationNo: string;
}) {
  const { data, error } = await requireSupabase().rpc('update_my_doctor_verification_info_v2', {
    p_medical_type: input.medicalType,
    p_medical_college: input.medicalCollege,
    p_medical_session: input.medicalSession,
    p_medical_batch: input.medicalBatch,
    p_bmdc_registration_no: input.bmdcRegistrationNo,
  });
  if (error) throw error;
  return data as {
    verification_status: DoctorVerificationProfile['verification_status'];
    verification_reset: boolean;
    information_changed: boolean;
  };
}
