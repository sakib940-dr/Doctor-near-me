import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import {
  Ambulance,
  ArrowRight,
  BadgeCheck,
  Building2,
  ChevronRight,
  Clock3,
  HeartPulse,
  LoaderCircle,
  LocateFixed,
  MapPin,
  Menu,
  Phone,
  Search,
  ShieldCheck,
  Stethoscope,
  Users,
  X,
} from 'lucide-react';
import { isSupabaseConfigured } from './lib/supabase';
import { getImageUrl } from './lib/storage';
import {
  getDistricts,
  getHomepageConfiguration,
  searchAmbulances,
  searchDoctors,
} from './services/discovery';
import type {
  AmbulanceSearchRow,
  DiscoveryTopic,
  District,
  DoctorSearchRow,
  HomepageConfiguration,
  SearchMode,
} from './types';
import DoctorDirectory from './pages/DoctorDirectory';
import DoctorProfile from './pages/DoctorProfile';
import AuthPage from './pages/AuthPage';
import DashboardPage from './pages/DashboardPage';
import OnboardingPage from './pages/OnboardingPage';
import ProtectedRoute from './components/ProtectedRoute';
import { useAuth } from './contexts/AuthContext';
import AppointmentsPage from './pages/AppointmentsPage';
import BookingPage from './pages/BookingPage';
import PatientProfilePage from './pages/PatientProfilePage';
import DoctorProfessionalProfilePage from './pages/DoctorProfessionalProfilePage';
import DoctorSchedulePage from './pages/DoctorSchedulePage';
import DoctorAppointmentsPage from './pages/DoctorAppointmentsPage';

const fallbackTopics: DiscoveryTopic[] = [
  { id: -1, name_bn: 'হৃদরোগ', name_en: 'Heart', slug: 'heart', icon: '🫀', description_bn: null, search_keywords: [], specialty_ids: [] },
  { id: -2, name_bn: 'চোখ', name_en: 'Eye', slug: 'eye', icon: '👁️', description_bn: null, search_keywords: [], specialty_ids: [] },
  { id: -3, name_bn: 'দাঁত', name_en: 'Dental', slug: 'dental', icon: '🦷', description_bn: null, search_keywords: [], specialty_ids: [] },
  { id: -4, name_bn: 'মস্তিষ্ক ও স্নায়ু', name_en: 'Brain & Nerve', slug: 'brain-nerve', icon: '🧠', description_bn: null, search_keywords: [], specialty_ids: [] },
  { id: -5, name_bn: 'হাড় ও জয়েন্ট', name_en: 'Bone & Joint', slug: 'bone-joint', icon: '🦴', description_bn: null, search_keywords: [], specialty_ids: [] },
  { id: -6, name_bn: 'শিশু', name_en: 'Child', slug: 'child', icon: '👶', description_bn: null, search_keywords: [], specialty_ids: [] },
  { id: -7, name_bn: 'নারী ও গর্ভাবস্থা', name_en: 'Women', slug: 'women-pregnancy', icon: '🤰', description_bn: null, search_keywords: [], specialty_ids: [] },
  { id: -8, name_bn: 'ডায়াবেটিস', name_en: 'Diabetes', slug: 'diabetes-hormone', icon: '🩸', description_bn: null, search_keywords: [], specialty_ids: [] },
];

const emptyHomepage: HomepageConfiguration = {
  sections: [],
  banners: [],
  topics: [],
  settings: {},
};

function humanizeError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error && 'message' in error) {
    return String(error.message);
  }
  return 'ডেটা লোড করা যায়নি। কিছুক্ষণ পর আবার চেষ্টা করুন।';
}

function HomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [homepage, setHomepage] = useState(emptyHomepage);
  const [districts, setDistricts] = useState<District[]>([]);
  const [mode, setMode] = useState<SearchMode>('doctor');
  const [query, setQuery] = useState('');
  const [districtId, setDistrictId] = useState('');
  const [loadingPage, setLoadingPage] = useState(isSupabaseConfigured);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [doctorResults, setDoctorResults] = useState<DoctorSearchRow[]>([]);
  const [ambulanceResults, setAmbulanceResults] = useState<AmbulanceSearchRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;

    Promise.all([getHomepageConfiguration(), getDistricts()])
      .then(([configuration, districtRows]) => {
        if (!active) return;
        setHomepage(configuration);
        setDistricts(districtRows);
      })
      .catch((loadError: unknown) => {
        if (active) setError(humanizeError(loadError));
      })
      .finally(() => {
        if (active) setLoadingPage(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const topics = homepage.topics.length ? homepage.topics : fallbackTopics;
  const selectedDistrict = useMemo(
    () => districts.find((district) => String(district.id) === districtId),
    [districtId, districts],
  );

  const siteName = useMemo(() => {
    const brand = homepage.settings.site_brand;
    if (brand && typeof brand === 'object' && 'site_name_bn' in brand) {
      return String(brand.site_name_bn);
    }
    return 'সিরাজগঞ্জ ডাক্তার';
  }, [homepage.settings]);

  async function runSearch(
    nextMode = mode,
    nextQuery = query,
    specialtyIds?: number[],
  ) {
    if (!isSupabaseConfigured) {
      setError('লাইভ ডেটা দেখতে আগে .env.local ফাইলে Supabase URL ও publishable key দিন।');
      return;
    }

    setSearching(true);
    setSearched(true);
    setError(null);
    try {
      const selectedId = districtId ? Number(districtId) : null;
      if (nextMode === 'doctor') {
        const rows = await searchDoctors({
          query: nextQuery,
          districtId: selectedId,
          specialtyIds,
        });
        setDoctorResults(rows);
        setAmbulanceResults([]);
      } else {
        const rows = await searchAmbulances({ districtId: selectedId });
        setAmbulanceResults(rows);
        setDoctorResults([]);
      }
    } catch (searchError) {
      setError(humanizeError(searchError));
    } finally {
      setSearching(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mode === 'doctor') {
      const params = new URLSearchParams();
      if (query.trim()) params.set('q', query.trim());
      if (districtId) params.set('district', districtId);
      navigate(`/doctors${params.size ? `?${params}` : ''}`);
      return;
    }
    void runSearch();
  }

  function chooseTopic(topic: DiscoveryTopic) {
    const params = new URLSearchParams({ q: topic.name_bn });
    if (topic.specialty_ids.length) {
      params.set('specialties', topic.specialty_ids.join(','));
    }
    if (districtId) params.set('district', districtId);
    navigate(`/doctors?${params}`);
  }

  const resultCount = mode === 'doctor'
    ? doctorResults[0]?.total_count ?? doctorResults.length
    : ambulanceResults[0]?.total_count ?? ambulanceResults.length;

  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="container header-inner">
          <a className="brand" href="#top" aria-label={`${siteName} হোম`}>
            <span className="brand-mark"><HeartPulse size={24} /></span>
            <span><strong>{siteName}</strong><small>স্বাস্থ্যের বিশ্বস্ত ঠিকানা</small></span>
          </a>

          <nav className={menuOpen ? 'main-nav is-open' : 'main-nav'} aria-label="প্রধান নেভিগেশন">
            <Link to="/doctors" onClick={() => setMenuOpen(false)}>ডাক্তার</Link>
            <a href="#hospitals" onClick={() => setMenuOpen(false)}>হাসপাতাল</a>
            <a href="#ambulances" onClick={() => { setMode('ambulance'); setMenuOpen(false); }}>অ্যাম্বুলেন্স</a>
            <a href="#blood" onClick={() => setMenuOpen(false)}>রক্তদাতা</a>
            <Link className="login-button" to={user ? '/dashboard' : '/auth'}>{user ? 'Dashboard' : 'লগইন'}</Link>
          </nav>

          <button
            className="menu-button"
            type="button"
            aria-label={menuOpen ? 'মেনু বন্ধ করুন' : 'মেনু খুলুন'}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X /> : <Menu />}
          </button>
        </div>
      </header>

      <main id="top">
        {!isSupabaseConfigured && (
          <div className="setup-banner" role="status">
            <div className="container">
              <ShieldCheck size={20} />
              <span><strong>UI preview চালু আছে।</strong> লাইভ ডেটার জন্য <code>.env.example</code> কপি করে <code>.env.local</code> তৈরি করুন।</span>
            </div>
          </div>
        )}

        <section className="hero">
          <div className="hero-orb hero-orb-one" />
          <div className="hero-orb hero-orb-two" />
          <div className="container hero-grid">
            <div className="hero-copy">
              <div className="eyebrow"><BadgeCheck size={17} /> যাচাইকৃত স্বাস্থ্যসেবা তথ্য</div>
              <h1>সঠিক ডাক্তার খুঁজুন,<br /><span>সহজে ও নিশ্চিন্তে</span></h1>
              <p>আপনার এলাকা, রোগ বা প্রয়োজন অনুযায়ী যাচাইকৃত ডাক্তার, হাসপাতাল এবং অ্যাম্বুলেন্স খুঁজে নিন।</p>

              <form className="search-panel" onSubmit={handleSubmit}>
                <div className="search-tabs" role="tablist" aria-label="সেবার ধরন">
                  <button
                    className={mode === 'doctor' ? 'active' : ''}
                    type="button"
                    onClick={() => setMode('doctor')}
                  ><Stethoscope size={18} /> ডাক্তার</button>
                  <button
                    className={mode === 'ambulance' ? 'active' : ''}
                    type="button"
                    onClick={() => setMode('ambulance')}
                  ><Ambulance size={18} /> অ্যাম্বুলেন্স</button>
                </div>

                <div className="search-fields">
                  {mode === 'doctor' && (
                    <label className="field query-field">
                      <Search size={20} />
                      <span className="sr-only">ডাক্তার বা রোগ লিখুন</span>
                      <input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="ডাক্তার, রোগ বা স্পেশালিটি"
                      />
                    </label>
                  )}
                  <label className="field location-field">
                    <MapPin size={20} />
                    <span className="sr-only">জেলা নির্বাচন করুন</span>
                    <select value={districtId} onChange={(event) => setDistrictId(event.target.value)}>
                      <option value="">সকল জেলা</option>
                      {districts.map((district) => (
                        <option key={district.id} value={district.id}>{district.name_bn}</option>
                      ))}
                    </select>
                  </label>
                  <button className="primary-search" type="submit" disabled={searching}>
                    {searching ? <LoaderCircle className="spin" size={21} /> : <Search size={21} />}
                    {mode === 'doctor' ? 'খুঁজুন' : 'অ্যাম্বুলেন্স খুঁজুন'}
                  </button>
                </div>
                <button className="nearby-link" type="button">
                  <LocateFixed size={16} /> আমার কাছাকাছি সেবা খুঁজুন
                </button>
              </form>

              <div className="trust-row">
                <span><ShieldCheck size={17} /> যাচাইকৃত তথ্য</span>
                <span><Clock3 size={17} /> দ্রুত যোগাযোগ</span>
                <span><Phone size={17} /> জরুরি কল</span>
              </div>
            </div>

            <div className="hero-visual" aria-hidden="true">
              <div className="visual-card visual-main">
                <div className="doctor-illustration">
                  <span className="doctor-head">🧑‍⚕️</span>
                  <span className="pulse-ring"><HeartPulse /></span>
                </div>
                <div><strong>ভেরিফায়েড ডাক্তার</strong><small>বিশ্বস্ত প্রোফাইল ও চেম্বার তথ্য</small></div>
              </div>
              <div className="floating-card floating-top"><BadgeCheck size={26} /><span><strong>১০০% যাচাইকৃত</strong><small>তথ্য নিয়মিত আপডেট হয়</small></span></div>
              <div className="floating-card floating-bottom"><Ambulance size={27} /><span><strong>জরুরি অ্যাম্বুলেন্স</strong><small>দ্রুত কল করুন</small></span></div>
            </div>
          </div>
        </section>

        {homepage.banners[0] && (
          <section className="container cms-banner">
            {getImageUrl(homepage.banners[0].image_path) && (
              <img src={getImageUrl(homepage.banners[0].image_path) ?? ''} alt={homepage.banners[0].image_alt_bn ?? ''} />
            )}
            <div><strong>{homepage.banners[0].title_bn}</strong><span>{homepage.banners[0].subtitle_bn}</span></div>
          </section>
        )}

        <section className="section topics-section" id="doctors">
          <div className="container">
            <div className="section-heading centered">
              <span className="section-kicker">সহজে খুঁজুন</span>
              <h2>কোন সমস্যার ডাক্তার প্রয়োজন?</h2>
              <p>রোগ বা অঙ্গ নির্বাচন করুন—আমরা সঠিক বিশেষজ্ঞ দেখাব</p>
            </div>
            <div className="topic-grid">
              {topics.slice(0, 8).map((topic) => (
                <button className="topic-card" type="button" key={topic.id} onClick={() => chooseTopic(topic)}>
                  <span className="topic-icon">{topic.icon || '🩺'}</span>
                  <strong>{topic.name_bn}</strong>
                  <small>{topic.name_en}</small>
                  <span className="topic-arrow"><ChevronRight size={17} /></span>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="section results-section" id="search-results">
          <div className="container">
            <div className="section-heading split">
              <div>
                <span className="section-kicker">লাইভ ডিরেক্টরি</span>
                <h2>{mode === 'doctor' ? 'ডাক্তার অনুসন্ধান' : 'উপলভ্য অ্যাম্বুলেন্স'}</h2>
                <p>{selectedDistrict ? `${selectedDistrict.name_bn} জেলার ফলাফল` : 'আপনার প্রয়োজন অনুযায়ী অনুসন্ধান করুন'}</p>
              </div>
              {searched && !searching && <span className="result-count">{resultCount}টি ফলাফল</span>}
            </div>

            {error && <div className="error-box" role="alert"><ShieldCheck size={20} /><span>{error}</span></div>}
            {loadingPage && <div className="loading-box"><LoaderCircle className="spin" /> লাইভ তথ্য লোড হচ্ছে…</div>}
            {!searched && !loadingPage && (
              <div className="empty-state">
                <span><Search size={34} /></span>
                <h3>উপরের সার্চ বক্স থেকে শুরু করুন</h3>
                <p>নাম, রোগ বা স্পেশালিটি লিখুন অথবা একটি ক্যাটাগরি বেছে নিন।</p>
              </div>
            )}
            {searched && searching && <div className="loading-box"><LoaderCircle className="spin" /> ফলাফল খোঁজা হচ্ছে…</div>}

            {!searching && mode === 'doctor' && doctorResults.length > 0 && (
              <div className="result-grid">
                {doctorResults.map((doctor) => <DoctorCard key={doctor.doctor_id} doctor={doctor} />)}
              </div>
            )}
            {!searching && mode === 'ambulance' && ambulanceResults.length > 0 && (
              <div className="result-grid">
                {ambulanceResults.map((ambulance) => <AmbulanceCard key={ambulance.ambulance_id} ambulance={ambulance} />)}
              </div>
            )}
            {searched && !searching && !error && resultCount === 0 && (
              <div className="empty-state"><span>🔎</span><h3>কোনো ফলাফল পাওয়া যায়নি</h3><p>অন্য জেলা বা ভিন্ন শব্দ দিয়ে আবার চেষ্টা করুন।</p></div>
            )}
          </div>
        </section>

        <section className="section service-strip" id="hospitals">
          <div className="container service-grid">
            <article><span><Stethoscope /></span><div><strong>বিশেষজ্ঞ ডাক্তার</strong><small>রোগ অনুযায়ী সঠিক চিকিৎসক</small></div></article>
            <article><span><Building2 /></span><div><strong>হাসপাতাল ও ক্লিনিক</strong><small>যাচাইকৃত প্রতিষ্ঠানের তথ্য</small></div></article>
            <article id="ambulances"><span><Ambulance /></span><div><strong>জরুরি অ্যাম্বুলেন্স</strong><small>উপলভ্য সেবায় সরাসরি কল</small></div></article>
            <article id="blood"><span><Users /></span><div><strong>রক্তদাতা নেটওয়ার্ক</strong><small>জরুরি রক্তের অনুরোধ</small></div></article>
          </div>
        </section>
      </main>

      <footer>
        <div className="container footer-inner">
          <div className="brand footer-brand"><span className="brand-mark"><HeartPulse size={22} /></span><span><strong>{siteName}</strong><small>স্বাস্থ্যের বিশ্বস্ত ঠিকানা</small></span></div>
          <p>জরুরি অবস্থায় জাতীয় জরুরি সেবা <a href="tel:999">৯৯৯</a>-এ কল করুন।</p>
        </div>
      </footer>
    </div>
  );
}

function DoctorCard({ doctor }: { doctor: DoctorSearchRow }) {
  const avatar = getImageUrl(doctor.avatar_url, 'avatars');
  return (
    <article className="result-card doctor-card">
      <div className="result-card-top">
        <div className="avatar">{avatar ? <img src={avatar} alt={doctor.doctor_name} /> : <Stethoscope />}</div>
        <div className="result-title"><h3>{doctor.doctor_name}</h3><span className="verified"><BadgeCheck size={15} /> যাচাইকৃত</span><p>{doctor.designation || doctor.professional_title || 'বিশেষজ্ঞ চিকিৎসক'}</p></div>
      </div>
      <div className="tag-row">{doctor.specialties.slice(0, 3).map((specialty) => <span key={specialty.id}>{specialty.name_bn}</span>)}</div>
      <dl>
        {doctor.degree && <div><dt>ডিগ্রি</dt><dd>{doctor.degree}</dd></div>}
        <div><dt>এলাকা</dt><dd>{[doctor.upazila_name_bn, doctor.district_name_bn].filter(Boolean).join(', ') || 'তথ্য নেই'}</dd></div>
        {doctor.consultation_fee != null && <div><dt>ভিজিট</dt><dd>৳{doctor.consultation_fee}</dd></div>}
      </dl>
      <Link className="card-action" to={`/doctors/${doctor.doctor_id}`}>প্রোফাইল দেখুন <ArrowRight size={17} /></Link>
    </article>
  );
}

function AmbulanceCard({ ambulance }: { ambulance: AmbulanceSearchRow }) {
  return (
    <article className="result-card ambulance-card">
      <div className="result-card-top">
        <div className="avatar ambulance-avatar"><Ambulance /></div>
        <div className="result-title"><h3>{ambulance.operator_name}</h3><span className={ambulance.is_available ? 'available' : 'unavailable'}>{ambulance.is_available ? 'এখন উপলভ্য' : 'অনুপলভ্য'}</span><p>{ambulance.vehicle_type}</p></div>
      </div>
      <div className="tag-row">{ambulance.capabilities.slice(0, 3).map((capability) => <span key={capability}>{capability}</span>)}</div>
      <dl>
        <div><dt>এলাকা</dt><dd>{[ambulance.upazila_name_bn, ambulance.district_name_bn].filter(Boolean).join(', ') || ambulance.service_area || 'তথ্য নেই'}</dd></div>
        {ambulance.operates_24_hours && <div><dt>সময়</dt><dd>২৪ ঘণ্টা</dd></div>}
        {ambulance.hospital_name_bn && <div><dt>সংযুক্ত</dt><dd>{ambulance.hospital_name_bn}</dd></div>}
      </dl>
      <a className="card-action call-action" href={`tel:${ambulance.phone}`}><Phone size={17} /> {ambulance.phone}</a>
    </article>
  );
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/doctors" element={<DoctorDirectory />} />
      <Route path="/doctors/:doctorId" element={<DoctorProfile />} />
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/onboarding" element={<ProtectedRoute><OnboardingPage /></ProtectedRoute>} />
      <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
      <Route path="/profile" element={<ProtectedRoute><PatientProfilePage /></ProtectedRoute>} />
      <Route path="/appointments" element={<ProtectedRoute><AppointmentsPage /></ProtectedRoute>} />
      <Route path="/doctors/:doctorId/book" element={<ProtectedRoute><BookingPage /></ProtectedRoute>} />
      <Route path="/doctor/profile" element={<ProtectedRoute><DoctorProfessionalProfilePage /></ProtectedRoute>} />
      <Route path="/doctor/schedules" element={<ProtectedRoute><DoctorSchedulePage /></ProtectedRoute>} />
      <Route path="/doctor/appointments" element={<ProtectedRoute><DoctorAppointmentsPage /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
