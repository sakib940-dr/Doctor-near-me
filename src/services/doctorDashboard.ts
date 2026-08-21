import { requireSupabase } from '../lib/supabase';
import { removeOptimizedImageVariants, uploadOptimizedImage } from './imageUpload';
import type { MyDoctorProfile } from '../types';
import { resolvePublicDoctorRoute } from './discovery';
import { safeDateOnly } from '../lib/dateSafe';

export interface DoctorProfileUpdate {
  fullName: string;
  phone: string | null;
  professionalTitle: string | null;
  degree: string | null;
  designation: string | null;
  bmdcRegistrationNo: string | null;
  bio: string | null;
  consultationFee: number | null;
  experienceYears: number | null;
  profileHeadline: string | null;
  profilePhotoUrl: string | null;
  consultationNote: string | null;
  languages: string[];
  acceptingAppointments: boolean;
  districtId: number | null;
  upazilaId: number | null;
  specialtyIds: number[];
}

export interface DoctorProfileUpdateResult {
  verification_status: MyDoctorProfile['doctor']['verification_status'];
  credentials_changed: boolean;
}

export async function getMyDoctorProfile() {
  const { data, error } = await requireSupabase().rpc('get_my_doctor_profile');
  if (error) throw error;
  const profile = (data ?? null) as MyDoctorProfile | null;
  if (!profile?.doctor.id) return profile;
  try {
    const route = await resolvePublicDoctorRoute(profile.doctor.id);
    if (route) profile.doctor.profile_slug = route.slug;
  } catch {
    // Owner dashboard remains usable during rolling migration/deploy.
  }
  return profile;
}


export interface DoctorAnalyticsDay {
  date: string;
  count: number;
}

export interface DoctorAnalytics {
  todayAppointments: number;
  monthlyUniquePatients: number;
  pendingAppointments: number;
  last7Days: DoctorAnalyticsDay[];
}

export async function getDoctorAnalytics(_doctorId: string): Promise<DoctorAnalytics> {
  const { data, error } = await requireSupabase().rpc('get_my_doctor_dashboard_analytics');
  if (error) throw error;
  const raw = (data ?? {}) as {
    todayAppointments?: number;
    monthlyUniquePatients?: number;
    pendingAppointments?: number;
    last7Days?: DoctorAnalyticsDay[];
  };
  return {
    todayAppointments: Number(raw.todayAppointments ?? 0),
    monthlyUniquePatients: Number(raw.monthlyUniquePatients ?? 0),
    pendingAppointments: Number(raw.pendingAppointments ?? 0),
    last7Days: Array.isArray(raw.last7Days)
      ? raw.last7Days.flatMap((item) => {
          const date = safeDateOnly(item?.date);
          return date ? [{ date, count: Number(item?.count ?? 0) }] : [];
        })
      : [],
  };
}


export interface DoctorPrivateProfile {
  date_of_birth: string | null;
  gender: 'male' | 'female' | 'other' | null;
  blood_group: string | null;
  address_line: string | null;
}

export async function getMyDoctorPrivateProfile() {
  const { data, error } = await requireSupabase().rpc('get_my_doctor_private_profile');
  if (error) throw error;
  return (data ?? { date_of_birth: null, gender: null, blood_group: null, address_line: null }) as DoctorPrivateProfile;
}

export async function updateMyDoctorPrivateProfile(input: DoctorPrivateProfile) {
  const { error } = await requireSupabase().rpc('update_my_doctor_private_profile', {
    p_date_of_birth: input.date_of_birth || null,
    p_gender: input.gender || null,
    p_blood_group: input.blood_group || null,
    p_address_line: input.address_line?.trim() || null,
  });
  if (error) throw error;
}

