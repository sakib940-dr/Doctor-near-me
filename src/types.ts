export type SearchMode = 'doctor' | 'ambulance';
export type PublicRegistrationRole = 'patient' | 'doctor' | 'hospital' | 'ambulance';
export type UserRole = PublicRegistrationRole | 'chamber' | 'verification_officer' | 'admin' | 'super_admin';
export type DashboardRole = UserRole;
export type MedicalType = 'MBBS' | 'BDS';

export interface AccountContext {
  user_id: string;
  role: UserRole;
  account_status: 'active' | 'suspended' | 'banned';
  full_name: string | null;
  email: string | null;
  phone: string | null;
  district_id: number | null;
  upazila_id: number | null;
  avatar_url: string | null;
  profile_completed: boolean;
  onboarding_step: number;
  onboarding_completed: boolean;
  onboarding_completed_at: string | null;
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
  latitude?: number | null;
  longitude?: number | null;
}

export interface BloodDonorProfile {
  blood_group: string;
  is_volunteer: boolean;
  phone_public: boolean;
  last_donation_date: string | null;
  available_for_requests: boolean;
  district_id: number | null;
  upazila_id: number | null;
  latitude: number | null;
  longitude: number | null;
  updated_at: string;
}

export interface BloodDonorSearchRow {
  donor_id: string;
  donor_name: string;
  phone: string | null;
  blood_group: string;
  district_id: number | null;
  upazila_id: number | null;
  last_donation_date: string | null;
  available_for_requests?: boolean;
  distance_km: number | null;
}

export interface PublicBloodRequestRow {
  request_id: string;
  patient_name: string;
  blood_group: string;
  district_id: number | null;
  upazila_id: number | null;
  contact_phone: string | null;
  needed_at: string | null;
  status: string;
  created_at: string;
}

export interface BloodRequestRow {
  request_id: string;
  patient_name: string;
  blood_group: string;
  units_needed: number;
  units_fulfilled: number;
  hospital_name: string | null;
  hospital_address: string | null;
  district_id: number | null;
  upazila_id: number | null;
  needed_at: string | null;
  reason: string | null;
  contact_phone: string | null;
  status: string;
  response_count: number;
  created_at: string;
  updated_at: string;
}

export interface BloodRequestResponseRow {
  response_id: string;
  donor_id: string;
  donor_name: string;
  phone: string | null;
  blood_group: string;
  district_id: number | null;
  upazila_id: number | null;
  last_donation_date: string | null;
  status: string;
  created_at: string;
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
  location_type: 'upazila' | 'city_area';
  city_corporation: 'north' | 'south' | null;
}

export interface LocationResolution {
  district_id: number;
  district_name_bn: string;
  district_name_en: string;
  district_slug: string;
  upazila_id: number | null;
  upazila_name_bn: string | null;
  upazila_name_en: string | null;
  upazila_slug: string | null;
  resolution_source: 'upazila_centroid_cluster' | 'district_centroid' | 'dhaka_city_area_centroid' | 'dhaka_upazila_centroid' | 'dhaka_district_fallback';
  distance_km: number;
}

export interface Specialty {
  id: number;
  name_bn: string;
  name_en: string;
  slug: string;
  icon_url: string | null;
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
  profile_slug?: string | null;
  doctor_name: string;
  avatar_url: string | null;
  degree: string | null;
  designation: string | null;
  professional_title: string | null;
  medical_type?: MedicalType | null;
  specialty_text?: string | null;
  public_address?: string | null;
  bmdc_registration_no?: string | null;
  medical_college?: string | null;
  present_job?: string | null;
  consultation_fee: number | null;
  experience_years: number | null;
  district_id: number | null;
  district_name_bn: string | null;
  upazila_id: number | null;
  upazila_name_bn: string | null;
  specialties: DoctorSpecialty[];
  available_today: boolean;
  total_count: number;
  distance_km?: number | null;
  nearest_provider_id?: string | null;
  nearest_provider_name?: string | null;
  nearest_provider_type?: string | null;
  nearest_provider_address?: string | null;
  nearest_provider_latitude?: number | null;
  nearest_provider_longitude?: number | null;
  verification_status?: 'pending' | 'approved' | 'rejected' | 'expired';
  provider_schedules?: Array<{ day_of_week: number; start_time: string; end_time: string; fee: number | null; note?: { bn?: string | null; en?: string | null } | null }>;
}


