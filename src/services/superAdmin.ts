import { requireSupabase } from '../lib/supabase';
import type { PrivilegedAccountInvite, SuperAdminDoctorVerificationPolicy, SuperAdminUserDetail, SuperAdminUserRow, UserRole } from '../types';

export async function getSuperAdminUserDirectory(filters: {
  role?: UserRole | null; status?: string | null; districtId?: number | null;
  upazilaId?: number | null; search?: string | null;
}) {
  const { data, error } = await requireSupabase().rpc('super_admin_user_directory_v2', {
    p_role: filters.role || null, p_status: filters.status || null,
    p_district_id: filters.districtId ?? null, p_upazila_id: filters.upazilaId ?? null,
    p_search: filters.search?.trim() || null, p_limit: 100, p_offset: 0,
  });
  if (error) throw error;
  return (data ?? []) as SuperAdminUserRow[];
}

export async function getSuperAdminUserDetail(userId: string) {
  const { data, error } = await requireSupabase().rpc('super_admin_get_user_detail_v2', { p_user_id: userId });
  if (error) throw error;
  return data as SuperAdminUserDetail;
}

export async function updateSuperAdminUserProfile(input: {
  userId: string; fullName: string; phone?: string | null; dateOfBirth?: string | null;
  gender?: string | null; bloodGroup?: string | null; addressLine?: string | null;
  districtId?: number | null; upazilaId?: number | null;
  emergencyContactName?: string | null; emergencyContactPhone?: string | null; reason: string;
}) {
  const { data, error } = await requireSupabase().rpc('super_admin_update_user_profile', {
    p_user_id: input.userId, p_full_name: input.fullName, p_phone: input.phone || null,
    p_date_of_birth: input.dateOfBirth || null, p_gender: input.gender || null,
    p_blood_group: input.bloodGroup || null, p_address_line: input.addressLine || null,
    p_district_id: input.districtId ?? null, p_upazila_id: input.upazilaId ?? null,
    p_emergency_contact_name: input.emergencyContactName || null,
    p_emergency_contact_phone: input.emergencyContactPhone || null, p_reason: input.reason,
  });
  if (error) throw error;
  return Boolean(data);
}

export async function changeSuperAdminUserRole(userId: string, role: Exclude<UserRole, 'super_admin'>, reason: string) {
  const { data, error } = await requireSupabase().rpc('super_admin_change_user_role_v2', { p_user_id: userId, p_new_role: role, p_reason: reason });
  if (error) throw error;
  return Boolean(data);
}

export async function setSuperAdminUserStatus(userId: string, status: 'active' | 'suspended' | 'banned', reason: string) {
  const { data, error } = await requireSupabase().rpc('super_admin_set_user_status_v2', { p_user_id: userId, p_status: status, p_reason: reason });
  if (error) throw error;
  return Boolean(data);
}

export async function createPrivilegedAccountInvite(input: { email: string; fullName: string; phone?: string; role: 'admin' | 'verification_officer'; expiresDays: number }) {
  const { data, error } = await requireSupabase().rpc('super_admin_create_privileged_invite', {
    p_email: input.email, p_full_name: input.fullName, p_phone: input.phone?.trim() || null,
    p_target_role: input.role, p_expires_days: input.expiresDays,
  });
  if (error) throw error;
  return data as { invite_id: string; email: string; target_role: string; registration_path: string };
}

export async function getPrivilegedAccountInvites() {
  const { data, error } = await requireSupabase().rpc('super_admin_list_privileged_invites');
  if (error) throw error;
  return (data ?? []) as PrivilegedAccountInvite[];
}

export async function cancelPrivilegedAccountInvite(inviteId: string) {
  const { data, error } = await requireSupabase().rpc('super_admin_cancel_privileged_invite', { p_invite_id: inviteId });
  if (error) throw error;
  return Boolean(data);
}

export async function deleteSuperAdminUser(userId: string, confirmation: string, reason: string) {
  const { data, error } = await requireSupabase().rpc('super_admin_delete_user_v2', { p_user_id: userId, p_confirmation: confirmation, p_reason: reason });
  if (error) throw error;
  return Boolean(data);
}


export async function getSuperAdminDoctorVerificationPolicy() {
  const { data, error } = await requireSupabase().rpc('super_admin_get_doctor_verification_policy');
  if (error) throw error;
  return data as SuperAdminDoctorVerificationPolicy;
}

export async function setSuperAdminDoctorVerificationPolicy(input: {
  hideUnverifiedDoctors: boolean;
  newRegistrationRequiresVerification: boolean;
}) {
  const { data, error } = await requireSupabase().rpc('super_admin_set_doctor_verification_policy', {
    p_hide_unverified_doctors: input.hideUnverifiedDoctors,
    p_new_registration_requires_verification: input.newRegistrationRequiresVerification,
  });
  if (error) throw error;
  return data as SuperAdminDoctorVerificationPolicy;
}
