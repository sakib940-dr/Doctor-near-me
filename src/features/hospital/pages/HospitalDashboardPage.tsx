import { useEffect, useState } from 'react';
import { BarChart3, Building2, CalendarDays, GalleryHorizontal, Image, Settings, Stethoscope, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getMyProviderReceptionAppointments } from '../../../services/providerReception';
import { HospitalPageHeader } from '../HospitalShell';
import { bi, useHospitalLanguage } from '../i18n';
import { getMyHospitalDoctors } from '../services/hospitalDoctors';
import { getMyHospitalStaff } from '../services/hospitalStaff';
import { useHospital } from '../useHospital';

export default function HospitalDashboardPage() {
  const { text } = useHospitalLanguage();
  const { provider, loading, error } = useHospital();
  const [counts, setCounts] = useState({ doctors: 0, pending: 0, staff: 0 });
  useEffect(() => {
    if (!provider) return;
    Promise.all([
      getMyHospitalDoctors(provider.id),
      getMyProviderReceptionAppointments('pending'),
      getMyHospitalStaff(provider.id),
    ]).then(([doctors, appointments, staff]) => setCounts({
      doctors: doctors.filter((row) => !row.archived_at).length,
      pending: appointments.filter((row) => row.provider_id === provider.id).length,
      staff: staff.filter((row) => row.is_active).length,
    })).catch(() => undefined);
  }, [provider]);

  if (loading) return <div className="hospital-empty">{text(bi('হাসপাতাল ড্যাশবোর্ড লোড হচ্ছে…', 'Hospital dashboard loading…'))}</div>;
  if (error || !provider) return <div className="hospital-error">{error || text(bi('আগে হাসপাতাল প্রোফাইল তৈরি করুন।', 'Create your Hospital profile first.'))}</div>;

  const actions = [
    { icon: Stethoscope, title: bi('ডাক্তার ম্যানেজ করুন', 'Manage Doctors'), detail: bi('ডাক্তার যোগ, সম্পাদনা ও দৃশ্যমানতা নিয়ন্ত্রণ', 'Add, edit and control visibility'), path: '/hospital-console/doctors' },
    { icon: CalendarDays, title: bi('রিসেপশন অ্যাপয়েন্টমেন্ট', 'Reception Appointments'), detail: bi('অনুরোধ দেখুন ও সিরিয়াল দিন', 'Review requests and assign serials'), path: '/hospital-console/appointments' },
    { icon: GalleryHorizontal, title: bi('টপ গ্যালারি', 'Top Gallery'), detail: bi('সর্বোচ্চ চারটি প্রিমিয়াম ছবি পরিচালনা করুন', 'Manage up to four premium images'), path: '/hospital-console/gallery' },
    { icon: Building2, title: bi('হাসপাতালের তথ্য', 'Hospital Information'), detail: bi('যোগাযোগ, লোকেশন ও পাবলিক তথ্য', 'Contact, location and public information'), path: '/hospital-console/information' },
    { icon: BarChart3, title: bi('প্রোফাইল অ্যানালিটিক্স', 'Profile Analytics'), detail: bi('ভিউ, কল ও অ্যাপয়েন্টমেন্ট দেখুন', 'Track views, calls and appointments'), path: '/hospital-console/analytics' },
    { icon: Settings, title: bi('রিসেপশন সেটিংস', 'Reception Settings'), detail: bi('ডিফল্ট ফোন ও WhatsApp যোগাযোগ', 'Default phone and WhatsApp contact'), path: '/hospital-console/reception' },
  ];

  return <>
    <HospitalPageHeader eyebrow={bi('স্বতন্ত্র হাসপাতাল সিস্টেম', 'Independent Hospital System')} title={provider.name_bn} description={bi('ডাক্তার, রিসেপশন অ্যাপয়েন্টমেন্ট ও পাবলিক কনটেন্ট—সবকিছু হাসপাতাল থেকেই পরিচালনা করুন।', 'Manage doctors, reception appointments and public content directly from your Hospital.')} action={<Link to={`/hospital/${provider.id}`} target="_blank">{text(bi('পাবলিক প্রোফাইল দেখুন', 'View public profile'))}</Link>} />
    <section className="hospital-grid hospital-stat-grid">
      <article className="hospital-stat"><span><Stethoscope /></span><strong>{counts.doctors}</strong><small>{text(bi('হাসপাতালের ডাক্তার', 'Hospital doctors'))}</small></article>
      <article className="hospital-stat"><span><CalendarDays /></span><strong>{counts.pending}</strong><small>{text(bi('অপেক্ষমাণ অনুরোধ', 'Pending requests'))}</small></article>
      <article className="hospital-stat"><span><Users /></span><strong>{counts.staff}</strong><small>{text(bi('সক্রিয় স্টাফ', 'Active staff'))}</small></article>
      <article className="hospital-stat"><span><Image /></span><strong>{provider.gallery_paths?.length || 0}</strong><small>{text(bi('প্রোফাইল ছবি', 'Profile images'))}</small></article>
    </section>
    <section className="hospital-grid hospital-action-grid">{actions.map(({ icon: Icon, title, detail, path }) => <Link className="hospital-action-card" to={path} key={path}><span><Icon /></span><div><strong>{text(title)}</strong><small>{text(detail)}</small></div></Link>)}</section>
  </>;
}
