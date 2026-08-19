import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import {
  Ambulance,
  ArrowRight,
  BadgeCheck,
  Building2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  X,
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
import { SITE_NAME, SITE_TAGLINE } from '../lib/brand';
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
const LOCATION_STORAGE_KEY = 'docbd-current-location';
const LEGACY_LOCATION_STORAGE_KEY = 'sirajganj-current-location';


function SpecialtyDoctorRow({ topic, doctors, href }: { topic: DiscoveryTopic; doctors: DoctorSearchRow[]; href: string }) {
  const rowRef = useRef<HTMLDivElement>(null);
  const scroll = (direction: -1 | 1) => {
    rowRef.current?.scrollBy({ left: direction * Math.min(rowRef.current.clientWidth * 0.82, 760), behavior: 'smooth' });
  };
  return (
    <section className="specialty-doctor-section">
      <header className="specialty-doctor-head">
        <div className="specialty-doctor-title"><span className="specialty-topic-icon" aria-hidden="true">{topic.icon || '🩺'}</span><div><small>বিশেষজ্ঞ চিকিৎসক</small><h3>{topic.name_bn} বিশেষজ্ঞ</h3></div></div>
        <div className="specialty-head-actions">
          <div className="specialty-scroll-arrows" aria-label={`${topic.name_bn} ডাক্তার স্ক্রল করুন`}>
            <button type="button" onClick={() => scroll(-1)} aria-label="বামে দেখুন"><ChevronLeft /></button>
            <button type="button" onClick={() => scroll(1)} aria-label="ডানে দেখুন"><ChevronRight /></button>
          </div>
          <Link className="marketplace-see-all" to={href}>সব দেখুন <ArrowRight /></Link>
        </div>
      </header>
      <div className="doctor-horizontal-scroll marketplace-doctor-row" ref={rowRef}>
        {doctors.map((doctor) => <DoctorResultCard doctor={doctor} key={doctor.doctor_id} />)}
      </div>
    </section>
  );
}

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
  const [specialtyDoctors, setSpecialtyDoctors] = useState<Record<number, DoctorSearchRow[]>>({});
  const [specialtyLoading, setSpecialtyLoading] = useState(false);
  const [providers, setProviders] = useState<ProviderDirectoryRow[]>([]);
  const [ambulances, setAmbulances] = useState<AmbulanceSearchRow[]>([]);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [locationState, setLocationState] = useState<'idle' | 'asking' | 'granted' | 'denied'>('idle');
  const [locationHydrated, setLocationHydrated] = useState(false);
  const [locationPromptVisible, setLocationPromptVisible] = useState(false);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState<'district' | 'upazila' | null>(null);
  const [currentLocation, setCurrentLocation] = useState<{ latitude: number; longitude: number; accuracy: number | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let hasSavedLocation = false;
    try {
      const raw = localStorage.getItem(LOCATION_STORAGE_KEY) || localStorage.getItem(LEGACY_LOCATION_STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { latitude?: number; longitude?: number; accuracy?: number | null; capturedAt?: number };
        if (typeof saved.latitude === 'number' && typeof saved.longitude === 'number' && (!saved.capturedAt || Date.now() - saved.capturedAt < 30 * 60 * 1000)) {
          hasSavedLocation = true;
          setCurrentLocation({ latitude: saved.latitude, longitude: saved.longitude, accuracy: saved.accuracy ?? null });
          setLocationState('granted');
        }
      }
    } catch { /* ignore unavailable/invalid local storage */ }
    finally {
      setLocationHydrated(true);
      setLocationPromptVisible(!hasSavedLocation);
    }
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
    let active = true;
    setResultsLoading(true);
    Promise.all([
      doctorRequest,
      getPublicProviders({ districtId: selectedDistrict, upazilaId: selectedUpazila, limit: 8 }),
      searchAmbulances({
        districtId: selectedDistrict,
        upazilaId: selectedUpazila,
        latitude: currentLocation?.latitude ?? null,
        longitude: currentLocation?.longitude ?? null,
        radiusKm: currentLocation ? 100 : null,
      }),
    ]).then(([doctors, providerRows, ambulanceRows]) => {
      if (!active) return;
      setNearbyDoctors(doctors);
      setProviders(providerRows);
      setAmbulances(ambulanceRows.slice(0, 4));
      setError(null);
    }).catch((loadError) => active && setError(messageFrom(loadError))).finally(() => active && setResultsLoading(false));
    return () => { active = false; };
  }, [districtId, upazilaId, currentLocation]);

  const topics = homepage.topics.length ? homepage.topics : fallbackTopics;
  const siteName = useMemo(() => {
    const brand = homepage.settings.public_brand;
    return brand && typeof brand === 'object' && 'site_name_bn' in brand ? String(brand.site_name_bn) : SITE_NAME;
  }, [homepage.settings]);


  useEffect(() => {
    if (!isSupabaseConfigured || loading) return;
    const featuredTopics = topics.slice(0, 6);
    if (!featuredTopics.length) {
      setSpecialtyDoctors({});
      return;
    }
    let active = true;
    setSpecialtyLoading(true);
    Promise.all(featuredTopics.map(async (topic) => {
      const doctors = await searchDoctors({
        query: topic.specialty_ids.length ? undefined : topic.name_bn,
        specialtyIds: topic.specialty_ids,
        districtId: districtId ? Number(districtId) : null,
        upazilaId: upazilaId ? Number(upazilaId) : null,
        limit: 8,
        sort: 'name',
      });
      return [topic.id, doctors] as const;
    }))
      .then((entries) => {
        if (!active) return;
        const next: Record<number, DoctorSearchRow[]> = {};
        entries.forEach(([topicId, doctors]) => { next[topicId] = doctors; });
        setSpecialtyDoctors(next);
      })
      .catch(() => {
        if (active) setSpecialtyDoctors({});
      })
      .finally(() => active && setSpecialtyLoading(false));
    return () => { active = false; };
  }, [topics, loading, districtId, upazilaId]);

  if (!authLoading && user) return <Navigate to="/dashboard" replace />;

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    const params = new URLSearchParams();
    if (query.trim()) params.set('q', query.trim());
    if (districtId) params.set('district', districtId);
    if (upazilaId) params.set('upazila', upazilaId);
    navigate(`/doctors${params.size ? `?${params}` : ''}`);
  }

  function topicHref(topic: DiscoveryTopic) {
    const params = new URLSearchParams();
    if (topic.specialty_ids.length) params.set('specialties', topic.specialty_ids.join(','));
    else params.set('q', topic.name_bn);
    if (districtId) params.set('district', districtId);
    if (upazilaId) params.set('upazila', upazilaId);
    return `/doctors?${params}`;
  }

  function requestLocation() {
    if (!navigator.geolocation) {
      setLocationState('denied');
      setLocationPromptVisible(false);
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
        window.setTimeout(() => setLocationPromptVisible(false), 280);
        // Anonymous visitors cannot write a user-owned Supabase row. Keep the
        // consented point locally so it can be persisted immediately after login.
        try {
          localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify({ ...location, capturedAt: Date.now() }));
          localStorage.removeItem(LEGACY_LOCATION_STORAGE_KEY);
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
      () => { setLocationState('denied'); setLocationPromptVisible(false); },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }

  const viewAllParams = new URLSearchParams();
  if (districtId) viewAllParams.set('district', districtId);
  if (upazilaId) viewAllParams.set('upazila', upazilaId);
  const selectedDistrictName = districts.find((district) => String(district.id) === districtId)?.name_bn || 'জেলা নির্বাচন';
  const selectedUpazilaName = upazilas.find((upazila) => String(upazila.id) === upazilaId)?.name_bn || 'উপজেলা নির্বাচন';
  const showLocationPrompt = locationHydrated && locationPromptVisible && locationState !== 'denied';

  return (
    <div className="app-shell visitor-home">
      <PublicHeader />

      <main>
        <section className="visitor-search-hero">
          <div className="visitor-hero-pattern" aria-hidden="true" />
          <div className="container visitor-hero-stack">
            {showLocationPrompt && (
              <div className={`visitor-location-onboarding ${locationState === 'asking' ? 'is-asking' : ''} ${locationState === 'granted' ? 'is-granted' : ''}`}>
                <div className="visitor-location-visual"><LocateFixed /></div>
                <div className="visitor-location-copy">
                  <span>লোকেশন চালু করলে ফলাফল আরও প্রাসঙ্গিক হবে</span>
                  <h2>আপনার কাছের সেরা ডাক্তার খুঁজে দিন</h2>
                  <p>এক ট্যাপে আপনার বর্তমান অবস্থান ব্যবহার করে কাছের যাচাইকৃত ডাক্তার, হাসপাতাল ও সেবা সাজিয়ে দেখাব।</p>
                </div>
                <button type="button" onClick={requestLocation} disabled={locationState === 'asking'}>
                  {locationState === 'asking' ? <LoaderCircle className="spin" /> : <LocateFixed />}
                  {locationState === 'asking' ? 'লোকেশন নেওয়া হচ্ছে…' : 'আমার লোকেশন ব্যবহার করুন'}
                </button>
              </div>
            )}

            <div className="visitor-hero-copy">
              <span><HeartPulse /> {SITE_NAME} — {SITE_TAGLINE}</span>
              <h1>বিশ্বস্ত চিকিৎসা, এখন আপনার আরও কাছে</h1>
              <p>ডাক্তার, রোগ বা স্পেশালিটি খুঁজুন—লোকেশন বা এলাকা অনুযায়ী দ্রুত সেরা অপশন দেখুন।</p>
            </div>

            <form className="visitor-search-box" onSubmit={submitSearch}>
              <div className="visitor-location-selects desktop-location-selects">
                <select aria-label="জেলা নির্বাচন" value={districtId} onChange={(event) => { setDistrictId(event.target.value); setUpazilaId(''); }}>
                  <option value="">জেলা নির্বাচন</option>
                  {districts.map((district) => <option value={district.id} key={district.id}>{district.name_bn}</option>)}
                </select>
                <select aria-label="উপজেলা নির্বাচন" value={upazilaId} onChange={(event) => setUpazilaId(event.target.value)} disabled={!districtId}>
                  <option value="">উপজেলা নির্বাচন</option>
                  {upazilas.map((upazila) => <option value={upazila.id} key={upazila.id}>{upazila.name_bn}</option>)}
                </select>
              </div>

              <div className={`visitor-location-selects mobile-location-selects ${locationState === 'denied' ? 'fallback-highlight' : ''}`}>
                <button type="button" onClick={() => setPickerOpen('district')}><MapPin /><span>{selectedDistrictName}</span><ChevronDown /></button>
                <button type="button" onClick={() => districtId && setPickerOpen('upazila')} disabled={!districtId}><MapPin /><span>{selectedUpazilaName}</span><ChevronDown /></button>
              </div>

              <label className="visitor-search-input"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ডাক্তার, রোগ বা স্পেশালিটি খুঁজুন..." /></label>
              <button className="visitor-search-submit" type="submit">খুঁজুন <Search /></button>
              <button className={`location-permission ${locationState}`} type="button" onClick={requestLocation} title="Location permission">
                {locationState === 'asking' ? <LoaderCircle className="spin" /> : <LocateFixed />}
                <span>{locationState === 'granted' ? 'লোকেশন চালু' : locationState === 'denied' ? 'লোকেশন আবার চেষ্টা করুন' : 'আমার লোকেশন'}</span>
              </button>
            </form>

            {locationState === 'denied' && (
              <div className="visitor-location-fallback"><MapPin /><span>লোকেশন অনুমতি না দিলেও সমস্যা নেই—জেলা ও উপজেলা বেছে নিয়ে কাছের ডাক্তার খুঁজুন।</span></div>
            )}
            {!isSupabaseConfigured && <div className="visitor-preview-note"><ShieldCheck /> UI preview চলছে—লাইভ ডেটার জন্য Supabase environment variables দিন।</div>}
          </div>
        </section>

        {pickerOpen && (
          <div className="visitor-picker-backdrop" role="presentation" onClick={() => setPickerOpen(null)}>
            <section className="visitor-picker-sheet" role="dialog" aria-modal="true" aria-label={pickerOpen === 'district' ? 'জেলা নির্বাচন' : 'উপজেলা নির্বাচন'} onClick={(event) => event.stopPropagation()}>
              <div className="visitor-picker-handle" />
              <div className="visitor-picker-head">
                <div><span>এলাকা বেছে নিন</span><h2>{pickerOpen === 'district' ? 'জেলা নির্বাচন' : 'উপজেলা নির্বাচন'}</h2></div>
                <button type="button" onClick={() => setPickerOpen(null)} aria-label="বন্ধ করুন"><X /></button>
              </div>
              <div className="visitor-picker-options">
                {(pickerOpen === 'district' ? districts : upazilas).map((item) => {
                  const active = pickerOpen === 'district' ? String(item.id) === districtId : String(item.id) === upazilaId;
                  return <button type="button" className={active ? 'active' : ''} key={item.id} onClick={() => {
                    if (pickerOpen === 'district') { setDistrictId(String(item.id)); setUpazilaId(''); }
                    else setUpazilaId(String(item.id));
                    setPickerOpen(null);
                  }}><span>{item.name_bn}</span>{active && <BadgeCheck />}</button>;
                })}
              </div>
            </section>
          </div>
        )}

        {error && <div className="container"><div className="error-box" role="alert">{error}</div></div>}

        <section className="visitor-section">
          <div className="container">
            <div className="visitor-section-head"><div><span>{currentLocation ? 'আপনার বর্তমান অবস্থান থেকে দূরত্ব অনুযায়ী' : 'আপনার নির্বাচিত এলাকার যাচাইকৃত ডাক্তার'}</span><h2><MapPin /> আপনার এলাকার ডাক্তার</h2></div><Link to={`/doctors${viewAllParams.size ? `?${viewAllParams}` : ''}`}>সব দেখুন <ArrowRight /></Link></div>
            {loading || resultsLoading ? <div className="visitor-card-skeleton-row">{Array.from({ length: 3 }).map((_, index) => <div className="visitor-doctor-skeleton" key={index}><span /><div><i /><i /><i /></div></div>)}</div> : nearbyDoctors.length ? <div className="doctor-horizontal-scroll">{nearbyDoctors.map((doctor) => <DoctorResultCard doctor={doctor} key={doctor.doctor_id} />)}</div> : <div className="visitor-empty">এই এলাকায় এখনো কোনো অনুমোদিত ডাক্তার পাওয়া যায়নি।</div>}
          </div>
        </section>

        <section className="visitor-section soft-section">
          <div className="container">
            <div className="visitor-section-head"><div><span>প্ল্যাটফর্মের যাচাইকৃত ডাক্তার প্রোফাইল</span><h2><BadgeCheck /> সকল ডাক্তার</h2></div><Link to="/doctors">সব দেখুন <ArrowRight /></Link></div>
            <div className="doctor-horizontal-scroll">{allDoctors.map((doctor) => <DoctorResultCard doctor={doctor} key={doctor.doctor_id} />)}</div>
          </div>
        </section>

        <section className="visitor-section specialty-marketplace">
          <div className="container">
            <div className="visitor-section-head marketplace-discovery-head"><div><span>স্পেশালিটি ধরে দ্রুত সেরা চিকিৎসক বেছে নিন</span><h2><HeartPulse /> আপনার প্রয়োজনের বিশেষজ্ঞ</h2></div><Link to="/doctors">সব স্পেশালিটি <ArrowRight /></Link></div>
            {specialtyLoading ? (
              <div className="specialty-marketplace-skeleton">{Array.from({ length: 2 }).map((_, sectionIndex) => <div key={sectionIndex}><i /><div className="visitor-card-skeleton-row">{Array.from({ length: 3 }).map((__, index) => <div className="visitor-doctor-skeleton" key={index}><span /><div><i /><i /><i /></div></div>)}</div></div>)}</div>
            ) : (
              <div className="specialty-marketplace-list">
                {topics.slice(0, 6).map((topic) => {
                  const doctors = specialtyDoctors[topic.id] ?? [];
                  if (!doctors.length) return null;
                  return <SpecialtyDoctorRow key={topic.id} topic={topic} doctors={doctors} href={topicHref(topic)} />;
                })}
              </div>
            )}
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
