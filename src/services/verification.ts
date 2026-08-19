import { requireSupabase } from '../lib/supabase';
import type { DoctorVerificationProfile, OwnerVerificationEvidence, VerificationEntityType, VerificationQueueRow, VerificationReviewDetail } from '../types';

export async function getMyEntityVerificationEvidence(entityType: 'doctor' | 'provider', entityId: string) {
  const { data, error } = await requireSupabase().rpc('get_my_entity_verification_evidence', { p_entity_type: entityType, p_entity_id: entityId });
  if (error) throw error;
  return data as OwnerVerificationEvidence;
}

export async function uploadEntityVerificationDocument(input: { entityType: 'doctor' | 'provider'; entityId: string; documentType: string; file: File }) {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  if (!allowed.includes(input.file.type)) throw new Error('JPG, PNG, WebP অথবা PDF document দিন।');
  if (input.file.size > 10 * 1024 * 1024) throw new Error('Document সর্বোচ্চ ১০ MB হতে পারবে।');
  const extension = input.file.name.split('.').pop()?.toLowerCase() || 'bin';
  const folder = input.entityType === 'doctor' ? 'doctors' : 'providers';
  const path = `${folder}/${input.entityId}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${extension}`;
  const client = requireSupabase();
  const { error: uploadError } = await client.storage.from('verification-documents').upload(path, input.file, { upsert: false });
  if (uploadError) throw uploadError;
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

export async function getVerificationReviewQueue(entityType?: VerificationEntityType | null, status?: string | null) {
  const { data, error } = await requireSupabase().rpc('get_verification_review_queue', { p_entity_type: entityType ?? null, p_status: status ?? 'pending', p_limit: 100, p_offset: 0 });
  if (error) throw error;
  return (data ?? []) as VerificationQueueRow[];
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


export async function getMyDoctorVerificationProfile() {
  const { data, error } = await requireSupabase().rpc('get_my_doctor_verification_profile');
  if (error) throw error;
  return data as DoctorVerificationProfile;
}

export async function updateMyDoctorVerificationInfo(input: {
  medicalCollege: string;
  medicalSession: string;
  medicalBatch: string;
}) {
  const { data, error } = await requireSupabase().rpc('update_my_doctor_verification_info', {
    p_medical_college: input.medicalCollege,
    p_medical_session: input.medicalSession,
    p_medical_batch: input.medicalBatch,
  });
  if (error) throw error;
  return data as {
    verification_status: DoctorVerificationProfile['verification_status'];
    verification_reset: boolean;
    information_changed: boolean;
  };
}
