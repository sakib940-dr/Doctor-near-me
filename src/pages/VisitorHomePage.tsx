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
  HeartPulse,
  LocateFixed,
  LoaderCircle,
  MapPin,
  Search,
  ShieldCheck,
  Stethoscope,
  Users,
  X,
} from 'lucide-react';
import DoctorResultCard from '../components/DoctorResultCard';
import PublicHeader from '../components/PublicHeader';
import ProviderCard from '../components/ProviderCard';
import VisitorBottomNav from '../components/VisitorBottomNav';
import { useAuth } from '../contexts/AuthContext';
import { SITE_NAME, SITE_TAGLINE } from '../lib/brand';
import { getImageUrl } from '../lib/storage';
import { isSupabaseConfigured } from '../lib/supabase';
import {
  findNearestDoctors,
  getDistricts,
  getHomepageConfiguration,
  getPublicProviders,
  getSpecialties,
  resolveLocationContext,
  getUpazilas,
  saveMyCurrentLocation,
  searchAmbulances,
  searchDoctors,
} from '../services/discovery';
import type {
  AmbulanceSearchRow,
  DiscoveryTopic,
  District,
  DoctorSearchRow,
  HomepageConfiguration,
  LocationResolution,
  ProviderDirectoryRow,
  Specialty,
  Upazila,
} from '../types';

const fallbackTopics: DiscoveryTopic[] = [
  { id: -1, name_bn: 'হৃদরোগ', name_en: 'Heart', slug: 'heart', icon: null, description_bn: null, search_keywords: [], specialty_ids: [] },
  { id: -2, name_bn: 'চোখ', name_en: 'Eye', slug: 'eye', icon: null, description_bn: null, search_keywords: [], specialty_ids: [] },
  { id: -3, name_bn: 'দাঁত', name_en: 'Dental', slug: 'dental', icon: null, description_bn: null, search_keywords: [], specialty_ids: [] },
  { id: -4, name_bn: 'মস্তিষ্ক ও স্নায়ু', name_en: 'Brain & Nerve', slug: 'brain-nerve', icon: null, description_bn: null, search_keywords: [], specialty_ids: [] },
  { id: -5, name_bn: 'হাড় ও জয়েন্ট', name_en: 'Bone & Joint', slug: 'bone-joint', icon: null, description_bn: null, search_keywords: [], specialty_ids: [] },
  { id: -6, name_bn: 'শিশু', name_en: 'Child', slug: 'child', icon: null, description_bn: null, search_keywords: [], specialty_ids: [] },
  { id: -7, name_bn: 'নারী ও প্রসূতি', name_en: 'Women', slug: 'women-pregnancy', icon: null, description_bn: null, search_keywords: [], specialty_ids: [] },
  { id: -8, name_bn: 'ডায়াবেটিস', name_en: 'Diabetes', slug: 'diabetes-hormone', icon: null, description_bn: null, search_keywords: [], specialty_ids: [] },
];

const emptyHomepage: HomepageConfiguration = { sections: [], banners: [], topics: [], settings: {} };
const messageFrom = (error: unknown) => error instanceof Error ? error.message : 'তথ্য লোড করা যায়নি।';
const LOCATION_STORAGE_KEY = 'docbd-current-location';
const LEGACY_LOCATION_STORAGE_KEY = 'sirajganj-current-location';
const AREA_STORAGE_KEY = 'docbd-area-selection';
type AreaSelectionSource = 'none' | 'gps' | 'manual';

function TopicImage({ path }: { path: string | null }) {
  const imageUrl = getImageUrl(path, 'public-images');
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [imageUrl]);
  return (
    <span className="specialty-topic-media" aria-hidden="true">
      {imageUrl && !failed ? <img src={imageUrl} alt="" loading="lazy" onError={() => setFailed(true)} /> : <Stethoscope />}
    </span>
  );
}

