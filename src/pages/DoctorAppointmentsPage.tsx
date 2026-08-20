import { useEffect, useState } from 'react';
import { ArrowLeft, CalendarCheck, CalendarDays, Check, Clock3, FileText, LoaderCircle, MapPin, UserRound, X } from 'lucide-react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getMyAppointments, updateAppointmentStatus } from '../services/appointments';
import type { AppointmentRow, AppointmentStatus } from '../types';

const labels: Record<AppointmentStatus, string> = { pending: 'অপেক্ষমাণ', confirmed: 'নিশ্চিত', rejected: 'প্রত্যাখ্যাত', cancelled: 'বাতিল', completed: 'সম্পন্ন', no_show: 'অনুপস্থিত' };
const tabs: Array<{ value: AppointmentStatus | 'all'; label: string }> = [{ value: 'all', label: 'সব' }, { value: 'pending', label: 'নতুন request' }, { value: 'confirmed', label: 'নিশ্চিত' }, { value: 'completed', label: 'সম্পন্ন' }, { value: 'cancelled', label: 'বাতিল' }];
type Action = { id: string; status: AppointmentStatus };
const APPOINTMENT_PAGE_SIZE = 30;

export default function DoctorAppointmentsPage() {
  const { account } = useAuth();
  const [params, setParams] = useSearchParams();
  const selected = (params.get('status') as AppointmentStatus | null) ?? 'all';
  const [rows, setRows] = useState<AppointmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<Action | null>(null);
  const [working, setWorking] = useState<Action | null>(null);

  const load = () => { setLoading(true); setError(null); getMyAppointments(selected === 'all' ? null : selected, APPOINTMENT_PAGE_SIZE, 0).then((page) => { setRows(page); setHasMore(page.length === APPOINTMENT_PAGE_SIZE); }).catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : 'Appointment লোড করা যায়নি।')).finally(() => setLoading(false)); };
  useEffect(load, [selected]);
  if (account && account.role !== 'doctor') return <Navigate to="/dashboard" replace />;

  async function act(id: string, status: AppointmentStatus, needsConfirmation = false) {
    if (needsConfirmation && (confirmAction?.id !== id || confirmAction.status !== status)) { setConfirmAction({ id, status }); return; }
    setWorking({ id, status }); setError(null);
    try { await updateAppointmentStatus(id, status); setConfirmAction(null); load(); }
    catch (actionError) { setError(actionError instanceof Error ? actionError.message : 'Status update করা যায়নি।'); }
    finally { setWorking(null); }
  }

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const page = await getMyAppointments(selected === 'all' ? null : selected, APPOINTMENT_PAGE_SIZE, rows.length);
      setRows((current) => [...current, ...page.filter((item) => !current.some((existing) => existing.appointment_id === item.appointment_id))]);
      setHasMore(page.length === APPOINTMENT_PAGE_SIZE);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'আরও appointment লোড করা যায়নি।');
    } finally { setLoadingMore(false); }
  }

  const busy = (id: string, status: AppointmentStatus) => working?.id === id && working.status === status;

  return <div className="app-shell doctor-dashboard-page"><main className="doctor-dashboard-main container"><Link className="back-link" to="/dashboard"><ArrowLeft /> Dashboard-এ ফিরুন</Link><div className="appointments-heading doctor-appointments-heading"><div><span>Doctor queue</span><h1>রোগীর অ্যাপয়েন্টমেন্ট</h1><p>Request confirm করুন এবং consultation-এর পর final status দিন।</p></div></div><div className="appointment-tabs">{tabs.map((tab) => <button className={selected === tab.value ? 'active' : ''} key={tab.value} type="button" onClick={() => setParams(tab.value === 'all' ? {} : { status: tab.value })}>{tab.label}</button>)}</div>{error && <div className="error-box" role="alert">{error}</div>}{loading ? <div className="loading-box"><LoaderCircle className="spin" /> Appointment লোড হচ্ছে…</div> : rows.length ? <><div className="appointment-list doctor-appointment-list">{rows.map((appointment) => <article key={appointment.appointment_id}><div className="appointment-date"><CalendarDays /><strong>{new Intl.DateTimeFormat('bn-BD', { dateStyle: 'medium' }).format(new Date(`${appointment.appointment_date}T12:00:00`))}</strong><span className={`status-${appointment.status}`}>{labels[appointment.status]}</span></div><div className="appointment-body"><span className="appointment-doctor-icon"><UserRound /></span><div><h2>{appointment.patient_name || 'রোগী'}</h2><p>{appointment.provider_name || 'চেম্বার নির্ধারিত নয়'}</p><div className="appointment-meta">{appointment.start_time && <span><Clock3 /> {appointment.start_time.slice(0, 5)} – {appointment.end_time?.slice(0, 5)}</span>}{appointment.address && <span><MapPin /> {appointment.address}</span>}</div></div><div className="appointment-fee"><small>ভিজিট ফি</small><strong>{appointment.consultation_fee == null ? '—' : `৳${appointment.consultation_fee}`}</strong></div></div>{appointment.patient_note && <p className="appointment-note"><strong>রোগীর নোট:</strong> {appointment.patient_note}</p>}{appointment.status === 'pending' && <div className="doctor-appointment-actions"><button className="positive" type="button" disabled={Boolean(working)} onClick={() => void act(appointment.appointment_id, 'confirmed')}><Check /> {busy(appointment.appointment_id, 'confirmed') ? 'Updating…' : 'Confirm'}</button><button className={confirmAction?.id === appointment.appointment_id && confirmAction.status === 'rejected' ? 'danger confirming' : 'danger'} type="button" disabled={Boolean(working)} onClick={() => void act(appointment.appointment_id, 'rejected', true)}><X /> {confirmAction?.id === appointment.appointment_id && confirmAction.status === 'rejected' ? 'নিশ্চিত করুন' : 'Reject'}</button>{confirmAction?.id === appointment.appointment_id && <button type="button" onClick={() => setConfirmAction(null)}>ফিরে যান</button>}</div>}{appointment.status === 'confirmed' && <div className="doctor-appointment-actions"><Link className="rx-appointment-prescription-link" to={`/doctor/prescriptions?appointment=${appointment.appointment_id}`}><FileText /> Prescription</Link><button className="positive" type="button" disabled={Boolean(working)} onClick={() => void act(appointment.appointment_id, 'completed')}><CalendarCheck /> সম্পন্ন</button><button type="button" disabled={Boolean(working)} onClick={() => void act(appointment.appointment_id, 'no_show')}>অনুপস্থিত</button><button className={confirmAction?.id === appointment.appointment_id && confirmAction.status === 'cancelled' ? 'danger confirming' : 'danger'} type="button" disabled={Boolean(working)} onClick={() => void act(appointment.appointment_id, 'cancelled', true)}><X /> {confirmAction?.id === appointment.appointment_id && confirmAction.status === 'cancelled' ? 'নিশ্চিত করুন' : 'বাতিল'}</button>{confirmAction?.id === appointment.appointment_id && <button type="button" onClick={() => setConfirmAction(null)}>ফিরে যান</button>}</div>}{appointment.status === 'completed' && <div className="doctor-appointment-actions"><Link className="rx-appointment-prescription-link" to={`/doctor/prescriptions?appointment=${appointment.appointment_id}`}><FileText /> Prescription</Link></div>}</article>)}</div>{hasMore && <div className="public-load-more-wrap"><button className="public-load-more-button" type="button" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? <><LoaderCircle className="spin" /> লোড হচ্ছে…</> : 'আরও দেখুন'}</button></div>}</> : <div className="empty-state"><span>📅</span><h3>এই status-এ কোনো appointment নেই</h3><p>নতুন request এলে এখানে দেখা যাবে।</p></div>}</main></div>;
}
