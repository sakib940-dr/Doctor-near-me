import { useEffect, useState } from 'react';
import { BarChart3, Building2, CalendarDays, GalleryHorizontal, Image, Settings, Stethoscope, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getMyProviderReceptionAppointments } from '../../../services/providerReception';
import { HospitalPageHeader } from '../HospitalShell';
import { getMyHospitalDoctors } from '../services/hospitalDoctors';
import { getMyHospitalStaff } from '../services/hospitalStaff';
import { useHospital } from '../useHospital';

export default function HospitalDashboardPage() {
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

  if (loading) return <div className="hospital-empty">Hospital dashboard loading…</div>;
  if (error || !provider) return <div className="hospital-error">{error || 'Create your Hospital profile first.'}</div>;

  const actions = [
    { icon: Stethoscope, title: 'Manage Doctors', detail: 'Add, edit, archive and control visibility', path: '/hospital-console/doctors' },
    { icon: CalendarDays, title: 'Reception Appointments', detail: 'Review requests and assign serials', path: '/hospital-console/appointments' },
    { icon: GalleryHorizontal, title: 'Top Gallery', detail: 'Manage up to four premium images', path: '/hospital-console/gallery' },
    { icon: Building2, title: 'Hospital Information', detail: 'Contact, location and public information', path: '/hospital-console/information' },
    { icon: BarChart3, title: 'Profile Analytics', detail: 'Views, calls, followers and appointments', path: '/hospital-console/analytics' },
    { icon: Settings, title: 'Reception Settings', detail: 'Default phone and WhatsApp contact', path: '/hospital-console/reception' },
  ];

  return <>
    <HospitalPageHeader eyebrow="Independent Hospital System" title={provider.name_bn} description="Doctors, reception appointments and public Hospital content—managed without any Doctor account dependency." action={<Link to={`/hospital/${provider.id}`} target="_blank">View public profile</Link>} />
    <section className="hospital-grid hospital-stat-grid">
      <article className="hospital-stat"><span><Stethoscope /></span><strong>{counts.doctors}</strong><small>Hospital doctors</small></article>
      <article className="hospital-stat"><span><CalendarDays /></span><strong>{counts.pending}</strong><small>Pending requests</small></article>
      <article className="hospital-stat"><span><Users /></span><strong>{counts.staff}</strong><small>Active staff</small></article>
      <article className="hospital-stat"><span><Image /></span><strong>{provider.gallery_paths?.length || 0}</strong><small>Profile images</small></article>
    </section>
    <section className="hospital-grid hospital-action-grid">{actions.map(({ icon: Icon, title, detail, path }) => <Link className="hospital-action-card" to={path} key={path}><span><Icon /></span><div><strong>{title}</strong><small>{detail}</small></div></Link>)}</section>
  </>;
}
