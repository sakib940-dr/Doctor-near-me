import { requireSupabase } from '../lib/supabase';
import type { MyDoctorProfile } from '../types';

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
  return (data ?? null) as MyDoctorProfile | null;
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

export async function uploadDoctorPhoto(file: File, userId: string) {
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(file.type)) {
    throw new Error('JPG, PNG, WebP অথবা AVIF ছবি দিন।');
  }
  if (file.size > 3 * 1024 * 1024) throw new Error('ছবির আকার সর্বোচ্চ ৩ MB হতে পারবে।');

  const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const path = `${userId}/doctor-profile-${Date.now()}.${extension}`;
  const { error } = await requireSupabase().storage.from('avatars').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  });
  if (error) throw error;
  return path;
}

export async function saveMyChamberSchedule(input: {
  providerId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  fee: number | null;
  isActive: boolean;
  scheduleId?: string | null;
}) {
  const { data, error } = await requireSupabase().rpc('save_my_chamber_schedule', {
    p_provider_id: input.providerId,
    p_day_of_week: input.dayOfWeek,
    p_start_time: input.startTime,
    p_end_time: input.endTime,
    p_fee: input.fee,
    p_is_active: input.isActive,
    p_schedule_id: input.scheduleId ?? null,
  });
  if (error) throw error;
  return data as string;
}

export async function deleteMyChamberSchedule(scheduleId: string) {
  const { error } = await requireSupabase().rpc('delete_my_chamber_schedule', {
    p_schedule_id: scheduleId,
  });
  if (error) throw error;
}