export interface ProviderDirectoryRow {
  id: string;
  provider_type: 'hospital' | 'chamber';
  name_bn: string;
  name_en: string | null;
  slug: string;
  logo_url: string | null;
  banner_url: string | null;
  short_description?: string | null;
  about_bn?: string | null;
  about_en?: string | null;
  phone: string | null;
  whatsapp?: string | null;
  email?: string | null;
  facebook_url?: string | null;
  website_url?: string | null;
  address: string | null;
  district_id: number | null;
  upazila_id: number | null;
  latitude: number | null;
  longitude: number | null;
  map_url: string | null;
  opening_note?: string | null;
  emergency_available?: boolean;
  verified: boolean;
  ranking_tier?: PublicRankingTier;
  is_premium?: boolean;
  total_count?: number;
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
    medical_type?: MedicalType | null;
    specialty_text?: string | null;
    public_address?: string | null;
    bmdc_registration_no: string | null;
    verification_status?: 'pending' | 'approved' | 'rejected' | 'expired';
    medical_college?: string | null;
    present_job?: string | null;
    experience_years: number | null;
    consultation_fee: number | null;
    headline: string | null;
    bio: string | null;
    bio_bn?: string | null;
    bio_en?: string | null;
    languages: string[] | null;
    accepting_appointments: boolean;
    // Optional forward-compatible public contact/profile fields. Existing
    // deployments may omit them; the UI hides absent values.
    phone?: string | null;
    whatsapp?: string | null;
    facebook_url?: string | null;
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
    whatsapp?: string | null;
    emergency_available: boolean;
    schedules: Array<{
      day_of_week: number;
      start_time: string;
      end_time: string;
      fee: number | null;
      note?: { bn?: string | null; en?: string | null } | null;
    }>;
  }>;
}

export interface DoctorDashboardSchedule {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  fee: number | null;
  note?: { bn?: string | null; en?: string | null } | null;
  is_active: boolean;
}

export interface DoctorDashboardChamber {
  id: string;
  name_bn: string;
  provider_type: 'chamber' | 'hospital';
  address: string | null;
  phone: string | null;
  whatsapp?: string | null;
  district_id?: number | null;
  upazila_id?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  map_url?: string | null;
  owned_by_doctor?: boolean;
  link_status: 'pending' | 'approved' | 'rejected' | 'removed';
  provider_status: 'pending' | 'approved' | 'rejected' | 'suspended';
  verified: boolean;
  schedules: DoctorDashboardSchedule[];
}

