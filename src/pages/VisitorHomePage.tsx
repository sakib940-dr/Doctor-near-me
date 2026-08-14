import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import {
  Ambulance,
  ArrowRight,
  BadgeCheck,
  Building2,
  ChevronRight,
  HeartPulse,
  LocateFixed,
  LoaderCircle,
  MapPin,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-react';
import DoctorResultCard from '../components/DoctorResultCard';
import PublicHeader from '../components/PublicHeader';
import ProviderCard from '../components/ProviderCard';
import VisitorBottomNav from '../components/VisitorBottomNav';
import { useAuth } from '../contexts/AuthContext';
import { isSupabaseConfigured } from '../lib/supabase';
import {
  findNearestDoctors,
  getDistricts,
  getHomepageConfiguration,
  getPublicProviders,
  getUpazilas,
  searchAmbulances,
  searchDoctors,
  saveMyCurrentLocation,
} from '../services/discovery';
import type {
  AmbulanceSearchRow,
  DiscoveryTopic,
  District,
  DoctorSearchRow,
  HomepageConfiguration,
  ProviderDirectoryRow,
  Upazila,
} from '../types';

const fallbackTopics: DiscoveryTopic[] = [
  { id: -1, name_bn: 'হৃদরোগ', name_en: 'Heart', slug: 'heart', icon: '🫀', description_bn: null, search_keywords: [], specialty_ids: [] },
  { id: -2, name_bn: 'চোখ', name_en: 'Eye', slug: 'eye', icon: '👁️', description_bn: null, search_keywords: [], specialty_ids: [] },
  { id: -3, name_bn: 'দাঁত', name_en: 'Dental', slug: 'dental', icon: '🦷', description_bn: null, search_keywords: [], specialty_ids: [] },
  { id: -4, name_bn: 'মস্তিষ্ক ও স্নায়ু', name_en: 'Brain & Nerve', slug: 'brain-nerve', icon: '🧠', description_bn: null, search_keywords: [], specialty_ids: [] },
  { id: -5, name_bn: 'হাড় ও জয়েন্ট', name_en: 'Bone & Joint', slug: 'bone-joint', icon: '🦴', description_bn: null, search_keywords: [], specialty_ids: [] },
  { id: -6, name_bn: 'শিশু', name_en: 'Child', slug: 'child', icon: '👶', description_bn: null, search_keywords: [], specialty_ids: [] },
  { id: -7, name_bn: 'নারী ও প্রসূতি', name_en: 'Women', slug: 'women-pregnancy', icon: '🤰', description_bn: null, search_keywords: [], specialty_ids: [] },
  { id: -8, name_bn: 'ডায়াবেটিস', name_en: 'Diabetes', slug: 'diabetes-hormone', icon: '🩸', description_bn: null, search_keywords: [], specialty_ids: [] },
];

const emptyHomepage: HomepageConfiguration = { sections: [], banners: [], topics: [], settings: {} };
const messageFrom = (error: unknown) => error instanceof Error ? error.message : 'তথ্য লোড করা যায়নি।';

export default function VisitorHomePage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [homepage, setHomepage] = useState(emptyHomepage);
  const [districts, setDistricts] = useState<District[]>([]);
  const [upazilas, setUpazilas] = useState<Upazila[]>([]);
  const [districtId, setDistrictId] = useState('');
  const [upazilaId, setUpazilaId] = useState('');
  const [query, setQuery] = useState('');
  const [nearbyDoctors, setNearbyDoctors] = useState<DoctorSearchRow[]>([]);
  const [allDoctors, setAllDoctors] = useState<DoctorSearchRow[]>([]);
  const [providers, setProviders] = useState<ProviderDirectoryRow[]>([]);
  const [ambulances, setAmbulances] = useState<AmbulanceSearchRow[]>([]);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [locationState, setLocationState] = useState<'idle' | 'asking' | 'granted' | 'denied'>('idle');
  const [currentLocation, setCurrentLocation] = useState<{ latitude: number; longitude: number; accuracy: number | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('sirajganj-current-location');
      if (!raw) return;
      const saved = JSON.parse(raw) as { latitude?: number; longitude?: number; accuracy?: number | null; capturedAt?: number };
      if (typeof saved.latitude === 'number' && typeof saved.longitude === 'number' && (!saved.capturedAt || Date.now() - saved.capturedAt < 30 * 60 * 1000)) {
        setCurrentLocation({ latitude: saved.latitude, longitude: saved.longitude, accuracy: saved.accuracy ?? null });
        setLocationState('granted');
      }
    } catch { /* ignore unavailable/invalid local storage */ }
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    Promise.all([
      getHomepageConfiguration(),
      getDistricts(),
      searchDoctors({ limit: 8, sort: 'name' }),
      getPublicProviders({ limit: 8 }),
      searchAmbulances({ districtId: null }),
    ]).then(([home, districtRows, doctors, providerRows, ambulanceRows]) => {
      if (!active) return;
      setHomepage(home);
      setDistricts(districtRows);
      setAllDoctors(doctors);
      setNearbyDoctors(doctors.slice(0, 6));
      setProviders(providerRows);
      setAmbulances(ambulanceRows.slice(0, 4));
    }).catch((loadError) => active && setError(messageFrom(loadError))).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || !districtId) {
      setUpazilas([]);
      setUpazilaId('');
      return;
    }
    getUpazilas(Number(districtId)).then(setUpazilas).catch(() => setUpazilas([]));
  }, [districtId]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const selectedDistrict = districtId ? Number(districtId) : null;
    const selectedUpazila = upazilaId ? Number(upazilaId) : null;
    const doctorRequest = currentLocation
      ? findNearestDoctors({
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
          districtId: selectedDistrict,
          upazilaId: selectedUpazila,
          radiusKm: 100,
          limit: 8,
        })
      : searchDoctors({ districtId: selectedDistrict, upazilaId: selectedUpazila, limit: 6, sort: 'name' });
    Promise.all([
      doctorRequest,
      getPublicProviders({ districtId: selectedDistrict, upazilaId: selectedUpazila, limit: 8 }),
      searchAmbulances({ districtId: selectedDistrict }),
    ]).then(([doctors, providerRows, ambulanceRows]) => {
      setNearbyDoctors(doctors);
      setProviders(providerRows);
      setAmbulances(ambulanceRows.slice(0, 4));
    }).catch((loadError) => setError(messageFrom(loadError)));
  }, [districtId, upazilaId, currentLocation]);

  const topics = homepage.topics.length ? homepage.topics : fallbackTopics;
  const siteName = useMemo(() => {
    const brand = homepage.settings.site_brand;
    return brand && typeof brand === 'object' && 'site_name_bn' in brand ? String(brand.site_name_bn) : 'সিরাজগঞ্জ ডাক্তার';
  }, [homepage.settings]);

  if (!authLoading && user) return <Navigate to="/dashboard" replace />;

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    const params = new URLSearchParams();
    if (query.trim()) params.set('q', query.trim());
    if (districtId) params.set('district', districtId);
    if (upazilaId) params.set('upazila', upazilaId);
    navigate(`/doctors${params.size ? `?${params}` : ''}`);
  }

  function chooseTopic(topic: DiscoveryTopic) {
    const params = new URLSearchParams();
    if (topic.specialty_ids.length) params.set('specialties', topic.specialty_ids.join(','));
    else params.set('q', topic.name_bn);
    if (districtId) params.set('district', districtId);
    if (upazilaId) params.set('upazila', upazilaId);
    navigate(`/doctors?${params}`);
  }

  function requestLocation() {
    if (!navigator.geolocation) {
      setLocationState('denied');
      return;
    }
    setLocationState('asking');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
        };
        setCurrentLocation(location);
        setLocationState('granted');
        // Anonymous visitors cannot write a user-owned Supabase row. Keep the
        // consented point locally so it can be persisted immediately after login.
        try {
          localStorage.setItem('sirajganj-current-location', JSON.stringify({ ...location, capturedAt: Date.now() }));
        } catch { /* storage can be unavailable in private browsing */ }
        if (user) {
          void saveMyCurrentLocation({
            latitude: location.latitude,
            longitude: location.longitude,
            accuracyMeters: location.accuracy,
            districtId: districtId ? Number(districtId) : null,
            upazilaId: upazilaId ? Number(upazilaId) : null,
          }).catch(() => undefined);
        }
      },
      () => setLocationState('denied'),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }

  const viewAllParams = new URLSearchParams();
  if (districtId) viewAllParams.set('district', districtId);
  if (upazilaId) viewAllParams.set('upazila', upazilaId);

  return (
    <div className="app-shell visitor-home">
      <PublicHeader />

      <main>
        <section className="visitor-search-hero">
          <div className="container">
            <div className="visitor-hero-copy">
              <span><HeartPulse /> সিরাজগঞ্জ ডাক্তার — স্বাস্থ্যের বিশ্বস্ত ঠিকানা</span>
              <h1>আপনার এলাকার বিশ্বস্ত ডাক্তার খুঁজুন</h1>
              <p>জেলা ও উপজেলা বেছে নিন, অথবা আপনার অবস্থান ব্যবহার করে কাছের ডাক্তার দেখুন।</p>
            </div>
            <form className="visitor-search-box" onSubmit={submitSearch}>
              <select aria-label="জেলা নির্বাচন" value={districtId} onChange={(event) => { setDistrictId(event.target.value); setUpazilaId(''); }}>
                <option value="">জেলা</option>
                {districts.map((district) => <option value={district.id} key={district.id}>{district.name_bn}</option>)}
              </select>
              <select aria-label="উপজেলা নির্বাচন" value={upazilaId} onChange={(event) => setUpazilaId(event.target.value)} disabled={!districtId}>
                <option value="">উপজেলা</option>
                {upazilas.map((upazila) => <option value={upazila.id} key={upazila.id}>{upazila.name_bn}</option>)}
              </select>
              <button className={`location-permission ${locationState}`} type="button" onClick={requestLocation} title="Location permission">
                {locationState === 'asking' ? <LoaderCircle className="spin" /> : <LocateFixed />}
                <span>{locationState === 'granted' ? 'লোকেশন চালু' : locationState === 'denied' ? 'লোকেশন বন্ধ' : 'আমার লোকেশন'}</span>
              </button>
              <label className="visitor-search-input"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ডাক্তার, রোগ বা স্পেশালিটি খুঁজুন..." /></label>
              <button className="visitor-search-submit" type="submit">খুঁজুন <Search /></button>
            </form>
            {!isSupabaseConfigured && <div className="visitor-preview-note"><ShieldCheck /> UI preview চলছে—লাইভ ডেটার জন্য Supabase environment variables দিন।</div>}
          </div>
        </section>

        {error && <div className="container"><div className="error-box" role="alert">{error}</div></div>}

        <section className="visitor-section">
          <div className="container">
            <div className="visitor-section-head"><div><span>{currentLocation ? 'আপনার বর্তমান অবস্থান থেকে দূরত্ব অনুযায়ী' : 'আপনার নির্বাচিত এলাকার যাচাইকৃত ডাক্তার'}</span><h2><MapPin /> আপনার এলাকার ডাক্তার</h2></div><Link to={`/doctors${viewAllParams.size ? `?${viewAllParams}` : ''}`}>সব দেখুন <ArrowRight /></Link></div>
            {loading ? <div className="loading-box"><LoaderCircle className="spin" /> ডাক্তার লোড হচ্ছে…</div> : nearbyDoctors.length ? <div className="doctor-horizontal-scroll">{nearbyDoctors.map((doctor) => <DoctorResultCard doctor={doctor} key={doctor.doctor_id} />)}</div> : <div className="visitor-empty">এই এলাকায় এখনো কোনো অনুমোদিত ডাক্তার পাওয়া যায়নি।</div>}
          </div>
        </section>

        <section className="visitor-section soft-section">
          <div className="container">
            <div className="visitor-section-head"><div><span>প্ল্যাটফর্মের যাচাইকৃত ডাক্তার প্রোফাইল</span><h2><BadgeCheck /> সকল ডাক্তার</h2></div><Link to="/doctors">সব দেখুন <ArrowRight /></Link></div>
            <div className="doctor-horizontal-scroll">{allDoctors.map((doctor) => <DoctorResultCard doctor={doctor} key={doctor.doctor_id} />)}</div>
          </div>
        </section>

        <section className="visitor-section">
          <div className="container">
            <div className="visitor-section-head"><div><span>রোগ ও প্রয়োজন অনুযায়ী বিশেষজ্ঞ খুঁজুন</span><h2><HeartPulse /> স্পেশালিটি অনুযায়ী খুঁজুন</h2></div><Link to="/doctors">সব দেখুন <ArrowRight /></Link></div>
            <div className="speciality-chip-grid">
              {topics.slice(0, 10).map((topic) => <button type="button" key={topic.id} onClick={() => chooseTopic(topic)}><span>{topic.icon || '🩺'}</span><strong>{topic.name_bn}</strong><ChevronRight /></button>)}
            </div>
          </div>
        </section>

        <section className="visitor-section soft-section" id="hospitals">
          <div className="container">
            <div className="visitor-section-head"><div><span>অনুমোদিত চিকিৎসা প্রতিষ্ঠান</span><h2><Building2 /> হাসপাতাল ও চেম্বার</h2></div><Link to="/providers">সব দেখুন <ArrowRight /></Link></div>
            <div className="provider-grid">{providers.map((provider) => <ProviderCard provider={provider} key={provider.id} />)}</div>
          </div>
        </section>

        <section className="visitor-section emergency-section">
          <div className="container emergency-grid">
            <article className="emergency-feature" id="blood">
              <div className="emergency-icon blood"><Users /></div>
              <div><span>জরুরি সহায়তা</span><h2>Blood Bank</h2><p>রক্তদাতা নেটওয়ার্ক ও জরুরি রক্তের অনুরোধের জন্য রোগী হিসেবে লগইন করুন।</p></div>
              <Link to="/auth">রক্তের সহায়তা নিন <ArrowRight /></Link>
            </article>
            <article className="emergency-feature" id="ambulance">
              <div className="emergency-icon ambulance"><Ambulance /></div>
              <div><span>২৪/৭ জরুরি পরিবহন</span><h2>Ambulance</h2><p>আপনার নির্বাচিত জেলার অনুমোদিত অ্যাম্বুলেন্সে সরাসরি কল করুন।</p></div>
              <div className="ambulance-mini-list">
                {ambulances.slice(0, 3).map((item) => <a href={`tel:${item.phone}`} key={item.ambulance_id}><div><strong>{item.operator_name}</strong><small><MapPin /> {[item.upazila_name_bn, item.district_name_bn].filter(Boolean).join(', ') || item.service_area || 'এলাকা নেই'}</small></div><span>{item.phone}</span></a>)}
              </div>
            </article>
          </div>
        </section>

        <section className="visitor-trust-strip"><div className="container"><div><BadgeCheck /><strong>যাচাইকৃত ডাক্তার</strong></div><div><Building2 /><strong>অনুমোদিত হাসপাতাল/চেম্বার</strong></div><div><Ambulance /><strong>জরুরি সেবা</strong></div></div></section>
      </main>
      <footer className="visitor-footer"><div className="container"><div className="visitor-brand"><span><HeartPulse /></span><strong>{siteName}</strong></div><p>জরুরি অবস্থায় জাতীয় জরুরি সেবা <a href="tel:999">৯৯৯</a>-এ কল করুন।</p></div></footer>
      <VisitorBottomNav />
    </div>
  );
}
