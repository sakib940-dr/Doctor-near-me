import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  BadgeCheck,
  CalendarDays,
  ChevronDown,
  Clock3,
  ExternalLink,
  GraduationCap,
  Languages,
  LoaderCircle,
  MapPin,
  MessageCircle,
  Navigation,
  Phone,
  ShieldCheck,
  Star,
  Stethoscope,
  X,
} from 'lucide-react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useVisitorLanguage, type VisitorLanguage } from '../contexts/VisitorLanguageContext';
import FollowSaveButton from '../components/FollowSaveButton';
import ProfileShareButton from '../components/ProfileShareButton';
import PublicHeader from '../components/PublicHeader';
import StructuredReviewSection from '../components/StructuredReviewSection';
import VisitorBottomNav from '../components/VisitorBottomNav';
import { makePageTitle } from '../lib/brand';
import { doctorPublicPath } from '../lib/publicRoutes';
import { captureCurrentCoordinates } from '../lib/geolocation';
import { getImageUrl } from '../lib/storage';
import { isSupabaseConfigured } from '../lib/supabase';
import { buildWhatsAppAppointmentUrl } from '../lib/whatsapp';
import { getPublicDoctorPageBase } from '../services/discovery';
import {
  getDoctorPublicStats,
  recordDoctorInteraction,
} from '../services/engagement';
import { getDoctorChamberDistances } from '../services/doctorPublicContent';
import type {
  DoctorChamberDistance,
  DoctorPublicContent,
  DoctorPublicProfile,
  PublicProfileStats,
  PublicRankingTier,
} from '../types';

