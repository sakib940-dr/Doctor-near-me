import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarCheck, CalendarDays, Check, Clock3, FileText, LoaderCircle, MapPin, TrendingUp, UserRound, UsersRound, X } from 'lucide-react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useAuth } from '../contexts/AuthContext';
import { getMyAppointments, updateAppointmentStatus } from '../services/appointments';
import { getDoctorAnalytics, type DoctorAnalytics } from '../services/doctorDashboard';
import { formatDateSafe } from '../lib/dateSafe';
import type { AppointmentRow, AppointmentStatus } from '../types';

const labels: Record<AppointmentStatus, string> = { pending: 'অপেক্ষমাণ', confirmed: 'নিশ্চিত', rejected: 'প্রত্যাখ্যাত', cancelled: 'বাতিল', completed: 'সম্পন্ন', no_show: 'অনুপস্থিত' };
const tabs: Array<{ value: AppointmentStatus | 'all'; label: string }> = [{ value: 'all', label: 'সব' }, { value: 'pending', label: 'নতুন request' }, { value: 'confirmed', label: 'নিশ্চিত' }, { value: 'completed', label: 'সম্পন্ন' }, { value: 'cancelled', label: 'বাতিল' }];
type Action = { id: string; status: AppointmentStatus };
const APPOINTMENT_PAGE_SIZE = 30;

