import { requireSupabase } from '../lib/supabase';

export const DEFAULT_PRESCRIPTION_FOOTER = 'Generated from docbd.info • Please follow the doctor’s instructions.';

export async function getPrescriptionFooter() {
  const { data, error } = await requireSupabase().rpc('get_prescription_footer');
  if (error) throw error;
  return typeof data === 'string' ? data : DEFAULT_PRESCRIPTION_FOOTER;
}

export type ClinicalCategory =
  | 'chief_complaint'
  | 'history'
  | 'on_examination'
  | 'investigation'
  | 'treatment_plan';

export interface DrugSearchRow {
  id: string | null;
  display_name: string;
  brand_name: string | null;
  generic_name: string | null;
  dosage_form: string | null;
  strength: string | null;
  company_name: string | null;
  registration_no: string | null;
  source?: 'recent' | 'catalog';
}

export interface ClinicalSuggestionRow {
  id: string;
  text: string;
  source: 'recent' | 'common';
  usage_count: number;
  last_used_at: string | null;
}

export interface TextSuggestionRow {
  id: string;
  text: string;
  usage_count: number;
  last_used_at: string;
}

export interface PrescriptionAppointmentContext {
  appointment_id: string;
  patient_id: string;
  patient_name: string | null;
  patient_mobile: string | null;
  patient_date_of_birth: string | null;
  patient_gender: string | null;
  patient_address: string | null;
  appointment_date: string;
  provider_id: string | null;
  provider_name: string | null;
  provider_address: string | null;
  provider_phone: string | null;
}

export interface PrescriptionMedicineInput {
  name: string;
  drug_master_id: string | null;
  dose: string;
  meal_instruction: string;
  duration_days: string;
}

export interface PrescriptionPayload {
  appointment_id: string | null;
  provider_id: string | null;
  doctor_header_text: string;
  chamber_header_text: string;
  patient_name: string;
  patient_age: string;
  patient_address: string;
  patient_mobile: string;
  patient_gender: string;
  chief_complaint: string[];
  history: string[];
  on_examination: string[];
  investigation: string[];
  treatment_plan: string[];
  medicines: PrescriptionMedicineInput[];
  advice: string[];
  note: string;
}

export interface PrescriptionSummary {
  id: string;
  patient_name: string;
  patient_mobile: string | null;
  appointment_id: string | null;
  provider_id: string | null;
  medicines_count: number;
  created_at: string;
}

export interface PrescriptionSettings {
  doctor_id: string;
  default_doctor_header_text: string;
  default_chamber_header_text: string;
  updated_at: string;
}

export interface AdviceTemplate {
  id: string;
  advice_text: string;
  created_at: string;
  updated_at: string;
  usage_count: number;
  last_used_at: string | null;
}

export interface DoctorPrescriptionRecord {
  id: string;
  doctor_id: string;
  patient_id: string | null;
  appointment_id: string | null;
  provider_id: string | null;
  doctor_header_text: string | null;
  chamber_header_text: string | null;
  patient_name: string;
  patient_age: string | null;
  patient_address: string | null;
  patient_mobile: string | null;
  patient_gender: string | null;
  chief_complaint: string[];
  history: string[];
  on_examination: string[];
  investigation: string[];
  treatment_plan: string[];
  medicines: PrescriptionMedicineInput[];
  advice: string[];
  note: string | null;
  created_at: string;
  updated_at: string;
}

export async function searchDrugMaster(searchTerm: string, limit = 12) {
  const { data, error } = await requireSupabase().rpc('search_drug_master', {
    p_search_term: searchTerm,
    p_limit: limit,
  });
  if (error) throw error;
  return (data ?? []) as DrugSearchRow[];
}

export async function searchRecentPrescriptionMedicines(searchTerm: string, limit = 6) {
  const { data, error } = await requireSupabase().rpc('search_recent_prescription_medicines', {
    p_search_term: searchTerm,
    p_limit: limit,
  });
  if (error) throw error;
  return (data ?? []) as Array<DrugSearchRow & { last_used_at: string; use_count: number }>;
}

export async function searchClinicalSuggestions(category: ClinicalCategory, searchTerm: string, limit = 20) {
  const { data, error } = await requireSupabase().rpc('search_clinical_suggestions', {
    p_category: category,
    p_search_term: searchTerm,
    p_limit: limit,
  });
  if (error) throw error;
  return (data ?? []) as ClinicalSuggestionRow[];
}

export async function searchPrescriptionTextSuggestions(
  category: 'dose' | 'meal_instruction',
  searchTerm: string,
  limit = 10,
) {
  const { data, error } = await requireSupabase().rpc('search_prescription_text_suggestions', {
    p_category: category,
    p_search_term: searchTerm,
    p_limit: limit,
  });
  if (error) throw error;
  return (data ?? []) as TextSuggestionRow[];
}

export async function getPrescriptionAppointmentContext(appointmentId: string) {
  const { data, error } = await requireSupabase().rpc('get_prescription_appointment_context', {
    p_appointment_id: appointmentId,
  });
  if (error) throw error;
  return (data ?? null) as PrescriptionAppointmentContext | null;
}

export async function saveMyPrescription(payload: PrescriptionPayload) {
  const { data, error } = await requireSupabase().rpc('save_my_prescription_v2', {
    p_payload: payload,
  });
  if (error) throw error;
  return data as string;
}

export async function updateMyPrescription(prescriptionId: string, payload: PrescriptionPayload) {
  const { data, error } = await requireSupabase().rpc('update_my_prescription', {
    p_prescription_id: prescriptionId,
    p_payload: payload,
  });
  if (error) throw error;
  return data as string;
}

export async function getMyPrescription(prescriptionId: string) {
  const { data, error } = await requireSupabase().rpc('get_my_prescription', {
    p_prescription_id: prescriptionId,
  });
  if (error) throw error;
  return (data ?? null) as DoctorPrescriptionRecord | null;
}

export async function getMyPrescriptionSettings() {
  const { data, error } = await requireSupabase().rpc('get_my_prescription_settings');
  if (error) throw error;
  return (data ?? null) as PrescriptionSettings | null;
}

export async function getMyAdviceTemplates() {
  const { data, error } = await requireSupabase().rpc('get_my_advice_templates');
  if (error) throw error;
  return (data ?? []) as AdviceTemplate[];
}

export async function saveMyAdviceTemplate(adviceText: string, adviceId: string | null = null) {
  const { data, error } = await requireSupabase().rpc('save_my_advice_template', {
    p_advice_id: adviceId,
    p_advice_text: adviceText,
  });
  if (error) throw error;
  return data as string;
}

export async function deleteMyAdviceTemplate(adviceId: string) {
  const { error } = await requireSupabase().rpc('delete_my_advice_template', {
    p_advice_id: adviceId,
  });
  if (error) throw error;
}

export async function getMyPrescriptions(limit = 30, offset = 0) {
  const { data, error } = await requireSupabase().rpc('get_my_prescriptions', {
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw error;
  return (data ?? []) as PrescriptionSummary[];
}
