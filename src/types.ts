export type SearchMode = 'doctor' | 'ambulance';

export interface District {
  id: number;
  division_id: number;
  name_bn: string;
  name_en: string;
  slug: string;
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