function localDateKey() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export default function DoctorAppointmentsPage() {
  const { account } = useAuth();
  const [params, setParams] = useSearchParams();
  const selected = (params.get('status') as AppointmentStatus | null) ?? 'all';
  const [rows, setRows] = useState<AppointmentRow[]>([]);
  const [overviewRows, setOverviewRows] = useState<AppointmentRow[]>([]);
  const [analytics, setAnalytics] = useState<DoctorAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<Action | null>(null);
  const [working, setWorking] = useState<Action | null>(null);

  const loadList = useCallback(() => {
    setLoading(true); setError(null);
    getMyAppointments(selected === 'all' ? null : selected, APPOINTMENT_PAGE_SIZE, 0)
      .then((page) => { setRows(page); setHasMore(page.length === APPOINTMENT_PAGE_SIZE); })
      .catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : 'Appointment লোড করা যায়নি।'))
      .finally(() => setLoading(false));
  }, [selected]);

  const loadOverview = useCallback(() => {
    if (!account || account.role !== 'doctor') return;
    setOverviewLoading(true);
    Promise.all([getDoctorAnalytics(account.user_id), getMyAppointments(null, 100, 0)])
      .then(([nextAnalytics, appointments]) => { setAnalytics(nextAnalytics); setOverviewRows(appointments); })
      .catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : 'Appointment summary লোড করা যায়নি।'))
      .finally(() => setOverviewLoading(false));
  }, [account]);

  useEffect(loadList, [loadList]);
  useEffect(loadOverview, [loadOverview]);
  if (account && account.role !== 'doctor') return <Navigate to="/dashboard" replace />;

  const upcomingFive = useMemo(() => {
    const today = localDateKey();
    return overviewRows
      .filter((row) => row.appointment_date >= today && (row.status === 'pending' || row.status === 'confirmed'))
      .sort((a, b) => `${a.appointment_date}T${a.start_time || '23:59'}`.localeCompare(`${b.appointment_date}T${b.start_time || '23:59'}`))
      .slice(0, 5);
  }, [overviewRows]);

  const weeklyTotal = analytics?.last7Days.reduce((sum, row) => sum + row.count, 0) ?? 0;
  const weeklyChart = (analytics?.last7Days ?? []).map((row) => ({ ...row, label: formatDateSafe(row.date, 'bn-BD', { weekday: 'short' }, '—', true) }));

  async function act(id: string, status: AppointmentStatus, needsConfirmation = false) {
    if (needsConfirmation && (confirmAction?.id !== id || confirmAction.status !== status)) { setConfirmAction({ id, status }); return; }
    setWorking({ id, status }); setError(null);
    try { await updateAppointmentStatus(id, status); setConfirmAction(null); loadList(); loadOverview(); }
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
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'আরও appointment লোড করা যায়নি।'); }
    finally { setLoadingMore(false); }
  }

  const actionProps = { working, confirmAction, setConfirmAction, act };

  return <div className="app-shell doctor-dashboard-page doctor-appointments-management"><main className="doctor-dashboard-main container">
    <div className="appointments-heading doctor-appointments-heading"><div><span>Appointment Management</span><h1>Appointments</h1><p>আজকের ও upcoming queue, summary, 7-day trend এবং সব appointment এক জায়গায় পরিচালনা করুন।</p></div></div>
    {error && <div className="error-box" role="alert">{error}</div>}

    <section className="doctor-appointment-overview">
      <header><div><small>Priority queue</small><h2>Today + Upcoming • Latest 5</h2></div><span><CalendarDays /> {upcomingFive.length} shown</span></header>
      {overviewLoading ? <div className="loading-box"><LoaderCircle className="spin" /> Overview লোড হচ্ছে…</div> : upcomingFive.length ? <div className="appointment-list doctor-appointment-list compact">{upcomingFive.map((appointment) => <AppointmentCard key={appointment.appointment_id} appointment={appointment} {...actionProps} />)}</div> : <div className="empty-inline">আজ বা upcoming কোনো pending/confirmed appointment নেই।</div>}
    </section>

    <section className="doctor-appointment-summary-grid">
      <article><span><CalendarDays /></span><div><small>Today</small><strong>{(analytics?.todayAppointments ?? 0).toLocaleString('bn-BD')}</strong><p>আজ নির্ধারিত</p></div></article>
      <article><span><Clock3 /></span><div><small>Pending</small><strong>{(analytics?.pendingAppointments ?? 0).toLocaleString('bn-BD')}</strong><p>Action অপেক্ষায়</p></div></article>
      <article><span><UsersRound /></span><div><small>Monthly Patients</small><strong>{(analytics?.monthlyUniquePatients ?? 0).toLocaleString('bn-BD')}</strong><p>Unique patients</p></div></article>
      <article><span><TrendingUp /></span><div><small>Last 7 Days</small><strong>{weeklyTotal.toLocaleString('bn-BD')}</strong><p>Total appointments</p></div></article>
    </section>

    <section className="doctor-appointment-week-card"><header><div><small>Last 7 Days</small><h2>Appointment Trend</h2></div><strong>{weeklyTotal.toLocaleString('bn-BD')} total</strong></header><div className="doctor-appointment-week-chart">{weeklyChart.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={weeklyChart} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" tickLine={false} axisLine={false} /><YAxis allowDecimals={false} tickLine={false} axisLine={false} /><Tooltip /><Bar dataKey="count" name="Appointments" fill="#0f766e" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer> : <div className="empty-inline">৭ দিনের trend data নেই।</div>}</div></section>

    <section className="doctor-all-appointments-section"><header><div><small>Complete queue</small><h2>All Appointments</h2></div></header><div className="appointment-tabs">{tabs.map((tab) => <button className={selected === tab.value ? 'active' : ''} key={tab.value} type="button" onClick={() => setParams(tab.value === 'all' ? {} : { status: tab.value })}>{tab.label}</button>)}</div>
      {loading ? <div className="loading-box"><LoaderCircle className="spin" /> Appointment লোড হচ্ছে…</div> : rows.length ? <><div className="appointment-list doctor-appointment-list">{rows.map((appointment) => <AppointmentCard key={appointment.appointment_id} appointment={appointment} {...actionProps} />)}</div>{hasMore && <div className="public-load-more-wrap"><button className="public-load-more-button" type="button" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? <><LoaderCircle className="spin" /> লোড হচ্ছে…</> : 'আরও দেখুন'}</button></div>}</> : <div className="empty-state"><CalendarDays /><h3>এই status-এ কোনো appointment নেই</h3><p>নতুন request এলে এখানে দেখা যাবে।</p></div>}
    </section>
  </main></div>;
}

