import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BadgeCheck,
  CalendarDays,
  Clock3,
  ExternalLink,
  GraduationCap,
  Languages,
  LoaderCircle,
  MapPin,
  MessageCircle,
  Phone,
  ShieldCheck,
  Stethoscope,
  X,
} from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import FollowSaveButton from '../components/FollowSaveButton';
import PublicHeader from '../components/PublicHeader';
import VisitorBottomNav from '../components/VisitorBottomNav';
import VerifiedBadge from '../components/VerifiedBadge';
import { makePageTitle } from '../lib/brand';
import { getImageUrl } from '../lib/storage';
import { isSupabaseConfigured } from '../lib/supabase';
import { getDoctorPublicProfile } from '../services/discovery';
import { getDoctorPublicStats } from '../services/engagement';
import type { DoctorPublicProfile, PublicProfileStats } from '../types';

const days = ['রবিবার', 'সোমবার', 'মঙ্গলবার', 'বুধবার', 'বৃহস্পতিবার', 'শুক্রবার', 'শনিবার'];
const cleanTime = (time: string) => time.slice(0, 5);
const cleanPhone = (value: string) => value.replace(/[^0-9+]/g, '');
const whatsappNumber = (value: string) => {
  let digits = value.replace(/\D/g, '');
  if (digits.startsWith('0')) digits = `88${digits}`;
  return digits;
};

