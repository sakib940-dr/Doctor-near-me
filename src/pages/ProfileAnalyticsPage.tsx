import { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  CalendarCheck2,
  Eye,
  Heart,
  LoaderCircle,
  MapPin,
  MessageCircle,
  MousePointerClick,
  Phone,
  Share2,
  Star,
  TrendingUp,
} from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useAuth } from '../contexts/AuthContext';
import { getMyProviderDashboard } from '../services/providerDashboard';
import { getMyDoctorProfileAnalytics, getMyProviderProfileAnalytics } from '../services/profileAnalytics';
import type { AnalyticsPeriod, ProfileAnalytics, ProviderDashboardItem } from '../types';

const PERIODS: Array<{ value: AnalyticsPeriod; label: string }> = [
  { value: 7, label: 'গত ৭ দিন' },
  { value: 30, label: 'গত ৩০ দিন' },
  { value: 0, label: 'সব সময়' },
];

export default function ProfileAnalyticsPage() {
  const { account } = useAuth();
  const [period, setPeriod] = useState<AnalyticsPeriod>(30);
  const [providers, setProviders] = useState<ProviderDashboardItem[]>([]);
  const [providerId, setProviderId] = useState('');
  const [analytics, setAnalytics] = useState<ProfileAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const providerRole = account?.role === 'hospital' || account?.role === 'chamber';

  useEffect(() => {
    if (!providerRole) return;
    let active = true;
    getMyProviderDashboard()
      .then((rows) => {
        if (!active) return;
        setProviders(rows);
        setProviderId((current) => current || rows[0]?.id || '');
      })
      .catch((loadError: unknown) => active && setError(loadError instanceof Error ? loadError.message : 'প্রতিষ্ঠান লোড করা যায়নি।'));
    return () => { active = false; };
  }, [providerRole]);

  useEffect(() => {
    if (!account) return;
    if (providerRole && !providerId) { setLoading(false); return; }
    let active = true;
    setLoading(true);
    setError(null);
    const request = account.role === 'doctor'
      ? getMyDoctorProfileAnalytics(period)
      : getMyProviderProfileAnalytics(providerId, period);
    request
      .then((result) => active && setAnalytics(result))
      .catch((loadError: unknown) => active && setError(loadError instanceof Error ? loadError.message : 'Analytics লোড করা যায়নি।'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [account, period, providerId, providerRole]);

  const selectedProvider = providers.find((provider) => provider.id === providerId) ?? null;
  const chartData = useMemo(() => (analytics?.series ?? []).map((point) => ({
    ...point,
    label: analytics?.bucket === 'month' ? point.bucket : point.bucket.slice(5),
  })), [analytics]);

  const metrics = analytics ? [
    { icon: Eye, label: 'Profile Views', value: analytics.profile_views, detail: 'Public profile দেখা হয়েছে' },
    { icon: Phone, label: 'Call Clicks', value: analytics.call_clicks, detail: 'কল করুন action' },
    { icon: MessageCircle, label: 'WhatsApp Clicks', value: analytics.whatsapp_clicks, detail: 'WhatsApp action' },
    { icon: MousePointerClick, label: 'Appointment Clicks', value: analytics.appointment_clicks, detail: 'Appointment button' },
    { icon: CalendarCheck2, label: 'Appointment Requests', value: analytics.appointment_requests, detail: 'সফল request submit' },
    { icon: Heart, label: 'Total Followers', value: analytics.followers, detail: `নতুন ${analytics.followers_new} • Unfollow ${analytics.followers_lost}` },
    { icon: Star, label: 'Total Reviews', value: analytics.reviews, detail: analytics.average_rating == null ? 'এখনো rating নেই' : `গড় ${analytics.average_rating.toFixed(1)} / 5` },
    { icon: MapPin, label: 'Map Clicks', value: analytics.map_clicks, detail: 'Location/Map action' },
    { icon: Share2, label: 'Profile Shares', value: analytics.profile_shares, detail: `Native ${analytics.native_share_initiated} • Copy ${analytics.copy_link}` },
  ] : [];

  return <main className="profile-analytics-page container">
    <header className="profile-analytics-heading">
      <div><span><BarChart3 /> Analytics</span><h1>{account?.role === 'doctor' ? 'Doctor Profile Analytics' : 'Hospital / Chamber Analytics'}</h1><p>Public profile-এর গুরুত্বপূর্ণ visitor action, appointment, follower এবং review activity এক জায়গায় দেখুন।</p></div>
      <div className="analytics-period-tabs" role="group" aria-label="Analytics period">{PERIODS.map((item) => <button type="button" key={item.value} className={period === item.value ? 'active' : ''} onClick={() => setPeriod(item.value)}>{item.label}</button>)}</div>
    </header>

    {providerRole && <label className="analytics-provider-select"><span>প্রতিষ্ঠান</span><select value={providerId} onChange={(event) => setProviderId(event.target.value)}>{providers.map((provider) => <option value={provider.id} key={provider.id}>{provider.name_bn}</option>)}</select>{selectedProvider && <small>{selectedProvider.provider_type === 'hospital' ? 'Hospital' : 'Chamber'} • {selectedProvider.verified ? 'Verified' : selectedProvider.status}</small>}</label>}

    {loading && <div className="loading-box"><LoaderCircle className="spin" /> Analytics লোড হচ্ছে…</div>}
    {error && <div className="error-box" role="alert">{error}</div>}
    {!loading && !error && providerRole && !providerId && <div className="empty-state"><BarChart3 /><h3>কোনো প্রতিষ্ঠান পাওয়া যায়নি</h3></div>}

    {!loading && analytics && <>
      <section className="profile-analytics-metrics">{metrics.map(({ icon: Icon, label, value, detail }) => <article key={label}><span><Icon /></span><div><small>{label}</small><strong>{value.toLocaleString('bn-BD')}</strong><p>{detail}</p></div></article>)}</section>

      <section className="profile-analytics-chart-card">
        <header><div><span><TrendingUp /> Trend</span><h2>{period === 0 ? 'মাসভিত্তিক activity' : 'দিনভিত্তিক activity'}</h2></div><small>{period === 0 ? 'All time' : `${period} days`}</small></header>
        <div className="profile-analytics-chart">{chartData.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={chartData} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" tickLine={false} axisLine={false} /><YAxis allowDecimals={false} tickLine={false} axisLine={false} /><Tooltip /><Bar dataKey="profile_views" name="Profile views" fill="#0f766e" radius={[5, 5, 0, 0]} /><Bar dataKey="appointment_requests" name="Appointment requests" fill="#0ea5e9" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer> : <div className="profile-analytics-empty">এই period-এ activity নেই।</div>}</div>
      </section>

      <section className="profile-analytics-secondary">
        <article><span>Follow gained</span><strong>+{analytics.followers_new.toLocaleString('bn-BD')}</strong></article>
        <article><span>Follow lost</span><strong>{analytics.followers_lost.toLocaleString('bn-BD')}</strong></article>
        <article><span>Net follower</span><strong>{analytics.followers_net >= 0 ? '+' : ''}{analytics.followers_net.toLocaleString('bn-BD')}</strong></article>
        <article><span>Review submitted</span><strong>{analytics.review_submitted.toLocaleString('bn-BD')}</strong></article>
        <article><span>Review edited</span><strong>{analytics.review_edited.toLocaleString('bn-BD')}</strong></article>
      </section>
      <p className="profile-analytics-note">Profile view একই target-এর জন্য একই browsing session-এর ৩০ মিনিটের window-এ একবার count হয়। Rapid duplicate clicks client + database dedupe দিয়ে suppress করা হয়। Profile Shares native share initiation + successful copy-link action থেকে গণনা করা হয়; receiving app guess করা হয় না। Appointment Requests, Total Followers ও Total Reviews canonical database records থেকে গণনা করা হয়।</p>
    </>}
  </main>;
}
