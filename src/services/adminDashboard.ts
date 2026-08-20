import { requireSupabase } from '../lib/supabase';
import type { AdminActivityRow, AdminAnalyticsRangeKey, AdminAppointmentRow, AdminHighLevelAnalytics, AdminHospitalEngagementAnalytics, AdminOperationalSummary, AdminOperationalTrendRow, AdminTopDoctorRangeKey, AdminTopDoctorsAnalytics, AdminUserRow, AppointmentStatus, UserRole } from '../types';


const adminReadInflight = new Map<string, Promise<unknown>>();

function dedupeAdminRead<T>(key: string, task: () => Promise<T>): Promise<T> {
  const current = adminReadInflight.get(key) as Promise<T> | undefined;
  if (current) return current;
  const request = task().finally(() => adminReadInflight.delete(key));
  adminReadInflight.set(key, request as Promise<unknown>);
  return request;
}

export async function getAdminOperationalSummary() {
  return dedupeAdminRead('admin:summary', async () => {
    const { data, error } = await requireSupabase().rpc('get_admin_operational_summary');
    if (error) throw error;
    return data as AdminOperationalSummary;
  });
}

export async function getAdminOperationalTrends() {
  return dedupeAdminRead('admin:trends', async () => {
    const { data, error } = await requireSupabase().rpc('get_admin_operational_trends');
    if (error) throw error;
    return (data ?? []) as AdminOperationalTrendRow[];
  });
}

export async function getAdminHighLevelAnalytics(input: { range: AdminAnalyticsRangeKey; from?: string | null; to?: string | null }) {
  const key = `admin:analytics:${input.range}:${input.range === 'custom' ? input.from || '' : ''}:${input.range === 'custom' ? input.to || '' : ''}`;
  return dedupeAdminRead(key, async () => {
    const { data, error } = await requireSupabase().rpc('get_admin_high_level_analytics', {
      p_range: input.range,
      p_from: input.range === 'custom' ? input.from || null : null,
      p_to: input.range === 'custom' ? input.to || null : null,
    });
    if (error) throw error;
    return data as AdminHighLevelAnalytics;
  });
}

export async function getAdminTopDoctorsAnalytics(range: AdminTopDoctorRangeKey, limit = 5) {
  return dedupeAdminRead(`admin:top-doctors:${range}:${limit}`, async () => {
    const { data, error } = await requireSupabase().rpc('get_admin_top_doctors_analytics', { p_range: range, p_limit: limit });
    if (error) throw error;
    return data as AdminTopDoctorsAnalytics;
  });
}

export async function getAdminHospitalEngagementAnalytics(range: AdminTopDoctorRangeKey, limit = 5) {
  return dedupeAdminRead(`admin:hospitals:${range}:${limit}`, async () => {
    const { data, error } = await requireSupabase().rpc('get_admin_hospital_engagement_analytics', { p_range: range, p_limit: limit });
    if (error) throw error;
    return data as AdminHospitalEngagementAnalytics;
  });
}

export async function getAdminUserDirectory(filters: {
  role?: UserRole | null;
  status?: string | null;
  search?: string | null;
  limit?: number;
  offset?: number;
} = {}) {
  const { data, error } = await requireSupabase().rpc('get_admin_user_directory', {
    p_role: filters.role || null,
    p_status: filters.status || null,
    p_search: filters.search?.trim() || null,
    p_limit: Math.min(Math.max(filters.limit ?? 30, 1), 50),
    p_offset: Math.max(filters.offset ?? 0, 0),
  });
  if (error) throw error;
  return (data ?? []) as AdminUserRow[];
}

export async function setAdminUserAccountStatus(input: {
  userId: string;
  status: 'active' | 'suspended';
  reason?: string;
}) {
  const { data, error } = await requireSupabase().rpc('admin_set_user_account_status', {
    p_user_id: input.userId,
    p_status: input.status,
    p_reason: input.reason?.trim() || null,
  });
  if (error) throw error;
  return Boolean(data);
}

export async function getAdminAppointmentDirectory(filters: {
  status?: AppointmentStatus | null;
  search?: string | null;
  limit?: number;
  offset?: number;
} = {}) {
  const { data, error } = await requireSupabase().rpc('get_admin_appointment_directory', {
    p_status: filters.status || null,
    p_search: filters.search?.trim() || null,
    p_date_from: null,
    p_date_to: null,
    p_limit: Math.min(Math.max(filters.limit ?? 30, 1), 50),
    p_offset: Math.max(filters.offset ?? 0, 0),
  });
  if (error) throw error;
  return (data ?? []) as AdminAppointmentRow[];
}

export async function overrideAdminAppointmentStatus(input: {
  appointmentId: string;
  status: AppointmentStatus;
  reason: string;
}) {
  const { data, error } = await requireSupabase().rpc('admin_override_appointment_status', {
    p_appointment_id: input.appointmentId,
    p_status: input.status,
    p_reason: input.reason.trim(),
  });
  if (error) throw error;
  return Boolean(data);
}

export async function getAdminActivity() {
  const { data, error } = await requireSupabase().rpc('get_admin_activity', { p_limit: 40, p_offset: 0 });
  if (error) throw error;
  return (data ?? []) as AdminActivityRow[];
}
