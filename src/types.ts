export type SearchMode = 'doctor' | 'ambulance';
export type PublicRegistrationRole = 'patient' | 'doctor' | 'hospital' | 'ambulance';
export type UserRole = PublicRegistrationRole | 'chamber' | 'verification_officer' | 'admin' | 'super_admin';

export interface AccountContext {
  user_id: string;
  role: UserRole;
  account_status: 'active' | 'suspended' | 'banned';
  full_name: string | null;
  avatar_url: string | null;
  profile_completed: boolean;
}

export interface DashboardContext extends AccountContext {
  district_id: number | null;
  upazila_id: number | null;
  doctor?: {
    verification_status: string;
    bmdc_verified: boolean;
    degree: string | null;
    designation: string | null;
    consultation_fee: number | null;
    accepting_appointments: boolean;
  } | null;
  providers?: Array<{
    id: string;
    name_bn: string;
    provider_type: string;
    status: string;
    verified: boolean;
  }>;
  admin_scope?: string;
}

export interface PatientProfile {
  user_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  gender: 'male' | 'female' | 'other' | null;
  blood_group: string | null;
  address_line: string | null;
  district_id: number | null;
  upazila_id: number | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  preferred_language: string;
  profile_completed: boolean;
}

export type AppointmentStatus = 'pending' | 'confirmed' | 'rejected' | 'cancelled' | 'completed' | 'no_show';

export interface AppointmentRow {
  appointment_id: string;
  appointment_date: string;
  start_time: string | null;
  end_time: string | null;
  status: AppointmentStatus;
  patient_name: string;
  doctor_name: string;
  provider_name: string | null;
  provider_type: string | null;
  address: string | null;
  consultation_fee: number | null;
  patient_note: string | null;
  created_at: string;
}

export interface District {
  id: number;
  division_id: number;
  name_bn: string;
  name_en: string;
  slug: string;
}

export interface Upazila {
  id: number;
  district_id: number;
  name_bn: string;
  name_en: string;
  slug: string;
}

export interface Specialty {
  id: number;
  name_bn: string;
  name_en: string;
  slug: string;
  sort_order: number;
}

export interface DiscoveryTopic {
  id: number;
  name_bn: string;
  name_en: string | null;
  slug: string;
  icon: string | null;
  description_bn: string | null;
  search_keywords: string[];
  specialty_ids: number[];
}

export interface HomepageBanner {
  id: string;
  title_bn: string;
  title_en: string | null;
  subtitle_bn: string | null;
  subtitle_en: string | null;
  image_path: string;
  image_alt_bn: string | null;
  target_url: string | null;
}

export interface HomepageSection {
  id: string;
  key: string;
  title_bn: string;
  title_en: string | null;
  description_bn: string | null;
  data_source: 'doctor' | 'provider' | 'ambulance' | 'topic' | 'custom';
  filter_config: Record<string, unknown>;
  view_all_path: string | null;
  card_limit: number;
}

export interface HomepageConfiguration {
  sections: HomepageSection[];
  banners: HomepageBanner[];
  topics: DiscoveryTopic[];
  settings: Record<string, unknown>;
}

export interface DoctorSpecialty {
  id: number;
  name_bn: string;
  name_en: string;
  slug: string;
  is_primary: boolean;
}

export interface DoctorSearchRow {
  doctor_id: string;
  doctor_name: string;
  avatar_url: string | null;
  degree: string | null;
  designation: string | null;
  professional_title: string | null;
  consultation_fee: number | null;
  experience_years: number | null;
  district_id: number | null;
  district_name_bn: string | null;
  upazila_id: number | null;
  upazila_name_bn: string | null;
  specialties: DoctorSpecialty[];
  available_today: boolean;
  total_count: number;
}

export interface AmbulanceSearchRow {
  ambulance_id: string;
  operator_name: string;
  driver_name: string | null;
  phone: string;
  secondary_phone: string | null;
  vehicle_type: string;
  capabilities: string[];
  service_area: string | null;
  address: string | null;
  district_id: number | null;
  district_name_bn: string | null;
  upazila_id: number | null;
  upazila_name_bn: string | null;
  price_note: string | null;
  operates_24_hours: boolean;
  is_available: boolean;
  distance_km: number | null;
  hospital_id: string | null;
  hospital_name_bn: string | null;
  total_count: number;
}

export interface DoctorPublicProfile {
  doctor: {
    id: string;
    name: string;
    avatar_url: string | null;
    degree: string | null;
    designation: string | null;
    professional_title: string | null;
    bmdc_registration_no: string | null;
    experience_years: number | null;
    consultation_fee: number | null;
    headline: string | null;
    bio: string | null;
    languages: string[] | null;
    accepting_appointments: boolean;
  };
  specialties: Array<{
    id: number;
    name_bn: string;
    name_en: string;
    icon_url: string | null;
  }>;
  chambers: Array<{
    id: string;
    type: 'chamber' | 'hospital';
    name_bn: string;
    name_en: string | null;
    address: string | null;
    district_id: number | null;
    upazila_id: number | null;
    latitude: number | null;
    longitude: number | null;
    map_url: string | null;
    phone: string | null;
    emergency_available: boolean;
    schedules: Array<{
      day_of_week: number;
      start_time: string;
      end_time: string;
      fee: number | null;
    }>;
  }>;
}

export interface DoctorDashboardSchedule {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  fee: number | null;
  is_active: boolean;
}

export interface DoctorDashboardChamber {
  id: string;
  name_bn: string;
  provider_type: 'chamber' | 'hospital';
  address: string | null;
  phone: string | null;
  link_status: 'pending' | 'approved' | 'rejected' | 'removed';
  provider_status: 'pending' | 'approved' | 'rejected' | 'suspended';
  verified: boolean;
  schedules: DoctorDashboardSchedule[];
}

export interface MyDoctorProfile {
  doctor: {
    id: string;
    full_name: string | null;
    email: string | null;
    phone: string | null;
    district_id: number | null;
    upazila_id: number | null;
    professional_title: string | null;
    degree: string | null;
    designation: string | null;
    bmdc_registration_no: string | null;
    bmdc_verified: boolean;
    bio: string | null;
    consultation_fee: number | null;
    experience_years: number | null;
    verification_status: 'pending' | 'approved' | 'rejected' | 'expired';
    profile_headline: string | null;
    profile_photo_url: string | null;
    consultation_note: string | null;
    languages: string[] | null;
    accepting_appointments: boolean;
  };
  specialty_ids: number[];
  chambers: DoctorDashboardChamber[];
}
