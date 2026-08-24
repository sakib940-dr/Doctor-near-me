import { useEffect, useState } from 'react';
import { CalendarCheck, CalendarDays, Check, Clock3, LoaderCircle, Phone, UserRound, X } from 'lucide-react';
import { getMyProviderReceptionAppointments, updateProviderReceptionAppointment } from '../../../services/providerReception';
import type { AppointmentStatus, ProviderReceptionAppointment } from '../../../types';
import { HospitalPageHeader } from '../HospitalShell';
import { bi, useHospitalLanguage } from '../i18n';
import { useHospital } from '../useHospital';

const statuses: Array<AppointmentStatus | 'all'> = ['all','pending','confirmed','completed','cancelled'];

export default function HospitalAppointmentsPage() {
  const { text } = useHospitalLanguage();
  const { provider } = useHospital();
  const [selected, setSelected] = useState<AppointmentStatus | 'all'>('all');
  const [rows, setRows] = useState<ProviderReceptionAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [serials, setSerials] = useState<Record<string,string>>({});

  async function load() {
    if (!provider) return;
    setLoading(true); setError(null);
    try {
      const result = await getMyProviderReceptionAppointments(selected === 'all' ? null : selected);
      setRows(result.filter((row) => row.provider_id === provider.id));
    } catch (reason) { setError(reason instanceof Error ? reason.message : text(bi('অ্যাপয়েন্টমেন্ট লোড করা যায়নি।', 'Appointments could not be loaded.'))); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [provider?.id, selected]);

  async function update(row: ProviderReceptionAppointment, status: AppointmentStatus) {
    setWorking(row.appointment_id); setError(null);
    try {
      await updateProviderReceptionAppointment({ appointmentId: row.appointment_id, status, serialNumber: status === 'confirmed' && serials[row.appointment_id] ? Number(serials[row.appointment_id]) : null });
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : text(bi('অ্যাপয়েন্টমেন্ট আপডেট করা যায়নি।', 'Appointment could not be updated.'))); }
    finally { setWorking(''); }
  }

  return <>
    <HospitalPageHeader eyebrow={bi('রিসেপশন কিউ', 'Reception Queue')} title={bi('হাসপাতাল অ্যাপয়েন্টমেন্ট', 'Hospital Appointments')} description={bi('হাসপাতাল নিয়ন্ত্রিত ডাক্তার প্রোফাইলের অনুরোধ এখানে গ্রহণ ও পরিচালনা করুন।', 'Receive and manage requests from Hospital-controlled Doctor profiles.')} />
    <div className="hospital-panel">
      <div className="appointment-tabs">{statuses.map((status) => <button type="button" key={status} className={selected === status ? 'active' : ''} onClick={() => setSelected(status)}>{text(({all:bi('সব','All'),pending:bi('অপেক্ষমাণ','Pending'),confirmed:bi('নিশ্চিত','Confirmed'),completed:bi('সম্পন্ন','Completed'),cancelled:bi('বাতিল','Cancelled'),rejected:bi('প্রত্যাখ্যাত','Rejected'),no_show:bi('অনুপস্থিত','No show')} as const)[status])}</button>)}</div>
      {error && <div className="hospital-error">{error}</div>}
      {loading ? <div className="hospital-empty"><LoaderCircle className="spin" /> {text(bi('রিসেপশন অনুরোধ লোড হচ্ছে…', 'Loading reception requests…'))}</div> : <div className="hospital-doctor-list">
        {rows.map((row) => <article className="hospital-panel" key={row.appointment_id}>
          <div className="hospital-panel-title"><div><span className={`hospital-status-pill ${row.status}`}>{row.status}</span><h2>{row.patient_name || text(bi('রোগী', 'Patient'))}</h2><p><UserRound size={16} /> {row.doctor_name}</p></div><strong><CalendarDays size={18} /> {row.appointment_date}</strong></div>
          <div className="hospital-form-grid"><p><Clock3 size={16} /> {text(bi('পছন্দের সময়:', 'Preferred:'))} {row.preferred_time?.slice(0,5) || text(bi('যেকোনো সময়', 'Any time'))}</p><p><Phone size={16} /> {row.patient_phone || text(bi('ফোন নেই', 'No phone'))}</p></div>
          {row.patient_note && <p>{row.patient_note}</p>}
          {row.status === 'pending' && <div className="hospital-doctor-card-actions">
            <input aria-label={text(bi('সিরিয়াল নম্বর', 'Serial number'))} type="number" min={1} placeholder={text(bi('অটো সিরিয়াল', 'Auto serial'))} value={serials[row.appointment_id] || ''} onChange={(event) => setSerials((current) => ({ ...current, [row.appointment_id]: event.target.value }))} />
            <button type="button" disabled={working === row.appointment_id} onClick={() => void update(row,'confirmed')}><Check /></button>
            <button className="danger" type="button" disabled={working === row.appointment_id} onClick={() => void update(row,'rejected')}><X /></button>
          </div>}
          {row.status === 'confirmed' && <div className="hospital-doctor-card-actions"><button type="button" onClick={() => void update(row,'completed')}><CalendarCheck /></button><button className="danger" type="button" onClick={() => void update(row,'cancelled')}><X /></button></div>}
        </article>)}
        {!rows.length && <div className="hospital-empty">{text(bi('এই স্ট্যাটাসে কোনো রিসেপশন অ্যাপয়েন্টমেন্ট নেই।', 'No reception appointment found in this status.'))}</div>}
      </div>}
    </div>
  </>;
}
