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

function toLocalDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export async function getDoctorAnalytics(doctorId: string): Promise<DoctorAnalytics> {
  const supabase = requireSupabase();
  const now = new Date();
  const today = toLocalDateString(now);
  const monthStart = toLocalDateString(new Date(now.getFullYear(), now.getMonth(), 1));
  const sevenDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
  const sevenDaysStart = toLocalDateString(sevenDaysAgo);

  const [todayResult, monthlyPatientsResult, pendingResult, last7DaysResult] = await Promise.all([
    supabase
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('doctor_id', doctorId)
      .eq('appointment_date', today),
    supabase
      .from('appointments')
      .select('patient_id')
      .eq('doctor_id', doctorId)
      .gte('appointment_date', monthStart)
      .lte('appointment_date', today),
    supabase
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('doctor_id', doctorId)
      .eq('status', 'pending'),
    supabase
      .from('appointments')
      .select('appointment_date')
      .eq('doctor_id', doctorId)
      .gte('appointment_date', sevenDaysStart)
      .lte('appointment_date', today),
  ]);

  if (todayResult.error) throw todayResult.error;
  if (monthlyPatientsResult.error) throw monthlyPatientsResult.error;
  if (pendingResult.error) throw pendingResult.error;
  if (last7DaysResult.error) throw last7DaysResult.error;

  const uniquePatients = new Set(
    (monthlyPatientsResult.data ?? []).map((row) => row.patient_id).filter(Boolean),
  );

  const dailyCounts = new Map<string, number>();
  for (const row of last7DaysResult.data ?? []) {
    dailyCounts.set(row.appointment_date, (dailyCounts.get(row.appointment_date) ?? 0) + 1);
  }

  const last7Days: DoctorAnalyticsDay[] = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(
      sevenDaysAgo.getFullYear(),
      sevenDaysAgo.getMonth(),
      sevenDaysAgo.getDate() + index,
    );
    const dateKey = toLocalDateString(date);
    return { date: dateKey, count: dailyCounts.get(dateKey) ?? 0 };
  });

  return {
    todayAppointments: todayResult.count ?? 0,
    monthlyUniquePatients: uniquePatients.size,
    pendingAppointments: pendingResult.count ?? 0,
    last7Days,
  };
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
