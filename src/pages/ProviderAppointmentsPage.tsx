import { useEffect, useState } from 'react';
import { ArrowLeft, CalendarCheck, CalendarDays, Check, Clock3, LoaderCircle, MapPin, Stethoscope, UserRound, X } from 'lucide-react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getMyAppointments, updateAppointmentStatus } from '../services/appointments';
import { getMyProviderReceptionAppointments, updateProviderReceptionAppointment } from '../services/providerReception';
import type { AppointmentRow, AppointmentStatus, ProviderReceptionAppointment } from '../types';

const labels: Record<AppointmentStatus, string> = { pending: 'অপেক্ষমাণ', confirmed: 'নিশ্চিত', rejected: 'প্রত্যাখ্যাত', cancelled: 'বাতিল', completed: 'সম্পন্ন', no_show: 'অনুপস্থিত' };
const tabs: Array<{ value: AppointmentStatus | 'all'; label: string }> = [{ value: 'all', label: 'সব' }, { value: 'pending', label: 'নতুন request' }, { value: 'confirmed', label: 'নিশ্চিত' }, { value: 'completed', label: 'সম্পন্ন' }, { value: 'cancelled', label: 'বাতিল' }];
type Action = { id: string; status: AppointmentStatus };
const APPOINTMENT_PAGE_SIZE = 30;

