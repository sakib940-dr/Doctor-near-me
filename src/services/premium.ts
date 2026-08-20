import { requireSupabase } from '../lib/supabase';
import type {
  PremiumAchievementRule,
  PremiumAdminTarget,
  PremiumPolicy,
  PremiumProgress,
  PremiumReferralRow,
} from '../types';

export async function getMyPremiumProgress(providerId: string | null = null) {
  const { data, error } = await requireSupabase().rpc('get_my_premium_progress', { p_provider_id: providerId });
  if (error) throw error;
  return data as PremiumProgress;
}

export async function requestMyPremiumMembership(providerId: string | null = null) {
  const { data, error } = await requireSupabase().rpc('request_my_premium_membership', { p_provider_id: providerId });
  if (error) throw error;
  return data as PremiumProgress;
}

export async function getOrCreateMyReferralCode() {
  const { data, error } = await requireSupabase().rpc('get_or_create_my_referral_code');
  if (error) throw error;
  return String(data || '');
}

export async function claimReferralCode(code: string) {
  const { data, error } = await requireSupabase().rpc('claim_referral_code', { p_code: code.trim() });
  if (error) throw error;
  return (data ?? {}) as { status?: 'pending' | 'approved'; already_claimed?: boolean };
}

export async function getAdminPremiumPolicy() {
  const { data, error } = await requireSupabase().rpc('get_admin_premium_policy');
  if (error) throw error;
  return data as PremiumPolicy;
}

export async function saveAdminPremiumPolicy(policy: PremiumPolicy) {
  const { data, error } = await requireSupabase().rpc('save_admin_premium_policy', {
    p_enabled: policy.enabled,
    p_min_followers: policy.min_followers,
    p_min_approved_referrals: policy.min_approved_referrals,
    p_require_profile_completion: policy.require_profile_completion,
    p_min_profile_completion_percent: policy.min_profile_completion_percent,
    p_require_verification: policy.require_verification,
    p_min_achievement_count: policy.min_achievement_count,
    p_manual_approval_required: policy.manual_approval_required,
    p_premium_duration_days: policy.premium_duration_days,
    p_referral_claim_window_days: policy.referral_claim_window_days,
    p_referral_requires_admin_approval: policy.referral_requires_admin_approval,
  });
  if (error) throw error;
  return data as PremiumPolicy;
}

export async function getAdminPremiumTargets(query = '', limit = 80) {
  const { data, error } = await requireSupabase().rpc('admin_get_premium_targets', {
    p_query: query.trim() || null,
    p_limit: limit,
  });
  if (error) throw error;
  return (data ?? []) as PremiumAdminTarget[];
}

export async function decidePremiumMembership(
  targetType: 'doctor' | 'provider',
  targetId: string,
  action: 'approve' | 'revoke' | 'expire' | 'pending',
  note: string | null = null,
) {
  const { data, error } = await requireSupabase().rpc('admin_decide_premium_membership', {
    p_target_type: targetType,
    p_target_id: targetId,
    p_action: action,
    p_note: note,
  });
  if (error) throw error;
  return data as PremiumProgress;
}

export async function getPremiumAchievementRules() {
  const { data, error } = await requireSupabase().rpc('admin_list_premium_achievement_rules');
  if (error) throw error;
  return (data ?? []) as PremiumAchievementRule[];
}

export async function savePremiumAchievementRule(input: {
  id?: number | null;
  code: string;
  titleBn: string;
  titleEn?: string | null;
  descriptionBn?: string | null;
  countsTowardPremium: boolean;
  active: boolean;
  sortOrder: number;
}) {
  const { data, error } = await requireSupabase().rpc('admin_save_premium_achievement_rule', {
    p_id: input.id ?? null,
    p_code: input.code,
    p_title_bn: input.titleBn,
    p_title_en: input.titleEn || null,
    p_description_bn: input.descriptionBn || null,
    p_counts: input.countsTowardPremium,
    p_active: input.active,
    p_sort_order: input.sortOrder,
  });
  if (error) throw error;
  return Number(data);
}

export async function setPremiumAchievementAward(input: {
  ruleId: number;
  targetType: 'doctor' | 'provider';
  targetId: string;
  award: boolean;
  note?: string | null;
}) {
  const { data, error } = await requireSupabase().rpc('admin_set_premium_achievement_award', {
    p_rule_id: input.ruleId,
    p_doctor_id: input.targetType === 'doctor' ? input.targetId : null,
    p_provider_id: input.targetType === 'provider' ? input.targetId : null,
    p_award: input.award,
    p_note: input.note || null,
  });
  if (error) throw error;
  return Boolean(data);
}

export async function getAdminReferralQueue(status: PremiumReferralRow['status'] = 'pending', limit = 100) {
  const { data, error } = await requireSupabase().rpc('admin_get_referral_queue', {
    p_status: status,
    p_limit: limit,
  });
  if (error) throw error;
  return (data ?? []) as PremiumReferralRow[];
}

export async function setAdminReferralStatus(
  referralId: string,
  status: 'approved' | 'rejected' | 'invalid',
  reason: string | null = null,
) {
  const { data, error } = await requireSupabase().rpc('admin_set_referral_status', {
    p_referral_id: referralId,
    p_status: status,
    p_reason: reason,
  });
  if (error) throw error;
  return Boolean(data);
}
