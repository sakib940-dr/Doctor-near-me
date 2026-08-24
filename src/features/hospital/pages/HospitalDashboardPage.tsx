import { useEffect, useState } from 'react';
import { CalendarClock, CalendarDays, CheckCircle2, Stethoscope, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getMyProviderReceptionAppointments } from '../../../services/providerReception';
import { providerSlider } from '../../../services/providerWebsiteContent';
import { HospitalPageHeader } from '../HospitalShell';
import { bi, useHospitalLanguage } from '../i18n';
import { getMyHospitalDoctors } from '../services/hospitalDoctors';
import { getMyHospitalStaff } from '../services/hospitalStaff';
import { useHospital } from '../useHospital';

export default function HospitalDashboardPage() {
  const { text } = useHospitalLanguage();
  const { provider, loading, error } = useHospital();
  const [counts, setCounts] = useState({ doctors: 0, today: 0, upcoming: 0, staff: 0, gallery: 0 });
  useEffect(() => {
    if (!provider) return;
    Promise.all([
      getMyHospitalDoctors(provider.id),
      getMyProviderReceptionAppointments(null),
      getMyHospitalStaff(provider.id),
      providerSlider.getAll(provider.id),
    ]).then(([doctors, appointments, staff, gallery]) => {
      const now = new Date();
      const today = new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
      const mine = appointments.filter((row) => row.provider_id === provider.id);
      setCounts({
      doctors: doctors.filter((row) => !row.archived_at).length,
      today: mine.filter((row) => row.appointment_date === today && !['cancelled','rejected'].includes(row.status)).length,
      upcoming: mine.filter((row) => row.appointment_date > today && !['cancelled','rejected','completed','no_show'].includes(row.status)).length,
      staff: staff.filter((row) => row.is_active).length,
      gallery: gallery.length,
    }); }).catch(() => undefined);
  }, [provider]);

  if (loading) return <div className="hospital-empty">{text(bi('হাসপাতাল ড্যাশবোর্ড লোড হচ্ছে…', 'Hospital dashboard loading…'))}</div>;
  if (error || !provider) return <div className="hospital-error">{error || text(bi('আগে হাসপাতাল প্রোফাইল তৈরি করুন।', 'Create your Hospital profile first.'))}</div>;

  return <>
    <HospitalPageHeader eyebrow={bi('স্বতন্ত্র হাসপাতাল সিস্টেম', 'Independent Hospital System')} title={provider.name_bn} description={bi('আজকের reception activity, directory readiness এবং Hospital profile setup এক নজরে দেখুন।', 'Review today’s reception activity, directory readiness and Hospital profile setup at a glance.')} action={<Link to="/hospital-console/onboarding"><CheckCircle2 /> {text(bi('Onboarding চালিয়ে যান', 'Continue onboarding'))}</Link>} />
    <section className="hospital-grid hospital-stat-grid">
      <article className="hospital-stat"><span><Stethoscope /></span><strong>{counts.doctors}</strong><small>{text(bi('হাসপাতালের ডাক্তার', 'Hospital doctors'))}</small></article>
      <article className="hospital-stat"><span><CalendarDays /></span><strong>{counts.today}</strong><small>{text(bi('আজকের অ্যাপয়েন্টমেন্ট', 'Today’s appointments'))}</small></article>
      <article className="hospital-stat"><span><CalendarClock /></span><strong>{counts.upcoming}</strong><small>{text(bi('আসন্ন অ্যাপয়েন্টমেন্ট', 'Upcoming appointments'))}</small></article>
      <article className="hospital-stat"><span><Users /></span><strong>{counts.staff}</strong><small>{text(bi('সক্রিয় স্টাফ', 'Active staff'))}</small></article>
    </section>
    <section className="hospital-panel hospital-dashboard-readiness"><div><span><CheckCircle2 /></span><div><h2>{text(bi('পাবলিক প্রোফাইল প্রস্তুতি', 'Public profile readiness'))}</h2><p>{counts.gallery}/4 {text(bi('টি slider ছবি আপলোড হয়েছে। বাকি setup Onboarding থেকে সম্পূর্ণ করুন।', 'slider images uploaded. Complete the remaining setup from Onboarding.'))}</p></div></div><progress max={4} value={counts.gallery} /></section>
  </>;
}