export interface MyDoctorProfile {
  doctor: {
    id: string;
    profile_slug?: string | null;
    full_name: string | null;
    email: string | null;
    phone: string | null;
    district_id: number | null;
    upazila_id: number | null;
    medical_type?: MedicalType | null;
    professional_title: string | null;
    specialty_text?: string | null;
    public_address?: string | null;
    degree: string | null;
    designation: string | null;
    bmdc_registration_no: string | null;
    medical_college: string | null;
    show_medical_college_public?: boolean;
    present_job: string | null;
    bmdc_verified: boolean;
    bio: string | null;
    bio_bn?: string | null;
    bio_en?: string | null;
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
  specialties?: Array<{
    id: number;
    name_bn: string;
    name_en: string | null;
  }>;
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
  about_bn: string | null;
  about_en: string | null;
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

export interface ProviderManagedDoctorCard {
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
  is_active?: boolean;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}

export interface ProviderReceptionAppointment {
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

export interface PublicContentPage {
  slug: 'terms' | 'privacy';
  title_bn: string;
  title_en: string | null;
  body_bn: string;
  body_en: string | null;
  seo_title: string | null;
  meta_description: string | null;
  updated_at: string;
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

export interface DoctorVerificationProfile {
  doctor_id: string;
  medical_type: MedicalType | null;
  medical_college: string | null;
  medical_session: string | null;
  medical_batch: string | null;
  bmdc_registration_no: string | null;
  degree: string | null;
  verification_status: 'pending' | 'approved' | 'rejected' | 'expired';
  verification_note: string | null;
  bmdc_verified: boolean;
  verified_at: string | null;
  verification_submitted_at?: string | null;
}

export interface SuperAdminDoctorVerificationPolicy {
  hide_unverified_doctors: boolean;
  new_registration_requires_verification: boolean;
  new_registration_verification_enabled_at: string | null;
  active_pending_doctors: number;
  currently_public_pending_doctors: number;
  approved_active_doctors: number;
}

export interface AdminOperationalSummary {
  total_users: number;
  active_users: number;
  suspended_users: number;
  banned_users: number;
  doctors: number;
  providers: number;
  ambulances: number;
  patients?: number;
  hospitals?: number;
  premium_members?: number;
  verified_doctors?: number;
  total_appointments?: number;
  total_prescriptions?: number;
  total_reviews?: number;
  pending_premium_memberships?: number;
  premium_requests?: number;
  expiring_premium_memberships?: number;
  pending_doctor_verifications?: number;
  pending_hospital_verifications?: number;
  flagged_reviews_supported?: boolean;
  flagged_reviews?: number;
  failed_push_deliveries?: number;
  pending_doctors: number;
  pending_providers: number;
  pending_ambulances: number;
  pending_verifications: number;
  appointments_today: number;
  pending_appointments: number;
  appointments_last_30_days: number;
  role_counts: Partial<Record<UserRole, number>>;
}

export type ProfileReportTargetType = 'doctor' | 'provider';
export type ProfileReportReason = 'fake_doctor' | 'fake_bmdc_information' | 'wrong_degree' | 'fake_hospital_chamber' | 'wrong_phone_number' | 'inappropriate_content' | 'other';

export interface AdminProfileReportSummary {
  pending_reports: number;
  flagged_profiles: number;
  high_priority_profiles: number;
}

export interface AdminProfileReportItem {
  id: string;
  reason: ProfileReportReason;
  details: string | null;
  status: 'pending' | 'reviewed' | 'dismissed' | 'actioned';
  created_at: string;
  admin_note: string | null;
}

export interface AdminProfileReportQueueRow {
  target_type: ProfileReportTargetType;
  target_id: string;
  target_name: string;
  provider_type: 'hospital' | 'chamber' | null;
  public_slug: string | null;
  target_status: string;
  pending_report_count: number;
  total_report_count: number;
  last_reported_at: string;
  reason_counts: Partial<Record<ProfileReportReason, number>>;
  recent_reports: AdminProfileReportItem[];
  total_count: number;
}

export interface AdminOperationalTrendRow {
  day: string;
  new_users: number;
  appointments: number;
}

export type AdminAnalyticsRangeKey = 'today' | '7d' | '30d' | '90d' | '1y' | 'custom';

export interface AdminAnalyticsMetric {
  current: number;
  previous: number;
  growth_pct: number | null;
}

export interface AdminAnalyticsSeriesRow {
  period: string;
  users: number;
  doctors: number;
  hospitals: number;
  patients: number;
  appointments: number;
  prescriptions: number;
  follows: number;
  calls: number;
  whatsapp: number;
  reviews: number;
  premium: number;
}

export interface AdminHighLevelAnalytics {
  range: { key: AdminAnalyticsRangeKey; from: string; to: string; days: number; bucket: 'day' | 'week' | 'month' };
  metrics: Partial<Record<'users' | 'doctors' | 'hospitals' | 'patients' | 'appointments' | 'prescriptions' | 'follows' | 'calls' | 'whatsapp' | 'reviews' | 'premium', AdminAnalyticsMetric>>;
  series: AdminAnalyticsSeriesRow[];
}

export type AdminTopDoctorRangeKey = 'today' | '7d' | '30d' | 'all';
export type AdminTopDoctorMetricKey = 'prescriptions' | 'follows' | 'calls' | 'whatsapp' | 'appointments' | 'views' | 'reviews' | 'rating';

export interface AdminTopDoctorRow {
  rank: number;
  doctor_id: string;
  name: string;
  photo_url: string | null;
  degree: string | null;
  specialty: string | null;
  status: 'premium' | 'verified' | 'new' | 'unverified' | string;
  verification_status: string;
  profile_slug: string | null;
  metric_value: number;
  sample_count: number;
}

export interface AdminTopDoctorsAnalytics {
  range: { key: AdminTopDoctorRangeKey; from: string | null; to: string };
  rankings: Record<AdminTopDoctorMetricKey, AdminTopDoctorRow[]>;
}

export type AdminTopHospitalMetricKey = 'follows' | 'calls' | 'whatsapp' | 'appointments' | 'views' | 'reviews' | 'rating';

export interface AdminTopHospitalRow {
  rank: number;
  provider_id: string;
  name: string;
  photo_url: string | null;
  subtitle: string | null;
  status: 'premium' | 'verified' | 'new' | 'unverified' | string;
  verification_status: string;
  slug: string | null;
  metric_value: number;
  sample_count: number;
}

export interface AdminVisitorEngagementSummary {
  doctor_saves: number;
  hospital_saves: number;
  calls: number;
  whatsapp: number;
  appointments: number;
  reviews: number;
  shares: number;
  map_clicks: number;
}

export interface AdminHospitalEngagementAnalytics {
  range: { key: AdminTopDoctorRangeKey; from: string | null; to: string };
  rankings: Record<AdminTopHospitalMetricKey, AdminTopHospitalRow[]>;
  engagement: AdminVisitorEngagementSummary;
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
  medical_type?: MedicalType | null;
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
  setting_key: 'public_brand' | 'social_links' | 'default_location' | 'directory_ranking_policy';
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

export interface SuperAdminUserRow {
  user_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  role: UserRole;
  account_status: 'active' | 'suspended' | 'banned';
  district_id: number | null;
  district_name: string | null;
  upazila_id: number | null;
  upazila_name: string | null;
  address_line: string | null;
  profile_completed: boolean;
  medical_type?: MedicalType | null;
  last_location_at: string | null;
  last_sign_in_at: string | null;
  created_at: string;
  total_count: number;
}

export interface SuperAdminUserDetail {
  profile: Record<string, unknown> & {
    id: string;
    full_name: string | null;
    email: string | null;
    phone: string | null;
    role: UserRole;
    account_status: 'active' | 'suspended' | 'banned';
    date_of_birth: string | null;
    gender: string | null;
    blood_group: string | null;
    address_line: string | null;
    district_id: number | null;
    upazila_id: number | null;
    emergency_contact_name: string | null;
    emergency_contact_phone: string | null;
  };
  auth: { email_confirmed_at: string | null; phone_confirmed_at: string | null; last_sign_in_at: string | null; auth_created_at: string };
  district: { id: number | null; name_bn: string | null; name_en: string | null };
  upazila: { id: number | null; name_bn: string | null; name_en: string | null };
  last_location: { latitude: number; longitude: number; accuracy_meters: number | null; source: string; updated_at: string; district_id: number | null; district_name: string | null; upazila_id: number | null; upazila_name: string | null } | null;
  doctor: Record<string, unknown> | null;
  providers: Array<Record<string, unknown>>;
  ambulances: Array<Record<string, unknown>>;
  blood_donor: Record<string, unknown> | null;
  appointment_counts: { as_patient: number; as_doctor: number; pending: number };
  recent_appointments: Array<Record<string, unknown>>;
  recent_audit: Array<Record<string, unknown>>;
}

export interface PrivilegedAccountInvite {
  invite_id: string;
  email: string;
  full_name: string;
  phone: string | null;
  target_role: 'admin' | 'verification_officer';
  expires_at: string;
  claimed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
}

// STEP 39 — public engagement / structured review foundation
export type PublicRankingTier = 'premium' | 'verified' | 'new' | 'unverified';

export interface PublicProfileStats {
  follower_count: number;
  review_count: number;
  average_rating: number | null;
  is_following: boolean;
  ranking_tier: PublicRankingTier;
  is_premium: boolean;
}

export interface PublicProfileStatsRow extends PublicProfileStats {
  target_type: 'doctor' | 'provider';
  target_id: string;
}

export interface SavedProfileCard {
  target_type: 'doctor' | 'provider';
  public_slug?: string | null;
  target_id: string;
  title: string;
  subtitle: string | null;
  image_url: string | null;
  verification_status: string | null;
  provider_type: 'hospital' | 'chamber' | null;
  saved_at: string;
}


export type ReviewLanguage = 'bn' | 'en';

export interface StructuredReviewQuestion {
  key: string;
  score_key: 'q1' | 'q2' | 'q3' | 'q4' | 'q5';
  bn: string;
  en: string;
}

export interface StructuredReviewQuestionSet {
  version: number;
  doctor: StructuredReviewQuestion[];
  provider: StructuredReviewQuestion[];
}

export interface StructuredReviewSummary {
  target_type: 'doctor' | 'provider';
  review_count: number;
  overall_average: number | null;
  q1_average: number | null;
  q2_average: number | null;
  q3_average: number | null;
  q4_average: number | null;
  q5_average: number | null;
}

export interface StructuredReview {
  review_id: string;
  target_type?: 'doctor' | 'provider';
  reviewer_name?: string;
  q1_score: number;
  q2_score: number;
  q3_score: number;
  q4_score: number;
  q5_score: number;
  rating: number;
  comment: string | null;
  reply?: { bn?: string | null; en?: string | null } | null;
  replied_at?: string | null;
  is_published?: boolean;
  created_at: string;
  edited_at: string | null;
  total_count?: number;
}

export interface AnalyticsSeriesPoint {
  bucket: string;
  profile_views: number;
  call_clicks: number;
  whatsapp_clicks: number;
  appointment_clicks: number;
  appointment_requests: number;
  map_clicks: number;
  follows: number;
  reviews: number;
}

export interface InteractionSummary {
  target_type?: 'doctor' | 'provider';
  target_id?: string;
  profile_views: number;
  call_clicks: number;
  whatsapp_clicks: number;
  appointment_clicks: number;
  appointment_requests: number;
  map_clicks: number;
  profile_shares: number;
  share_clicks: number;
  native_share_initiated: number;
  copy_link: number;
  followers: number;
  followers_new: number;
  followers_lost: number;
  followers_net: number;
  reviews: number;
  review_submitted: number;
  review_edited: number;
  average_rating: number | null;
  days: number;
  bucket?: 'day' | 'month';
  series?: AnalyticsSeriesPoint[];
}

export type AnalyticsPeriod = 7 | 30 | 0;
export type ProfileAnalytics = InteractionSummary & {
  target_type: 'doctor' | 'provider';
  target_id: string;
  bucket: 'day' | 'month';
  series: AnalyticsSeriesPoint[];
};

export interface DoctorSliderImage {
  id: number;
  doctor_id: string;
  image: string;
  caption: { bn?: string; en?: string };
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}


// STEP 41 — Admin-managed degree classification
export type DegreeQualificationLevel = 'basic' | 'postgraduate';
export type DegreeClassification = 'general' | 'specialist';
export type DegreeDiscipline = 'medical' | 'dental' | 'public_health' | 'other';

export interface DegreeMasterItem {
  id: number;
  name: string;
  short_code: string;
  qualification_level: DegreeQualificationLevel;
  classification: DegreeClassification;
  discipline: DegreeDiscipline;
  aliases: string[];
  sort_order: number;
  is_active?: boolean;
}

// STEP 45 — Doctor public profile content/editor
export interface LocalizedProfileText {
  bn?: string | null;
  en?: string | null;
}

export interface DoctorServiceItem {
  id: number;
  doctor_id: string;
  name: LocalizedProfileText;
  description: LocalizedProfileText | null;
  icon: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface DoctorTreatmentCostItem {
  id: number;
  doctor_id: string;
  name: LocalizedProfileText;
  cost: {
    min?: number | null;
    max?: number | null;
    note_bn?: string | null;
    note_en?: string | null;
  };
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface DoctorInvestigationCostItem {
  id: number;
  doctor_id: string;
  name: LocalizedProfileText;
  cost: {
    amount?: number | null;
    note_bn?: string | null;
    note_en?: string | null;
  };
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface DoctorPublicContent {
  bio_bn: string | null;
  bio_en: string | null;
  slider_images: DoctorSliderImage[];
  services: DoctorServiceItem[];
  treatment_costs: DoctorTreatmentCostItem[];
  investigation_costs: DoctorInvestigationCostItem[];
}

export interface DoctorChamberDistance {
  provider_id: string;
  distance_km: number;
}

export type PremiumMembershipStatus = 'active' | 'pending' | 'expired' | 'inactive';

export interface PremiumCriterionProgress {
  key: 'followers' | 'referrals' | 'profile' | 'verification' | 'achievements' | string;
  label_bn: string;
  label_en: string;
  enabled: boolean;
  current: number;
  required: number;
  unit?: string;
  complete: boolean;
}

export interface PremiumAchievementSummary {
  rule_id: number;
  code: string;
  title_bn: string;
  title_en: string | null;
}

export interface PremiumProgress {
  target_type: 'doctor' | 'provider';
  target_id: string;
  policy_enabled: boolean;
  manual_approval_required: boolean;
  premium_duration_days: number;
  followers: number;
  approved_referrals: number;
  achievement_count: number;
  profile_completion_percent: number;
  verified: boolean;
  requirements_complete: boolean;
  is_premium: boolean;
  membership_status: PremiumMembershipStatus;
  membership_id: string | null;
  starts_at: string | null;
  expires_at: string | null;
  criteria: PremiumCriterionProgress[];
  achievements: PremiumAchievementSummary[];
}

export interface PremiumPolicy {
  enabled: boolean;
  min_followers: number;
  min_approved_referrals: number;
  require_profile_completion: boolean;
  min_profile_completion_percent: number;
  require_verification: boolean;
  min_achievement_count: number;
  manual_approval_required: boolean;
  premium_duration_days: number;
  referral_claim_window_days: number;
  referral_requires_admin_approval: boolean;
}

export interface PremiumAdminTarget {
  target_type: 'doctor' | 'provider';
  target_id: string;
  name: string;
  owner_user_id: string;
  verification_label: string;
  follower_count: number;
  approved_referral_count: number;
  achievement_count: number;
  profile_completion_percent: number;
  requirements_complete: boolean;
  membership_status: PremiumMembershipStatus;
  is_premium: boolean;
  membership_id: string | null;
  expires_at: string | null;
}

export interface PremiumAchievementRule {
  id: number;
  code: string;
  title_bn: string;
  title_en: string | null;
  description_bn: string | null;
  counts_toward_premium: boolean;
  is_active: boolean;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PremiumReferralRow {
  id: string;
  referrer_id: string;
  referrer_name: string;
  referred_user_id: string | null;
  referred_name: string | null;
  referral_code: string;
  status: 'pending' | 'approved' | 'rejected' | 'invalid';
  created_at: string;
  validated_at: string | null;
}

export type AdminStorageWarningLevel = 'unknown' | 'normal' | 'notice' | 'warning' | 'critical';

export interface AdminStorageCleanupSummary {
  total_files: number;
  referenced_files: number;
  orphan_files: number;
  recent_unreferenced_files: number;
  total_bytes: number;
  orphan_bytes: number;
  grace_hours: number;
  quota_bytes: number | null;
  usage_percent: number | null;
  warning_level: AdminStorageWarningLevel;
  notice_percent: number;
  warning_percent: number;
  critical_percent: number;
  expired_push_subscriptions: number;
}

export interface AdminStorageCleanupObject {
  bucket_id: 'avatars' | 'public-images' | 'verification-documents';
  name: string;
  size_bytes: number;
  created_at: string;
  age_hours: number;
}

export interface AdminStorageCleanupResult {
  deleted_objects: number;
  deleted_bytes: number;
  failed_objects: number;
  expired_push_subscriptions_deleted: number;
}
