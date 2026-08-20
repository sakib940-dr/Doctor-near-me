import { requireSupabase } from '../lib/supabase';
import type { AppointmentRow, AppointmentStatus, PatientProfile } from '../types';

export async function getMyPatientProfile() {
  const { data, error } = await requireSupabase().rpc('get_my_patient_profile');
  if (error) throw error;
  return (data ?? null) as PatientProfile | null;
}

export async function updateMyPatientProfile(input: Omit<PatientProfile, 'user_id' | 'email' | 'preferred_language' | 'profile_completed'>) {
  const { error } = await requireSupabase().rpc('update_my_patient_profile', {
    p_full_name: input.full_name,
    p_phone: input.phone,
    p_date_of_birth: input.date_of_birth,
    p_gender: input.gender,
    p_blood_group: input.blood_group,
    p_address_line: input.address_line,
    p_district_id: input.district_id,
    p_upazila_id: input.upazila_id,
    p_emergency_contact_name: input.emergency_contact_name,
    p_emergency_contact_phone: input.emergency_contact_phone,
  });
  if (error) throw error;
}

export async function getMyAppointments(status?: AppointmentStatus | null, limit = 100, offset = 0) {
  const safeLimit = Math.min(Math.max(limit, 1), 100);
  const safeOffset = Math.max(offset, 0);
  const { data, error } = await requireSupabase().rpc('get_my_appointments', {
    p_status: status ?? null,
    p_limit: safeLimit,
    p_offset: safeOffset,
  });
  if (error) throw error;
  return (data ?? []) as AppointmentRow[];
}

export interface PatientDashboardAppointmentSummary {
  upcoming: number;
  completed: number;
  pending: number;
  last30Days: number;
}

export async function getMyPatientDashboardSummary() {
  const { data, error } = await requireSupabase().rpc('get_my_patient_dashboard_summary');
  if (error) throw error;
  const raw = (data ?? {}) as { summary?: Partial<PatientDashboardAppointmentSummary>; recent?: AppointmentRow[] };
  return {
    summary: {
      upcoming: Number(raw.summary?.upcoming ?? 0),
      completed: Number(raw.summary?.completed ?? 0),
      pending: Number(raw.summary?.pending ?? 0),
      last30Days: Number(raw.summary?.last30Days ?? 0),
    },
    recent: Array.isArray(raw.recent) ? raw.recent : [],
  };
}

export async function createPatientAppointment(input: {
  doctorId: string;
  providerId: string;
  appointmentDate: string;
  startTime: string;
  endTime: string;
  patientNote?: string;
}) {
  const { data, error } = await requireSupabase().rpc('create_patient_appointment', {
    p_doctor_id: input.doctorId,
    p_provider_id: input.providerId,
    p_appointment_date: input.appointmentDate,
    p_start_time: input.startTime,
    p_end_time: input.endTime,
    p_patient_note: input.patientNote?.trim() || null,
  });
  if (error) throw error;
  return data as string;
}

export async function cancelAppointment(appointmentId: string) {
  return updateAppointmentStatus(appointmentId, 'cancelled');
}

export async function updateAppointmentStatus(appointmentId: string, status: AppointmentStatus) {
  const { error } = await requireSupabase().rpc('update_appointment_status', {
    p_appointment_id: appointmentId,
    p_status: status,
  });
  if (error) throw error;
}
