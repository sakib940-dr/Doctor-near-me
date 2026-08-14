import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Ambulance, Building2, Droplets, HeartPulse, MapPin, ShieldCheck, Sparkles, Stethoscope } from 'lucide-react';
import PublicHeader from '../components/PublicHeader';
import DoctorRow from '../components/DoctorRow';
import ProviderRow from '../components/ProviderRow';
import LocationSearchBar from '../components/LocationSearchBar';
import { isSupabaseConfigured } from '../lib/supabase';
import { useGeolocation } from '../hooks/useGeolocation';
import {
  getDistricts,
  getHomepageConfiguration,
  getNearestDoctors,
  getUpazilas,
  searchDoctors,
  searchProviders,
} from '../services/discovery';
import type { District, DiscoveryTopic, DoctorSearchRow, HomepageConfiguration, ProviderPublicRow, Upazila } from '../types';

const emptyHomepage: HomepageConfiguration = { sections: [], banners: [], topics: [], settings: {} };

const fallbackTopics: DiscoveryTopic[] = [
  { id: -1, name_bn: 'হৃদরোগ', name_en: 'Heart', slug: 'heart', icon: '🫀', description_bn: null, search_keywords: [], specialty_ids: [] },
  { id: -2, name_bn: 'চোখ', name_en: 'Eye', slug: 'eye', icon: '👁️', description_bn: null, search_keywords: [], specialty_ids: [] },
  { id: -3, name_bn: 'দাঁত', name_en: 'Dental', slug: 'dental', icon: '🦷', description_bn: null, search_keywords: [], specialty_ids: [] },
  { id: -4, name_bn: 'মস্তিষ্ক ও স্নায়ু', name_en: 'Brain & Nerve', slug: 'brain-nerve', icon: '🧠', description_bn: null, search_keywords: [], specialty_ids: [] },
  { id: -5, name_bn: 'হাড় ও জয়েন্ট', name_en: 'Bone & Joint', slug: 'bone-joint', icon: '🦴', description_bn: null, search_keywords: [], specialty_ids: [] },
  { id: -6, name_bn: 'শিশু', name_en: 'Child', slug: 'child', icon: '👶', description_bn: null, search_keywords: [], specialty_ids: [] },
  { id: -7, name_bn: 'নারী ও গর্ভাবস্থা', name_en: 'Women', slug: 'women-pregnancy', icon: '🤰', description_bn: null, search_keywords: [], specialty_ids: [] },
  { id: -8, name_bn: 'ডায়াবেটিস', name_en: 'Diabetes', slug: 'diabetes-hormone', icon: '🩸', description_bn: null, search_keywords: [], specialty_ids: [] },
];

const messageFrom = (error: unknown) => error instanceof Error ? error.message : 'ডেটা লোড করা যায়নি। কিছুক্ষণ পর আবার চেষ্টা করুন।';