const daysBn = ['রবিবার', 'সোমবার', 'মঙ্গলবার', 'বুধবার', 'বৃহস্পতিবার', 'শুক্রবার', 'শনিবার'];
const daysEn = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const cleanTime = (time: string) => time.slice(0, 5);
const cleanPhone = (value: string) => value.replace(/[^0-9+]/g, '');
const numberText = (value: number, language: VisitorLanguage, digits = 0) => value.toLocaleString(language === 'bn' ? 'bn-BD' : 'en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits });

const copy = {
  bn: {
    back: 'ডাক্তার তালিকায় ফিরুন',
    degree: 'ডিগ্রি', specialty: 'বিশেষত্ব', designation: 'পদবি', medicalCollege: 'মেডিকেল কলেজ', presentJob: 'বর্তমান কর্মস্থল', bmdc: 'বিএমডিসি',
    call: 'কল করুন', whatsapp: 'WhatsApp', appointment: 'অ্যাপয়েন্টমেন্ট', save: 'সংরক্ষণ',
    followers: 'মোট অনুসারী', reviews: 'রিভিউ', rating: 'গড় রেটিং', fee: 'ভিজিট ফি',
    about: 'ডাক্তার সম্পর্কে', schedule: 'চেম্বারের সময়সূচি', services: 'সেবাসমূহ', treatment: 'চিকিৎসার খরচ', investigation: 'পরীক্ষা / ইনভেস্টিগেশন খরচ',
    contact: 'যোগাযোগ, ম্যাপ ও দূরত্ব', noAbout: 'এই ডাক্তার সম্পর্কে বিস্তারিত তথ্য এখনো যোগ করা হয়নি।',
    noSchedule: 'সময়সূচি এখনো যোগ করা হয়নি।', noServices: 'সেবার তালিকা এখনো যোগ করা হয়নি।', noCost: 'খরচের তালিকা এখনো যোগ করা হয়নি।',
    distance: 'আপনার অবস্থান থেকে', showDistance: 'আমার দূরত্ব দেখুন', locating: 'Location নেওয়া হচ্ছে…', map: 'ম্যাপ খুলুন',
    open: 'এখন খোলা', closed: 'এখন বন্ধ', today: 'আজ', unavailable: 'তথ্য নেই',
    costDisclaimer: 'খরচ সেবা, চিকিৎসা পরিকল্পনা ও রোগীর অবস্থার উপর পরিবর্তিত হতে পারে।',
    verified: 'Verified', premium: 'Premium', new: 'নতুন', unverified: 'যাচাই হয়নি',
    experience: 'অভিজ্ঞতা', years: 'বছর', languages: 'ভাষা',
  },
  en: {
    back: 'Back to doctors',
    degree: 'Degrees', specialty: 'Specialty', designation: 'Designation', medicalCollege: 'Medical College', presentJob: 'Present Job', bmdc: 'BMDC',
    call: 'Call Now', whatsapp: 'WhatsApp', appointment: 'Appointment', save: 'Save',
    followers: 'Followers', reviews: 'Reviews', rating: 'Average rating', fee: 'Visit fee',
    about: 'About Doctor', schedule: 'Chamber Schedule', services: 'Services', treatment: 'Treatment Costs', investigation: 'Investigation Costs',
    contact: 'Contact, Map & Distance', noAbout: 'No detailed profile information has been added yet.',
    noSchedule: 'No schedule has been added yet.', noServices: 'No services have been added yet.', noCost: 'No cost information has been added yet.',
    distance: 'From your location', showDistance: 'Show my distance', locating: 'Getting location…', map: 'Open map',
    open: 'Open now', closed: 'Closed now', today: 'Today', unavailable: 'Not available',
    costDisclaimer: 'Costs may vary based on service, treatment plan and patient condition.',
    verified: 'Verified', premium: 'Premium', new: 'New', unverified: 'Unverified',
    experience: 'Experience', years: 'years', languages: 'Languages',
  },
} as const;

function localText(value: { bn?: string | null; en?: string | null } | null | undefined, language: VisitorLanguage) {
  if (!value) return '';
  return (language === 'bn' ? value.bn || value.en : value.en || value.bn) || '';
}

function rankLabel(tier: PublicRankingTier | undefined, language: VisitorLanguage, verified: boolean) {
  const t = copy[language];
  if (tier === 'premium') return t.premium;
  if (tier === 'verified' || verified) return t.verified;
  if (tier === 'new') return t.new;
  return t.unverified;
}

function todayStatus(chamber: DoctorPublicProfile['chambers'][number], language: VisitorLanguage) {
  const now = new Date();
  const weekday = now.getDay();
  const minutes = now.getHours() * 60 + now.getMinutes();
  const schedules = chamber.schedules.filter((item) => item.day_of_week === weekday);
  if (!schedules.length) return { open: false, text: `${copy[language].today}: ${copy[language].closed}` };
  const current = schedules.find((item) => {
    const [sh, sm] = cleanTime(item.start_time).split(':').map(Number);
    const [eh, em] = cleanTime(item.end_time).split(':').map(Number);
    const start = sh * 60 + sm;
    const end = eh * 60 + em;
    return end > start ? minutes >= start && minutes <= end : minutes >= start || minutes <= end;
  });
  const scheduleText = schedules.map((item) => `${cleanTime(item.start_time)}–${cleanTime(item.end_time)}`).join(', ');
  return { open: Boolean(current), text: `${current ? copy[language].open : copy[language].closed} • ${copy[language].today} ${scheduleText}` };
}

export default function DoctorProfile() {
  const { doctorId = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [profile, setProfile] = useState<DoctorPublicProfile | null>(null);
  const [publicSlug, setPublicSlug] = useState('');
  const [content, setContent] = useState<DoctorPublicContent | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [error, setError] = useState<string | null>(null);
  const [contactOpen, setContactOpen] = useState(false);
  const [profileStats, setProfileStats] = useState<PublicProfileStats | null>(null);
  const { language } = useVisitorLanguage();
  const [activeSlide, setActiveSlide] = useState(0);
  const [distances, setDistances] = useState<DoctorChamberDistance[]>([]);
  const [distanceBusy, setDistanceBusy] = useState(false);
  const [distanceError, setDistanceError] = useState<string | null>(null);
  const sliderRef = useRef<HTMLDivElement>(null);
  const trackedView = useRef<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured || !doctorId) return;
    let active = true;
    setLoading(true);
    setError(null);
    setProfile(null);
    setContent(null);
    setProfileStats(null);
    setPublicSlug('');
    getPublicDoctorPageBase(doctorId)
      .then(async (base) => {
        if (!base?.route) return [null, null, null, ''] as const;
        const canonicalPath = doctorPublicPath(base.route.slug, base.route.id);
        if (location.pathname !== canonicalPath) navigate(canonicalPath, { replace: true });
        const statsResult = await getDoctorPublicStats(base.route.id);
        return [base.profile, base.content, statsResult, base.route.slug] as const;
      })
      .then(([profileResult, contentResult, statsResult, slugResult]) => {
        if (!active) return;
        setProfile(profileResult);
        setContent(contentResult);
        setProfileStats(statsResult);
        setPublicSlug(slugResult || '');
        document.title = profileResult ? makePageTitle(profileResult.doctor.name) : makePageTitle('ডাক্তার পাওয়া যায়নি');
      })
      .catch((loadError: unknown) => active && setError(loadError instanceof Error ? loadError.message : 'প্রোফাইল লোড করা যায়নি।'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [doctorId, location.pathname, navigate]);

  useEffect(() => {
    if (!profile?.doctor.id || trackedView.current === profile.doctor.id) return;
    trackedView.current = profile.doctor.id;
    void recordDoctorInteraction(profile.doctor.id, 'profile_view', 'doctor_profile').catch(() => undefined);
  }, [profile?.doctor.id]);

  useEffect(() => {
    if (!profile?.doctor.id) return;
    try {
      const raw = localStorage.getItem('docbd-current-location');
      if (!raw) return;
      const saved = JSON.parse(raw) as { latitude?: number; longitude?: number; capturedAt?: number };
      if (typeof saved.latitude !== 'number' || typeof saved.longitude !== 'number') return;
      if (saved.capturedAt && Date.now() - saved.capturedAt > 30 * 60 * 1000) return;
      void getDoctorChamberDistances(profile.doctor.id, saved.latitude, saved.longitude).then(setDistances).catch(() => undefined);
    } catch { /* optional local storage context */ }
  }, [profile?.doctor.id]);

  const t = copy[language];
  const avatar = getImageUrl(profile?.doctor.avatar_url, 'avatars');
  const sliderImages = useMemo(() => {
    const rows = content?.slider_images ?? [];
    if (rows.length) return rows.map((row) => ({ id: `slider-${row.id}`, src: getImageUrl(row.image, 'public-images'), caption: localText(row.caption, language) })).filter((row) => Boolean(row.src));
    if (avatar) return [{ id: 'profile-photo', src: avatar, caption: profile?.doctor.name || '' }];
    return [];
  }, [avatar, content?.slider_images, language, profile?.doctor.name]);

  useEffect(() => { setActiveSlide(0); }, [sliderImages.length]);

  const categorySpecialty = profile ? (language === 'bn' ? profile.specialties[0]?.name_bn : profile.specialties[0]?.name_en || profile.specialties[0]?.name_bn) || '' : '';
  const primarySpecialty = profile ? profile.doctor.specialty_text?.trim() || categorySpecialty || (language === 'bn' ? 'চিকিৎসক' : 'Doctor') : '';
  const primaryChamber = profile?.chambers[0] ?? null;

  // Prefer doctor visiting-card public contact fields. Older records may not
  // have these fields, so keep chamber/provider contact as fallback.
  const primaryPhone = primaryChamber?.phone || null;
  const primaryWhatsapp = primaryChamber?.whatsapp || null;

  const callPhone = primaryPhone ? cleanPhone(primaryPhone) : null;
  const whatsappUrl = primaryWhatsapp ? buildWhatsAppAppointmentUrl(primaryWhatsapp, profile?.doctor.name) : null;
  const isVerified = profile?.doctor.verification_status === 'approved';
  const canOnlineBook = Boolean(isVerified && profile?.doctor.accepting_appointments);
  const rank = rankLabel(profileStats?.ranking_tier, language, isVerified);
  const about = profile ? (language === 'bn' ? profile.doctor.bio_bn || content?.bio_bn || profile.doctor.bio : profile.doctor.bio_en || content?.bio_en || profile.doctor.bio_bn || content?.bio_bn || profile.doctor.bio) : null;

  const visitingDetails = useMemo(() => {
    if (!profile) return [];
    const specialtyNames = profile.specialties.map((item) => language === 'bn' ? item.name_bn : item.name_en || item.name_bn).filter(Boolean).join(', ');
    const specialtyValue = Array.from(new Set([profile.doctor.specialty_text?.trim(), specialtyNames].filter((value): value is string => Boolean(value)))).join(' · ') || primarySpecialty;
    return [
      { label: t.degree, value: profile.doctor.degree, icon: GraduationCap },
      { label: t.specialty, value: specialtyValue, icon: Stethoscope },
      { label: t.designation, value: profile.doctor.designation || profile.doctor.professional_title, icon: BadgeCheck },
      { label: t.bmdc, value: profile.doctor.bmdc_registration_no, icon: ShieldCheck },
      { label: t.medicalCollege, value: profile.doctor.medical_college, icon: GraduationCap },
      { label: t.presentJob, value: profile.doctor.present_job, icon: Stethoscope },
      { label: language === 'bn' ? 'পাবলিক ঠিকানা' : 'Public Address', value: profile.doctor.public_address, icon: MapPin },
    ].filter((item) => Boolean(item.value));
  }, [language, primarySpecialty, profile, t.bmdc, t.degree, t.designation, t.medicalCollege, t.presentJob, t.specialty]);

  function moveSlider(index: number) {
    const node = sliderRef.current?.querySelectorAll<HTMLElement>('[data-doctor-slide]')[index];
    if (node && sliderRef.current) sliderRef.current.scrollTo({ left: node.offsetLeft, behavior: 'smooth' });
  }

  function detectSlide() {
    const root = sliderRef.current;
    if (!root) return;
    const nodes: HTMLElement[] = Array.from(root.querySelectorAll<HTMLElement>('[data-doctor-slide]'));
    if (!nodes.length) return;
    let best = 0;
    let delta = Number.POSITIVE_INFINITY;
    nodes.forEach((node, index) => {
      const value = Math.abs(node.offsetLeft - root.scrollLeft);
      if (value < delta) { delta = value; best = index; }
    });
    setActiveSlide(best);
  }

  async function captureDistance() {
    if (!profile) return;
    setDistanceBusy(true);
    setDistanceError(null);
    try {
      const coordinates = await captureCurrentCoordinates();
      const rows = await getDoctorChamberDistances(profile.doctor.id, coordinates.latitude, coordinates.longitude);
      setDistances(rows);
      void recordDoctorInteraction(profile.doctor.id, 'map_click', 'doctor_distance').catch(() => undefined);
      try {
        const current = localStorage.getItem('docbd-current-location');
        const previous = current ? JSON.parse(current) as Record<string, unknown> : {};
        localStorage.setItem('docbd-current-location', JSON.stringify({ ...previous, ...coordinates, capturedAt: Date.now() }));
      } catch { /* local storage is optional */ }
    } catch (locationError) {
      setDistanceError(locationError instanceof Error ? locationError.message : 'Distance পাওয়া যায়নি।');
    } finally {
      setDistanceBusy(false);
    }
  }

  function distanceFor(providerId: string) {
    return distances.find((row) => row.provider_id === providerId)?.distance_km ?? null;
  }

  function track(event: 'call_click' | 'whatsapp_click' | 'appointment_click' | 'map_click') {
    if (!profile) return;
    void recordDoctorInteraction(profile.doctor.id, event, 'doctor_profile').catch(() => undefined);
  }

  return (
    <div className="app-shell doctor-public-v2-page">
      <PublicHeader mobileBottomNav />
      <main className="doctor-public-v2 container">
        <div className="doctor-public-topline">
          <Link className="doctor-public-back" to="/doctors"><ArrowLeft /> {t.back}</Link>
        </div>
        {!isSupabaseConfigured && <div className="directory-notice">লাইভ প্রোফাইল দেখতে Supabase environment variables প্রয়োজন।</div>}
        {loading && <div className="loading-box"><LoaderCircle className="spin" /> প্রোফাইল লোড হচ্ছে…</div>}
        {error && <div className="error-box" role="alert">{error}</div>}
        {!loading && isSupabaseConfigured && !error && !profile && <div className="empty-state"><span><Stethoscope /></span><h3>ডাক্তার পাওয়া যায়নি</h3><p>প্রোফাইলটি অননুমোদিত, নিষ্ক্রিয় অথবা মুছে ফেলা হয়েছে।</p></div>}

        {profile && <>
          <section className="doctor-profile-slider-shell" aria-label="Doctor images">
            <div className="doctor-profile-slider" ref={sliderRef} onScroll={detectSlide}>
              {sliderImages.length ? sliderImages.map((slide, index) => <figure data-doctor-slide key={slide.id}><img src={slide.src || ''} alt={slide.caption || profile.doctor.name} loading={index === 0 ? 'eager' : 'lazy'} decoding="async" width="1600" height="900" onError={(event) => { event.currentTarget.style.display = 'none'; }} />{slide.caption && <figcaption>{slide.caption}</figcaption>}</figure>) : <div data-doctor-slide className="doctor-profile-slider-fallback"><Stethoscope /></div>}
            </div>
            {sliderImages.length > 1 && <div className="doctor-slider-dots">{sliderImages.map((slide, index) => <button type="button" key={slide.id} className={index === activeSlide ? 'active' : ''} aria-label={`Slide ${index + 1}`} onClick={() => moveSlider(index)} />)}</div>}
          </section>

          <section className="doctor-visiting-card-v2">
            <div className="doctor-visiting-card-v2-head">
              <div><div className={`doctor-rank-pill ${profileStats?.ranking_tier || (isVerified ? 'verified' : 'unverified')}`}>{rank}</div><h1>{profile.doctor.name}</h1><p>{profile.doctor.degree || primarySpecialty}</p></div>
              {avatar && <img src={avatar} alt="" loading="lazy" decoding="async" width="320" height="320" onError={(event) => { event.currentTarget.style.display = 'none'; }} />}
            </div>
            <div className="doctor-visiting-compact-grid">{visitingDetails.map(({ label, value, icon: Icon }) => <div key={label}><span><Icon /> {label}</span><strong>{value}</strong></div>)}</div>
            <div className="doctor-visiting-facts">{profile.doctor.experience_years != null && <span><Clock3 /> <b>{numberText(profile.doctor.experience_years, language)}</b> {t.years} {t.experience}</span>}{profile.doctor.languages?.length ? <span><Languages /> {t.languages}: <b>{profile.doctor.languages.join(', ')}</b></span> : null}{profile.doctor.consultation_fee != null && <span><strong>৳{numberText(profile.doctor.consultation_fee, language)}</strong> {t.fee}</span>}</div>
          </section>

          <section className="doctor-primary-actions-v2">
            {callPhone ? <a href={`tel:${callPhone}`} onClick={() => track('call_click')}><Phone /><span>{t.call}</span></a> : <button disabled><Phone /><span>{t.call}</span></button>}
            {whatsappUrl ? <a href={whatsappUrl} target="_blank" rel="noreferrer" onClick={() => track('whatsapp_click')}><MessageCircle /><span>{t.whatsapp}</span></a> : <button disabled><MessageCircle /><span>{t.whatsapp}</span></button>}
            {canOnlineBook ? <Link to={`/doctors/${profile.doctor.id}/book`} onClick={() => track('appointment_click')}><CalendarDays /><span>{t.appointment}</span></Link> : <button type="button" disabled={!callPhone} onClick={() => { track('appointment_click'); setContactOpen(true); }}><CalendarDays /><span>{t.appointment}</span></button>}
            <FollowSaveButton targetType="doctor" targetId={profile.doctor.id} stats={profileStats} variant="button" entityLabel="ডাক্তার" onStatsChange={setProfileStats} className="doctor-profile-follow-action" language={language} />
            {publicSlug && <ProfileShareButton targetType="doctor" targetId={profile.doctor.id} slug={publicSlug} title={profile.doctor.name} language={language} className="doctor-profile-share-action" />}
          </section>

          <section className="doctor-social-summary-v2">
            <div><strong>{numberText(profileStats?.follower_count ?? 0, language)}</strong><span>{t.followers}</span></div>
            <div><strong>{numberText(profileStats?.review_count ?? 0, language)}</strong><span>{t.reviews}</span></div>
            <div><strong>{profileStats?.average_rating != null ? numberText(profileStats.average_rating, language, 1) : '—'}</strong><span><Star /> {t.rating}</span></div>
          </section>

          <section className="doctor-about-v2">
            <div className="doctor-section-title"><span><Stethoscope /></span><div><small>{language === 'bn' ? 'পরিচিতি' : 'Profile'}</small><h2>{t.about}</h2></div></div>
            {profile.doctor.headline && <h3>{profile.doctor.headline}</h3>}
            <p>{about || t.noAbout}</p>
          </section>

          <section className="doctor-accordion-stack">
            <details className="doctor-profile-accordion">
              <summary><span><Clock3 /> {t.schedule}</span><ChevronDown /></summary>
              <div className="doctor-accordion-body">{profile.chambers.length ? profile.chambers.map((chamber) => <article className="doctor-schedule-public-card" key={chamber.id}><header><div><h3>{language === 'bn' ? chamber.name_bn : chamber.name_en || chamber.name_bn}</h3><p>{chamber.address || t.unavailable}</p></div><span className={todayStatus(chamber, language).open ? 'open' : 'closed'}>{todayStatus(chamber, language).text}</span></header>{chamber.schedules.length ? <div className="doctor-public-schedule-list">{chamber.schedules.map((schedule, index) => <div key={`${schedule.day_of_week}-${schedule.start_time}-${index}`}><span>{(language === 'bn' ? daysBn : daysEn)[schedule.day_of_week]}</span><strong>{cleanTime(schedule.start_time)}–{cleanTime(schedule.end_time)}</strong>{localText(schedule.note, language) && <small>{localText(schedule.note, language)}</small>}</div>)}</div> : <p className="doctor-empty-copy">{t.noSchedule}</p>}</article>) : <p className="doctor-empty-copy">{t.noSchedule}</p>}</div>
            </details>

            <details className="doctor-profile-accordion">
              <summary><span><Stethoscope /> {t.services}</span><ChevronDown /></summary>
              <div className="doctor-accordion-body doctor-public-service-list">{content?.services.length ? content.services.map((service) => <article key={service.id}><strong>{localText(service.name, language)}</strong>{localText(service.description, language) && <p>{localText(service.description, language)}</p>}</article>) : <p className="doctor-empty-copy">{t.noServices}</p>}</div>
            </details>

            <details className="doctor-profile-accordion">
              <summary><span><BadgeCheck /> {t.treatment}</span><ChevronDown /></summary>
              <div className="doctor-accordion-body doctor-public-cost-list">{content?.treatment_costs.length ? content.treatment_costs.map((item) => <article key={item.id}><div><strong>{localText(item.name, language)}</strong>{(language === 'bn' ? item.cost.note_bn : item.cost.note_en || item.cost.note_bn) && <small>{language === 'bn' ? item.cost.note_bn : item.cost.note_en || item.cost.note_bn}</small>}</div><b>৳{numberText(Number(item.cost.min ?? 0), language)}{item.cost.max != null ? ` – ৳${numberText(Number(item.cost.max), language)}` : '+'}</b></article>) : <p className="doctor-empty-copy">{t.noCost}</p>}<p className="doctor-cost-disclaimer">{t.costDisclaimer}</p></div>
            </details>

            <details className="doctor-profile-accordion">
              <summary><span><GraduationCap /> {t.investigation}</span><ChevronDown /></summary>
              <div className="doctor-accordion-body doctor-public-cost-list">{content?.investigation_costs.length ? content.investigation_costs.map((item) => <article key={item.id}><div><strong>{localText(item.name, language)}</strong>{(language === 'bn' ? item.cost.note_bn : item.cost.note_en || item.cost.note_bn) && <small>{language === 'bn' ? item.cost.note_bn : item.cost.note_en || item.cost.note_bn}</small>}</div><b>৳{numberText(Number(item.cost.amount ?? 0), language)}</b></article>) : <p className="doctor-empty-copy">{t.noCost}</p>}<p className="doctor-cost-disclaimer">{t.costDisclaimer}</p></div>
            </details>
          </section>

          <section className="doctor-contact-map-v2">
            <div className="doctor-section-title"><span><MapPin /></span><div><small>{language === 'bn' ? 'চেম্বারভিত্তিক' : 'By chamber'}</small><h2>{t.contact}</h2></div></div>
            <button className="doctor-distance-button" type="button" onClick={() => void captureDistance()} disabled={distanceBusy}>{distanceBusy ? <LoaderCircle className="spin" /> : <Navigation />}{distanceBusy ? t.locating : t.showDistance}</button>
            {distanceError && <p className="doctor-distance-error">{distanceError}</p>}
            <div className="doctor-contact-chamber-list">{profile.chambers.map((chamber) => {
              const status = todayStatus(chamber, language);
              const distance = distanceFor(chamber.id);
              const mapHref = chamber.map_url || (chamber.latitude != null && chamber.longitude != null
                ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${chamber.latitude},${chamber.longitude}`)}`
                : null);
              return <article key={chamber.id}><div><h3>{language === 'bn' ? chamber.name_bn : chamber.name_en || chamber.name_bn}</h3><p><MapPin /> {chamber.address || t.unavailable}</p><span className={status.open ? 'open' : 'closed'}>{status.text}</span>{distance != null && <strong><Navigation /> {t.distance} {numberText(distance, language, 1)} {language === 'bn' ? 'কিমি' : 'km'}</strong>}</div><div>{chamber.phone && <a href={`tel:${cleanPhone(chamber.phone)}`} onClick={() => track('call_click')}><Phone /> {t.call}</a>}{chamber.whatsapp && buildWhatsAppAppointmentUrl(chamber.whatsapp, profile.doctor.name) && <a href={buildWhatsAppAppointmentUrl(chamber.whatsapp, profile.doctor.name) || undefined} target="_blank" rel="noreferrer" onClick={() => track('whatsapp_click')}><MessageCircle /> WhatsApp</a>}{mapHref && <a href={mapHref} target="_blank" rel="noreferrer" onClick={() => track('map_click')}><ExternalLink /> {t.map}</a>}</div></article>;
            })}</div>
            {primaryChamber?.latitude != null && primaryChamber.longitude != null && <div className="doctor-map-frame"><iframe title={language === 'bn' ? 'চেম্বার ম্যাপ' : 'Chamber map'} loading="lazy" referrerPolicy="no-referrer-when-downgrade" src={`https://www.google.com/maps?q=${encodeURIComponent(`${primaryChamber.latitude},${primaryChamber.longitude}`)}&z=15&output=embed`} /></div>}
          </section>

          <StructuredReviewSection targetType="doctor" targetId={profile.doctor.id} entityLabel="ডাক্তার" language={language} />
        </>}
      </main>
      <VisitorBottomNav />

      {profile && contactOpen && <div className="appointment-sheet-backdrop" role="presentation" onClick={() => setContactOpen(false)}><section className="appointment-sheet" role="dialog" aria-modal="true" aria-label="অ্যাপয়েন্টমেন্ট যোগাযোগ" onClick={(event) => event.stopPropagation()}><div className="appointment-sheet-handle" /><div className="appointment-sheet-head"><div><small>{language === 'bn' ? 'সরাসরি যোগাযোগ' : 'Direct contact'}</small><h2>{t.appointment}</h2></div><button type="button" aria-label="বন্ধ করুন" onClick={() => setContactOpen(false)}><X /></button></div><div className="appointment-contact-grid">{callPhone && <a href={`tel:${callPhone}`} onClick={() => track('call_click')}><span><Phone /></span><strong>{t.call}</strong></a>}{whatsappUrl && <a href={whatsappUrl} target="_blank" rel="noreferrer" onClick={() => track('whatsapp_click')}><span><MessageCircle /></span><strong>WhatsApp</strong></a>}</div>{!canOnlineBook && <p className="profile-unverified-booking-note">{language === 'bn' ? 'Online appointment verification/availability অনুযায়ী চালু হবে। আপাতত সরাসরি যোগাযোগ করুন।' : 'Online booking depends on verification and availability. Please use direct contact for now.'}</p>}</section></div>}
    </div>
  );
}
