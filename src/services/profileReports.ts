import { requireSupabase } from '../lib/supabase';
import type { AdminProfileReportQueueRow, AdminProfileReportSummary, ProfileReportReason, ProfileReportTargetType } from '../types';

export async function getMyProfileReport(targetType: ProfileReportTargetType, targetId: string) {
  const { data, error } = await requireSupabase().rpc('get_my_profile_report', {
    p_target_type: targetType,
    p_target_id: targetId,
  });
  if (error) throw error;
  return ((data ?? []) as Array<{ reason: ProfileReportReason; status: string; created_at: string }>)[0] ?? null;
}

export async function submitProfileReport(input: {
  targetType: ProfileReportTargetType;
  targetId: string;
  reason: ProfileReportReason;
  otherDetails?: string | null;
}) {
  const { data, error } = await requireSupabase().rpc('submit_profile_report', {
    p_target_type: input.targetType,
    p_target_id: input.targetId,
    p_reason: input.reason,
    p_other_details: input.otherDetails?.trim() || null,
  });
  if (error) throw error;
  return data as string;
}

export async function getAdminProfileReportSummary() {
  const { data, error } = await requireSupabase().rpc('get_admin_profile_report_summary');
  if (error) throw error;
  return data as AdminProfileReportSummary;
}

export async function getAdminProfileReportQueue(openOnly = true) {
  const { data, error } = await requireSupabase().rpc('get_admin_profile_report_queue', {
    p_open_only: openOnly,
    p_limit: 100,
    p_offset: 0,
  });
  if (error) throw error;
  return (data ?? []) as AdminProfileReportQueueRow[];
}

export async function moderateProfileReports(input: {
  targetType: ProfileReportTargetType;
  targetId: string;
  action: 'reviewed' | 'dismissed' | 'suspend_listing';
  adminNote: string;
}) {
  const { data, error } = await requireSupabase().rpc('admin_moderate_profile_reports', {
    p_target_type: input.targetType,
    p_target_id: input.targetId,
    p_action: input.action,
    p_admin_note: input.adminNote.trim(),
  });
  if (error) throw error;
  return Boolean(data);
}
