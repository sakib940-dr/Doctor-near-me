import { useEffect, useState } from 'react';
import { CalendarCheck, CalendarDays, Check, Clock3, LoaderCircle, Phone, UserRound, X } from 'lucide-react';
import { getMyProviderReceptionAppointments, updateProviderReceptionAppointment } from '../../../services/providerReception';
import type { AppointmentStatus, ProviderReceptionAppointment } from '../../../types';
import { HospitalPageHeader } from '../HospitalShell';
import { useHospital } from '../useHospital';

const statuses: Array<AppointmentStatus | 'all'> = ['all','pending','confirmed','completed','cancelled'];

export default function HospitalAppointmentsPage() {
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
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Appointments could not be loaded.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [provider?.id, selected]);

  async function update(row: ProviderReceptionAppointment, status: AppointmentStatus) {
    setWorking(row.appointment_id); setError(null);
    try {
      await updateProviderReceptionAppointment({ appointmentId: row.appointment_id, status, serialNumber: status === 'confirmed' && serials[row.appointment_id] ? Number(serials[row.appointment_id]) : null });
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Appointment could not be updated.'); }
    finally { setWorking(''); }
  }

  return <>
    <HospitalPageHeader eyebrow="Reception Queue" title="Hospital Appointments" description="Requests from Hospital-controlled doctor profiles. This queue does not use Doctor accounts or the canonical Doctor appointment backend." />
    <div className="hospital-panel">
      <div className="appointment-tabs">{statuses.map((status) => <button type="button" key={status} className={selected === status ? 'active' : ''} onClick={() => setSelected(status)}>{status}</button>)}</div>
      {error && <div className="hospital-error">{error}</div>}
      {loading ? <div className="hospital-empty"><LoaderCircle className="spin" /> Loading reception requests…</div> : <div className="hospital-doctor-list">
        {rows.map((row) => <article className="hospital-panel" key={row.appointment_id}>
          <div className="hospital-panel-title"><div><span className={`hospital-status-pill ${row.status}`}>{row.status}</span><h2>{row.patient_name || 'Patient'}</h2><p><UserRound size={16} /> {row.doctor_name}</p></div><strong><CalendarDays size={18} /> {row.appointment_date}</strong></div>
          <div className="hospital-form-grid"><p><Clock3 size={16} /> Preferred: {row.preferred_time?.slice(0,5) || 'Any time'}</p><p><Phone size={16} /> {row.patient_phone || 'No phone'}</p></div>
          {row.patient_note && <p>{row.patient_note}</p>}
          {row.status === 'pending' && <div className="hospital-doctor-card-actions">
            <input aria-label="Serial number" type="number" min={1} placeholder="Auto serial" value={serials[row.appointment_id] || ''} onChange={(event) => setSerials((current) => ({ ...current, [row.appointment_id]: event.target.value }))} />
            <button type="button" disabled={working === row.appointment_id} onClick={() => void update(row,'confirmed')}><Check /></button>
            <button className="danger" type="button" disabled={working === row.appointment_id} onClick={() => void update(row,'rejected')}><X /></button>
          </div>}
          {row.status === 'confirmed' && <div className="hospital-doctor-card-actions"><button type="button" onClick={() => void update(row,'completed')}><CalendarCheck /></button><button className="danger" type="button" onClick={() => void update(row,'cancelled')}><X /></button></div>}
        </article>)}
        {!rows.length && <div className="hospital-empty">No reception appointment found in this status.</div>}
      </div>}
    </div>
  </>;
}
