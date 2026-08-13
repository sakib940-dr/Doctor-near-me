import { useEffect, useState } from 'react';
import { ArrowLeft, BadgeCheck, CalendarDays, Clock3, Languages, LoaderCircle, MapPin, Phone, ShieldCheck, Stethoscope } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import PublicHeader from '../components/PublicHeader';
import { getImageUrl } from '../lib/storage';
import { isSupabaseConfigured } from '../lib/supabase';
import { getDoctorPublicProfile } from '../services/discovery';
import type { DoctorPublicProfile } from '../types';

const days = ['রবিবার', 'সোমবার', 'মঙ্গলবার', 'বুধবার', 'বৃহস্পতিবার', 'শুক্রবার', 'শনিবার'];
const cleanTime = (time: string) => time.slice(0, 5);

export default function DoctorProfile() {
  const { doctorId = '' } = useParams();
  const [profile, setProfile] = useState<DoctorPublicProfile | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    getDoctorPublicProfile(doctorId)
      .then((result) => {
        setProfile(result);
        document.title = result ? `${result.doctor.name} | সিরাজগঞ্জ ডাক্তার` : 'ডাক্তার পাওয়া যায়নি';
      })
      .catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : 'প্রোফাইল লোড করা যায়নি।'))
      .finally(() => setLoading(false));
  }, [doctorId]);

  const avatar = getImageUrl(profile?.doctor.avatar_url, 'avatars');
  return (
    <div className="app-shell profile-page">
      <PublicHeader />
      <main className="profile-main container">
        <Link className="back-link" to="/doctors"><ArrowLeft size={17} /> ডাক্তার তালিকায় ফিরুন</Link>
        {!isSupabaseConfigured && <div className="directory-notice">লাইভ প্রোফাইল দেখতে Supabase environment variables প্রয়োজন।</div>}
        {loading && <div className="loading-box"><LoaderCircle className="spin" /> প্রোফাইল লোড হচ্ছে…</div>}
        {error && <div className="error-box" role="alert">{error}</div>}
        {!loading && isSupabaseConfigured && !error && !profile && <div className="empty-state"><span>🩺</span><h3>ডাক্তার পাওয়া যায়নি</h3><p>প্রোফাইলটি অননুমোদিত, নিষ্ক্রিয় অথবা মুছে ফেলা হয়েছে।</p></div>}
        {profile && <>
          <section className="profile-hero-card">
            <div className="profile-avatar">{avatar ? <img src={avatar} alt={profile.doctor.name} /> : <Stethoscope size={52} />}</div>
            <div className="profile-identity">
              <span className="verified-line"><BadgeCheck size={17} /> ভেরিফায়েড ডাক্তার</span>
              <h1>{profile.doctor.name}</h1>
              <p>{profile.doctor.designation || profile.doctor.professional_title || 'বিশেষজ্ঞ চিকিৎসক'}</p>
              {profile.doctor.degree && <strong>{profile.doctor.degree}</strong>}
              <div className="directory-tags">{profile.specialties.map((specialty) => <span key={specialty.id}>{specialty.name_bn}</span>)}</div>
            </div>
            <div className="profile-actions">
              {profile.doctor.accepting_appointments ? <Link className="profile-book-link" to={`/doctors/${profile.doctor.id}/book`}><CalendarDays size={18} /> অ্যাপয়েন্টমেন্ট নিন</Link> : <button type="button" disabled><CalendarDays size={18} /> অ্যাপয়েন্টমেন্ট বন্ধ</button>}
              {profile.doctor.consultation_fee != null && <span><small>সাধারণ ভিজিট</small><strong>৳{profile.doctor.consultation_fee}</strong></span>}
            </div>
          </section>
          <div className="profile-layout">
            <div>
              <section className="profile-section"><h2>ডাক্তার সম্পর্কে</h2>{profile.doctor.headline && <h3>{profile.doctor.headline}</h3>}<p>{profile.doctor.bio || 'এই ডাক্তার সম্পর্কে বিস্তারিত তথ্য শিগগিরই যোগ হবে।'}</p><div className="profile-facts">{profile.doctor.experience_years != null && <span><Clock3 /> <b>{profile.doctor.experience_years}+ বছর</b> অভিজ্ঞতা</span>}{profile.doctor.languages?.length ? <span><Languages /> ভাষা: <b>{profile.doctor.languages.join(', ')}</b></span> : null}{profile.doctor.bmdc_registration_no && <span><ShieldCheck /> BMDC: <b>{profile.doctor.bmdc_registration_no}</b></span>}</div></section>
              <section className="profile-section"><h2>চেম্বার ও সময়সূচি</h2>{profile.chambers.length ? <div className="chamber-list">{profile.chambers.map((chamber) => <article key={chamber.id}><div className="chamber-title"><span><MapPin /></span><div><h3>{chamber.name_bn}</h3><p>{chamber.address || 'ঠিকানা যোগ করা হয়নি'}</p></div></div><div className="schedule-list">{chamber.schedules.length ? chamber.schedules.map((schedule, index) => <div key={`${schedule.day_of_week}-${schedule.start_time}-${index}`}><span>{days[schedule.day_of_week]}</span><strong>{cleanTime(schedule.start_time)} – {cleanTime(schedule.end_time)}</strong>{schedule.fee != null && <small>৳{schedule.fee}</small>}</div>) : <p>সময়সূচি এখনো যোগ করা হয়নি।</p>}</div>{chamber.phone && <a className="chamber-call" href={`tel:${chamber.phone}`}><Phone size={17} /> {chamber.phone}</a>}</article>)}</div> : <p>অনুমোদিত চেম্বারের তথ্য পাওয়া যায়নি।</p>}</section>
            </div>
            <aside className="profile-safety"><ShieldCheck size={28} /><h3>নিরাপদে সেবা নিন</h3><p>যাওয়ার আগে ফোন করে সময়সূচি ও ভিজিট ফি নিশ্চিত করুন। জরুরি অবস্থায় ৯৯৯-এ কল করুন।</p></aside>
          </div>
        </>}
      </main>
    </div>
  );
}
