import { FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import {
  Ambulance,
  ArrowRight,
  BadgeCheck,
  Bookmark,
  Building2,
  ChevronDown,
  Crown,
  HeartPulse,
  LocateFixed,
  LoaderCircle,
  MapPin,
  Search,
  Sparkles,
  Stethoscope,
  Users,
  X,
} from 'lucide-react';
import DoctorResultCard from '../components/DoctorResultCard';
import PublicHeader from '../components/PublicHeader';
import ProviderCard from '../components/ProviderCard';
import VisitorBottomNav from '../components/VisitorBottomNav';
import { useAuth } from '../contexts/AuthContext';
import { SITE_NAME } from '../lib/brand';
import { getImageUrl } from '../lib/storage';
import { isSupabaseConfigured } from '../lib/supabase';
import { getPublicProfileStatsBatch } from '../services/engagement';
import {
  findNearestDoctors,
  getDistricts,
  getHomepageConfiguration,
  getMarketplaceDoctors,
  getPublicProviders,
  getSpecialties,
  getUpazilas,
  resolveLocationContext,
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
  PublicProfileStats,
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

type StatsMap = Record<string, PublicProfileStats>;

function TopicImage({ path }: { path: string | null }) {
  const imageUrl = getImageUrl(path, 'public-images');
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [imageUrl]);
  return (
    <span className="specialty-topic-media" aria-hidden="true">
      {imageUrl && !failed ? <img src={imageUrl} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} /> : <Stethoscope />}
    </span>
  );
}

function SectionHead({ eyebrow, title, href, icon }: { eyebrow?: string; title: string; href?: string; icon?: ReactNode }) {
  return (
    <header className="marketplace-section-head">
      <div>{eyebrow && <span>{eyebrow}</span>}<h2>{icon}{title}</h2></div>
      {href && <Link to={href}>সব দেখুন <ArrowRight /></Link>}
    </header>
  );
}

function DoctorRail({ doctors, stats, onStatsChange }: { doctors: DoctorSearchRow[]; stats: StatsMap; onStatsChange: (doctorId: string, next: PublicProfileStats) => void }) {
  return <div className="marketplace-horizontal-rail doctor-horizontal-scroll">{doctors.map((doctor) => <DoctorResultCard doctor={doctor} stats={stats[doctor.doctor_id]} onStatsChange={onStatsChange} key={doctor.doctor_id} />)}</div>;
}

function DoctorRailSkeleton() {
  return <div className="marketplace-horizontal-rail visitor-card-skeleton-row">{Array.from({ length: 3 }).map((_, index) => <div className="visitor-doctor-skeleton" key={index}><span /><div><i /><i /><i /></div></div>)}</div>;
}

function SpecialtyDoctorRow({
  topic,
  doctors,
  href,
  imagePath,
  stats,
  onStatsChange,
}: {
  topic: DiscoveryTopic;
  doctors: DoctorSearchRow[];
  href: string;
  imagePath: string | null;
  stats: StatsMap;
  onStatsChange: (doctorId: string, next: PublicProfileStats) => void;
}) {
  return (
    <section className="specialty-doctor-section compact-specialty-row">
      <div className="specialty-doctor-head">
        <div className="specialty-doctor-title"><TopicImage path={imagePath} /><div><small>স্পেশালিটি</small><h3>{topic.name_bn}</h3></div></div>
        <Link className="marketplace-see-all" to={href}>সব দেখুন <ArrowRight /></Link>
      </div>
      <DoctorRail doctors={doctors} stats={stats} onStatsChange={onStatsChange} />
    </section>
  );
}

