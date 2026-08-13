import { requireSupabase } from '../lib/supabase';
import type { AdminActivityRow, AdminAppointmentRow, AdminOperationalSummary, AdminUserRow, AppointmentStatus, UserRole } from '../types';

export async function getAdminOperationalSummary() {
  const { data, error } = await requireSupabase().rpc('get_admin_operational_summary');
  if (error) throw error;
  return data as AdminOperationalSummary;
}

export async function getAdminUserDirectory(filters: {
  role?: UserRole | null;
  status?: string | null;
  search?: string | null;
} = {}) {
  const { data, error } = await requireSupabase().rpc('get_admin_user_directory', {
    p_role: filters.role || null,
    p_status: filters.status || null,
    p_search: filters.search?.trim() || null,
    p_limit: 50,
    p_offset: 0,
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
} = {}) {
  const { data, error } = await requireSupabase().rpc('get_admin_appointment_directory', {
    p_status: filters.status || null,
    p_search: filters.search?.trim() || null,
    p_date_from: null,
    p_date_to: null,
    p_limit: 50,
    p_offset: 0,
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
