import { requireSupabase } from '../lib/supabase';
import { analyticsDedupeKey, shouldRecordInteraction } from '../lib/analyticsClient';
import type {
  InteractionSummary,
  PublicProfileStats,
  PublicProfileStatsRow,
  SavedProfileCard,
  StructuredReview,
  StructuredReviewQuestionSet,
  StructuredReviewSummary,
} from '../types';

export interface StructuredReviewInput {
  q1Score: number;
  q2Score: number;
  q3Score: number;
  q4Score: number;
  q5Score: number;
  comment?: string | null;
}

export async function setDoctorFollow(doctorId: string, follow: boolean) {
  const { data, error } = await requireSupabase().rpc('toggle_my_follow', {
    p_doctor_id: doctorId,
    p_provider_id: null,
    p_follow: follow,
  });
  if (error) throw error;
  return data as { following: boolean; follower_count: number };
}

export async function setProviderFollow(providerId: string, follow: boolean) {
  const { data, error } = await requireSupabase().rpc('toggle_my_follow', {
    p_doctor_id: null,
    p_provider_id: providerId,
    p_follow: follow,
  });
  if (error) throw error;
  return data as { following: boolean; follower_count: number };
}

export async function getDoctorPublicStats(doctorId: string) {
  const { data, error } = await requireSupabase().rpc('get_public_profile_stats', {
    p_doctor_id: doctorId,
    p_provider_id: null,
  });
  if (error) throw error;
  return (data ?? null) as PublicProfileStats | null;
}

export async function getProviderPublicStats(providerId: string) {
  const { data, error } = await requireSupabase().rpc('get_public_profile_stats', {
    p_doctor_id: null,
    p_provider_id: providerId,
  });
  if (error) throw error;
  return (data ?? null) as PublicProfileStats | null;
}

export async function getMyDoctorReview(doctorId: string) {
  const { data, error } = await requireSupabase().rpc('get_my_structured_review', {
    p_doctor_id: doctorId,
    p_provider_id: null,
  });
  if (error) throw error;
  return (data ?? null) as StructuredReview | null;
}

export async function getMyProviderReview(providerId: string) {
  const { data, error } = await requireSupabase().rpc('get_my_structured_review', {
    p_doctor_id: null,
    p_provider_id: providerId,
  });
  if (error) throw error;
  return (data ?? null) as StructuredReview | null;
}

export async function saveMyDoctorReview(doctorId: string, input: StructuredReviewInput) {
  const { data, error } = await requireSupabase().rpc('upsert_my_doctor_review', {
    p_doctor_id: doctorId,
    p_q1_score: input.q1Score,
    p_q2_score: input.q2Score,
    p_q3_score: input.q3Score,
    p_q4_score: input.q4Score,
    p_q5_score: input.q5Score,
    p_comment: input.comment ?? null,
  });
  if (error) throw error;
  return data as string;
}

export async function saveMyProviderReview(providerId: string, input: StructuredReviewInput) {
  const { data, error } = await requireSupabase().rpc('upsert_my_provider_review', {
    p_provider_id: providerId,
    p_q1_score: input.q1Score,
    p_q2_score: input.q2Score,
    p_q3_score: input.q3Score,
    p_q4_score: input.q4Score,
    p_q5_score: input.q5Score,
    p_comment: input.comment ?? null,
  });
  if (error) throw error;
  return data as string;
}

