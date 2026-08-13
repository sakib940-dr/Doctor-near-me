import { requireSupabase } from '../lib/supabase';
import type { AccountContext, DashboardContext, PublicRegistrationRole } from '../types';

export async function getMyAccountContext() {
  const { data, error } = await requireSupabase().rpc('get_my_account_context');
  if (error) throw error;
  return (data ?? null) as AccountContext | null;
}

export async function getRoleDashboardContext() {
  const { data, error } = await requireSupabase().rpc('get_role_dashboard_context');
  if (error) throw error;
  return (data ?? null) as DashboardContext | null;
}

export async function completeAccountOnboarding(input: {
  fullName: string;
  phone?: string;
  role: PublicRegistrationRole;
  districtId?: number | null;
  upazilaId?: number | null;
}) {
  const { data, error } = await requireSupabase().rpc(
    'complete_my_account_onboarding',
    {
      p_full_name: input.fullName.trim(),
      p_phone: input.phone?.trim() || null,
      p_role: input.role,
      p_district_id: input.districtId ?? null,
      p_upazila_id: input.upazilaId ?? null,
    },
  );
  if (error) throw error;
  return data as { user_id: string; role: PublicRegistrationRole; profile_completed: boolean };
}
