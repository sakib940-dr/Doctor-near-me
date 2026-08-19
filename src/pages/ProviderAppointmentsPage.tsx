import { useEffect, useState } from 'react';
import { ArrowLeft, CalendarCheck, CalendarDays, Check, Clock3, LoaderCircle, MapPin, Stethoscope, UserRound, X } from 'lucide-react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getMyAppointments, updateAppointmentStatus } from '../services/appointments';
import type { AppointmentRow, AppointmentStatus } from '../types';

const labels: Record<AppointmentStatus, string> = { pending: 'অপেক্ষমাণ', confirmed: 'নিশ্চিত', rejected: 'প্রত্যাখ্যাত', cancelled: 'বাতিল', completed: 'সম্পন্ন', no_show: 'অনুপস্থিত' };
const tabs: Array<{ value: AppointmentStatus | 'all'; label: string }> = [{ value: 'all', label: 'সব' }, { value: 'pending', label: 'নতুন request' }, { value: 'confirmed', label: 'নিশ্চিত' }, { value: 'completed', label: 'সম্পন্ন' }, { value: 'cancelled', label: 'বাতিল' }];
type Action = { id: string; status: AppointmentStatus };

export default function ProviderAppointmentsPage() {
  const { account } = useAuth();
  const [params, setParams] = useSearchParams();
  const selected = (params.get('status') as AppointmentStatus | null) ?? 'all';
  const [rows, setRows] = useState<AppointmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<Action | null>(null);
  const [working, setWorking] = useState<Action | null>(null);
  const load = () => { setLoading(true); setError(null); getMyAppointments(selected === 'all' ? null : selected).then(setRows).catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : 'Appointment লোড করা যায়নি।')).finally(() => setLoading(false)); };
  useEffect(load, [selected]);
  if (account && !['hospital', 'chamber'].includes(account.role)) return <Navigate to="/dashboard" replace />;

  async function act(id: string, status: AppointmentStatus, confirmation = false) {
    if (confirmation && (confirmAction?.id !== id || confirmAction.status !== status)) { setConfirmAction({ id, status }); return; }
    setWorking({ id, status }); setError(null);
    try { await updateAppointmentStatus(id, status); setConfirmAction(null); load(); }
    catch (actionError) { setError(actionError instanceof Error ? actionError.message : 'Status update করা যায়নি।'); }
    finally { setWorking(null); }
  }

  return <div className="app-shell provider-dashboard-page"><main className="provider-dashboard-main container"><Link className="back-link" to="/dashboard"><ArrowLeft /> Dashboard-এ ফিরুন</Link><div className="provider-page-heading"><span><CalendarDays /></span><div><small>Reception queue</small><h1>Appointment overview</h1><p>আপনার প্রতিষ্ঠানে সংযুক্ত Doctor-দের request এক জায়গা থেকে পরিচালনা করুন।</p></div></div><div className="appointment-tabs">{tabs.map((tab) => <button className={selected === tab.value ? 'active' : ''} key={tab.value} onClick={() => setParams(tab.value === 'all' ? {} : { status: tab.value })}>{tab.label}</button>)}</div>{error && <div className="error-box">{error}</div>}{loading ? <div className="loading-box"><LoaderCircle className="spin" /> Appointment লোড হচ্ছে…</div> : rows.length ? <div className="appointment-list provider-appointment-list">{rows.map((row) => <article key={row.appointment_id}><div className="appointment-date"><CalendarDays /><strong>{new Intl.DateTimeFormat('bn-BD', { dateStyle: 'medium' }).format(new Date(`${row.appointment_date}T12:00:00`))}</strong><span className={`status-${row.status}`}>{labels[row.status]}</span></div><div className="appointment-body"><span className="appointment-doctor-icon"><UserRound /></span><div><h2>{row.patient_name || 'রোগী'}</h2><p><Stethoscope /> {row.doctor_name} • {row.provider_name}</p><div className="appointment-meta">{row.start_time && <span><Clock3 /> {row.start_time.slice(0, 5)}–{row.end_time?.slice(0, 5)}</span>}{row.address && <span><MapPin /> {row.address}</span>}</div></div><div className="appointment-fee"><small>ভিজিট ফি</small><strong>{row.consultation_fee == null ? '—' : `৳${row.consultation_fee}`}</strong></div></div>{row.patient_note && <p className="appointment-note"><strong>রোগীর নোট:</strong> {row.patient_note}</p>}{row.status === 'pending' && <div className="doctor-appointment-actions"><button className="positive" disabled={Boolean(working)} onClick={() => void act(row.appointment_id, 'confirmed')}><Check /> Confirm</button><button className={confirmAction?.id === row.appointment_id ? 'danger confirming' : 'danger'} disabled={Boolean(working)} onClick={() => void act(row.appointment_id, 'rejected', true)}><X /> {confirmAction?.id === row.appointment_id ? 'নিশ্চিত করুন' : 'Reject'}</button>{confirmAction?.id === row.appointment_id && <button onClick={() => setConfirmAction(null)}>ফিরে যান</button>}</div>}{row.status === 'confirmed' && <div className="doctor-appointment-actions"><button className="positive" disabled={Boolean(working)} onClick={() => void act(row.appointment_id, 'completed')}><CalendarCheck /> সম্পন্ন</button><button disabled={Boolean(working)} onClick={() => void act(row.appointment_id, 'no_show')}>অনুপস্থিত</button><button className={confirmAction?.id === row.appointment_id ? 'danger confirming' : 'danger'} disabled={Boolean(working)} onClick={() => void act(row.appointment_id, 'cancelled', true)}><X /> {confirmAction?.id === row.appointment_id ? 'নিশ্চিত করুন' : 'বাতিল'}</button>{confirmAction?.id === row.appointment_id && <button onClick={() => setConfirmAction(null)}>ফিরে যান</button>}</div>}</article>)}</div> : <div className="empty-state"><span>📅</span><h3>এই status-এ কোনো appointment নেই</h3><p>Patient request এলে এখানে দেখা যাবে।</p></div>}</main></div>;
}