export default function VisitorHomePage() {
  const navigate = useNavigate();
  const { user, account, loading: authLoading } = useAuth();
  const [homepage, setHomepage] = useState(emptyHomepage);
  const [districts, setDistricts] = useState<District[]>([]);
  const [upazilas, setUpazilas] = useState<Upazila[]>([]);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [districtId, setDistrictId] = useState('');
  const [upazilaId, setUpazilaId] = useState('');
  const [query, setQuery] = useState('');
  const [nearbyDoctors, setNearbyDoctors] = useState<DoctorSearchRow[]>([]);
  const [areaDoctors, setAreaDoctors] = useState<DoctorSearchRow[]>([]);
  const [mbbsDoctors, setMbbsDoctors] = useState<DoctorSearchRow[]>([]);
  const [specialistDoctors, setSpecialistDoctors] = useState<DoctorSearchRow[]>([]);
  const [premiumDoctors, setPremiumDoctors] = useState<DoctorSearchRow[]>([]);
  const [newDoctors, setNewDoctors] = useState<DoctorSearchRow[]>([]);
  const [specialtyDoctors, setSpecialtyDoctors] = useState<Record<number, DoctorSearchRow[]>>({});
  const [providers, setProviders] = useState<ProviderDirectoryRow[]>([]);
  const [ambulances, setAmbulances] = useState<AmbulanceSearchRow[]>([]);
  const [doctorStats, setDoctorStats] = useState<StatsMap>({});
  const [providerStats, setProviderStats] = useState<StatsMap>({});
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [secondaryReady, setSecondaryReady] = useState(false);
  const [secondaryLoading, setSecondaryLoading] = useState(false);
  const [locationState, setLocationState] = useState<'idle' | 'asking' | 'granted' | 'denied'>('idle');
  const [locationHydrated, setLocationHydrated] = useState(false);
  const [locationPromptVisible, setLocationPromptVisible] = useState(false);
  const [pickerOpen, setPickerOpen] = useState<'district' | 'upazila' | null>(null);
  const [currentLocation, setCurrentLocation] = useState<{ latitude: number; longitude: number; accuracy: number | null } | null>(null);
  const [detectedLocation, setDetectedLocation] = useState<LocationResolution | null>(null);
  const [areaSelectionSource, setAreaSelectionSource] = useState<AreaSelectionSource>('none');
  const [locationResolutionState, setLocationResolutionState] = useState<'idle' | 'resolving' | 'resolved' | 'failed'>('idle');
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const secondaryGateRef = useRef<HTMLDivElement>(null);

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
    } catch { /* local storage is optional */ }
    finally {
      setLocationHydrated(true);
      setLocationPromptVisible(!hasSavedLocation);
    }
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) { setLoading(false); return; }
    let active = true;
    Promise.all([getHomepageConfiguration(), getDistricts(), getSpecialties()])
      .then(([home, districtRows, specialtyRows]) => {
        if (!active) return;
        setHomepage(home); setDistricts(districtRows); setSpecialties(specialtyRows);
      })
      .catch((loadError) => active && setError(messageFrom(loadError)))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || loading) return;
    let active = true;
    getHomepageConfiguration(districtId ? Number(districtId) : null).then((home) => active && setHomepage(home)).catch(() => undefined);
    return () => { active = false; };
  }, [districtId, loading]);

  useEffect(() => {
    if (!isSupabaseConfigured || !locationHydrated || !currentLocation || detectedLocation || areaSelectionSource === 'manual' || locationResolutionState !== 'idle') return;
    let active = true;
    setLocationResolutionState('resolving');
    resolveLocationContext(currentLocation.latitude, currentLocation.longitude)
      .then((resolved) => {
        if (!active) return;
        if (!resolved) { setLocationResolutionState('failed'); setLocationMessage('GPS পাওয়া গেছে, জেলা manually নির্বাচন করুন।'); return; }
        setDetectedLocation(resolved);
        setLocationResolutionState('resolved');
        setLocationMessage(`${resolved.district_name_bn} জেলা detect হয়েছে`);
        setDistrictId(String(resolved.district_id));
        setUpazilaId('');
        setAreaSelectionSource('gps');
        persistAreaSelection(String(resolved.district_id), '', 'gps');
        persistGpsLocation(currentLocation, resolved);
      })
      .catch(() => { if (active) { setLocationResolutionState('failed'); setLocationMessage('জেলা resolve করা যায়নি। manually নির্বাচন করুন।'); } });
    return () => { active = false; };
  }, [locationHydrated, currentLocation, detectedLocation, areaSelectionSource, locationResolutionState]);

  useEffect(() => {
    if (!isSupabaseConfigured || !districtId) { setUpazilas([]); setUpazilaId(''); return; }
    getUpazilas(Number(districtId)).then(setUpazilas).catch(() => setUpazilas([]));
  }, [districtId]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const selectedDistrict = districtId ? Number(districtId) : null;
    const selectedUpazila = upazilaId ? Number(upazilaId) : null;
    let active = true;
    setResultsLoading(true);
    Promise.all([
      getMarketplaceDoctors({ districtId: selectedDistrict, upazilaId: selectedUpazila, mode: 'ranked', limit: 8 }),
      getMarketplaceDoctors({ districtId: selectedDistrict, upazilaId: selectedUpazila, mode: 'general', limit: 8 }),
      getMarketplaceDoctors({ districtId: selectedDistrict, upazilaId: selectedUpazila, mode: 'specialist', limit: 8 }),
      currentLocation ? findNearestDoctors({ latitude: currentLocation.latitude, longitude: currentLocation.longitude, radiusKm: 100, limit: 8 }) : Promise.resolve([] as DoctorSearchRow[]),
      getPublicProviders({ districtId: selectedDistrict, upazilaId: selectedUpazila, limit: 8 }),
      searchAmbulances({
        districtId: selectedDistrict,
        upazilaId: selectedUpazila,
        latitude: areaSelectionSource === 'gps' ? currentLocation?.latitude ?? null : null,
        longitude: areaSelectionSource === 'gps' ? currentLocation?.longitude ?? null : null,
        radiusKm: areaSelectionSource === 'gps' && currentLocation ? 100 : null,
      }),
    ]).then(([areaRows, mbbsRows, specialistRows, nearestRows, providerRows, ambulanceRows]) => {
      if (!active) return;
      setAreaDoctors(areaRows);
      setMbbsDoctors(mbbsRows);
      setSpecialistDoctors(specialistRows);
      setNearbyDoctors(nearestRows);
      setProviders(providerRows);
      setAmbulances(ambulanceRows.slice(0, 3));
      setError(null);
    }).catch((loadError) => active && setError(messageFrom(loadError))).finally(() => active && setResultsLoading(false));
    return () => { active = false; };
  }, [districtId, upazilaId, currentLocation, areaSelectionSource]);

  useEffect(() => {
    const node = secondaryGateRef.current;
    if (!node || secondaryReady) return;
    if (!('IntersectionObserver' in window)) { setSecondaryReady(true); return; }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { setSecondaryReady(true); observer.disconnect(); }
    }, { rootMargin: '700px 0px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [secondaryReady]);

  const topics = homepage.topics.length ? homepage.topics : fallbackTopics;
  const specialtyById = useMemo(() => new Map(specialties.map((item) => [item.id, item])), [specialties]);
  const topicImagePath = (topic: DiscoveryTopic) => topic.specialty_ids.map((id) => specialtyById.get(id)?.icon_url || null).find(Boolean) || null;

  useEffect(() => {
    if (!isSupabaseConfigured || !secondaryReady || loading) return;
    const selectedDistrict = districtId ? Number(districtId) : null;
    const selectedUpazila = upazilaId ? Number(upazilaId) : null;
    const featuredTopics = topics.slice(0, 5);
    let active = true;
    setSecondaryLoading(true);
    Promise.all([
      getMarketplaceDoctors({ districtId: selectedDistrict, upazilaId: selectedUpazila, mode: 'premium', limit: 8 }),
      getMarketplaceDoctors({ districtId: selectedDistrict, upazilaId: selectedUpazila, mode: 'new', limit: 8 }),
      Promise.all(featuredTopics.map(async (topic) => [topic.id, await searchDoctors({
        query: topic.specialty_ids.length ? undefined : topic.name_bn,
        specialtyIds: topic.specialty_ids,
        districtId: selectedDistrict,
        upazilaId: selectedUpazila,
        limit: 7,
        sort: 'name',
      })] as const)),
    ]).then(([premiumRows, newRows, specialtyEntries]) => {
      if (!active) return;
      setPremiumDoctors(premiumRows);
      setNewDoctors(newRows);
      const next: Record<number, DoctorSearchRow[]> = {};
      specialtyEntries.forEach(([topicId, rows]) => { next[topicId] = rows; });
      setSpecialtyDoctors(next);
    }).catch(() => {
      if (!active) return;
      setPremiumDoctors([]); setNewDoctors([]); setSpecialtyDoctors({});
    }).finally(() => active && setSecondaryLoading(false));
    return () => { active = false; };
  }, [secondaryReady, loading, districtId, upazilaId, topics]);

  const visibleDoctorIds = useMemo(() => Array.from(new Set([
    ...areaDoctors, ...mbbsDoctors, ...specialistDoctors, ...nearbyDoctors, ...premiumDoctors, ...newDoctors,
    ...Object.values(specialtyDoctors).flat(),
  ].map((doctor) => doctor.doctor_id))), [areaDoctors, mbbsDoctors, specialistDoctors, nearbyDoctors, premiumDoctors, newDoctors, specialtyDoctors]);
  const visibleProviderIds = useMemo(() => providers.map((provider) => provider.id), [providers]);

  useEffect(() => {
    if (!isSupabaseConfigured || (!visibleDoctorIds.length && !visibleProviderIds.length)) return;
    let active = true;
    getPublicProfileStatsBatch({ doctorIds: visibleDoctorIds, providerIds: visibleProviderIds }).then((rows) => {
      if (!active) return;
      const nextDoctors: StatsMap = {};
      const nextProviders: StatsMap = {};
      rows.forEach((row) => {
        const stats: PublicProfileStats = {
          follower_count: Number(row.follower_count ?? 0),
          review_count: Number(row.review_count ?? 0),
          average_rating: row.average_rating == null ? null : Number(row.average_rating),
          is_following: Boolean(row.is_following),
          ranking_tier: row.ranking_tier,
          is_premium: Boolean(row.is_premium),
        };
        if (row.target_type === 'doctor') nextDoctors[row.target_id] = stats;
        else nextProviders[row.target_id] = stats;
      });
      setDoctorStats((current) => ({ ...current, ...nextDoctors }));
      setProviderStats((current) => ({ ...current, ...nextProviders }));
    }).catch(() => undefined);
    return () => { active = false; };
  }, [visibleDoctorIds, visibleProviderIds, user?.id]);

  if (!authLoading && user && account?.role !== 'patient') return <Navigate to="/dashboard" replace />;

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
    try { localStorage.setItem(AREA_STORAGE_KEY, JSON.stringify({ districtId: nextDistrictId, upazilaId: nextUpazilaId, source, updatedAt: Date.now() })); } catch { /* optional */ }
  }

  function selectDistrict(nextDistrictId: string, source: AreaSelectionSource = 'manual') {
    setDistrictId(nextDistrictId); setUpazilaId(''); setAreaSelectionSource(source);
    if (source === 'manual') setLocationMessage(null);
    persistAreaSelection(nextDistrictId, '', source);
  }

  function selectUpazila(nextUpazilaId: string) {
    setUpazilaId(nextUpazilaId); setAreaSelectionSource('manual'); setLocationMessage(null);
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
    } catch { /* optional */ }
  }

  function requestLocation() {
    if (!navigator.geolocation) {
      setCurrentLocation(null); setLocationState('denied'); setLocationResolutionState('failed');
      setLocationMessage('এই browser-এ GPS support নেই। জেলা manually নির্বাচন করুন।'); setLocationPromptVisible(false); return;
    }
    setLocationState('asking'); setLocationResolutionState('resolving'); setLocationMessage(null);
    navigator.geolocation.getCurrentPosition(async (position) => {
      const location = { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null };
      setCurrentLocation(location); setLocationState('granted'); setLocationPromptVisible(false);
      let resolved: LocationResolution | null = null;
      if (isSupabaseConfigured) {
        try { resolved = await resolveLocationContext(location.latitude, location.longitude); } catch { resolved = null; }
      }
      if (resolved) {
        setDetectedLocation(resolved); setLocationResolutionState('resolved'); setLocationMessage(`${resolved.district_name_bn} জেলা detect হয়েছে`);
        selectDistrict(String(resolved.district_id), 'gps'); persistGpsLocation(location, resolved);
      } else {
        setLocationResolutionState('failed'); setLocationMessage('GPS পাওয়া গেছে—জেলা manually নির্বাচন করুন।'); persistGpsLocation(location, null);
      }
      if (user) void saveMyCurrentLocation({ latitude: location.latitude, longitude: location.longitude, accuracyMeters: location.accuracy, districtId: resolved?.district_id ?? (districtId ? Number(districtId) : null), upazilaId: resolved?.upazila_id ?? null }).catch(() => undefined);
    }, () => {
      setCurrentLocation(null); setLocationState('denied'); setLocationResolutionState('failed');
      setLocationMessage('লোকেশন অনুমতি পাওয়া যায়নি। জেলা/উপজেলা নির্বাচন করুন।'); setLocationPromptVisible(false);
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
  }

  const viewAllParams = new URLSearchParams();
  if (districtId) viewAllParams.set('district', districtId);
  if (upazilaId) viewAllParams.set('upazila', upazilaId);
  const contextDoctorsHref = `/doctors${viewAllParams.size ? `?${viewAllParams}` : ''}`;
  const selectedDistrictName = districts.find((district) => String(district.id) === districtId)?.name_bn || detectedLocation?.district_name_bn || 'জেলা';
  const selectedUpazilaName = upazilas.find((upazila) => String(upazila.id) === upazilaId)?.name_bn || 'উপজেলা';
  const areaTitle = upazilaId ? selectedUpazilaName : districtId ? selectedDistrictName : 'সারা বাংলাদেশ';
  const dentalTopic = topics.find((topic) => topic.slug === 'dental' || topic.name_en?.toLowerCase().includes('dental') || topic.name_bn.includes('দাঁত'));
  const dentalDoctors = dentalTopic ? specialtyDoctors[dentalTopic.id] ?? [] : [];
  const savedHref = user ? '/saved' : '/auth';
  const savedState = user ? undefined : { from: '/saved' };
  const updateDoctorStats = (doctorId: string, next: PublicProfileStats) => setDoctorStats((current) => ({ ...current, [doctorId]: next }));
  const updateProviderStats = (providerId: string, next: PublicProfileStats) => setProviderStats((current) => ({ ...current, [providerId]: next }));

  return (
    <div className="app-shell visitor-home visitor-marketplace-home">
      <PublicHeader mobileBottomNav />
      <main>
        <section className="marketplace-search-hero">
          <div className="container marketplace-search-wrap">
            <div className="marketplace-search-intro"><span>docbd.info</span><h1>ডাক্তার খুঁজুন</h1><p>{districtId ? `${areaTitle} এলাকার ডাক্তার ও হাসপাতাল` : 'লোকেশন, নাম বা স্পেশালিটি দিয়ে দ্রুত খুঁজুন'}</p></div>
            <form className="marketplace-search-box" onSubmit={submitSearch}>
              <label className="marketplace-search-input"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ডাক্তার, রোগ বা স্পেশালিটি" aria-label="ডাক্তার খুঁজুন" /></label>
              <button type="submit" className="marketplace-search-button" aria-label="Search"><Search /></button>
            </form>
            <div className="marketplace-location-row">
              <button type="button" onClick={() => setPickerOpen('district')}><MapPin /><span>{selectedDistrictName}</span><ChevronDown /></button>
              <button type="button" onClick={() => districtId && setPickerOpen('upazila')} disabled={!districtId}><span>{selectedUpazilaName}</span><ChevronDown /></button>
              <button type="button" className={`near-me-chip ${locationState === 'granted' ? 'active' : ''}`} onClick={requestLocation}>{locationState === 'asking' ? <LoaderCircle className="spin" /> : <LocateFixed />}<span>{locationState === 'granted' ? 'Near Me On' : 'Near Me'}</span></button>
            </div>
            <div className="marketplace-quick-row">
              <Link to={contextDoctorsHref}><Stethoscope /> সব ডাক্তার</Link>
              <a href="#categories"><HeartPulse /> ক্যাটাগরি</a>
              <Link to={savedHref} state={savedState}><Bookmark /> সংরক্ষিত</Link>
            </div>
            {locationHydrated && locationPromptVisible && locationState === 'idle' && <button className="compact-location-prompt" type="button" onClick={requestLocation}><LocateFixed /><span><strong>কাছের ডাক্তার দেখুন</strong><small>Current Location ব্যবহার করুন</small></span><ArrowRight /></button>}
            {locationMessage && <div className={`compact-location-status ${locationResolutionState}`}>{locationResolutionState === 'resolving' ? <LoaderCircle className="spin" /> : locationResolutionState === 'resolved' ? <BadgeCheck /> : <MapPin />}<span>{locationMessage}</span></div>}
            {!isSupabaseConfigured && <div className="visitor-preview-note">UI preview চলছে—লাইভ ডেটার জন্য Supabase environment variables প্রয়োজন।</div>}
          </div>
        </section>

        {pickerOpen && (
          <div className="visitor-picker-backdrop" role="presentation" onClick={() => setPickerOpen(null)}>
            <section className="visitor-picker-sheet" role="dialog" aria-modal="true" aria-label={pickerOpen === 'district' ? 'জেলা নির্বাচন' : 'উপজেলা নির্বাচন'} onClick={(event) => event.stopPropagation()}>
              <div className="visitor-picker-handle" />
              <div className="visitor-picker-head"><div><span>এলাকা বেছে নিন</span><h2>{pickerOpen === 'district' ? 'জেলা নির্বাচন' : 'উপজেলা নির্বাচন'}</h2></div><button type="button" onClick={() => setPickerOpen(null)} aria-label="বন্ধ করুন"><X /></button></div>
              <div className="visitor-picker-list">
                {(pickerOpen === 'district' ? districts : upazilas).map((item) => {
                  const active = pickerOpen === 'district' ? String(item.id) === districtId : String(item.id) === upazilaId;
                  return <button className={active ? 'active' : ''} type="button" key={item.id} onClick={() => { if (pickerOpen === 'district') selectDistrict(String(item.id)); else selectUpazila(String(item.id)); setPickerOpen(null); }}><span>{item.name_bn}</span>{active && <BadgeCheck />}</button>;
                })}
              </div>
            </section>
          </div>
        )}

        {error && <div className="container visitor-inline-error"><div className="error-box" role="alert">{error}</div></div>}

        <section className="marketplace-section marketplace-category-section" id="categories">
          <div className="container">
            <SectionHead eyebrow="ক্যাটাগরি" title="বিশেষজ্ঞতা বেছে নিন" href={contextDoctorsHref} icon={<Stethoscope />} />
            <div className="marketplace-category-rail">
              {topics.slice(0, 10).map((topic) => <Link className="marketplace-category-card" to={topicHref(topic)} key={topic.id}><TopicImage path={topicImagePath(topic)} /><strong>{topic.name_bn}</strong></Link>)}
            </div>
          </div>
        </section>

        <div ref={secondaryGateRef} className="marketplace-lazy-gate" aria-hidden="true" />

        {(secondaryLoading || premiumDoctors.length > 0) && (
          <section className="marketplace-section premium-doctors-section">
            <div className="container">
              <SectionHead eyebrow="Premium" title="Premium Doctors" href={contextDoctorsHref} icon={<Crown />} />
              {secondaryLoading ? <DoctorRailSkeleton /> : <DoctorRail doctors={premiumDoctors} stats={doctorStats} onStatsChange={updateDoctorStats} />}
            </div>
          </section>
        )}

        {currentLocation && (
          <section className="marketplace-section marketplace-soft-section" id="near-me">
            <div className="container">
              <SectionHead eyebrow="GPS distance" title="Near Me" href={contextDoctorsHref} icon={<LocateFixed />} />
              {resultsLoading ? <DoctorRailSkeleton /> : nearbyDoctors.length ? <DoctorRail doctors={nearbyDoctors} stats={doctorStats} onStatsChange={updateDoctorStats} /> : <div className="marketplace-empty">কাছাকাছি coordinate-সহ কোনো doctor chamber পাওয়া যায়নি।</div>}
            </div>
          </section>
        )}

        <section className="marketplace-section">
          <div className="container">
            <SectionHead eyebrow={areaTitle} title="আপনার এলাকার ডাক্তার" href={contextDoctorsHref} icon={<MapPin />} />
            {loading || resultsLoading ? <DoctorRailSkeleton /> : areaDoctors.length ? <DoctorRail doctors={areaDoctors} stats={doctorStats} onStatsChange={updateDoctorStats} /> : <div className="marketplace-empty">এই এলাকায় ডাক্তার পাওয়া যায়নি।</div>}
          </div>
        </section>

        <section className="marketplace-section marketplace-soft-section">
          <div className="container">
            <SectionHead eyebrow="Degree-based" title="General Doctors" href={`${contextDoctorsHref}${contextDoctorsHref.includes('?') ? '&' : '?'}classification=general`} icon={<BadgeCheck />} />
            {loading || resultsLoading ? <DoctorRailSkeleton /> : mbbsDoctors.length ? <DoctorRail doctors={mbbsDoctors} stats={doctorStats} onStatsChange={updateDoctorStats} /> : <div className="marketplace-empty">এই এলাকায় General Doctor পাওয়া যায়নি।</div>}
          </div>
        </section>

        <section className="marketplace-section">
          <div className="container">
            <SectionHead eyebrow={areaTitle} title="Specialist Doctors" href={`${contextDoctorsHref}${contextDoctorsHref.includes('?') ? '&' : '?'}classification=specialist`} icon={<Stethoscope />} />
            {loading || resultsLoading ? <DoctorRailSkeleton /> : specialistDoctors.length ? <DoctorRail doctors={specialistDoctors} stats={doctorStats} onStatsChange={updateDoctorStats} /> : <div className="marketplace-empty">বিশেষজ্ঞ ডাক্তার পাওয়া যায়নি।</div>}
          </div>
        </section>

        {dentalTopic && (secondaryLoading || dentalDoctors.length > 0) && (
          <section className="marketplace-section marketplace-soft-section">
            <div className="container">
              <SectionHead eyebrow={areaTitle} title="Dental Doctors" href={topicHref(dentalTopic)} icon={<Stethoscope />} />
              {secondaryLoading ? <DoctorRailSkeleton /> : <DoctorRail doctors={dentalDoctors} stats={doctorStats} onStatsChange={updateDoctorStats} />}
            </div>
          </section>
        )}

        {(secondaryLoading || newDoctors.length > 0) && (
          <section className="marketplace-section">
            <div className="container">
              <SectionHead eyebrow="Recently joined" title="নতুন ডাক্তার" href={`${contextDoctorsHref}${contextDoctorsHref.includes('?') ? '&' : '?'}sort=newest`} icon={<Sparkles />} />
              {secondaryLoading ? <DoctorRailSkeleton /> : <DoctorRail doctors={newDoctors} stats={doctorStats} onStatsChange={updateDoctorStats} />}
            </div>
          </section>
        )}

        {secondaryReady && Object.keys(specialtyDoctors).length > 0 && (
          <section className="marketplace-section marketplace-specialty-rows marketplace-soft-section">
            <div className="container">
              <SectionHead eyebrow="Popular" title="স্পেশালিটি অনুযায়ী" href={contextDoctorsHref} icon={<HeartPulse />} />
              <div className="compact-specialty-list">
                {topics.slice(0, 4).map((topic) => {
                  if (topic.id === dentalTopic?.id) return null;
                  const rows = specialtyDoctors[topic.id] ?? [];
                  return rows.length ? <SpecialtyDoctorRow key={topic.id} topic={topic} doctors={rows} href={topicHref(topic)} imagePath={topicImagePath(topic)} stats={doctorStats} onStatsChange={updateDoctorStats} /> : null;
                })}
              </div>
            </div>
          </section>
        )}

        <section className="marketplace-section marketplace-hospital-section" id="hospitals">
          <div className="container">
            <SectionHead eyebrow={areaTitle} title="Hospitals & Chambers" href="/providers" icon={<Building2 />} />
            {resultsLoading ? <div className="marketplace-horizontal-rail provider-marketplace-rail"><div className="visitor-doctor-skeleton" /><div className="visitor-doctor-skeleton" /></div> : providers.length ? <div className="marketplace-horizontal-rail provider-marketplace-rail">{providers.map((provider) => <ProviderCard provider={provider} stats={providerStats[provider.id]} onStatsChange={updateProviderStats} key={provider.id} />)}</div> : <div className="marketplace-empty">এই এলাকায় হাসপাতাল/চেম্বার পাওয়া যায়নি।</div>}
          </div>
        </section>

        <section className="marketplace-emergency-strip">
          <div className="container marketplace-emergency-rail">
            <Link to="/auth" className="marketplace-emergency-card" id="blood"><Users /><span><strong>Blood Bank</strong><small>জরুরি রক্ত সহায়তা</small></span><ArrowRight /></Link>
            <article className="marketplace-emergency-card" id="ambulance"><Ambulance /><span><strong>Ambulance</strong><small>{ambulances[0]?.operator_name || 'জরুরি পরিবহন'}</small></span>{ambulances[0]?.phone ? <a href={`tel:${ambulances[0].phone}`}>কল</a> : <ArrowRight />}</article>
          </div>
        </section>
      </main>
      <footer className="visitor-footer compact-visitor-footer"><div className="container"><strong>{SITE_NAME}</strong><span>জরুরি সেবা: <a href="tel:999">৯৯৯</a></span></div></footer>
      <VisitorBottomNav />
    </div>
  );
}