export default function ProviderAppointmentsPage() {
  const { account } = useAuth();
  const [params, setParams] = useSearchParams();
  const selected = (params.get('status') as AppointmentStatus | null) ?? 'all';
  const [rows, setRows] = useState<AppointmentRow[]>([]);
  const [receptionRows, setReceptionRows] = useState<ProviderReceptionAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<Action | null>(null);
  const [working, setWorking] = useState<Action | null>(null);
  const [receptionWorking, setReceptionWorking] = useState<string | null>(null);
  const [serials, setSerials] = useState<Record<string, string>>({});
  const load = () => { setLoading(true); setError(null); Promise.all([getMyAppointments(selected === 'all' ? null : selected, APPOINTMENT_PAGE_SIZE, 0), getMyProviderReceptionAppointments(selected === 'all' ? null : selected)]).then(([page, reception]) => { setRows(page); setReceptionRows(reception); setHasMore(page.length === APPOINTMENT_PAGE_SIZE); }).catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : 'Appointment লোড করা যায়নি।')).finally(() => setLoading(false)); };
  useEffect(load, [selected]);
  if (account && !['hospital', 'chamber'].includes(account.role)) return <Navigate to="/dashboard" replace />;

  async function act(id: string, status: AppointmentStatus, confirmation = false) {
    if (confirmation && (confirmAction?.id !== id || confirmAction.status !== status)) { setConfirmAction({ id, status }); return; }
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

  async function actReception(item: ProviderReceptionAppointment, status: AppointmentStatus) {
    setReceptionWorking(item.appointment_id); setError(null);
    try { await updateProviderReceptionAppointment({ appointmentId: item.appointment_id, status, serialNumber: status === 'confirmed' && serials[item.appointment_id] ? Number(serials[item.appointment_id]) : null }); await load(); }
    catch (actionError) { setError(actionError instanceof Error ? actionError.message : 'Reception appointment update করা যায়নি।'); }
    finally { setReceptionWorking(null); }
  }

  return <div className="app-shell provider-dashboard-page"><main className="provider-dashboard-main container"><Link className="back-link" to="/dashboard"><ArrowLeft /> Dashboard-এ ফিরুন</Link><div className="provider-page-heading"><span><CalendarDays /></span><div><small>Independent reception queue</small><h1>Appointment overview</h1><p>Reception Doctor cards এবং existing appointments এক জায়গা থেকে পরিচালনা করুন।</p></div></div><div className="appointment-tabs">{tabs.map((tab) => <button className={selected === tab.value ? 'active' : ''} key={tab.value} onClick={() => setParams(tab.value === 'all' ? {} : { status: tab.value })}>{tab.label}</button>)}</div>{error && <div className="error-box">{error}</div>}{loading ? <div className="loading-box"><LoaderCircle className="spin" /> Appointment লোড হচ্ছে…</div> : <><section className="provider-reception-queue"><div className="section-title"><div><h2>Reception serial requests</h2><p>Hospital-managed Doctor cards থেকে আসা request</p></div><b>{receptionRows.length}</b></div><div className="appointment-list provider-appointment-list">{receptionRows.map((item) => <article key={item.appointment_id}><div className="appointment-date"><CalendarDays /><strong>{new Intl.DateTimeFormat('bn-BD', { dateStyle: 'medium' }).format(new Date(`${item.appointment_date}T12:00:00`))}</strong><span className={`status-${item.status}`}>{labels[item.status]}</span></div><div className="appointment-body"><span className="appointment-doctor-icon"><UserRound /></span><div><h2>{item.patient_name || 'রোগী'}</h2><p><Stethoscope /> {item.doctor_name} • Reception card</p><div className="appointment-meta">{item.preferred_time && <span><Clock3 /> Preferred {item.preferred_time.slice(0,5)}</span>}{item.patient_phone && <span>Phone: {item.patient_phone}</span>}{item.serial_number && <span>Serial #{item.serial_number}</span>}</div></div></div>{item.patient_note && <p className="appointment-note"><strong>রোগীর নোট:</strong> {item.patient_note}</p>}{item.status === 'pending' && <div className="doctor-appointment-actions reception-confirm-actions"><input type="number" min={1} value={serials[item.appointment_id] || ''} onChange={(event) => setSerials((current) => ({ ...current, [item.appointment_id]: event.target.value }))} placeholder="Serial (auto)" /><button className="positive" disabled={receptionWorking === item.appointment_id} onClick={() => void actReception(item, 'confirmed')}><Check /> Confirm</button><button className="danger" disabled={receptionWorking === item.appointment_id} onClick={() => void actReception(item, 'rejected')}><X /> Reject</button></div>}{item.status === 'confirmed' && <div className="doctor-appointment-actions"><button className="positive" disabled={receptionWorking === item.appointment_id} onClick={() => void actReception(item, 'completed')}><CalendarCheck /> সম্পন্ন</button><button disabled={receptionWorking === item.appointment_id} onClick={() => void actReception(item, 'no_show')}>অনুপস্থিত</button><button className="danger" disabled={receptionWorking === item.appointment_id} onClick={() => void actReception(item, 'cancelled')}><X /> বাতিল</button></div>}</article>)}</div>{!receptionRows.length && <div className="empty-inline">এই status-এ কোনো Reception request নেই।</div>}</section>{rows.length ? <><section className="provider-existing-appointment-queue"><div className="section-title"><div><h2>Existing Doctor appointments</h2><p>আগের verified Doctor booking flow</p></div><b>{rows.length}</b></div><div className="appointment-list provider-appointment-list">{rows.map((row) => <article key={row.appointment_id}><div className="appointment-date"><CalendarDays /><strong>{new Intl.DateTimeFormat('bn-BD', { dateStyle: 'medium' }).format(new Date(`${row.appointment_date}T12:00:00`))}</strong><span className={`status-${row.status}`}>{labels[row.status]}</span></div><div className="appointment-body"><span className="appointment-doctor-icon"><UserRound /></span><div><h2>{row.patient_name || 'রোগী'}</h2><p><Stethoscope /> {row.doctor_name} • {row.provider_name}</p><div className="appointment-meta">{row.start_time && <span><Clock3 /> {row.start_time.slice(0, 5)}–{row.end_time?.slice(0, 5)}</span>}{row.address && <span><MapPin /> {row.address}</span>}</div></div><div className="appointment-fee"><small>ভিজিট ফি</small><strong>{row.consultation_fee == null ? '—' : `৳${row.consultation_fee}`}</strong></div></div>{row.patient_note && <p className="appointment-note"><strong>রোগীর নোট:</strong> {row.patient_note}</p>}{row.status === 'pending' && <div className="doctor-appointment-actions"><button className="positive" disabled={Boolean(working)} onClick={() => void act(row.appointment_id, 'confirmed')}><Check /> Confirm</button><button className={confirmAction?.id === row.appointment_id ? 'danger confirming' : 'danger'} disabled={Boolean(working)} onClick={() => void act(row.appointment_id, 'rejected', true)}><X /> {confirmAction?.id === row.appointment_id ? 'নিশ্চিত করুন' : 'Reject'}</button>{confirmAction?.id === row.appointment_id && <button onClick={() => setConfirmAction(null)}>ফিরে যান</button>}</div>}{row.status === 'confirmed' && <div className="doctor-appointment-actions"><button className="positive" disabled={Boolean(working)} onClick={() => void act(row.appointment_id, 'completed')}><CalendarCheck /> সম্পন্ন</button><button disabled={Boolean(working)} onClick={() => void act(row.appointment_id, 'no_show')}>অনুপস্থিত</button><button className={confirmAction?.id === row.appointment_id ? 'danger confirming' : 'danger'} disabled={Boolean(working)} onClick={() => void act(row.appointment_id, 'cancelled', true)}><X /> {confirmAction?.id === row.appointment_id ? 'নিশ্চিত করুন' : 'বাতিল'}</button>{confirmAction?.id === row.appointment_id && <button onClick={() => setConfirmAction(null)}>ফিরে যান</button>}</div>}</article>)}</div>{hasMore && <div className="public-load-more-wrap"><button className="public-load-more-button" type="button" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? <><LoaderCircle className="spin" /> লোড হচ্ছে…</> : 'আরও দেখুন'}</button></div>}</section></> : null}{!rows.length && !receptionRows.length && <div className="empty-state"><span>📅</span><h3>এই status-এ কোনো appointment নেই</h3><p>Patient request এলে এখানে দেখা যাবে।</p></div>}</>}</main></div>;
}
