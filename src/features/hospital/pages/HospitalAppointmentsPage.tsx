import { useEffect, useState } from 'react';
import { CalendarCheck, CalendarDays, Check, Clock3, LoaderCircle, Phone, UserRound, X } from 'lucide-react';
import { getMyProviderReceptionAppointments, updateProviderReceptionAppointment } from '../../../services/providerReception';
import type { AppointmentStatus, ProviderReceptionAppointment } from '../../../types';
import { HospitalPageHeader } from '../HospitalShell';
import { bi, useHospitalLanguage } from '../i18n';
import { useHospital } from '../useHospital';

type QueueFilter = 'today' | 'upcoming' | 'all' | 'accepted' | 'rejected';
const filters: QueueFilter[] = ['today','upcoming','all','accepted','rejected'];
const dateKey = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);

export default function HospitalAppointmentsPage() {
  const { text } = useHospitalLanguage();
  const { provider } = useHospital();
  const [selected, setSelected] = useState<QueueFilter>('today');
  const [rows, setRows] = useState<ProviderReceptionAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [serials, setSerials] = useState<Record<string,string>>({});

  async function load() {
    if (!provider) return;
    setLoading(true); setError(null);
    try {
      const result = await getMyProviderReceptionAppointments(null);
      setRows(result.filter((row) => row.provider_id === provider.id));
    } catch (reason) { setError(reason instanceof Error ? reason.message : text(bi('অ্যাপয়েন্টমেন্ট লোড করা যায়নি।', 'Appointments could not be loaded.'))); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [provider?.id]);

  async function update(row: ProviderReceptionAppointment, status: AppointmentStatus) {
    setWorking(row.appointment_id); setError(null);
    try {
      await updateProviderReceptionAppointment({ appointmentId: row.appointment_id, status, serialNumber: status === 'confirmed' && serials[row.appointment_id] ? Number(serials[row.appointment_id]) : null });
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : text(bi('অ্যাপয়েন্টমেন্ট আপডেট করা যায়নি।', 'Appointment could not be updated.'))); }
    finally { setWorking(''); }
  }

  const today = dateKey();
  const visibleRows = rows.filter((row) => {
    if (selected === 'today') return row.appointment_date === today;
    if (selected === 'upcoming') return row.appointment_date > today && !['completed','cancelled','rejected','no_show'].includes(row.status);
    if (selected === 'accepted') return row.status === 'confirmed';
    if (selected === 'rejected') return row.status === 'rejected';
    return true;
  });
  const filterLabels = {
    today: bi('আজ', 'Today'), upcoming: bi('আসন্ন', 'Upcoming'), all: bi('সব', 'All'),
    accepted: bi('গৃহীত', 'Accepted'), rejected: bi('প্রত্যাখ্যাত', 'Rejected'),
  };
  const statusLabel = (status: AppointmentStatus) => text(({
    pending: bi('অপেক্ষমাণ','Pending'), confirmed: bi('গৃহীত','Accepted'), completed: bi('সম্পন্ন','Completed'),
    cancelled: bi('বাতিল','Cancelled'), rejected: bi('প্রত্যাখ্যাত','Rejected'), no_show: bi('অনুপস্থিত','No show'),
  } as const)[status]);

  return <>
    <HospitalPageHeader eyebrow={bi('রিসেপশন কিউ', 'Reception Queue')} title={bi('হাসপাতাল অ্যাপয়েন্টমেন্ট', 'Hospital Appointments')} description={bi('হাসপাতাল নিয়ন্ত্রিত ডাক্তার প্রোফাইলের অনুরোধ এখানে গ্রহণ ও পরিচালনা করুন।', 'Receive and manage requests from Hospital-controlled Doctor profiles.')} />
    <div className="hospital-panel">
      <div className="appointment-tabs hospital-appointment-tabs">{filters.map((filter) => <button type="button" key={filter} className={selected === filter ? 'active' : ''} onClick={() => setSelected(filter)}>{text(filterLabels[filter])}</button>)}</div>
      {error && <div className="hospital-error">{error}</div>}
      {loading ? <div className="hospital-empty"><LoaderCircle className="spin" /> {text(bi('রিসেপশন অনুরোধ লোড হচ্ছে…', 'Loading reception requests…'))}</div> : <div className="hospital-doctor-list">
        {visibleRows.map((row) => <article className="hospital-appointment-card" key={row.appointment_id}>
          <div className="hospital-panel-title"><div><span className={`hospital-status-pill ${row.status}`}>{statusLabel(row.status)}</span><h2>{row.patient_name || text(bi('রোগী', 'Patient'))}</h2><p><UserRound size={16} /> {row.doctor_name}</p></div><strong><CalendarDays size={18} /> {row.appointment_date}</strong></div>
          <div className="hospital-form-grid"><p><Clock3 size={16} /> {text(bi('পছন্দের সময়:', 'Preferred:'))} {row.preferred_time?.slice(0,5) || text(bi('যেকোনো সময়', 'Any time'))}</p><p><Phone size={16} /> {row.patient_phone || text(bi('ফোন নেই', 'No phone'))}</p></div>
          {row.patient_note && <p>{row.patient_note}</p>}
          {row.status === 'pending' && <div className="hospital-appointment-actions">
            <input aria-label={text(bi('সিরিয়াল নম্বর', 'Serial number'))} type="number" min={1} placeholder={text(bi('অটো সিরিয়াল', 'Auto serial'))} value={serials[row.appointment_id] || ''} onChange={(event) => setSerials((current) => ({ ...current, [row.appointment_id]: event.target.value }))} />
            <button className="accept" type="button" disabled={working === row.appointment_id} onClick={() => void update(row,'confirmed')}><Check /> {text(bi('গ্রহণ করুন', 'Accept'))}</button>
            <button className="reject" type="button" disabled={working === row.appointment_id} onClick={() => void update(row,'rejected')}><X /> {text(bi('প্রত্যাখ্যান', 'Reject'))}</button>
          </div>}
          {row.status === 'confirmed' && <div className="hospital-appointment-actions compact"><button className="accept" type="button" onClick={() => void update(row,'completed')}><CalendarCheck /> {text(bi('সম্পন্ন', 'Complete'))}</button><button className="reject" type="button" onClick={() => void update(row,'cancelled')}><X /> {text(bi('বাতিল', 'Cancel'))}</button></div>}
        </article>)}
        {!visibleRows.length && <div className="hospital-empty">{text(bi('এই তালিকায় কোনো রিসেপশন অ্যাপয়েন্টমেন্ট নেই।', 'No reception appointment found in this list.'))}</div>}
      </div>}
    </div>
  </>;
}
