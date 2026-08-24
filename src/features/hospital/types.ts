import type { AppointmentStatus, ProviderDashboardItem } from '../../types';

export type HospitalContactMode = 'reception' | 'individual';

export interface HospitalDoctorCard {
  id: string;
  provider_id: string;
  doctor_name: string;
  photo_path: string | null;
  degree: string | null;
  designation: string | null;
  specialty: string | null;
  bmdc_registration_no: string | null;
  experience_years: number | null;
  consultation_fee: number | null;
  visiting_schedule: string | null;
  appointment_note: string | null;
  room_information: string | null;
  contact_mode: HospitalContactMode;
  individual_phone: string | null;
  individual_whatsapp: string | null;
  is_active?: boolean;
  sort_order: number;
  archived_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface HospitalDoctorSearchRow extends HospitalDoctorCard {
  hospital_name: string;
  hospital_logo: string | null;
  hospital_phone: string | null;
  hospital_whatsapp: string | null;
  hospital_address: string | null;
  hospital_latitude: number | null;
  hospital_longitude: number | null;
  hospital_map_url: string | null;
  district_id: number | null;
  upazila_id: number | null;
  total_count: number;
}

export interface PublicHospitalDoctorProfile {
  doctor: HospitalDoctorCard;
  hospital: import('../../types').ProviderDirectoryRow;
}

export interface HospitalReceptionAppointment {
  appointment_id: string;
  provider_id: string;
  provider_name: string;
  doctor_card_id: string;
  doctor_name: string;
  patient_id: string;
  patient_name: string;
  patient_phone: string | null;
  appointment_date: string;
  preferred_time: string | null;
  patient_note: string | null;
  serial_number: number | null;
  status: AppointmentStatus;
  created_at: string;
  updated_at: string;
}

export interface HospitalStaffMember {
  id: string;
  provider_id: string;
  full_name: string;
  designation: string | null;
  department: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export type HospitalProvider = ProviderDashboardItem;