export async function updateMyDoctorProfile(input: DoctorProfileUpdate) {
  const { data, error } = await requireSupabase().rpc('update_my_doctor_profile', {
    p_full_name: input.fullName,
    p_phone: input.phone,
    p_professional_title: input.professionalTitle,
    p_degree: input.degree,
    p_designation: input.designation,
    p_bmdc_registration_no: input.bmdcRegistrationNo,
    p_bio: input.bio,
    p_consultation_fee: input.consultationFee,
    p_experience_years: input.experienceYears,
    p_profile_headline: input.profileHeadline,
    p_profile_photo_url: input.profilePhotoUrl,
    p_consultation_note: input.consultationNote,
    p_languages: input.languages,
    p_accepting_appointments: input.acceptingAppointments,
    p_district_id: input.districtId,
    p_upazila_id: input.upazilaId,
    p_specialty_ids: input.specialtyIds,
  });
  if (error) throw error;
  return data as DoctorProfileUpdateResult;
}


export interface DoctorVisitingCardUpdate {
  fullName: string;
  profilePhotoUrl: string | null;
  professionalTitle: string | null;
  degree: string | null;
  designation: string | null;
  bmdcRegistrationNo: string | null;
  medicalCollege: string | null;
  presentJob: string | null;
  specialtyIds: number[];
}

export async function updateMyDoctorVisitingCard(input: DoctorVisitingCardUpdate) {
  const { data, error } = await requireSupabase().rpc('update_my_doctor_visiting_card', {
    p_full_name: input.fullName,
    p_profile_photo_url: input.profilePhotoUrl,
    p_professional_title: input.professionalTitle,
    p_degree: input.degree,
    p_designation: input.designation,
    p_bmdc_registration_no: input.bmdcRegistrationNo,
    p_medical_college: input.medicalCollege,
    p_present_job: input.presentJob,
    p_specialty_ids: input.specialtyIds,
  });
  if (error) throw error;
  return data as DoctorProfileUpdateResult;
}

export async function uploadDoctorPhoto(file: File, userId: string) {
  const result = await uploadOptimizedImage({
    file,
    bucket: 'avatars',
    ownerPrefix: userId,
    folder: 'doctor-profile',
    preset: 'profile',
  });
  return result.path;
}




export async function cleanupDoctorPhoto(path: string | null | undefined) {
  return removeOptimizedImageVariants('avatars', path);
}

export interface DoctorChamberInput {
  providerId: string | null;
  nameBn: string;
  address: string;
  districtId: number | null;
  upazilaId: number | null;
  phone: string | null;
  latitude: number | null;
  longitude: number | null;
}

export async function saveMyDoctorChamber(input: DoctorChamberInput) {
  const { data, error } = await requireSupabase().rpc('save_my_doctor_chamber', {
    p_provider_id: input.providerId,
    p_name_bn: input.nameBn,
    p_address: input.address,
    p_district_id: input.districtId,
    p_upazila_id: input.upazilaId,
    p_phone: input.phone,
    p_latitude: input.latitude,
    p_longitude: input.longitude,
  });
  if (error) throw error;
  return data as { provider_id: string; verification_reset: boolean };
}

export async function saveMyChamberSchedule(input: {
  providerId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  fee: number | null;
  isActive: boolean;
  scheduleId?: string | null;
  noteBn?: string | null;
  noteEn?: string | null;
}) {
  const client = requireSupabase();
  const { data, error } = await client.rpc('save_my_chamber_schedule', {
    p_provider_id: input.providerId,
    p_day_of_week: input.dayOfWeek,
    p_start_time: input.startTime,
    p_end_time: input.endTime,
    p_fee: input.fee,
    p_is_active: input.isActive,
    p_schedule_id: input.scheduleId ?? null,
  });
  if (error) throw error;
  const scheduleId = data as string;
  const { error: noteError } = await client.rpc('update_my_chamber_schedule_note', {
    p_schedule_id: scheduleId,
    p_note_bn: input.noteBn?.trim() || null,
    p_note_en: input.noteEn?.trim() || null,
  });
  if (noteError) throw noteError;
  return scheduleId;
}

export async function deleteMyChamberSchedule(scheduleId: string) {
  const { error } = await requireSupabase().rpc('delete_my_chamber_schedule', {
    p_schedule_id: scheduleId,
  });
  if (error) throw error;
}
