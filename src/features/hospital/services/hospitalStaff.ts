import { requireSupabase } from '../../../lib/supabase';
import type { HospitalStaffMember } from '../types';

export async function getMyHospitalStaff(providerId: string) {
  const { data, error } = await requireSupabase().rpc('get_my_hospital_staff', { p_provider_id: providerId });
  if (error) throw error;
  return (data ?? []) as HospitalStaffMember[];
}

export async function saveMyHospitalStaff(providerId: string, item: Omit<HospitalStaffMember, 'provider_id'> & { id: string | null }) {
  const { data, error } = await requireSupabase().rpc('save_my_hospital_staff', {
    p_provider_id: providerId, p_staff_id: item.id, p_full_name: item.full_name,
    p_designation: item.designation, p_department: item.department, p_phone: item.phone,
    p_email: item.email, p_notes: item.notes, p_is_active: item.is_active,
  });
  if (error) throw error;
  return data as string;
}

export async function deleteMyHospitalStaff(providerId: string, staffId: string) {
  const { error } = await requireSupabase().rpc('delete_my_hospital_staff', { p_provider_id: providerId, p_staff_id: staffId });
  if (error) throw error;
}
