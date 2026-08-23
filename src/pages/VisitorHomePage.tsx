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
import { useVisitorLanguage, type VisitorLanguage } from '../contexts/VisitorLanguageContext';
import { SITE_NAME } from '../lib/brand';
import { getImageUrl } from '../lib/storage';
import { isSupabaseConfigured } from '../lib/supabase';
import { getPublicProfileStatsBatch } from '../services/engagement';
import {
  findNearestDoctors,
  getDistricts,
  getHomepageConfiguration,
  getHomepagePrimaryDoctorSections,
  getHomepageSecondaryDoctorSections,
  getPublicProviders,
  getSpecialties,
  getUpazilas,
  resolveLocationContext,
  saveMyCurrentLocation,
  searchAmbulances,
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
  const imageUrl = getImageUrl(path, 'public-images', 'thumbnail');
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [imageUrl]);
  return (
    <span className="specialty-topic-media" aria-hidden="true">
      {imageUrl && !failed ? <img src={imageUrl} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} /> : <Stethoscope />}
    </span>
  );
}

function SectionHead({ eyebrow, title, href, icon, language }: { eyebrow?: string; title: string; href?: string; icon?: ReactNode; language: VisitorLanguage }) {
  return (
    <header className="marketplace-section-head">
      <div>{eyebrow && <span>{eyebrow}</span>}<h2>{icon}{title}</h2></div>
      {href && <Link to={href}>{language === 'bn' ? 'সব দেখুন' : 'View all'} <ArrowRight /></Link>}
    </header>
  );
}

function DoctorRail({ doctors, stats, onStatsChange, viewerLocation }: { doctors: DoctorSearchRow[]; stats: StatsMap; onStatsChange: (doctorId: string, next: PublicProfileStats) => void; viewerLocation?: { latitude: number; longitude: number } | null }) {
  return <div className="marketplace-horizontal-rail doctor-horizontal-scroll">{doctors.map((doctor) => <DoctorResultCard doctor={doctor} stats={stats[doctor.doctor_id]} onStatsChange={onStatsChange} viewerLocation={viewerLocation} key={doctor.doctor_id} />)}</div>;
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
  language,
}: {
  topic: DiscoveryTopic;
  doctors: DoctorSearchRow[];
  href: string;
  imagePath: string | null;
  stats: StatsMap;
  onStatsChange: (doctorId: string, next: PublicProfileStats) => void;
  language: VisitorLanguage;
}) {
  return (
    <section className="specialty-doctor-section compact-specialty-row">
      <div className="specialty-doctor-head">
        <div className="specialty-doctor-title"><TopicImage path={imagePath} /><div><small>{language === 'bn' ? 'বিশেষজ্ঞতা' : 'Specialty'}</small><h3>{language === 'bn' ? topic.name_bn : topic.name_en || topic.name_bn}</h3></div></div>
        <Link className="marketplace-see-all" to={href}>{language === 'bn' ? 'সব দেখুন' : 'View all'} <ArrowRight /></Link>
      </div>
      <DoctorRail doctors={doctors} stats={stats} onStatsChange={onStatsChange} />
    </section>
  );
}

