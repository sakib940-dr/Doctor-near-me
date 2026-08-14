import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BadgeCheck, Building2, LoaderCircle, MapPin, Navigation, Phone } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import DoctorResultCard from '../components/DoctorResultCard';
import PublicHeader from '../components/PublicHeader';
import VisitorBottomNav from '../components/VisitorBottomNav';
import { isSupabaseConfigured } from '../lib/supabase';
import { getDoctorsForProvider, getPublicProvider } from '../services/discovery';
import type { DoctorSearchRow, ProviderDirectoryRow } from '../types';

export default function PublicProviderProfilePage() {
  const { providerId = '' } = useParams();
  const [provider, setProvider] = useState<ProviderDirectoryRow | null>(null);
  const [doctors, setDoctors] = useState<DoctorSearchRow[]>([]);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    Promise.all([getPublicProvider(providerId), getDoctorsForProvider(providerId)])
      .then(([providerRow, doctorRows]) => { setProvider(providerRow); setDoctors(doctorRows); })
      .catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : 'প্রতিষ্ঠানের তথ্য লোড করা যায়নি।'))
      .finally(() => setLoading(false));
  }, [providerId]);

  const directionUrl = useMemo(() => {
    if (!provider) return '';
    if (provider.map_url) return provider.map_url;
    if (provider.latitude != null && provider.longitude != null) return `https://www.google.com/maps/dir/?api=1&destination=${provider.latitude},${provider.longitude}`;
    if (provider.address) return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(provider.address)}`;
    return '';
  }, [provider]);

  return (
    <div className="app-shell public-provider-page">
      <PublicHeader />
      <main className="container public-provider-main">
        <Link className="back-link" to="/providers"><ArrowLeft /> হাসপাতাল/চেম্বার তালিকা</Link>
        {loading && <div className="loading-box"><LoaderCircle className="spin" /> তথ্য লোড হচ্ছে…</div>}
        {error && <div className="error-box">{error}</div>}
        {!loading && !provider && !error && <div className="visitor-empty">প্রতিষ্ঠানটি পাওয়া যায়নি।</div>}
        {provider && <>
          <section className="public-provider-hero-card">
            <div className="provider-big-icon"><Building2 /></div>
            <div><span>{provider.provider_type === 'hospital' ? 'হাসপাতাল' : 'চেম্বার'} {provider.verified && <><BadgeCheck /> যাচাইকৃত</>}</span><h1>{provider.name_bn}</h1><p><MapPin /> {provider.address || 'ঠিকানা যোগ করা হয়নি'}</p></div>
            {provider.phone && <a href={`tel:${provider.phone}`}><Phone /> {provider.phone}</a>}
          </section>

          <section className="visitor-section provider-doctors-section">
            <div className="visitor-section-head"><div><span>এই প্রতিষ্ঠানে</span><h2>ডাক্তার তালিকা</h2></div><strong>{doctors.length} জন</strong></div>
            {doctors.length ? <div className="provider-doctor-vertical">{doctors.map((doctor) => <DoctorResultCard doctor={doctor} key={doctor.doctor_id} />)}</div> : <div className="visitor-empty">এই প্রতিষ্ঠানের public doctor link এখনো পাওয়া যায়নি।</div>}
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
