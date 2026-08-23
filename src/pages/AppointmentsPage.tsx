import { useEffect, useState } from 'react';
import { ArrowLeft, CalendarDays, Clock3, LoaderCircle, MapPin, Stethoscope, XCircle } from 'lucide-react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { cancelAppointment, getMyAppointments } from '../services/appointments';
import { getMyProviderReceptionAppointments, updateProviderReceptionAppointment } from '../services/providerReception';
import type { AppointmentRow, AppointmentStatus, ProviderReceptionAppointment } from '../types';

const statusLabels: Record<AppointmentStatus, string> = { pending: 'অপেক্ষমাণ', confirmed: 'নিশ্চিত', rejected: 'প্রত্যাখ্যাত', cancelled: 'বাতিল', completed: 'সম্পন্ন', no_show: 'অনুপস্থিত' };
const tabs: Array<{ value: AppointmentStatus | 'all'; label: string }> = [{ value: 'all', label: 'সব' }, { value: 'pending', label: 'অপেক্ষমাণ' }, { value: 'confirmed', label: 'নিশ্চিত' }, { value: 'completed', label: 'সম্পন্ন' }, { value: 'cancelled', label: 'বাতিল' }];
const APPOINTMENT_PAGE_SIZE = 30;

export default function AppointmentsPage() {
  const { account } = useAuth();
  const [params, setParams] = useSearchParams();
  const selected = (params.get('status') as AppointmentStatus | null) ?? 'all';
  const [rows, setRows] = useState<AppointmentRow[]>([]);
  const [receptionRows, setReceptionRows] = useState<ProviderReceptionAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);

  const load = () => { setLoading(true); setError(null); Promise.all([getMyAppointments(selected === 'all' ? null : selected, APPOINTMENT_PAGE_SIZE, 0), getMyProviderReceptionAppointments(selected === 'all' ? null : selected)]).then(([page, reception]) => { setRows(page); setReceptionRows(reception); setHasMore(page.length === APPOINTMENT_PAGE_SIZE); }).catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : 'Appointment লোড করা যায়নি।')).finally(() => setLoading(false)); };
  useEffect(load, [selected]);
  if (account && account.role !== 'patient') return <Navigate to="/dashboard" replace />;

  async function cancel(id: string) {
    if (confirmId !== id) { setConfirmId(id); return; }
    setWorkingId(id); setError(null);
    try { await cancelAppointment(id); setConfirmId(null); load(); } catch (cancelError) { setError(cancelError instanceof Error ? cancelError.message : 'বাতিল করা যায়নি।'); } finally { setWorkingId(null); }
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

  async function cancelReception(id: string) {
    if (confirmId !== id) { setConfirmId(id); return; }
    setWorkingId(id); setError(null);
    try { await updateProviderReceptionAppointment({ appointmentId: id, status: 'cancelled' }); setConfirmId(null); load(); }
    catch (cancelError) { setError(cancelError instanceof Error ? cancelError.message : 'Reception appointment বাতিল করা যায়নি।'); }
    finally { setWorkingId(null); }
  }

  return <div className="app-shell appointments-page"><main className="appointments-main container"><Link className="back-link" to="/dashboard"><ArrowLeft /> Dashboard-এ ফিরুন</Link><div className="appointments-heading"><div><span>Patient account</span><h1>আমার অ্যাপয়েন্টমেন্ট</h1><p>Doctor booking ও Hospital Reception serial এক জায়গায় দেখুন।</p></div><Link to="/doctors">নতুন ডাক্তার খুঁজুন</Link></div>{params.get('created') === '1' && <div className="auth-message success">Appointment request সফলভাবে পাঠানো হয়েছে।</div>}<div className="appointment-tabs">{tabs.map((tab) => <button className={selected === tab.value ? 'active' : ''} key={tab.value} type="button" onClick={() => setParams(tab.value === 'all' ? {} : { status: tab.value })}>{tab.label}</button>)}</div>{error && <div className="error-box" role="alert">{error}</div>}{loading ? <div className="loading-box"><LoaderCircle className="spin" /> Appointment লোড হচ্ছে…</div> : <>{receptionRows.length > 0 && <section className="patient-reception-appointments"><div className="section-title"><div><h2>Hospital Reception serial</h2><p>Hospital Doctor card থেকে নেওয়া request</p></div><b>{receptionRows.length}</b></div><div className="appointment-list">{receptionRows.map((item) => <article key={item.appointment_id}><div className="appointment-date"><CalendarDays /><strong>{new Intl.DateTimeFormat('bn-BD', { dateStyle: 'medium' }).format(new Date(`${item.appointment_date}T12:00:00`))}</strong><span className={`status-${item.status}`}>{statusLabels[item.status]}</span></div><div className="appointment-body"><span className="appointment-doctor-icon"><Stethoscope /></span><div><h2>{item.doctor_name}</h2><p>{item.provider_name} Reception</p><div className="appointment-meta">{item.preferred_time && <span><Clock3 /> Preferred {item.preferred_time.slice(0,5)}</span>}{item.serial_number && <span className="patient-serial-number">Serial #{item.serial_number}</span>}</div></div></div>{item.patient_note && <p className="appointment-note">নোট: {item.patient_note}</p>}{['pending','confirmed'].includes(item.status) && <div className="appointment-actions">{confirmId === item.appointment_id && <span>আপনি কি নিশ্চিত?</span>}<button className={confirmId === item.appointment_id ? 'confirming' : ''} disabled={workingId === item.appointment_id} onClick={() => void cancelReception(item.appointment_id)}>{workingId === item.appointment_id ? <LoaderCircle className="spin" /> : <XCircle />}{confirmId === item.appointment_id ? 'হ্যাঁ, বাতিল করুন' : 'বাতিল করুন'}</button>{confirmId === item.appointment_id && <button onClick={() => setConfirmId(null)}>না</button>}</div>}</article>)}</div></section>}{rows.length ? <><section><div className="section-title"><div><h2>Doctor appointments</h2><p>Doctor profile থেকে নেওয়া booking</p></div><b>{rows.length}</b></div><div className="appointment-list">{rows.map((appointment) => <article key={appointment.appointment_id}><div className="appointment-date"><CalendarDays /><strong>{new Intl.DateTimeFormat('bn-BD', { dateStyle: 'medium' }).format(new Date(`${appointment.appointment_date}T12:00:00`))}</strong><span className={`status-${appointment.status}`}>{statusLabels[appointment.status]}</span></div><div className="appointment-body"><span className="appointment-doctor-icon"><Stethoscope /></span><div><h2>{appointment.doctor_name}</h2><p>{appointment.provider_name || 'চেম্বার নির্ধারিত নয়'}</p><div className="appointment-meta">{appointment.start_time && <span><Clock3 /> {appointment.start_time.slice(0, 5)} – {appointment.end_time?.slice(0, 5)}</span>}{appointment.address && <span><MapPin /> {appointment.address}</span>}</div></div><div className="appointment-fee"><small>ভিজিট ফি</small><strong>{appointment.consultation_fee == null ? '—' : `৳${appointment.consultation_fee}`}</strong></div></div>{appointment.patient_note && <p className="appointment-note">নোট: {appointment.patient_note}</p>}{['pending', 'confirmed'].includes(appointment.status) && <div className="appointment-actions">{confirmId === appointment.appointment_id && <span>আপনি কি নিশ্চিত?</span>}<button className={confirmId === appointment.appointment_id ? 'confirming' : ''} type="button" disabled={workingId === appointment.appointment_id} onClick={() => void cancel(appointment.appointment_id)}>{workingId === appointment.appointment_id ? <LoaderCircle className="spin" /> : <XCircle />} {confirmId === appointment.appointment_id ? 'হ্যাঁ, বাতিল করুন' : 'বাতিল করুন'}</button>{confirmId === appointment.appointment_id && <button type="button" onClick={() => setConfirmId(null)}>না</button>}</div>}</article>)}</div>{hasMore && <div className="public-load-more-wrap"><button className="public-load-more-button" type="button" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? <><LoaderCircle className="spin" /> লোড হচ্ছে…</> : 'আরও দেখুন'}</button></div>}</section></> : null}{!rows.length && !receptionRows.length && <div className="empty-state"><span>📅</span><h3>কোনো appointment নেই</h3><p>Doctor profile বা Hospital Doctor card থেকে appointment নিতে পারবেন।</p></div>}</>}</main></div>;
}