function AppointmentCard({ appointment, working, confirmAction, setConfirmAction, act }: { appointment: AppointmentRow; working: Action | null; confirmAction: Action | null; setConfirmAction: (value: Action | null) => void; act: (id: string, status: AppointmentStatus, needsConfirmation?: boolean) => Promise<void> }) {
  const busy = (status: AppointmentStatus) => working?.id === appointment.appointment_id && working.status === status;
  return <article><div className="appointment-date"><CalendarDays /><strong>{new Intl.DateTimeFormat('bn-BD', { dateStyle: 'medium' }).format(new Date(`${appointment.appointment_date}T12:00:00`))}</strong><span className={`status-${appointment.status}`}>{labels[appointment.status]}</span></div><div className="appointment-body"><span className="appointment-doctor-icon"><UserRound /></span><div><h2>{appointment.patient_name || 'রোগী'}</h2><p>{appointment.provider_name || 'চেম্বার নির্ধারিত নয়'}</p><div className="appointment-meta">{appointment.start_time && <span><Clock3 /> {appointment.start_time.slice(0, 5)} – {appointment.end_time?.slice(0, 5)}</span>}{appointment.address && <span><MapPin /> {appointment.address}</span>}</div></div><div className="appointment-fee"><small>ভিজিট ফি</small><strong>{appointment.consultation_fee == null ? '—' : `৳${appointment.consultation_fee}`}</strong></div></div>{appointment.patient_note && <p className="appointment-note"><strong>রোগীর নোট:</strong> {appointment.patient_note}</p>}{appointment.status === 'pending' && <div className="doctor-appointment-actions"><button className="positive" type="button" disabled={Boolean(working)} onClick={() => void act(appointment.appointment_id, 'confirmed')}><Check /> {busy('confirmed') ? 'Updating…' : 'Confirm'}</button><button className={confirmAction?.id === appointment.appointment_id && confirmAction.status === 'rejected' ? 'danger confirming' : 'danger'} type="button" disabled={Boolean(working)} onClick={() => void act(appointment.appointment_id, 'rejected', true)}><X /> {confirmAction?.id === appointment.appointment_id && confirmAction.status === 'rejected' ? 'নিশ্চিত করুন' : 'Reject'}</button>{confirmAction?.id === appointment.appointment_id && <button type="button" onClick={() => setConfirmAction(null)}>ফিরে যান</button>}</div>}{appointment.status === 'confirmed' && <div className="doctor-appointment-actions"><Link className="rx-appointment-prescription-link" to={`/doctor/prescriptions?appointment=${appointment.appointment_id}`}><FileText /> Prescription</Link><button className="positive" type="button" disabled={Boolean(working)} onClick={() => void act(appointment.appointment_id, 'completed')}><CalendarCheck /> সম্পন্ন</button><button type="button" disabled={Boolean(working)} onClick={() => void act(appointment.appointment_id, 'no_show')}>অনুপস্থিত</button><button className={confirmAction?.id === appointment.appointment_id && confirmAction.status === 'cancelled' ? 'danger confirming' : 'danger'} type="button" disabled={Boolean(working)} onClick={() => void act(appointment.appointment_id, 'cancelled', true)}><X /> {confirmAction?.id === appointment.appointment_id && confirmAction.status === 'cancelled' ? 'নিশ্চিত করুন' : 'বাতিল'}</button>{confirmAction?.id === appointment.appointment_id && <button type="button" onClick={() => setConfirmAction(null)}>ফিরে যান</button>}</div>}{appointment.status === 'completed' && <div className="doctor-appointment-actions"><Link className="rx-appointment-prescription-link" to={`/doctor/prescriptions?appointment=${appointment.appointment_id}`}><FileText /> Prescription</Link></div>}</article>;
}
