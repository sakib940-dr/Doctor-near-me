import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BadgeCheck, Building2, LoaderCircle, MapPin, Navigation, Phone } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import DoctorResultCard from '../components/DoctorResultCard';
import FollowSaveButton from '../components/FollowSaveButton';
import PublicHeader from '../components/PublicHeader';
import VisitorBottomNav from '../components/VisitorBottomNav';
import { isSupabaseConfigured } from '../lib/supabase';
import { getDoctorsForProvider, getPublicProvider } from '../services/discovery';
import { getProviderPublicStats, getPublicProfileStatsBatch } from '../services/engagement';
import type { DoctorSearchRow, ProviderDirectoryRow, PublicProfileStats } from '../types';

export default function PublicProviderProfilePage() {
  const { providerId = '' } = useParams();
  const [provider, setProvider] = useState<ProviderDirectoryRow | null>(null);
  const [doctors, setDoctors] = useState<DoctorSearchRow[]>([]);
  const [doctorStats, setDoctorStats] = useState<Record<string, PublicProfileStats>>({});
  const [providerStats, setProviderStats] = useState<PublicProfileStats | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    Promise.all([getPublicProvider(providerId), getDoctorsForProvider(providerId)])
      .then(([providerRow, doctorRows]) => { setProvider(providerRow); setDoctors(doctorRows); })
      .catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : 'প্রতিষ্ঠানের তথ্য লোড করা যায়নি।'))
      .finally(() => setLoading(false));
  }, [providerId]);

  useEffect(() => {
    if (!isSupabaseConfigured || !providerId) return;
    let active = true;
    getProviderPublicStats(providerId)
      .then((stats) => { if (active) setProviderStats(stats); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [providerId]);

  useEffect(() => {
    if (!doctors.length || !isSupabaseConfigured) { setDoctorStats({}); return; }
    let active = true;
    getPublicProfileStatsBatch({ doctorIds: doctors.map((doctor) => doctor.doctor_id) }).then((items) => {
      if (!active) return;
      const next: Record<string, PublicProfileStats> = {};
      items.forEach((item) => {
        if (item.target_type !== 'doctor') return;
        next[item.target_id] = { follower_count: Number(item.follower_count ?? 0), review_count: Number(item.review_count ?? 0), average_rating: item.average_rating == null ? null : Number(item.average_rating), is_following: Boolean(item.is_following), ranking_tier: item.ranking_tier, is_premium: Boolean(item.is_premium) };
      });
      setDoctorStats(next);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [doctors]);

  const directionUrl = useMemo(() => {
    if (!provider) return '';
    if (provider.map_url) return provider.map_url;
    if (provider.latitude != null && provider.longitude != null) return `https://www.google.com/maps/dir/?api=1&destination=${provider.latitude},${provider.longitude}`;
    if (provider.address) return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(provider.address)}`;
    return '';
  }, [provider]);

  return (
    <div className="app-shell public-provider-page">
      <PublicHeader mobileBottomNav />
      <main className="container public-provider-main">
        <Link className="back-link" to="/providers"><ArrowLeft /> হাসপাতাল/চেম্বার তালিকা</Link>
        {loading && <div className="loading-box"><LoaderCircle className="spin" /> তথ্য লোড হচ্ছে…</div>}
        {error && <div className="error-box">{error}</div>}
        {!loading && !provider && !error && <div className="visitor-empty">প্রতিষ্ঠানটি পাওয়া যায়নি।</div>}
        {provider && <>
          <section className="public-provider-hero-card">
            <div className="provider-big-icon"><Building2 /></div>
            <div><span>{provider.provider_type === 'hospital' ? 'হাসপাতাল' : 'চেম্বার'} {provider.verified && <><BadgeCheck /> যাচাইকৃত</>}</span><h1>{provider.name_bn}</h1><p><MapPin /> {provider.address || 'ঠিকানা যোগ করা হয়নি'}</p><div className="public-follow-summary provider-follow-summary"><FollowSaveButton targetType="provider" targetId={provider.id} stats={providerStats} variant="button" entityLabel={provider.provider_type === 'hospital' ? 'হাসপাতাল' : 'চেম্বার'} onStatsChange={setProviderStats} /><span><b>{(providerStats?.follower_count ?? 0).toLocaleString('bn-BD')}</b> মোট অনুসারী</span></div></div>
            {provider.phone && <a href={`tel:${provider.phone}`}><Phone /> {provider.phone}</a>}
          </section>

          <section className="visitor-section provider-doctors-section">
            <div className="visitor-section-head"><div><span>এই প্রতিষ্ঠানে</span><h2>ডাক্তার তালিকা</h2></div><strong>{doctors.length} জন</strong></div>
            {doctors.length ? <div className="provider-doctor-vertical">{doctors.map((doctor) => <DoctorResultCard doctor={doctor} stats={doctorStats[doctor.doctor_id]} onStatsChange={(doctorId, next) => setDoctorStats((current) => ({ ...current, [doctorId]: next }))} key={doctor.doctor_id} />)}</div> : <div className="visitor-empty">এই প্রতিষ্ঠানের public doctor link এখনো পাওয়া যায়নি।</div>}
          </section>

          <section className="provider-location-box">
            <div><MapPin /><div><span>Location</span><h2>{provider.name_bn}</h2><p>{provider.address || 'ঠিকানা যোগ করা হয়নি'}</p>{provider.latitude != null && provider.longitude != null && <small>{provider.latitude.toFixed(5)}, {provider.longitude.toFixed(5)}</small>}</div></div>
            {directionUrl ? <a href={directionUrl} target="_blank" rel="noreferrer"><Navigation /> Google Maps Direction</a> : <button type="button" disabled><Navigation /> Map location নেই</button>}
          </section>
        </>}
      </main>
      <VisitorBottomNav />
    </div>
  );
}
