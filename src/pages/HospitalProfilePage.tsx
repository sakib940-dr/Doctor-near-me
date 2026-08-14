import { useEffect, useState } from 'react';
import { ArrowLeft, BadgeCheck, Building2, LoaderCircle, MapPin, Navigation, Phone, ShieldCheck, Stethoscope } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import PublicHeader from '../components/PublicHeader';
import { getImageUrl } from '../lib/storage';
import { isSupabaseConfigured } from '../lib/supabase';
import { getProviderById, getProviderDoctors } from '../services/discovery';
import type { ProviderPublicDoctorRow, ProviderPublicRow } from '../types';

const messageFrom = (error: unknown) => error instanceof Error ? error.message : 'তথ্য লোড করা যায়নি।';

function mapsDirectionUrl(provider: ProviderPublicRow) {
  if (provider.google_maps_url) return provider.google_maps_url;
  if (provider.map_url) return provider.map_url;
  if (provider.latitude != null && provider.longitude != null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${provider.latitude},${provider.longitude}`;
  }
  if (provider.address) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(provider.address)}`;
  }
  return null;
}

export default function HospitalProfilePage() {
  const { providerId = '' } = useParams();
  const [provider, setProvider] = useState<ProviderPublicRow | null>(null);
  const [doctors, setDoctors] = useState<ProviderPublicDoctorRow[]>([]);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [doctorsLoading, setDoctorsLoading] = useState(isSupabaseConfigured);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    getProviderById(providerId)
      .then((result) => {
        if (!active) return;
        setProvider(result);
        document.title = result ? `${result.name_bn} | সিরাজগঞ্জ ডাক্তার` : 'প্রতিষ্ঠান পাওয়া যায়নি';
      })
      .catch((loadError: unknown) => { if (active) setError(messageFrom(loadError)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [providerId]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    setDoctorsLoading(true);
    getProviderDoctors(providerId)
      .then((rows) => { if (active) setDoctors(rows); })
      .finally(() => { if (active) setDoctorsLoading(false); });
    return () => { active = false; };
  }, [providerId]);

  const logo = getImageUrl(provider?.logo_url);
  const directionUrl = provider ? mapsDirectionUrl(provider) : null;

  return (
    <div className="app-shell profile-page">
      <PublicHeader />
      <main className="profile-main container">
        <Link className="back-link" to="/hospitals"><ArrowLeft size={17} /> হাসপাতাল/চেম্বার তালিকায় ফিরুন</Link>
        {!isSupabaseConfigured && <div className="directory-notice">লাইভ তথ্যের জন্য Supabase environment variables প্রয়োজন।</div>}
        {loading && <div className="loading-box"><LoaderCircle className="spin" /> লোড হচ্ছে…</div>}
        {error && <div className="error-box" role="alert">{error}</div>}
        {!loading && isSupabaseConfigured && !error && !provider && (
          <div className="empty-state"><span>🏥</span><h3>প্রতিষ্ঠান পাওয়া যায়নি</h3><p>এই প্রোফাইল অননুমোদিত অথবা মুছে ফেলা হয়েছে।</p></div>
        )}

        {provider && (
          <>
            <section className="profile-hero-card provider-hero-card">
              <div className="profile-avatar">{logo ? <img src={logo} alt={provider.name_bn} /> : <Building2 size={44} />}</div>
              <div className="profile-identity">
                {provider.verified && <span className="verified-line"><BadgeCheck size={17} /> যাচাইকৃত প্রতিষ্ঠান</span>}
                <h1>{provider.name_bn}</h1>
                <p>{provider.provider_type === 'hospital' ? 'হাসপাতাল' : 'চেম্বার'}{provider.short_description ? ` · ${provider.short_description}` : ''}</p>
                {provider.address && <strong><MapPin size={15} style={{ marginRight: 4, verticalAlign: 'middle' }} />{provider.address}</strong>}
              </div>
              {provider.phone && <a className="profile-book-link" href={`tel:${provider.phone}`}><Phone size={18} /> {provider.phone}</a>}
            </section>

            <div className="profile-layout">
              <div>
                <section className="profile-section">
                  <h2>এই প্রতিষ্ঠানের ডাক্তারগণ</h2>
                  {doctorsLoading ? (
                    <div className="loading-box"><LoaderCircle className="spin" /> লোড হচ্ছে…</div>
                  ) : doctors.length ? (
                    <div className="provider-doctor-list">
                      {doctors.map((doctor) => {
                        const avatar = getImageUrl(doctor.avatar_url, 'avatars');
                        return (
                          <Link className="provider-doctor-row" to={`/doctors/${doctor.doctor_id}`} key={doctor.doctor_id}>
                            <div className="provider-doctor-avatar">{avatar ? <img src={avatar} alt={doctor.doctor_name} /> : <Stethoscope size={26} />}</div>
                            <div>
                              <h3>{doctor.doctor_name}</h3>
                              <p>{doctor.designation || 'বিশেষজ্ঞ চিকিৎসক'}{doctor.degree ? ` · ${doctor.degree}` : ''}</p>
                              {doctor.specialty_names_bn.length > 0 && <div className="directory-tags">{doctor.specialty_names_bn.slice(0, 3).map((name) => <span key={name}>{name}</span>)}</div>}
                              {doctor.bmdc_registration_no && <small className="doctor-h-bmdc"><ShieldCheck size={12} /> BMDC: {doctor.bmdc_registration_no}</small>}
                            </div>
                            {doctor.consultation_fee != null && <span className="provider-doctor-fee">৳{doctor.consultation_fee}</span>}
                          </Link>
                        );
                      })}
                    </div>
                  ) : (
                    <p>এই মুহূর্তে ডাক্তারের তালিকা দেখানো যাচ্ছে না। ডাক্তার প্রোফাইলের &quot;চেম্বার ও সময়সূচি&quot; অংশ থেকেও এই প্রতিষ্ঠানের তথ্য পাওয়া যাবে, অথবা লগইন করে আবার চেষ্টা করুন।</p>
                  )}
                </section>
              </div>

              <aside className="profile-safety location-box">
                <MapPin size={28} />
                <h3>অবস্থান</h3>
                <p>{provider.address || 'ঠিকানা যোগ করা হয়নি।'}</p>
                {directionUrl && (
                  <a className="chamber-call" href={directionUrl} target="_blank" rel="noreferrer">
                    <Navigation size={17} /> Google Maps-এ পথনির্দেশ
                  </a>
                )}
              </aside>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