function SpecialtyDoctorRow({
  topic, doctors, href, imagePath, heading, eyebrow,
}: {
  topic: DiscoveryTopic;
  doctors: DoctorSearchRow[];
  href: string;
  imagePath: string | null;
  heading?: string;
  eyebrow?: string;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const scroll = (direction: -1 | 1) => {
    rowRef.current?.scrollBy({ left: direction * Math.min(rowRef.current.clientWidth * 0.82, 760), behavior: 'smooth' });
  };
  return (
    <section className="specialty-doctor-section">
      <header className="specialty-doctor-head">
        <div className="specialty-doctor-title">
          <TopicImage path={imagePath} />
          <div><small>{eyebrow || 'বিশেষজ্ঞ চিকিৎসক'}</small><h3>{heading || `${topic.name_bn} বিশেষজ্ঞ`}</h3></div>
        </div>
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
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [districtId, setDistrictId] = useState('');
  const [upazilaId, setUpazilaId] = useState('');
  const [query, setQuery] = useState('');
  const [nearbyDoctors, setNearbyDoctors] = useState<DoctorSearchRow[]>([]);
  const [allDoctors, setAllDoctors] = useState<DoctorSearchRow[]>([]);
  const [mbbsDoctors, setMbbsDoctors] = useState<DoctorSearchRow[]>([]);
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
  const [detectedLocation, setDetectedLocation] = useState<LocationResolution | null>(null);
  const [areaSelectionSource, setAreaSelectionSource] = useState<AreaSelectionSource>('none');
  const [locationResolutionState, setLocationResolutionState] = useState<'idle' | 'resolving' | 'resolved' | 'failed'>('idle');
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let hasSavedLocation = false;
    try {
      const raw = localStorage.getItem(LOCATION_STORAGE_KEY) || localStorage.getItem(LEGACY_LOCATION_STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as {
          latitude?: number; longitude?: number; accuracy?: number | null; capturedAt?: number;
          detectedDistrictId?: number; detectedDistrictNameBn?: string; detectedDistrictNameEn?: string; detectedDistrictSlug?: string;
          detectedUpazilaId?: number | null; detectedUpazilaNameBn?: string | null; detectedUpazilaNameEn?: string | null; detectedUpazilaSlug?: string | null;
          resolutionSource?: LocationResolution['resolution_source']; resolutionDistanceKm?: number;
        };
        if (typeof saved.latitude === 'number' && typeof saved.longitude === 'number' && (!saved.capturedAt || Date.now() - saved.capturedAt < 30 * 60 * 1000)) {
          hasSavedLocation = true;
          setCurrentLocation({ latitude: saved.latitude, longitude: saved.longitude, accuracy: saved.accuracy ?? null });
          setLocationState('granted');
          if (saved.detectedDistrictId && saved.detectedDistrictNameBn && saved.detectedDistrictNameEn && saved.detectedDistrictSlug) {
            setDetectedLocation({
              district_id: saved.detectedDistrictId,
              district_name_bn: saved.detectedDistrictNameBn,
              district_name_en: saved.detectedDistrictNameEn,
              district_slug: saved.detectedDistrictSlug,
              upazila_id: saved.detectedUpazilaId ?? null,
              upazila_name_bn: saved.detectedUpazilaNameBn ?? null,
              upazila_name_en: saved.detectedUpazilaNameEn ?? null,
              upazila_slug: saved.detectedUpazilaSlug ?? null,
              resolution_source: saved.resolutionSource ?? 'district_centroid',
              distance_km: saved.resolutionDistanceKm ?? 0,
            });
            setLocationResolutionState('resolved');
          }
        }
      }
      const areaRaw = localStorage.getItem(AREA_STORAGE_KEY);
      if (areaRaw) {
        const area = JSON.parse(areaRaw) as { districtId?: string; upazilaId?: string; source?: AreaSelectionSource };
        if (area.districtId) setDistrictId(area.districtId);
        if (area.upazilaId) setUpazilaId(area.upazilaId);
        if (area.source === 'gps' || area.source === 'manual') setAreaSelectionSource(area.source);
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
      getSpecialties(),
    ]).then(([home, districtRows, specialtyRows]) => {
      if (!active) return;
      setHomepage(home);
      setDistricts(districtRows);
      setSpecialties(specialtyRows);
    }).catch((loadError) => active && setError(messageFrom(loadError))).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || loading) return;
    let active = true;
    getHomepageConfiguration(districtId ? Number(districtId) : null)
      .then((home) => { if (active) setHomepage(home); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [districtId, loading]);


  useEffect(() => {
    if (!isSupabaseConfigured || !locationHydrated || !currentLocation || detectedLocation || areaSelectionSource === 'manual' || locationResolutionState !== 'idle') return;
    let active = true;
    setLocationResolutionState('resolving');
    resolveLocationContext(currentLocation.latitude, currentLocation.longitude)
      .then((resolved) => {
        if (!active) return;
        if (!resolved) {
          setLocationResolutionState('failed');
          setLocationMessage('GPS পাওয়া গেছে, কিন্তু জেলা detect করা যায়নি। জেলা manually নির্বাচন করুন।');
          return;
        }
        setDetectedLocation(resolved);
        setLocationResolutionState('resolved');
        setLocationMessage(`${resolved.district_name_bn} জেলা detect হয়েছে।`);
        setDistrictId(String(resolved.district_id));
        setUpazilaId('');
        setAreaSelectionSource('gps');
        persistAreaSelection(String(resolved.district_id), '', 'gps');
        persistGpsLocation(currentLocation, resolved);
      })
      .catch(() => {
        if (!active) return;
        setLocationResolutionState('failed');
        setLocationMessage('GPS পাওয়া গেছে, কিন্তু জেলা resolve করা যায়নি। জেলা manually নির্বাচন করুন।');
      });
    return () => { active = false; };
  }, [locationHydrated, currentLocation, detectedLocation, areaSelectionSource]);

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
    let active = true;
    setResultsLoading(true);
    Promise.all([
      searchDoctors({ districtId: selectedDistrict, upazilaId: selectedUpazila, specialtyIds: specialties.length ? specialties.map((item) => item.id) : undefined, limit: 8, sort: 'name' }),
      searchDoctors({ districtId: selectedDistrict, upazilaId: selectedUpazila, degrees: ['MBBS'], limit: 8, sort: 'name' }),
      currentLocation
        ? findNearestDoctors({
            latitude: currentLocation.latitude,
            longitude: currentLocation.longitude,
            radiusKm: 100,
            limit: 8,
          })
        : Promise.resolve([] as DoctorSearchRow[]),
      getPublicProviders({ districtId: selectedDistrict, upazilaId: selectedUpazila, limit: 8 }),
      searchAmbulances({
        districtId: selectedDistrict,
        upazilaId: selectedUpazila,
        latitude: areaSelectionSource === 'gps' ? currentLocation?.latitude ?? null : null,
        longitude: areaSelectionSource === 'gps' ? currentLocation?.longitude ?? null : null,
        radiusKm: areaSelectionSource === 'gps' && currentLocation ? 100 : null,
      }),
    ]).then(([doctors, mbbsRows, nearestRows, providerRows, ambulanceRows]) => {
      if (!active) return;
      setAllDoctors(doctors);
      setMbbsDoctors(mbbsRows);
      setNearbyDoctors(nearestRows);
      setProviders(providerRows);
      setAmbulances(ambulanceRows.slice(0, 4));
      setError(null);
    }).catch((loadError) => active && setError(messageFrom(loadError))).finally(() => active && setResultsLoading(false));
    return () => { active = false; };
  }, [districtId, upazilaId, currentLocation, areaSelectionSource, specialties]);


  const topics = homepage.topics.length ? homepage.topics : fallbackTopics;
  const specialtyById = useMemo(() => new Map(specialties.map((item) => [item.id, item])), [specialties]);
  const topicImagePath = (topic: DiscoveryTopic) => topic.specialty_ids.map((id) => specialtyById.get(id)?.icon_url || null).find(Boolean) || null;
  const siteName = useMemo(() => {
    const brand = homepage.settings.public_brand;
    return brand && typeof brand === 'object' && 'site_name_bn' in brand ? String(brand.site_name_bn) : SITE_NAME;
  }, [homepage.settings]);

  useEffect(() => {
    if (!isSupabaseConfigured || loading) return;
    const featuredTopics = topics.slice(0, 8);
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

  function persistAreaSelection(nextDistrictId: string, nextUpazilaId: string, source: AreaSelectionSource) {
    try {
      localStorage.setItem(AREA_STORAGE_KEY, JSON.stringify({
        districtId: nextDistrictId,
        upazilaId: nextUpazilaId,
        source,
        updatedAt: Date.now(),
      }));
    } catch { /* localStorage can be unavailable */ }
  }

  function selectDistrict(nextDistrictId: string, source: AreaSelectionSource = 'manual') {
    setDistrictId(nextDistrictId);
    setUpazilaId('');
    setAreaSelectionSource(source);
    if (source === 'manual') setLocationMessage(null);
    persistAreaSelection(nextDistrictId, '', source);
  }

  function selectUpazila(nextUpazilaId: string) {
    setUpazilaId(nextUpazilaId);
    setAreaSelectionSource('manual');
    setLocationMessage(null);
    persistAreaSelection(districtId, nextUpazilaId, 'manual');
  }

  function persistGpsLocation(location: { latitude: number; longitude: number; accuracy: number | null }, resolved: LocationResolution | null) {
    try {
      localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify({
        ...location,
        capturedAt: Date.now(),
        detectedDistrictId: resolved?.district_id,
        detectedDistrictNameBn: resolved?.district_name_bn,
        detectedDistrictNameEn: resolved?.district_name_en,
        detectedDistrictSlug: resolved?.district_slug,
        detectedUpazilaId: resolved?.upazila_id ?? null,
        detectedUpazilaNameBn: resolved?.upazila_name_bn ?? null,
        detectedUpazilaNameEn: resolved?.upazila_name_en ?? null,
        detectedUpazilaSlug: resolved?.upazila_slug ?? null,
        resolutionSource: resolved?.resolution_source,
        resolutionDistanceKm: resolved?.distance_km,
      }));
      localStorage.removeItem(LEGACY_LOCATION_STORAGE_KEY);
    } catch { /* storage can be unavailable in private browsing */ }
  }

  function requestLocation() {
    if (!navigator.geolocation) {
      setCurrentLocation(null);
      setLocationState('denied');
      setLocationResolutionState('failed');
      setLocationMessage('এই browser-এ GPS location support নেই। জেলা manually নির্বাচন করুন।');
      setLocationPromptVisible(false);
      return;
    }
    setLocationState('asking');
    setLocationResolutionState('resolving');
    setLocationMessage(null);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const location = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
        };
        setCurrentLocation(location);
        setLocationState('granted');
        window.setTimeout(() => setLocationPromptVisible(false), 280);

        let resolved: LocationResolution | null = null;
        if (isSupabaseConfigured) {
          try {
            resolved = await resolveLocationContext(location.latitude, location.longitude);
          } catch {
            resolved = null;
          }
        }

        if (resolved) {
          setDetectedLocation(resolved);
          setLocationResolutionState('resolved');
          setLocationMessage(`${resolved.district_name_bn} জেলা detect হয়েছে।`);
          selectDistrict(String(resolved.district_id), 'gps');
          persistGpsLocation(location, resolved);
        } else {
          setLocationResolutionState('failed');
          setLocationMessage('GPS পাওয়া গেছে, কিন্তু জেলা নির্ভরযোগ্যভাবে detect করা যায়নি। জেলা manually নির্বাচন করুন।');
          persistGpsLocation(location, null);
        }

        if (user) {
          void saveMyCurrentLocation({
            latitude: location.latitude,
            longitude: location.longitude,
            accuracyMeters: location.accuracy,
            districtId: resolved?.district_id ?? (districtId ? Number(districtId) : null),
            upazilaId: resolved?.upazila_id ?? null,
          }).catch(() => undefined);
        }
      },
      () => {
        setCurrentLocation(null);
        setLocationState('denied');
        setLocationResolutionState('failed');
        setLocationMessage('লোকেশন অনুমতি পাওয়া যায়নি। জেলা ও উপজেলা manually নির্বাচন করে search ব্যবহার করুন।');
        setLocationPromptVisible(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }


  const viewAllParams = new URLSearchParams();
  if (districtId) viewAllParams.set('district', districtId);
  if (upazilaId) viewAllParams.set('upazila', upazilaId);
  const selectedDistrictName = districts.find((district) => String(district.id) === districtId)?.name_bn || detectedLocation?.district_name_bn || 'জেলা নির্বাচন';
  const selectedUpazilaName = upazilas.find((upazila) => String(upazila.id) === upazilaId)?.name_bn || 'উপজেলা নির্বাচন';
  const showLocationPrompt = locationHydrated && locationPromptVisible && locationState !== 'denied';
  const districtPossessive = districtId ? `${selectedDistrictName}-এর` : 'বাংলাদেশের';
  const selectedAreaCaption = upazilaId
    ? `${selectedUpazilaName} উপজেলা filter সক্রিয়`
    : districtId
      ? `${selectedDistrictName} জেলা filter সক্রিয়`
      : 'জেলা বা উপজেলা নির্বাচন করে ফলাফল আরও নির্দিষ্ট করুন';
  const dentalTopic = topics.find((topic) => topic.slug === 'dental' || topic.name_en?.toLowerCase().includes('dental') || topic.name_bn.includes('দাঁত'));
  const dentalDoctors = dentalTopic ? specialtyDoctors[dentalTopic.id] ?? [] : [];
  const contextDoctorsHref = `/doctors${viewAllParams.size ? `?${viewAllParams}` : ''}`;

  return (
    <div className="app-shell visitor-home visitor-home-redesign">
      <PublicHeader />

      <main>
        <section className="visitor-search-hero">
          <div className="visitor-hero-pattern" aria-hidden="true" />
          <div className="container visitor-hero-stack">
            <div className="visitor-hero-grid">
              <div className="visitor-hero-copy">
                <span><HeartPulse /> {SITE_NAME} — {SITE_TAGLINE}</span>
                <h1>সঠিক ডাক্তার খুঁজুন, সঠিক এলাকায়</h1>
                <p>ডাক্তার, রোগ বা স্পেশালিটি দিয়ে খুঁজুন। জেলা, উপজেলা বা আপনার বর্তমান লোকেশন ব্যবহার করে কাছের যাচাইকৃত চিকিৎসা সেবা দেখুন।</p>
                <div className="visitor-hero-trust">
                  <span><BadgeCheck /> যাচাইকৃত প্রোফাইল</span>
                  <span><MapPin /> জেলা-ভিত্তিক অনুসন্ধান</span>
                  <span><LocateFixed /> Near Me</span>
                </div>
              </div>
              <div className="visitor-hero-assurance" aria-label="সার্চ সুবিধা">
                <span><ShieldCheck /></span>
                <div><small>Healthcare directory</small><strong>ডাক্তার, হাসপাতাল ও চেম্বার এক জায়গায়</strong><p>যাচাইকৃত ডাক্তার, স্পেশালিটি ও লোকেশন অনুযায়ী প্রয়োজনীয় সেবা দ্রুত খুঁজুন।</p></div>
              </div>
            </div>

            <form className="visitor-search-box visitor-search-panel" onSubmit={submitSearch}>
              <div className="visitor-search-primary">
                <label className="visitor-search-input"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ডাক্তার, রোগ বা স্পেশালিটি খুঁজুন..." /></label>
                <button className="visitor-search-submit" type="submit">খুঁজুন <Search /></button>
              </div>

              <div className="visitor-location-toolbar">
                <div className="visitor-location-label"><MapPin /><span><strong>এলাকা নির্বাচন</strong><small>জেলা ও উপজেলা অনুযায়ী ফলাফল</small></span></div>
                <div className="visitor-location-selects desktop-location-selects">
                  <select aria-label="জেলা নির্বাচন" value={districtId} onChange={(event) => selectDistrict(event.target.value)}>
                    <option value="">জেলা নির্বাচন</option>
                    {districts.map((district) => <option value={district.id} key={district.id}>{district.name_bn}</option>)}
                  </select>
                  <select aria-label="উপজেলা নির্বাচন" value={upazilaId} onChange={(event) => selectUpazila(event.target.value)} disabled={!districtId}>
                    <option value="">উপজেলা নির্বাচন</option>
                    {upazilas.map((upazila) => <option value={upazila.id} key={upazila.id}>{upazila.name_bn}</option>)}
                  </select>
                </div>

                <div className={`visitor-location-selects mobile-location-selects ${locationState === 'denied' ? 'fallback-highlight' : ''}`}>
                  <button type="button" onClick={() => setPickerOpen('district')}><MapPin /><span>{selectedDistrictName}</span><ChevronDown /></button>
                  <button type="button" onClick={() => districtId && setPickerOpen('upazila')} disabled={!districtId}><MapPin /><span>{selectedUpazilaName}</span><ChevronDown /></button>
                </div>

                <button className={`location-permission ${locationState}`} type="button" onClick={requestLocation} title="Location permission">
                  {locationState === 'asking' ? <LoaderCircle className="spin" /> : <LocateFixed />}
                  <span>{locationState === 'granted' ? 'Near Me চালু' : locationState === 'denied' ? 'আবার চেষ্টা করুন' : 'Near Me'}</span>
                </button>
              </div>
            </form>

            {showLocationPrompt && (
              <div className={`visitor-location-onboarding ${locationState === 'asking' ? 'is-asking' : ''} ${locationState === 'granted' ? 'is-granted' : ''}`}>
                <div className="visitor-location-visual"><LocateFixed /></div>
                <div className="visitor-location-copy">
                  <span>আরও প্রাসঙ্গিক ফলাফলের জন্য</span>
                  <h2>আপনার কাছের যাচাইকৃত ডাক্তার দেখুন</h2>
                  <p>লোকেশন অনুমতি দিলে আপনার বর্তমান অবস্থান থেকে দূরত্ব অনুযায়ী কাছের ডাক্তার ও সেবা দেখানো হবে।</p>
                </div>
                <button type="button" onClick={requestLocation} disabled={locationState === 'asking'}>
                  {locationState === 'asking' ? <LoaderCircle className="spin" /> : <LocateFixed />}
                  {locationState === 'asking' ? 'লোকেশন নেওয়া হচ্ছে…' : 'আমার লোকেশন ব্যবহার করুন'}
                </button>
              </div>
            )}

            {locationState === 'denied' && (
              <div className="visitor-location-fallback"><MapPin /><span>লোকেশন অনুমতি না দিলেও জেলা ও উপজেলা নির্বাচন করে ডাক্তার খুঁজতে পারবেন।</span></div>
            )}
            {locationMessage && (
              <div className={`visitor-location-status ${locationResolutionState}`}>
                {locationResolutionState === 'resolving' ? <LoaderCircle className="spin" /> : locationResolutionState === 'resolved' ? <BadgeCheck /> : <MapPin />}
                <span>{locationMessage}</span>
              </div>
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
                    if (pickerOpen === 'district') selectDistrict(String(item.id));
                    else selectUpazila(String(item.id));
                    setPickerOpen(null);
                  }}><span>{item.name_bn}</span>{active && <BadgeCheck />}</button>;
                })}
              </div>
            </section>
          </div>
        )}

        {error && <div className="container visitor-inline-error"><div className="error-box" role="alert">{error}</div></div>}

        <section className="visitor-section visitor-category-section">
          <div className="container">
            <div className="visitor-section-head">
              <div><span>Specialty & category</span><h2><Stethoscope /> প্রয়োজন অনুযায়ী বিশেষজ্ঞ খুঁজুন</h2></div>
              <Link to={contextDoctorsHref}>সব ডাক্তার <ArrowRight /></Link>
            </div>
            <div className="visitor-category-grid">
              {topics.slice(0, 8).map((topic) => (
                <Link className="visitor-category-card marketplace-card" to={topicHref(topic)} key={topic.id}>
                  <TopicImage path={topicImagePath(topic)} />
                  <span className="visitor-category-copy"><strong>{topic.name_bn}</strong><small>{topic.description_bn || topic.name_en || 'বিশেষজ্ঞ ডাক্তার দেখুন'}</small></span>
                  <ArrowRight className="visitor-category-arrow" />
                </Link>
              ))}
            </div>
          </div>
        </section>

        {districtId && dentalTopic && (
          <section className="visitor-section soft-section visitor-district-dentist-section">
            <div className="container">
              {specialtyLoading ? <div className="visitor-card-skeleton-row">{Array.from({ length: 3 }).map((_, index) => <div className="visitor-doctor-skeleton" key={index}><span /><div><i /><i /><i /></div></div>)}</div> : dentalDoctors.length ? (
                <SpecialtyDoctorRow
                  topic={dentalTopic}
                  doctors={dentalDoctors}
                  href={topicHref(dentalTopic)}
                  imagePath={topicImagePath(dentalTopic)}
                  eyebrow={selectedAreaCaption}
                  heading={`${districtPossessive} Dentist`}
                />
              ) : (
                <>
                  <div className="visitor-section-head"><div><span>{selectedAreaCaption}</span><h2><Stethoscope /> {districtPossessive} Dentist</h2></div><Link to={topicHref(dentalTopic)}>সব দেখুন <ArrowRight /></Link></div>
                  <div className="visitor-empty">এই এলাকায় এখনো কোনো অনুমোদিত dentist পাওয়া যায়নি।</div>
                </>
              )}
            </div>
          </section>
        )}

        <section className="visitor-section visitor-mbbs-section">
          <div className="container">
            <div className="visitor-section-head"><div><span>{selectedAreaCaption}</span><h2><BadgeCheck /> {districtPossessive} সকল MBBS Doctor</h2></div><Link to={`${contextDoctorsHref}${contextDoctorsHref.includes('?') ? '&' : '?'}degrees=MBBS`}>সব দেখুন <ArrowRight /></Link></div>
            {loading || resultsLoading ? <div className="visitor-card-skeleton-row">{Array.from({ length: 3 }).map((_, index) => <div className="visitor-doctor-skeleton" key={index}><span /><div><i /><i /><i /></div></div>)}</div> : mbbsDoctors.length ? <div className="doctor-horizontal-scroll">{mbbsDoctors.map((doctor) => <DoctorResultCard doctor={doctor} key={doctor.doctor_id} />)}</div> : <div className="visitor-empty">এই এলাকায় কোনো অনুমোদিত MBBS doctor পাওয়া যায়নি।</div>}
          </div>
        </section>

        <section className="visitor-section soft-section visitor-area-specialists-section">
          <div className="container">
            <div className="visitor-section-head"><div><span>{selectedAreaCaption}</span><h2><Stethoscope /> {districtPossessive} বিশেষজ্ঞ ডাক্তার</h2></div><Link to={contextDoctorsHref}>সব দেখুন <ArrowRight /></Link></div>
            {loading || resultsLoading ? <div className="visitor-card-skeleton-row">{Array.from({ length: 3 }).map((_, index) => <div className="visitor-doctor-skeleton" key={index}><span /><div><i /><i /><i /></div></div>)}</div> : allDoctors.length ? <div className="doctor-horizontal-scroll">{allDoctors.map((doctor) => <DoctorResultCard doctor={doctor} key={doctor.doctor_id} />)}</div> : <div className="visitor-empty">এই এলাকায় এখনো কোনো অনুমোদিত ডাক্তার পাওয়া যায়নি।</div>}
          </div>
        </section>

        {currentLocation && (
          <section className="visitor-section visitor-nearby-section" id="near-me">
            <div className="container">
              <div className="visitor-section-head"><div><span>আপনার বর্তমান GPS থেকে অনুমোদিত চেম্বারের দূরত্ব অনুযায়ী</span><h2><LocateFixed /> Near Me</h2></div></div>
              {resultsLoading ? <div className="visitor-card-skeleton-row">{Array.from({ length: 3 }).map((_, index) => <div className="visitor-doctor-skeleton" key={index}><span /><div><i /><i /><i /></div></div>)}</div> : nearbyDoctors.length ? <div className="doctor-horizontal-scroll">{nearbyDoctors.map((doctor) => <DoctorResultCard doctor={doctor} key={doctor.doctor_id} />)}</div> : <div className="visitor-empty">১০০ কিমির মধ্যে coordinate-সহ কোনো অনুমোদিত doctor chamber পাওয়া যায়নি।</div>}
            </div>
          </section>
        )}

        <section className="visitor-section specialty-marketplace">
          <div className="container">
            <div className="visitor-section-head marketplace-discovery-head"><div><span>{selectedAreaCaption}</span><h2><HeartPulse /> {districtPossessive} স্পেশালিটি অনুযায়ী ডাক্তার</h2></div><Link to={contextDoctorsHref}>সব স্পেশালিটি <ArrowRight /></Link></div>
            {specialtyLoading ? (
              <div className="specialty-marketplace-skeleton">{Array.from({ length: 2 }).map((_, sectionIndex) => <div key={sectionIndex}><i /><div className="visitor-card-skeleton-row">{Array.from({ length: 3 }).map((__, index) => <div className="visitor-doctor-skeleton" key={index}><span /><div><i /><i /><i /></div></div>)}</div></div>)}</div>
            ) : (
              <div className="specialty-marketplace-list">
                {topics.slice(0, 6).map((topic) => {
                  if (districtId && dentalTopic?.id === topic.id) return null;
                  const doctors = specialtyDoctors[topic.id] ?? [];
                  if (!doctors.length) return null;
                  return <SpecialtyDoctorRow key={topic.id} topic={topic} doctors={doctors} href={topicHref(topic)} imagePath={topicImagePath(topic)} />;
                })}
              </div>
            )}
          </div>
        </section>

        <section className="visitor-section visitor-provider-section" id="hospitals">
          <div className="container">
            <div className="visitor-section-head"><div><span>{selectedAreaCaption}</span><h2><Building2 /> {districtId ? `${selectedDistrictName}-এর হাসপাতাল ও চেম্বার` : 'হাসপাতাল ও চেম্বার'}</h2></div><Link to="/providers">সব দেখুন <ArrowRight /></Link></div>
            {providers.length ? <div className="provider-grid">{providers.map((provider) => <ProviderCard provider={provider} key={provider.id} />)}</div> : !loading && <div className="visitor-empty">এই এলাকায় কোনো অনুমোদিত হাসপাতাল/চেম্বার পাওয়া যায়নি।</div>}
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
