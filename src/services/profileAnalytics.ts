import { requireSupabase } from '../lib/supabase';
import type { AnalyticsPeriod, ProfileAnalytics } from '../types';

function normalize(data: unknown): ProfileAnalytics {
  const value = (data ?? {}) as Partial<ProfileAnalytics>;
  const number = (input: unknown) => Number(input ?? 0);
  return {
    target_type: value.target_type === 'provider' ? 'provider' : 'doctor',
    target_id: String(value.target_id ?? ''),
    days: Number(value.days ?? 30),
    bucket: value.bucket === 'month' ? 'month' : 'day',
    profile_views: number(value.profile_views),
    call_clicks: number(value.call_clicks),
    whatsapp_clicks: number(value.whatsapp_clicks),
    appointment_clicks: number(value.appointment_clicks),
    appointment_requests: number(value.appointment_requests),
    map_clicks: number(value.map_clicks),
    profile_shares: number(value.profile_shares),
    share_clicks: number(value.share_clicks),
    native_share_initiated: number(value.native_share_initiated),
    copy_link: number(value.copy_link),
    followers: number(value.followers),
    followers_new: number(value.followers_new),
    followers_lost: number(value.followers_lost),
    followers_net: number(value.followers_net),
    reviews: number(value.reviews),
    review_submitted: number(value.review_submitted),
    review_edited: number(value.review_edited),
    average_rating: value.average_rating == null ? null : Number(value.average_rating),
    series: Array.isArray(value.series) ? value.series.map((point) => ({
      bucket: String(point.bucket ?? ''),
      profile_views: number(point.profile_views),
      call_clicks: number(point.call_clicks),
      whatsapp_clicks: number(point.whatsapp_clicks),
      appointment_clicks: number(point.appointment_clicks),
      appointment_requests: number(point.appointment_requests),
      map_clicks: number(point.map_clicks),
      follows: number(point.follows),
      reviews: number(point.reviews),
    })) : [],
  };
}

async function getMyShareMetrics(providerId: string | null, period: AnalyticsPeriod) {
  const { data, error } = await requireSupabase().rpc('get_my_profile_share_metrics', {
    p_provider_id: providerId,
    p_days: period,
  });
  if (error) throw error;
  return (data ?? {}) as Partial<ProfileAnalytics>;
}

export async function getMyDoctorProfileAnalytics(period: AnalyticsPeriod) {
  const client = requireSupabase();
  const [analyticsResult, shareMetrics] = await Promise.all([
    client.rpc('get_my_doctor_profile_analytics', { p_days: period }),
    getMyShareMetrics(null, period),
  ]);
  if (analyticsResult.error) throw analyticsResult.error;
  return normalize({ ...((analyticsResult.data ?? {}) as object), ...shareMetrics });
}

export async function getMyProviderProfileAnalytics(providerId: string, period: AnalyticsPeriod) {
  const client = requireSupabase();
  const [analyticsResult, shareMetrics] = await Promise.all([
    client.rpc('get_my_provider_profile_analytics', { p_provider_id: providerId, p_days: period }),
    getMyShareMetrics(providerId, period),
  ]);
  if (analyticsResult.error) throw analyticsResult.error;
  return normalize({ ...((analyticsResult.data ?? {}) as object), ...shareMetrics });
}