export async function getPublicDoctorReviews(doctorId: string, limit = 20, offset = 0) {
  const { data, error } = await requireSupabase().rpc('get_public_doctor_reviews', {
    p_doctor_id: doctorId,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw error;
  return (data ?? []) as StructuredReview[];
}

export async function getPublicProviderReviews(providerId: string, limit = 20, offset = 0) {
  const { data, error } = await requireSupabase().rpc('get_public_provider_structured_reviews', {
    p_provider_id: providerId,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw error;
  return (data ?? []) as StructuredReview[];
}

export type PublicInteractionType =
  | 'profile_view'
  | 'call_click'
  | 'whatsapp_click'
  | 'appointment_click'
  | 'map_click';

export async function recordDoctorInteraction(
  doctorId: string,
  eventType: PublicInteractionType,
  source?: string,
) {
  if (!shouldRecordInteraction('doctor', doctorId, eventType)) return false;
  const { data, error } = await requireSupabase().rpc('record_public_profile_interaction', {
    p_doctor_id: doctorId,
    p_provider_id: null,
    p_event_type: eventType,
    p_source: source ?? null,
    p_metadata: { dedupe_key: analyticsDedupeKey('doctor', doctorId, eventType) },
  });
  if (error) throw error;
  return Boolean(data);
}

export async function recordProviderInteraction(
  providerId: string,
  eventType: PublicInteractionType,
  source?: string,
) {
  if (!shouldRecordInteraction('provider', providerId, eventType)) return false;
  const { data, error } = await requireSupabase().rpc('record_public_profile_interaction', {
    p_doctor_id: null,
    p_provider_id: providerId,
    p_event_type: eventType,
    p_source: source ?? null,
    p_metadata: { dedupe_key: analyticsDedupeKey('provider', providerId, eventType) },
  });
  if (error) throw error;
  return Boolean(data);
}

export async function getMyDoctorInteractionSummary(days = 30) {
  const { data, error } = await requireSupabase().rpc('get_my_doctor_interaction_summary', {
    p_days: days,
  });
  if (error) throw error;
  return data as InteractionSummary;
}

export async function getMyProviderInteractionSummary(providerId: string, days = 30) {
  const { data, error } = await requireSupabase().rpc('get_my_provider_interaction_summary', {
    p_provider_id: providerId,
    p_days: days,
  });
  if (error) throw error;
  return data as InteractionSummary;
}


export async function getPublicProfileStatsBatch(input: { doctorIds?: string[]; providerIds?: string[] }) {
  const doctorIds = Array.from(new Set(input.doctorIds ?? []));
  const providerIds = Array.from(new Set(input.providerIds ?? []));
  if (!doctorIds.length && !providerIds.length) return [] as PublicProfileStatsRow[];
  const { data, error } = await requireSupabase().rpc('get_public_profile_stats_batch', {
    p_doctor_ids: doctorIds,
    p_provider_ids: providerIds,
  });
  if (error) throw error;
  return (data ?? []) as PublicProfileStatsRow[];
}

export async function getMySavedProfileCards() {
  const { data, error } = await requireSupabase().rpc('get_my_saved_profile_cards');
  if (error) throw error;
  return (data ?? []) as SavedProfileCard[];
}

export async function getStructuredReviewQuestions() {
  const { data, error } = await requireSupabase().rpc('get_public_structured_review_questions');
  if (error) throw error;
  return (data ?? null) as StructuredReviewQuestionSet | null;
}

export async function getDoctorReviewSummary(doctorId: string) {
  const { data, error } = await requireSupabase().rpc('get_public_structured_review_summary', {
    p_doctor_id: doctorId,
    p_provider_id: null,
  });
  if (error) throw error;
  return (data ?? null) as StructuredReviewSummary | null;
}

export async function getProviderReviewSummary(providerId: string) {
  const { data, error } = await requireSupabase().rpc('get_public_structured_review_summary', {
    p_doctor_id: null,
    p_provider_id: providerId,
  });
  if (error) throw error;
  return (data ?? null) as StructuredReviewSummary | null;
}


export async function replyToMyProviderReview(reviewId: string, replyBn?: string | null, replyEn?: string | null) {
  const { data, error } = await requireSupabase().rpc('reply_to_my_provider_review', {
    p_review_id: reviewId,
    p_reply_bn: replyBn?.trim() || null,
    p_reply_en: replyEn?.trim() || null,
  });
  if (error) throw error;
  return Boolean(data);
}
