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

export interface ProviderDoctorLink {
  doctor_id: string;
  doctor_name: string;
  avatar_url: string | null;
  degree: string | null;
  designation: string | null;
  professional_title: string | null;
  verification_status: string;
  link_status: 'pending' | 'approved' | 'rejected' | 'removed';
  created_at: string;
  schedules: DoctorDashboardSchedule[];
}

export interface ProviderDashboardItem {
  id: string;
  provider_type: 'hospital' | 'chamber';
  name_bn: string;
  name_en: string | null;
  short_description: string | null;
  logo_url: string | null;
  banner_url: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  facebook_url: string | null;
  website_url: string | null;
  address: string | null;
  district_id: number | null;
  upazila_id: number | null;
  latitude: number | null;
  longitude: number | null;
  google_maps_url: string | null;
  opening_note: string | null;
  emergency_available: boolean;
  departments: string[];
  services: string[];
  gallery_paths: string[];
  status: 'pending' | 'approved' | 'rejected' | 'suspended';
  verified: boolean;
  doctor_links: ProviderDoctorLink[];
}

export interface ProviderDoctorSearchRow {
  doctor_id: string;
  doctor_name: string;
  avatar_url: string | null;
  degree: string | null;
  designation: string | null;
  professional_title: string | null;
  specialty_names_bn: string[];
}

export interface DoctorProviderInvitation {
  provider_id: string;
  provider_name: string;
  provider_type: 'hospital' | 'chamber';
  address: string | null;
  link_status: 'pending' | 'approved' | 'rejected' | 'removed';
  invited_at: string;
}

export type AmbulanceVehicleType = 'ac' | 'non_ac' | 'icu' | 'freezer' | 'basic' | 'other';
export type AmbulanceDocumentType = 'vehicle_registration' | 'driver_license' | 'national_id' | 'organization_document' | 'vehicle_photo' | 'other';

export interface AmbulanceHospitalLink {
  hospital_id: string;
  hospital_name_bn: string;
  status: 'pending' | 'approved' | 'rejected' | 'removed';
  review_note: string | null;
}

export interface MyAmbulanceService {
  ambulance_id: string;
  operator_name: string;
  driver_name: string | null;
  phone: string;
  secondary_phone: string | null;
  vehicle_registration_no: string;
  vehicle_type: AmbulanceVehicleType;
  capabilities: string[];
  service_area: string | null;
  address: string;
  district_id: number | null;
  upazila_id: number | null;
  latitude: number | null;
  longitude: number | null;
  price_note: string | null;
  operates_24_hours: boolean;
  status: 'pending' | 'approved' | 'rejected' | 'suspended';
  verified: boolean;
  admin_note: string | null;
  verified_at: string | null;
  is_available: boolean;
  last_seen_at: string | null;
  document_count: number;
  hospital_links: AmbulanceHospitalLink[];
  created_at: string;
  updated_at: string;
}

export interface AmbulanceDocument {
  document_id: string;
  document_type: AmbulanceDocumentType;
  storage_path: string;
  created_at: string;
}

export interface ApprovedHospitalRow {
  hospital_id: string;
  hospital_name: string;
  address: string | null;
  district_id: number | null;
  upazila_id: number | null;
}

export interface HospitalAmbulanceLinkRequest {
  ambulance_id: string;
  operator_name: string;
  phone: string;
  vehicle_registration_no: string;
  vehicle_type: AmbulanceVehicleType;
  ambulance_status: 'pending' | 'approved' | 'rejected' | 'suspended';
  link_status: 'pending' | 'approved' | 'rejected' | 'removed';
  requested_at: string;
  review_note: string | null;
}

export type VerificationEntityType = 'doctor' | 'provider' | 'ambulance';

export interface VerificationEvidenceDocument {
  document_id: string;
  document_type: string;
  storage_path: string;
  created_at: string;
}

export interface OwnerVerificationEvidence {
  entity_type: 'doctor' | 'provider';
  entity_id: string;
  status: string;
  note: string | null;
  verified_at: string | null;
  documents: VerificationEvidenceDocument[];
}

export interface VerificationQueueRow {
  entity_type: VerificationEntityType;
  entity_id: string;
  display_name: string;
  subtitle: string | null;
  district_id: number | null;
  upazila_id: number | null;
  status: string;
  evidence_count: number;
  submitted_at: string;
}

export interface VerificationReviewDetail {
  entity_type: VerificationEntityType;
  entity_id: string;
  owner_id: string;
  status: string;
  note: string | null;
  verified_at: string | null;
  data: Record<string, unknown>;
  documents: VerificationEvidenceDocument[];
}

export interface AdminOperationalSummary {
  total_users: number;
  active_users: number;
  suspended_users: number;
  banned_users: number;
  doctors: number;
  providers: number;
  ambulances: number;
  pending_doctors: number;
  pending_providers: number;
  pending_ambulances: number;
  pending_verifications: number;
  appointments_today: number;
  pending_appointments: number;
  appointments_last_30_days: number;
  role_counts: Partial<Record<UserRole, number>>;
}

export interface AdminUserRow {
  user_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  role: UserRole;
  account_status: 'active' | 'suspended' | 'banned';
  district_id: number | null;
  upazila_id: number | null;
  professional_status: string | null;
  entity_id: string | null;
  created_at: string;
  updated_at: string;
  total_count: number;
}

export interface AdminAppointmentRow {
  appointment_id: string;
  appointment_date: string;
  start_time: string | null;
  end_time: string | null;
  status: AppointmentStatus;
  patient_id: string;
  patient_name: string;
  patient_phone: string | null;
  doctor_id: string;
  doctor_name: string;
  provider_id: string | null;
  provider_name: string | null;
  patient_note: string | null;
  created_at: string;
  updated_at: string;
  total_count: number;
}

export interface AdminActivityRow {
  audit_id: string;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  target_user_id: string | null;
  target_type: string | null;
  target_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface AdminCmsSpecialty extends Specialty {
  icon_url: string | null;
  is_active: boolean;
}

export interface AdminCmsTopic extends DiscoveryTopic {
  is_active: boolean;
  sort_order: number;
}

export interface AdminCmsSection {
  id: string;
  section_key: string;
  title_bn: string;
  title_en: string | null;
  description_bn: string | null;
  data_source: 'doctor' | 'provider' | 'ambulance' | 'topic' | 'custom';
  filter_config: Record<string, unknown>;
  view_all_path: string | null;
  card_limit: number;
  is_active: boolean;
  sort_order: number;
}

export interface AdminCmsBanner {
  id: string;
  title_bn: string;
  title_en: string | null;
  subtitle_bn: string | null;
  subtitle_en: string | null;
  image_path: string;
  image_alt_bn: string | null;
  target_url: string | null;
  district_id: number | null;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
  sort_order: number;
}

export interface AdminCmsContentPage {
  id: string;
  slug: 'about' | 'terms' | 'privacy' | 'faq' | 'help';
  title_bn: string;
  title_en: string | null;
  body_bn: string;
  body_en: string | null;
  seo_title: string | null;
  meta_description: string | null;
  is_published: boolean;
  updated_at: string;
}

export interface AdminCmsSetting {
  setting_key: 'public_brand' | 'social_links' | 'default_location';
  setting_value: Record<string, unknown>;
  is_public: boolean;
  description: string | null;
  updated_at: string;
}

export interface AdminCmsSnapshot {
  specialties: AdminCmsSpecialty[];
  topics: AdminCmsTopic[];
  sections: AdminCmsSection[];
  banners: AdminCmsBanner[];
  pages: AdminCmsContentPage[];
  settings: AdminCmsSetting[];
}