export default function DoctorProfile() {
  const { doctorId = '' } = useParams();
  const [profile, setProfile] = useState<DoctorPublicProfile | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [error, setError] = useState<string | null>(null);
  const [contactOpen, setContactOpen] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [profileStats, setProfileStats] = useState<PublicProfileStats | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    getDoctorPublicProfile(doctorId)
      .then((result) => {
        setProfile(result);
        document.title = result ? makePageTitle(result.doctor.name) : makePageTitle('ডাক্তার পাওয়া যায়নি');
      })
      .catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : 'প্রোফাইল লোড করা যায়নি।'))
      .finally(() => setLoading(false));
  }, [doctorId]);

  useEffect(() => {
    if (!isSupabaseConfigured || !doctorId) return;
    let active = true;
    getDoctorPublicStats(doctorId)
      .then((stats) => { if (active) setProfileStats(stats); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [doctorId]);

  const avatar = getImageUrl(profile?.doctor.avatar_url, 'avatars');
  useEffect(() => setImageFailed(false), [avatar]);

  const primarySpecialty = profile?.specialties[0]?.name_bn || 'বিশেষজ্ঞ চিকিৎসক';
  const primaryChamber = profile?.chambers[0] ?? null;
  const directPhone = profile?.doctor.phone || null;
  const directWhatsapp = profile?.doctor.whatsapp || null;
  const chamberPhone = primaryChamber?.phone || null;
  const contactPhone = directPhone || chamberPhone;
  const callPhone = contactPhone ? cleanPhone(contactPhone) : null;
  const whatsapp = directWhatsapp || directPhone || null;
  const contactSource = directPhone || directWhatsapp ? 'assistant' : chamberPhone ? 'chamber' : null;
  const facebook = profile?.doctor.facebook_url || null;
  const locationText = primaryChamber?.address || null;
  const hasContactOptions = Boolean(callPhone || whatsapp || facebook);
  const isVerified = profile?.doctor.verification_status === 'approved';
  const canOnlineBook = Boolean(isVerified && profile?.doctor.accepting_appointments);

  const details = useMemo(() => {
    if (!profile) return [];
    return [
      { label: 'ডিগ্রি', value: profile.doctor.degree, icon: GraduationCap },
      { label: 'বিশেষজ্ঞ', value: profile.specialties.map((item) => item.name_bn).join(', ') || null, icon: Stethoscope },
      { label: 'পদবি', value: profile.doctor.designation || profile.doctor.professional_title, icon: BadgeCheck },
      { label: 'মেডিকেল কলেজ', value: profile.doctor.medical_college, icon: GraduationCap },
      { label: 'বর্তমান কর্মস্থল', value: profile.doctor.present_job, icon: Stethoscope },
      { label: 'বিএমডিসি রেজি. নং', value: profile.doctor.bmdc_registration_no, icon: ShieldCheck },
      { label: 'চেম্বার/হাসপাতাল', value: primaryChamber?.name_bn || null, icon: Stethoscope },
      { label: 'ঠিকানা', value: locationText, icon: MapPin },
    ].filter((item) => Boolean(item.value));
  }, [profile, primaryChamber, locationText]);

  return (
    <div className="app-shell profile-page visitor-profile-page">
      <PublicHeader mobileBottomNav />
      <main className="profile-main container visitor-profile-main">
        <Link className="back-link visitor-profile-back" to="/doctors"><ArrowLeft /> ডাক্তার তালিকায় ফিরুন</Link>
        {!isSupabaseConfigured && <div className="directory-notice">লাইভ প্রোফাইল দেখতে Supabase environment variables প্রয়োজন।</div>}
        {loading && <div className="loading-box"><LoaderCircle className="spin" /> প্রোফাইল লোড হচ্ছে…</div>}
        {error && <div className="error-box" role="alert">{error}</div>}
        {!loading && isSupabaseConfigured && !error && !profile && (
          <div className="empty-state"><span><Stethoscope /></span><h3>ডাক্তার পাওয়া যায়নি</h3><p>প্রোফাইলটি অননুমোদিত, নিষ্ক্রিয় অথবা মুছে ফেলা হয়েছে।</p></div>
        )}

        {profile && <>
          <section className="visitor-profile-hero">
            <div className="visitor-profile-photo">
              {avatar && !imageFailed ? (
                <img src={avatar} alt={profile.doctor.name} onError={() => setImageFailed(true)} />
              ) : (
                <div className="profile-photo-fallback"><Stethoscope /></div>
              )}
            </div>
            <VerifiedBadge className="profile-verified" verified={isVerified} label={isVerified ? "Verified" : "Not verified yet"} />
            <h1>{profile.doctor.name}</h1>
            <p>{primarySpecialty}</p>
            <div className="public-follow-summary">
              <FollowSaveButton targetType="doctor" targetId={profile.doctor.id} stats={profileStats} variant="button" entityLabel="ডাক্তার" onStatsChange={setProfileStats} />
              <span><b>{(profileStats?.follower_count ?? 0).toLocaleString('bn-BD')}</b> মোট অনুসারী</span>
            </div>
          </section>

          <section className="profile-prescription-card">
            <div className="prescription-heading">
              <small>ডাক্তারের পেশাগত তথ্য</small>
              <h2>{profile.doctor.name}</h2>
              {profile.doctor.degree && <p>{profile.doctor.degree}</p>}
            </div>
            <div className="prescription-details">
              {details.map(({ label, value, icon: Icon }) => (
                <div key={label}>
                  <span><Icon /> {label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
          </section>

          <section className="profile-appointment-strip">
            <div className="profile-fee-box">
              <small>ভিজিট ফি</small>
              <strong>{profile.doctor.consultation_fee != null ? `৳${profile.doctor.consultation_fee}` : 'যোগাযোগ করুন'}</strong>
            </div>
            <div className="profile-direct-actions">
              {callPhone && (
                <a className="profile-contact-button call" href={`tel:${callPhone}`} title={contactSource === 'assistant' ? 'ডাক্তারের সহকারীকে কল করুন' : 'চেম্বারে কল করুন'}>
                  <Phone /><span>{contactSource === 'assistant' ? 'সহকারী' : 'কল'}</span>
                </a>
              )}
              {whatsapp && (
                <a className="profile-contact-button whatsapp" href={`https://wa.me/${whatsappNumber(whatsapp)}`} target="_blank" rel="noreferrer" title="WhatsApp">
                  <MessageCircle /><span>WhatsApp</span>
                </a>
              )}
              <button
                type="button"
                className="profile-appointment-button"
                disabled={!canOnlineBook && !hasContactOptions}
                onClick={() => setContactOpen(true)}
              >
                <CalendarDays /> অ্যাপয়েন্টমেন্ট নিন
              </button>
            </div>
          </section>

          <section className="profile-section visitor-about-section">
            <h2>ডাক্তার সম্পর্কে</h2>
            {profile.doctor.headline && <h3>{profile.doctor.headline}</h3>}
            <p>{profile.doctor.bio || 'এই ডাক্তার সম্পর্কে বিস্তারিত তথ্য এখনো যোগ করা হয়নি।'}</p>
            <div className="profile-facts">
              {profile.doctor.experience_years != null && <span><Clock3 /> <b>{profile.doctor.experience_years}+ বছর</b> অভিজ্ঞতা</span>}
              {profile.doctor.languages?.length ? <span><Languages /> ভাষা: <b>{profile.doctor.languages.join(', ')}</b></span> : null}
            </div>
          </section>

          <section className="profile-section visitor-schedule-section">
            <h2>চেম্বার ও সময়সূচি</h2>
            {profile.chambers.length ? (
              <div className="visitor-chamber-list">
                {profile.chambers.map((chamber) => (
                  <article key={chamber.id}>
                    <div className="visitor-chamber-heading">
                      <span><MapPin /></span>
                      <div>
                        <h3>{chamber.name_bn}</h3>
                        <p>{chamber.address || 'ঠিকানা যোগ করা হয়নি'}</p>
                      </div>
                    </div>
                    <div className="visitor-schedule-list">
                      {chamber.schedules.length ? chamber.schedules.map((schedule, index) => (
                        <div key={`${schedule.day_of_week}-${schedule.start_time}-${index}`}>
                          <span>{days[schedule.day_of_week]}</span>
                          <strong>{cleanTime(schedule.start_time)} – {cleanTime(schedule.end_time)}</strong>
                          {schedule.fee != null && <small>৳{schedule.fee}</small>}
                        </div>
                      )) : <p>সময়সূচি এখনো যোগ করা হয়নি।</p>}
                    </div>
                    <div className="visitor-chamber-actions">
                      {chamber.phone && <a href={`tel:${cleanPhone(chamber.phone)}`}><Phone /> কল করুন</a>}
                      {chamber.map_url && <a href={chamber.map_url} target="_blank" rel="noreferrer"><MapPin /> ম্যাপ দেখুন</a>}
                    </div>
                  </article>
                ))}
              </div>
            ) : <p>অনুমোদিত চেম্বারের তথ্য পাওয়া যায়নি।</p>}
          </section>
        </>}
      </main>

      <VisitorBottomNav />

      {profile && contactOpen && (
        <div className="appointment-sheet-backdrop" role="presentation" onClick={() => setContactOpen(false)}>
          <section className="appointment-sheet" role="dialog" aria-modal="true" aria-label="অ্যাপয়েন্টমেন্ট যোগাযোগ" onClick={(event) => event.stopPropagation()}>
            <div className="appointment-sheet-handle" />
            <div className="appointment-sheet-head">
              <div><small>যোগাযোগের মাধ্যম বেছে নিন</small><h2>অ্যাপয়েন্টমেন্ট নিন</h2></div>
              <button type="button" aria-label="বন্ধ করুন" onClick={() => setContactOpen(false)}><X /></button>
            </div>
            <div className="appointment-contact-grid">
              {callPhone && <a href={`tel:${callPhone}`}><span><Phone /></span><strong>কল করুন</strong></a>}
              {whatsapp && <a href={`https://wa.me/${whatsappNumber(whatsapp)}`} target="_blank" rel="noreferrer"><span><MessageCircle /></span><strong>WhatsApp</strong></a>}
              {facebook && <a href={facebook} target="_blank" rel="noreferrer"><span><ExternalLink /></span><strong>Facebook Page</strong></a>}
            </div>
            {!hasContactOptions && canOnlineBook && (
              <Link className="appointment-online-link" to={`/doctors/${profile.doctor.id}/book`}>অনলাইন অ্যাপয়েন্টমেন্ট ফর্ম খুলুন</Link>
            )}
            {!isVerified && <p className="profile-unverified-booking-note">Online appointment booking verification approved হওয়ার পর available হবে। সরাসরি contact option থাকলে সেটি ব্যবহার করতে পারেন।</p>}
          </section>
        </div>
      )}
    </div>
  );
}