export default function HomePage() {
  const navigate = useNavigate();
  const [homepage, setHomepage] = useState(emptyHomepage);
  const [districts, setDistricts] = useState<District[]>([]);
  const [upazilas, setUpazilas] = useState<Upazila[]>([]);
  const [districtId, setDistrictId] = useState('');
  const [upazilaId, setUpazilaId] = useState('');
  const [query, setQuery] = useState('');
  const { status: geoStatus, coords, requestLocation } = useGeolocation();

  const [areaDoctors, setAreaDoctors] = useState<DoctorSearchRow[]>([]);
  const [areaLoading, setAreaLoading] = useState(false);
  const [allDoctors, setAllDoctors] = useState<DoctorSearchRow[]>([]);
  const [allLoading, setAllLoading] = useState(true);
  const [providers, setProviders] = useState<ProviderPublicRow[]>([]);
  const [providersLoading, setProvidersLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { document.title = 'সিরাজগঞ্জ ডাক্তার — ডাক্তার খুঁজুন'; }, []);

  // হোমপেজ কনফিগারেশন (স্পেশালিটি টপিক, ব্যানার) ও জেলার তালিকা
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    Promise.all([getHomepageConfiguration(), getDistricts()])
      .then(([configuration, districtRows]) => {
        if (!active) return;
        setHomepage(configuration);
        setDistricts(districtRows);
      })
      .catch((loadError: unknown) => { if (active) setError(messageFrom(loadError)); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!districtId || !isSupabaseConfigured) { setUpazilas([]); setUpazilaId(''); return; }
    getUpazilas(Number(districtId)).then(setUpazilas).catch(() => setUpazilas([]));
  }, [districtId]);

  // আপনার এলাকার ডাক্তার — জেলা/উপজেলা বাছা থাকলে সেটা দিয়ে, নাহলে GPS
  // অনুমতি মিললে nearest_doctors() (best-effort) দিয়ে চেষ্টা করা হয়। লগইন
  // ছাড়া nearest_doctors ব্যর্থ হতে পারে (backend-এর বিদ্যমান RLS ডিজাইন) —
  // সেক্ষেত্রে এই সেকশনটি খালি দেখাবে, ভেঙে পড়বে না।
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;

    async function loadAreaDoctors() {
      setAreaLoading(true);
      try {
        if (districtId) {
          const rows = await searchDoctors({
            districtId: Number(districtId),
            upazilaId: upazilaId ? Number(upazilaId) : null,
            limit: 10,
          });
          if (active) setAreaDoctors(rows);
          return;
        }
        if (geoStatus === 'granted' && coords) {
          const rows = await getNearestDoctors({ latitude: coords.latitude, longitude: coords.longitude, limit: 10 });
          if (active) {
            setAreaDoctors(
              rows.map((row) => ({
                doctor_id: row.doctor_id,
                doctor_name: row.doctor_name,
                avatar_url: null,
                degree: row.degree,
                designation: row.designation,
                professional_title: null,
                consultation_fee: row.consultation_fee,
                experience_years: null,
                district_id: row.district_id,
                district_name_bn: null,
                upazila_id: row.upazila_id,
                upazila_name_bn: row.address,
                specialties: [],
                available_today: false,
                total_count: rows.length,
              })),
            );
          }
          return;
        }
        if (active) setAreaDoctors([]);
      } catch (loadError) {
        if (active) setError(messageFrom(loadError));
      } finally {
        if (active) setAreaLoading(false);
      }
    }

    void loadAreaDoctors();
    return () => { active = false; };
  }, [districtId, upazilaId, geoStatus, coords]);

  // সকল ডাক্তার (এখানে "জনপ্রিয়তা"-ভিত্তিক কোনো মেট্রিক backend-এ নেই, তাই
  // এটিকে সততার সাথে "সকল ডাক্তার" হিসেবে দেখানো হচ্ছে, নাম অনুযায়ী সাজানো)
  useEffect(() => {
    if (!isSupabaseConfigured) { setAllLoading(false); return; }
    let active = true;
    setAllLoading(true);
    searchDoctors({ limit: 10, sort: 'name' })
      .then((rows) => { if (active) setAllDoctors(rows); })
      .catch((loadError: unknown) => { if (active) setError(messageFrom(loadError)); })
      .finally(() => { if (active) setAllLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) { setProvidersLoading(false); return; }
    let active = true;
    setProvidersLoading(true);
    searchProviders({ limit: 8 })
      .then(({ rows }) => { if (active) setProviders(rows); })
      .catch((loadError: unknown) => { if (active) setError(messageFrom(loadError)); })
      .finally(() => { if (active) setProvidersLoading(false); });
    return () => { active = false; };
  }, []);

  const topics = homepage.topics.length ? homepage.topics : fallbackTopics;
  const siteName = useMemo(() => {
    const brand = homepage.settings.public_brand;
    if (brand && typeof brand === 'object' && 'site_name_bn' in brand) return String((brand as { site_name_bn: string }).site_name_bn);
    return 'সিরাজগঞ্জ ডাক্তার';
  }, [homepage.settings]);

  function handleSearchSubmit(event: FormEvent) {
    event.preventDefault();
    const params = new URLSearchParams();
    if (query.trim()) params.set('q', query.trim());
    if (districtId) params.set('district', districtId);
    if (upazilaId) params.set('upazila', upazilaId);
    navigate(`/doctors${params.size ? `?${params}` : ''}`);
  }

  function chooseTopic(topic: DiscoveryTopic) {
    const params = new URLSearchParams({ q: topic.name_bn });
    if (topic.specialty_ids.length) params.set('specialties', topic.specialty_ids.join(','));
    if (districtId) params.set('district', districtId);
    navigate(`/doctors?${params}`);
  }

  const areaTitle = districtId
    ? `${districts.find((d) => String(d.id) === districtId)?.name_bn ?? ''} এলাকার ডাক্তার`
    : geoStatus === 'granted' ? 'আপনার কাছাকাছি ডাক্তার' : 'আপনার এলাকার ডাক্তার';

  return (
    <div className="app-shell home-page">
      <PublicHeader />
      <main>
        {!isSupabaseConfigured && (
          <div className="setup-banner" role="status">
            <div className="container"><ShieldCheck size={20} /><span><strong>UI preview চালু আছে।</strong> লাইভ ডেটার জন্য <code>.env.local</code>-এ Supabase কী যোগ করুন।</span></div>
          </div>
        )}

        {/* কমপ্যাক্ট হিরো + টপ লোকেশন/সার্চ বার */}
        <section className="home-hero">
          <div className="container">
            <p className="home-hero-eyebrow"><HeartPulse size={15} /> {siteName} — স্বাস্থ্যের বিশ্বস্ত ঠিকানা</p>
            <h1>আপনার এলাকার বিশ্বস্ত ডাক্তার খুঁজুন</h1>
            <LocationSearchBar
              districts={districts}
              upazilas={upazilas}
              districtId={districtId}
              upazilaId={upazilaId}
              onDistrictChange={(value) => { setDistrictId(value); setUpazilaId(''); }}
              onUpazilaChange={setUpazilaId}
              query={query}
              onQueryChange={setQuery}
              onSubmit={handleSearchSubmit}
              geoStatus={geoStatus}
              onRequestLocation={requestLocation}
            />
          </div>
        </section>

        {error && <div className="container"><div className="error-box" role="alert">{error}</div></div>}

        <DoctorRow
          id="area-doctors"
          icon={MapPin}
          title={areaTitle}
          subtitle="আপনার নির্বাচিত এলাকার যাচাইকৃত ডাক্তার"
          doctors={areaDoctors}
          loading={areaLoading}
          viewAllTo={`/doctors${districtId ? `?district=${districtId}${upazilaId ? `&upazila=${upazilaId}` : ''}` : ''}`}
          emptyText="এলাকা নির্বাচন করুন অথবা লোকেশন অনুমতি দিন — তাহলে কাছের ডাক্তার দেখা যাবে।"
        />

        <DoctorRow
          icon={Sparkles}
          title="সকল ডাক্তার"
          subtitle="প্ল্যাটফর্মের সকল যাচাইকৃত ডাক্তার প্রোফাইল"
          doctors={allDoctors}
          loading={allLoading}
          viewAllTo="/doctors"
          emptyText="এখনো কোনো ডাক্তার প্রোফাইল যোগ করা হয়নি।"
        />

        {/* স্পেশালিটি ক্যাটাগরি */}
        <section className="container home-row" id="specialties">
          <div className="home-row-head">
            <div className="home-row-heading"><span className="home-row-icon"><Stethoscope size={18} /></span><div><h2>স্পেশালিটি অনুযায়ী খুঁজুন</h2><p>যে সমস্যার জন্য ডাক্তার প্রয়োজন তা বেছে নিন</p></div></div>
          </div>
          <div className="specialty-grid">
            {topics.slice(0, 10).map((topic) => (
              <button className="specialty-chip" type="button" key={topic.id} onClick={() => chooseTopic(topic)}>
                <span>{topic.icon || '🩺'}</span>
                <strong>{topic.name_bn}</strong>
              </button>
            ))}
          </div>
        </section>

        <ProviderRow
          id="hospitals"
          icon={Building2}
          title="হাসপাতাল ও চেম্বার"
          subtitle="যাচাইকৃত প্রতিষ্ঠানসমূহ"
          providers={providers}
          loading={providersLoading}
          viewAllTo="/hospitals"
          emptyText="এখনো কোনো হাসপাতাল/চেম্বার অনুমোদিত হয়নি।"
        />

        {/* রক্ত ব্যাংক ও অ্যাম্বুলেন্স শর্টকাট */}
        <section className="container home-shortcuts">
          <Link to="/blood-bank" className="home-shortcut-card"><Droplets size={24} /><div><strong>রক্ত ব্যাংক</strong><small>কাছাকাছি স্বেচ্ছাসেবী রক্তদাতা খুঁজুন</small></div></Link>
          <Link to="/ambulance" className="home-shortcut-card"><Ambulance size={24} /><div><strong>অ্যাম্বুলেন্স</strong><small>জরুরি অ্যাম্বুলেন্স সার্ভিস খুঁজুন</small></div></Link>
        </section>
      </main>

      <footer>
        <div className="container footer-inner">
          <div className="brand footer-brand"><span className="brand-mark"><HeartPulse size={22} /></span><span><strong>{siteName}</strong><small>স্বাস্থ্যের বিশ্বস্ত ঠিকানা</small></span></div>
          <p>জরুরি অবস্থায় জাতীয় জরুরি সেবা <a href="tel:999">৯৯৯</a>-এ কল করুন।</p>
        </div>
      </footer>
    </div>
  );
}