export default function VisitorHomePage() {
  const navigate = useNavigate();
  const { user, account, loading: authLoading } = useAuth();
  const { language } = useVisitorLanguage();
  const tr = (bn: string, en: string) => language === 'bn' ? bn : en;
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
    if (!pickerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPickerOpen(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [pickerOpen]);

  useEffect(() => {
    let hasSavedLocation = false;
    let savedV2Resolution: LocationResolution | null = null;
    try {
      const raw = localStorage.getItem(LOCATION_STORAGE_KEY) || localStorage.getItem(LEGACY_LOCATION_STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as {
          latitude?: number; longitude?: number; accuracy?: number | null; capturedAt?: number; contextVersion?: number;
          detectedDistrictId?: number; detectedDistrictNameBn?: string; detectedDistrictNameEn?: string; detectedDistrictSlug?: string;
          detectedUpazilaId?: number | null; detectedUpazilaNameBn?: string | null; detectedUpazilaNameEn?: string | null; detectedUpazilaSlug?: string | null;
          resolutionSource?: LocationResolution['resolution_source']; resolutionDistanceKm?: number;
        };
        if (typeof saved.latitude === 'number' && typeof saved.longitude === 'number' && (!saved.capturedAt || Date.now() - saved.capturedAt < 30 * 60 * 1000)) {
          hasSavedLocation = true;
          setCurrentLocation({ latitude: saved.latitude, longitude: saved.longitude, accuracy: saved.accuracy ?? null });
          setLocationState('granted');
          // STEP 60 changes Dhaka GPS semantics. Old cached GPS resolutions are
          // deliberately re-resolved once instead of trusting stale district-only data.
          if (saved.contextVersion === 2 && saved.detectedDistrictId && saved.detectedDistrictNameBn && saved.detectedDistrictNameEn && saved.detectedDistrictSlug) {
            savedV2Resolution = {
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
            };
            setDetectedLocation(savedV2Resolution);
            setLocationResolutionState('resolved');
          }
        }
      }
      const areaRaw = localStorage.getItem(AREA_STORAGE_KEY);
      if (areaRaw) {
        const area = JSON.parse(areaRaw) as { districtId?: string; upazilaId?: string; source?: AreaSelectionSource };
        if (area.source === 'manual') {
          if (area.districtId) setDistrictId(area.districtId);
          if (area.upazilaId) setUpazilaId(area.upazilaId);
          setAreaSelectionSource('manual');
        } else if (area.source === 'gps' && savedV2Resolution) {
          setDistrictId(String(savedV2Resolution.district_id));
          setUpazilaId(savedV2Resolution.upazila_id ? String(savedV2Resolution.upazila_id) : '');
          setAreaSelectionSource('gps');
        }
      } else if (savedV2Resolution) {
        setDistrictId(String(savedV2Resolution.district_id));
        setUpazilaId(savedV2Resolution.upazila_id ? String(savedV2Resolution.upazila_id) : '');
        setAreaSelectionSource('gps');
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
        if (!resolved) { setLocationResolutionState('failed'); setLocationMessage(tr('জিপিএস পাওয়া গেছে, জেলা নিজে নির্বাচন করুন।', 'GPS found; please select a district manually.')); return; }
        setDetectedLocation(resolved);
        setLocationResolutionState('resolved');
        setLocationMessage(formatResolvedLocationMessage(resolved));
        applyResolvedLocation(resolved);
        persistGpsLocation(currentLocation, resolved);
      })
      .catch(() => { if (active) { setLocationResolutionState('failed'); setLocationMessage(tr('অবস্থান শনাক্ত করা যায়নি। জেলা নিজে নির্বাচন করুন।', 'Location could not be resolved. Please select a district manually.')); } });
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
      getHomepagePrimaryDoctorSections({ districtId: selectedDistrict, upazilaId: selectedUpazila, limit: 8 }),
      currentLocation ? findNearestDoctors({ latitude: currentLocation.latitude, longitude: currentLocation.longitude, radiusKm: 100, limit: 8 }) : Promise.resolve([] as DoctorSearchRow[]),
      getPublicProviders({ districtId: selectedDistrict, upazilaId: selectedUpazila, limit: 8 }),
      searchAmbulances({
        districtId: selectedDistrict,
        upazilaId: selectedUpazila,
        latitude: areaSelectionSource === 'gps' ? currentLocation?.latitude ?? null : null,
        longitude: areaSelectionSource === 'gps' ? currentLocation?.longitude ?? null : null,
        radiusKm: areaSelectionSource === 'gps' && currentLocation ? 100 : null,
      }),
    ]).then(([doctorSections, nearestRows, providerRows, ambulanceRows]) => {
      if (!active) return;
      setAreaDoctors(doctorSections.ranked);
      setMbbsDoctors(doctorSections.general);
      setSpecialistDoctors(doctorSections.specialist);
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
    getHomepageSecondaryDoctorSections({
      districtId: selectedDistrict,
      upazilaId: selectedUpazila,
      topics: featuredTopics,
      marketplaceLimit: 8,
      topicLimit: 7,
    }).then((sections) => {
      if (!active) return;
      setPremiumDoctors(sections.premium);
      setNewDoctors(sections.new);
      setSpecialtyDoctors(sections.topics);
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

  function applyResolvedLocation(resolved: LocationResolution) {
    const nextDistrictId = String(resolved.district_id);
    const nextUpazilaId = resolved.upazila_id ? String(resolved.upazila_id) : '';
    setDistrictId(nextDistrictId);
    setUpazilaId(nextUpazilaId);
    setAreaSelectionSource('gps');
    persistAreaSelection(nextDistrictId, nextUpazilaId, 'gps');
  }

  function formatResolvedLocationMessage(resolved: LocationResolution) {
    const district = language === 'bn' ? resolved.district_name_bn : resolved.district_name_en || resolved.district_name_bn;
    const upazila = language === 'bn' ? resolved.upazila_name_bn : resolved.upazila_name_en || resolved.upazila_name_bn;
    if (!upazila) return tr(`${district} জেলা শনাক্ত হয়েছে • সকল উপজেলা / এলাকা দেখানো হচ্ছে`, `${district} district detected • showing all areas`);
    const kind = resolved.resolution_source === 'dhaka_city_area_centroid' ? tr('এলাকা', 'area') : tr('উপজেলা', 'upazila');
    return tr(`${district} জেলা • ${upazila} ${kind} শনাক্ত হয়েছে`, `${district} district • ${upazila} ${kind} detected`);
  }

  function persistGpsLocation(location: { latitude: number; longitude: number; accuracy: number | null }, resolved: LocationResolution | null) {
    try {
      localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify({
        ...location,
        capturedAt: Date.now(),
        contextVersion: 2,
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
      setLocationMessage(tr('এই ব্রাউজারে জিপিএস সমর্থন নেই। জেলা নিজে নির্বাচন করুন।', 'GPS is not supported in this browser. Please select a district manually.')); setLocationPromptVisible(false); return;
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
        setDetectedLocation(resolved); setLocationResolutionState('resolved'); setLocationMessage(formatResolvedLocationMessage(resolved));
        applyResolvedLocation(resolved); persistGpsLocation(location, resolved);
      } else {
        setLocationResolutionState('failed'); setLocationMessage(tr('জিপিএস পাওয়া গেছে—জেলা নিজে নির্বাচন করুন।', 'GPS found—please select a district manually.')); persistGpsLocation(location, null);
      }
      if (user) void saveMyCurrentLocation({ latitude: location.latitude, longitude: location.longitude, accuracyMeters: location.accuracy, districtId: resolved?.district_id ?? (districtId ? Number(districtId) : null), upazilaId: resolved?.upazila_id ?? null }).catch(() => undefined);
    }, () => {
      setCurrentLocation(null); setLocationState('denied'); setLocationResolutionState('failed');
      setLocationMessage(tr('অবস্থানের অনুমতি পাওয়া যায়নি। জেলা ও উপজেলা / এলাকা নির্বাচন করুন।', 'Location permission was not granted. Please select a district and area.')); setLocationPromptVisible(false);
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
  }

  const viewAllParams = new URLSearchParams();
  if (districtId) viewAllParams.set('district', districtId);
  if (upazilaId) viewAllParams.set('upazila', upazilaId);
  const contextDoctorsHref = `/doctors${viewAllParams.size ? `?${viewAllParams}` : ''}`;
  const contextCategoriesHref = `/categories${viewAllParams.size ? `?${viewAllParams}` : ''}`;
  const contextProvidersHref = `/providers${viewAllParams.size ? `?${viewAllParams}` : ''}`;
  const selectedDistrict = districts.find((district) => String(district.id) === districtId);
  const selectedDistrictName = districtId ? ((language === 'bn' ? selectedDistrict?.name_bn : selectedDistrict?.name_en) || (language === 'bn' ? detectedLocation?.district_name_bn : detectedLocation?.district_name_en) || tr('জেলা', 'District')) : tr('সকল জেলা', 'All districts');
  const selectedSecondLevel = upazilas.find((upazila) => String(upazila.id) === upazilaId);
  const selectedUpazilaName = selectedSecondLevel
    ? `${language === 'bn' ? selectedSecondLevel.name_bn : selectedSecondLevel.name_en || selectedSecondLevel.name_bn}${selectedSecondLevel.location_type === 'city_area' ? tr(' (এলাকা)', ' (Area)') : ''}`
    : tr('সকল উপজেলা / এলাকা', 'All upazilas / areas');
  const areaTitle = upazilaId ? selectedUpazilaName : districtId ? selectedDistrictName : tr('সারা বাংলাদেশ', 'Bangladesh');
  const dentalTopic = topics.find((topic) => topic.slug === 'dental' || topic.name_en?.toLowerCase().includes('dental') || topic.name_bn.includes('দাঁত'));
  const dentalDoctors = dentalTopic ? specialtyDoctors[dentalTopic.id] ?? [] : [];
  const savedHref = user ? '/saved' : '/auth';
  const savedState = user ? undefined : { from: '/saved' };
  const bloodHref = user ? '/blood' : '/auth';
  const bloodState = user ? undefined : { from: '/blood' };
  const updateDoctorStats = (doctorId: string, next: PublicProfileStats) => setDoctorStats((current) => ({ ...current, [doctorId]: next }));
  const updateProviderStats = (providerId: string, next: PublicProfileStats) => setProviderStats((current) => ({ ...current, [providerId]: next }));

  return (
    <div className="app-shell visitor-home visitor-marketplace-home">
      <PublicHeader mobileBottomNav />
      <main>
        <section className="marketplace-search-hero">
          <div className="container marketplace-search-wrap">
            <div className="marketplace-search-intro"><span>docbd.info</span><h1>{tr('ডাক্তার খুঁজুন', 'Find a Doctor')}</h1><p>{districtId ? tr(`${areaTitle} এলাকার ডাক্তার ও হাসপাতাল`, `Doctors and hospitals in ${areaTitle}`) : tr('অবস্থান, নাম বা বিশেষজ্ঞতা দিয়ে দ্রুত খুঁজুন', 'Search quickly by location, name, or specialty')}</p></div>
            <form className="marketplace-search-box" onSubmit={submitSearch}>
              <label className="marketplace-search-input"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tr('ডাক্তার, রোগ বা বিশেষজ্ঞতা', 'Doctor, condition, or specialty')} aria-label={tr('ডাক্তার খুঁজুন', 'Find a doctor')} /></label>
              <button type="submit" className="marketplace-search-button" aria-label="Search"><Search /></button>
            </form>
            <div className="marketplace-location-row marketplace-location-selectors">
              <button className="marketplace-location-select" type="button" onClick={() => setPickerOpen('district')}><MapPin /><span><small>{tr('জেলা', 'District')}</small><strong>{selectedDistrictName}</strong></span><ChevronDown /></button>
              <button className="marketplace-location-select" type="button" onClick={() => districtId && setPickerOpen('upazila')} disabled={!districtId}><MapPin /><span><small>{tr('উপজেলা / এলাকা', 'Upazila / Area')}</small><strong>{selectedUpazilaName}</strong></span><ChevronDown /></button>
              <button type="button" className={`near-me-chip marketplace-near-me-button ${locationState === 'granted' ? 'active' : ''}`} onClick={requestLocation}>{locationState === 'asking' ? <LoaderCircle className="spin" /> : <LocateFixed />}<span><small>{tr('জিপিএস', 'GPS')}</small><strong>{locationState === 'granted' ? tr('কাছাকাছি চালু', 'Near Me On') : tr('কাছাকাছি', 'Near Me')}</strong></span></button>
            </div>
            <div className="marketplace-quick-row">
              <Link to={contextDoctorsHref}><Stethoscope /> {tr('সব ডাক্তার', 'All Doctors')}</Link>
              <a href="#categories"><HeartPulse /> {tr('ক্যাটাগরি', 'Categories')}</a>
              <Link to={savedHref} state={savedState}><Bookmark /> {tr('সংরক্ষিত', 'Saved')}</Link>
            </div>
            {locationHydrated && locationPromptVisible && locationState === 'idle' && <button className="compact-location-prompt" type="button" onClick={requestLocation}><LocateFixed /><span><strong>{tr('কাছের ডাক্তার দেখুন', 'Find nearby doctors')}</strong><small>{tr('বর্তমান অবস্থান ব্যবহার করুন', 'Use current location')}</small></span><ArrowRight /></button>}
            {locationMessage && <div className={`compact-location-status ${locationResolutionState}`}>{locationResolutionState === 'resolving' ? <LoaderCircle className="spin" /> : locationResolutionState === 'resolved' ? <BadgeCheck /> : <MapPin />}<span>{locationMessage}</span></div>}
            {!isSupabaseConfigured && <div className="visitor-preview-note">{tr('ইউআই প্রিভিউ চলছে—লাইভ ডেটার জন্য Supabase environment variables প্রয়োজন।', 'UI preview mode—Supabase environment variables are required for live data.')}</div>}
          </div>
        </section>

        {pickerOpen && (
          <div className="visitor-picker-backdrop" role="presentation" onClick={() => setPickerOpen(null)}>
            <section className="visitor-picker-sheet" role="dialog" aria-modal="true" aria-labelledby="visitor-area-picker-title" onClick={(event) => event.stopPropagation()}>
              <div className="visitor-picker-handle" />
              <div className="visitor-picker-head"><div><span>{tr('এলাকা বেছে নিন', 'Choose an area')}</span><h2 id="visitor-area-picker-title">{pickerOpen === 'district' ? tr('জেলা নির্বাচন', 'Select district') : tr('উপজেলা / এলাকা নির্বাচন', 'Select upazila / area')}</h2></div><button type="button" onClick={() => setPickerOpen(null)} aria-label={tr('বন্ধ করুন', 'Close')}><X /></button></div>
              <div className="visitor-picker-list">
                <button className={((!districtId && pickerOpen === 'district') || (!upazilaId && pickerOpen === 'upazila')) ? 'active visitor-picker-clear' : 'visitor-picker-clear'} type="button" onClick={() => { if (pickerOpen === 'district') selectDistrict(''); else selectUpazila(''); setPickerOpen(null); }}><span>{pickerOpen === 'district' ? tr('সারা বাংলাদেশ / সকল জেলা', 'Bangladesh / All districts') : tr('সকল উপজেলা / এলাকা', 'All upazilas / areas')}</span>{((pickerOpen === 'district' && !districtId) || (pickerOpen === 'upazila' && !upazilaId)) && <BadgeCheck />}</button>
                {pickerOpen === 'district' ? districts.map((item) => {
                  const active = String(item.id) === districtId;
                  return <button className={active ? 'active' : ''} type="button" key={item.id} onClick={() => { selectDistrict(String(item.id)); setPickerOpen(null); }}><span>{language === 'bn' ? item.name_bn : item.name_en || item.name_bn}</span>{active && <BadgeCheck />}</button>;
                }) : upazilas.map((item) => {
                  const active = String(item.id) === upazilaId;
                  return <button className={active ? 'active' : ''} type="button" key={item.id} onClick={() => { selectUpazila(String(item.id)); setPickerOpen(null); }}><span>{language === 'bn' ? item.name_bn : item.name_en || item.name_bn}{item.location_type === 'city_area' ? tr(' · এলাকা', ' · Area') : ''}</span>{active && <BadgeCheck />}</button>;
                })}
              </div>
            </section>
          </div>
        )}

        {error && <div className="container visitor-inline-error"><div className="error-box" role="alert">{error}</div></div>}

        <section className="marketplace-section marketplace-category-section" id="categories">
          <div className="container">
            <SectionHead language={language} eyebrow={tr('ক্যাটাগরি', 'Categories')} title={tr('বিশেষজ্ঞতা বেছে নিন', 'Choose a Specialty')} href={contextCategoriesHref} icon={<Stethoscope />} />
            <div className="marketplace-category-rail">
              {topics.slice(0, 10).map((topic) => <Link className="marketplace-category-card" to={topicHref(topic)} key={topic.id}><TopicImage path={topicImagePath(topic)} /><strong>{language === 'bn' ? topic.name_bn : topic.name_en || topic.name_bn}</strong></Link>)}
            </div>
          </div>
        </section>

        <div ref={secondaryGateRef} className="marketplace-lazy-gate" aria-hidden="true" />

        {(secondaryLoading || premiumDoctors.length > 0) && (
          <section className="marketplace-section premium-doctors-section">
            <div className="container">
              <SectionHead language={language} eyebrow={tr('প্রিমিয়াম', 'Premium')} title={tr('প্রিমিয়াম ডাক্তার', 'Premium Doctors')} href={contextDoctorsHref} icon={<Crown />} />
              {secondaryLoading ? <DoctorRailSkeleton /> : <DoctorRail viewerLocation={currentLocation} doctors={premiumDoctors} stats={doctorStats} onStatsChange={updateDoctorStats} />}
            </div>
          </section>
        )}

        {currentLocation && (
          <section className="marketplace-section marketplace-soft-section" id="near-me">
            <div className="container">
              <SectionHead language={language} eyebrow={tr('জিপিএস দূরত্ব', 'GPS Distance')} title={tr('আমার কাছাকাছি', 'Near Me')} href={contextDoctorsHref} icon={<LocateFixed />} />
              {resultsLoading ? <DoctorRailSkeleton /> : nearbyDoctors.length ? <DoctorRail viewerLocation={currentLocation} doctors={nearbyDoctors} stats={doctorStats} onStatsChange={updateDoctorStats} /> : <div className="marketplace-empty">{tr('কাছাকাছি স্থানাঙ্কসহ কোনো ডাক্তার চেম্বার পাওয়া যায়নি।', 'No doctor chamber with coordinates was found nearby.')}</div>}
            </div>
          </section>
        )}

        <section className="marketplace-section">
          <div className="container">
            <SectionHead language={language} eyebrow={areaTitle} title={tr('আপনার এলাকার ডাক্তার', 'Doctors in Your Area')} href={contextDoctorsHref} icon={<MapPin />} />
            {loading || resultsLoading ? <DoctorRailSkeleton /> : areaDoctors.length ? <DoctorRail viewerLocation={currentLocation} doctors={areaDoctors} stats={doctorStats} onStatsChange={updateDoctorStats} /> : <div className="marketplace-empty">{tr('এই এলাকায় ডাক্তার পাওয়া যায়নি।', 'No doctors were found in this area.')}</div>}
          </div>
        </section>

        <section className="marketplace-section marketplace-soft-section">
          <div className="container">
            <SectionHead language={language} eyebrow={tr('ডিগ্রিভিত্তিক', 'By Degree')} title={tr('সাধারণ চিকিৎসক', 'General Doctors')} href={`${contextDoctorsHref}${contextDoctorsHref.includes('?') ? '&' : '?'}classification=general`} icon={<BadgeCheck />} />
            {loading || resultsLoading ? <DoctorRailSkeleton /> : mbbsDoctors.length ? <DoctorRail viewerLocation={currentLocation} doctors={mbbsDoctors} stats={doctorStats} onStatsChange={updateDoctorStats} /> : <div className="marketplace-empty">{tr('এই এলাকায় সাধারণ চিকিৎসক পাওয়া যায়নি।', 'No general doctors were found in this area.')}</div>}
          </div>
        </section>

        <section className="marketplace-section">
          <div className="container">
            <SectionHead language={language} eyebrow={areaTitle} title={tr('বিশেষজ্ঞ ডাক্তার', 'Specialist Doctors')} href={`${contextDoctorsHref}${contextDoctorsHref.includes('?') ? '&' : '?'}classification=specialist`} icon={<Stethoscope />} />
            {loading || resultsLoading ? <DoctorRailSkeleton /> : specialistDoctors.length ? <DoctorRail viewerLocation={currentLocation} doctors={specialistDoctors} stats={doctorStats} onStatsChange={updateDoctorStats} /> : <div className="marketplace-empty">{tr('বিশেষজ্ঞ ডাক্তার পাওয়া যায়নি।', 'No specialist doctors were found.')}</div>}
          </div>
        </section>

        {dentalTopic && (secondaryLoading || dentalDoctors.length > 0) && (
          <section className="marketplace-section marketplace-soft-section">
            <div className="container">
              <SectionHead language={language} eyebrow={areaTitle} title={tr('দন্ত চিকিৎসক', 'Dental Doctors')} href={topicHref(dentalTopic)} icon={<Stethoscope />} />
              {secondaryLoading ? <DoctorRailSkeleton /> : <DoctorRail viewerLocation={currentLocation} doctors={dentalDoctors} stats={doctorStats} onStatsChange={updateDoctorStats} />}
            </div>
          </section>
        )}

        {(secondaryLoading || newDoctors.length > 0) && (
          <section className="marketplace-section">
            <div className="container">
              <SectionHead language={language} eyebrow={tr('নতুন সদস্য', 'Recently Joined')} title={tr('সম্প্রতি যুক্ত হওয়া ডাক্তার', 'Recently Joined Doctors')} href={`${contextDoctorsHref}${contextDoctorsHref.includes('?') ? '&' : '?'}sort=newest`} icon={<Sparkles />} />
              {secondaryLoading ? <DoctorRailSkeleton /> : <DoctorRail viewerLocation={currentLocation} doctors={newDoctors} stats={doctorStats} onStatsChange={updateDoctorStats} />}
            </div>
          </section>
        )}

        {secondaryReady && Object.keys(specialtyDoctors).length > 0 && (
          <section className="marketplace-section marketplace-specialty-rows marketplace-soft-section">
            <div className="container">
              <SectionHead language={language} eyebrow={tr('জনপ্রিয়', 'Popular')} title={tr('বিশেষজ্ঞতা অনুযায়ী', 'By Specialty')} href="/categories" icon={<HeartPulse />} />
              <div className="compact-specialty-list">
                {topics.slice(0, 4).map((topic) => {
                  if (topic.id === dentalTopic?.id) return null;
                  const rows = specialtyDoctors[topic.id] ?? [];
                  return rows.length ? <SpecialtyDoctorRow key={topic.id} topic={topic} doctors={rows} href={topicHref(topic)} imagePath={topicImagePath(topic)} stats={doctorStats} onStatsChange={updateDoctorStats} language={language} /> : null;
                })}
              </div>
            </div>
          </section>
        )}

        <section className="marketplace-section marketplace-hospital-section" id="hospitals">
          <div className="container">
            <SectionHead language={language} eyebrow={areaTitle} title={tr('হাসপাতাল ও চেম্বার', 'Hospitals & Chambers')} href={contextProvidersHref} icon={<Building2 />} />
            {resultsLoading ? <div className="marketplace-horizontal-rail provider-marketplace-rail"><div className="visitor-doctor-skeleton" /><div className="visitor-doctor-skeleton" /></div> : providers.length ? <div className="marketplace-horizontal-rail provider-marketplace-rail">{providers.map((provider) => <ProviderCard provider={provider} stats={providerStats[provider.id]} onStatsChange={updateProviderStats} viewerLocation={currentLocation} key={provider.id} />)}</div> : <div className="marketplace-empty">{tr('এই এলাকায় হাসপাতাল/চেম্বার পাওয়া যায়নি।', 'No hospital or chamber was found in this area.')}</div>}
          </div>
        </section>

        <section className="marketplace-emergency-strip">
          <div className="container marketplace-emergency-rail">
            <Link to={bloodHref} state={bloodState} className="marketplace-emergency-card" id="blood"><Users /><span><strong>{tr('ব্লাড ব্যাংক', 'Blood Bank')}</strong><small>{tr('জরুরি রক্ত সহায়তা', 'Emergency blood support')}</small></span><ArrowRight /></Link>
            <article className="marketplace-emergency-card" id="ambulance"><Ambulance /><span><strong>{tr('অ্যাম্বুলেন্স', 'Ambulance')}</strong><small>{ambulances[0]?.operator_name || tr('জরুরি পরিবহন', 'Emergency transport')}</small></span>{ambulances[0]?.phone ? <a href={`tel:${ambulances[0].phone}`}>{tr('কল', 'Call')}</a> : <ArrowRight />}</article>
          </div>
        </section>
      </main>
      <footer className="visitor-footer compact-visitor-footer"><div className="container"><strong>{SITE_NAME}</strong><span>{tr('জরুরি সেবা', 'Emergency')}: <a href="tel:999">{language === 'bn' ? '৯৯৯' : '999'}</a></span></div></footer>
      <VisitorBottomNav />
    </div>
  );
}
