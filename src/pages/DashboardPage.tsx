import { useEffect, useMemo, useState } from 'react';
import { Ambulance, Bell, Building2, CalendarDays, ChevronRight, Clock3, Crown, Droplets, Eye, FileCheck2, Heart, Link2, LoaderCircle, LogOut, MessageCircle, PhoneCall, Settings, ShieldCheck, Star, Stethoscope, UserRound, UsersRound, Activity, CalendarClock, Search, CheckCircle2 } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import DashboardShell from '../components/DashboardShell';
import AccountStateFallback from '../components/AccountStateFallback';
import { useAuth } from '../contexts/AuthContext';
import { getRoleDashboardContext } from '../services/account';
import { saveMyCurrentLocation } from '../services/discovery';
import { formatDateSafe, safeDateTimestamp } from '../lib/dateSafe';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { getMyAppointments, getMyPatientDashboardSummary, type PatientDashboardAppointmentSummary } from '../services/appointments';
import { getDoctorAnalytics, type DoctorAnalytics } from '../services/doctorDashboard';
import { getMyDoctorInteractionSummary } from '../services/engagement';
import type { AppointmentRow, DashboardContext, InteractionSummary, UserRole } from '../types';

const LOCATION_STORAGE_KEY = 'docbd-current-location';
const LEGACY_LOCATION_STORAGE_KEY = 'sirajganj-current-location';

const roleLabels: Record<UserRole, string> = { patient: 'রোগী', doctor: 'ডাক্তার', chamber: 'চেম্বার', hospital: 'হাসপাতাল', ambulance: 'অ্যাম্বুলেন্স সেবা', verification_officer: 'ভেরিফিকেশন অফিসার', admin: 'অ্যাডমিন', super_admin: 'সুপার অ্যাডমিন' };

export default function DashboardPage() {
  const { account, accountError, loading, refreshAccount, signOut } = useAuth();
  const [context, setContext] = useState<DashboardContext | null>(null);
  const [contextLoading, setContextLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [doctorAnalytics, setDoctorAnalytics] = useState<DoctorAnalytics | null>(null);
  const [doctorEngagement, setDoctorEngagement] = useState<InteractionSummary | null>(null);
  const [recentAppointments, setRecentAppointments] = useState<AppointmentRow[]>([]);
  const [doctorDashboardLoading, setDoctorDashboardLoading] = useState(false);
  const [doctorDashboardError, setDoctorDashboardError] = useState<string | null>(null);
  const [patientAppointments, setPatientAppointments] = useState<AppointmentRow[]>([]);
  const [patientSummary, setPatientSummary] = useState<PatientDashboardAppointmentSummary>({ upcoming: 0, completed: 0, pending: 0, last30Days: 0 });
  const [patientAppointmentsLoading, setPatientAppointmentsLoading] = useState(false);
  const [patientAppointmentsError, setPatientAppointmentsError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!account) { setContextLoading(false); return; }
    getRoleDashboardContext().then(setContext).catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : 'Dashboard লোড করা যায়নি।')).finally(() => setContextLoading(false));
  }, [account]);

  useEffect(() => {
    if (!account || account.role !== 'patient') {
      setPatientAppointments([]);
      setPatientAppointmentsLoading(false);
      setPatientAppointmentsError(null);
      return;
    }

    let active = true;
    setPatientAppointmentsLoading(true);
    setPatientAppointmentsError(null);
    getMyPatientDashboardSummary()
      .then((result) => { if (active) { setPatientAppointments(result.recent); setPatientSummary(result.summary); } })
      .catch((loadError: unknown) => {
        if (!active) return;
        setPatientAppointmentsError(loadError instanceof Error ? loadError.message : 'Appointment summary লোড করা যায়নি।');
      })
      .finally(() => { if (active) setPatientAppointmentsLoading(false); });

    return () => { active = false; };
  }, [account]);

  useEffect(() => {
    if (!account || account.role !== 'doctor') {
      setDoctorAnalytics(null);
      setDoctorEngagement(null);
      setRecentAppointments([]);
      setDoctorDashboardLoading(false);
      return;
    }

    let active = true;
    setDoctorDashboardLoading(true);
    setDoctorDashboardError(null);
    Promise.all([getDoctorAnalytics(account.user_id), getMyAppointments(null, 5), getMyDoctorInteractionSummary(30)])
      .then(([analytics, appointments, engagement]) => {
        if (!active) return;
        setDoctorAnalytics(analytics);
        setDoctorEngagement(engagement);
        setRecentAppointments([...appointments]
          .sort((a, b) => safeDateTimestamp(b.created_at) - safeDateTimestamp(a.created_at))
          .slice(0, 5));
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        setDoctorDashboardError(loadError instanceof Error ? loadError.message : 'ডাক্তার dashboard data লোড করা যায়নি।');
      })
      .finally(() => { if (active) setDoctorDashboardLoading(false); });

    return () => { active = false; };
  }, [account]);

  useEffect(() => {
    if (!account) return;

    const persist = (latitude: number, longitude: number, accuracy: number | null) => {
      void saveMyCurrentLocation({ latitude, longitude, accuracyMeters: accuracy, saveHistory: true })
        .then(() => { try { localStorage.removeItem(LOCATION_STORAGE_KEY); localStorage.removeItem(LEGACY_LOCATION_STORAGE_KEY); } catch { /* ignore */ } })
        .catch(() => undefined);
    };

    // If the visitor granted location before logging in, persist that exact
    // consented location as soon as an authenticated session exists.
    try {
      const raw = localStorage.getItem(LOCATION_STORAGE_KEY) || localStorage.getItem(LEGACY_LOCATION_STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { latitude?: number; longitude?: number; accuracy?: number | null; capturedAt?: number };
        if (typeof saved.latitude === 'number' && typeof saved.longitude === 'number' && (!saved.capturedAt || Date.now() - saved.capturedAt < 30 * 60 * 1000)) {
          persist(saved.latitude, saved.longitude, saved.accuracy ?? null);
          return;
        }
      }
    } catch { /* ignore invalid local storage */ }

    // Never trigger a surprise permission prompt on dashboard. If permission
    // was already granted earlier, refresh and save the current GPS point.
    if (!navigator.geolocation || !navigator.permissions?.query) return;
    void navigator.permissions.query({ name: 'geolocation' }).then((permission) => {
      if (permission.state !== 'granted') return;
      navigator.geolocation.getCurrentPosition(
        (position) => persist(position.coords.latitude, position.coords.longitude, Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null),
        () => undefined,
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
      );
    }).catch(() => undefined);
  }, [account]);

  async function logout() { await signOut(); navigate('/', { replace: true }); }

  const patientMetrics = patientSummary;

  const patientRecentAppointments = useMemo(() => [...patientAppointments]
    .sort((a, b) => safeDateTimestamp(b.created_at) - safeDateTimestamp(a.created_at))
    .slice(0, 5), [patientAppointments]);

  // Keep all hooks above every redirect/return. Returning before the useMemo above
  // caused a hook-order crash when auth loading changed to an incomplete account.
  if (!loading && account && ((['doctor', 'hospital'].includes(account.role) && !account.onboarding_completed) || (!['doctor', 'hospital'].includes(account.role) && !account.profile_completed))) {
    return <Navigate to="/onboarding" replace />;
  }
  if (!loading && !account) {
    return <AccountStateFallback message={accountError} onRetry={refreshAccount} onSignOut={logout} />;
  }

  // Account context is the canonical role source. A secondary dashboard RPC may
  // fail or be stale, but that must never switch the shell role or create a loop.
  const role = account?.role ?? 'patient';
  const cards = role === 'patient'
    ? [{ icon: CalendarDays, title: 'আমার অ্যাপয়েন্টমেন্ট', detail: 'আসন্ন ও আগের appointment দেখুন', path: '/appointments' }, { icon: UserRound, title: 'আমার প্রোফাইল', detail: 'ব্যক্তিগত ও জরুরি যোগাযোগের তথ্য', path: '/profile' }]
    : role === 'doctor'
      ? [{ icon: Activity, title: 'Profile Analytics', detail: 'Views, clicks, follower ও review metrics', path: '/doctor/analytics' }, { icon: Stethoscope, title: 'ডাক্তার প্রোফাইল', detail: context?.doctor?.verification_status === 'approved' ? 'প্রোফাইল অনুমোদিত' : 'Verification অপেক্ষমাণ', path: '/doctor/profile' }, { icon: FileCheck2, title: 'Verification evidence', detail: 'BMDC, degree ও identity evidence', path: '/verification/evidence' }, { icon: Link2, title: 'প্রতিষ্ঠানের invitation', detail: 'Hospital/Chamber link accept বা reject করুন', path: '/doctor/invitations' }, { icon: Clock3, title: 'চেম্বার ও সময়সূচি', detail: 'Visiting day, সময় ও fee পরিচালনা করুন', path: '/doctor/schedules' }, { icon: CalendarDays, title: 'অ্যাপয়েন্টমেন্ট', detail: 'রোগীর request ও status পরিচালনা করুন', path: '/doctor/appointments' }]
      : role === 'hospital' || role === 'chamber'
        ? [{ icon: Activity, title: 'Profile Analytics', detail: 'Views, calls, appointments ও follower metrics', path: '/provider/analytics' }, { icon: Building2, title: 'প্রতিষ্ঠানের প্রোফাইল', detail: `${context?.providers?.length ?? 0}টি প্রতিষ্ঠান যুক্ত`, path: '/provider/profile' }, { icon: FileCheck2, title: 'Verification evidence', detail: 'Trade license ও organization evidence', path: '/verification/evidence' }, { icon: Stethoscope, title: 'ডাক্তার ব্যবস্থাপনা', detail: 'Consent-based invitation ও schedule', path: '/provider/doctors' }, { icon: CalendarDays, title: 'Appointment overview', detail: 'Reception-style request queue', path: '/provider/appointments' }, ...(role === 'hospital' ? [{ icon: Ambulance, title: 'Ambulance links', detail: 'সংযোগ request approve বা reject করুন', path: '/provider/ambulances' }] : [])]
        : role === 'ambulance'
          ? [{ icon: Ambulance, title: 'Ambulance service', detail: 'গাড়ি, documents ও availability পরিচালনা করুন', path: '/ambulance/services' }, { icon: Building2, title: 'হাসপাতাল সংযোগ', detail: 'Consent-based link request পরিচালনা করুন', path: '/ambulance/hospitals' }]
          : role === 'verification_officer'
            ? [{ icon: ShieldCheck, title: 'Verification queue', detail: 'Doctor, Provider ও Ambulance review', path: '/verification/reviews' }]
            : role === 'admin'
              ? [{ icon: Settings, title: 'Admin operations', detail: 'Users, appointments ও activity oversight', path: '/admin' }, { icon: ShieldCheck, title: 'Verification queue', detail: 'Pending application review', path: '/verification/reviews' }]
              : [{ icon: Crown, title: 'Super Admin control', detail: 'Users, roles, privileged invites ও sensitive controls', path: '/super-admin' }, { icon: Settings, title: 'Admin operations', detail: 'Operational dashboard ও full audit', path: '/admin' }, { icon: ShieldCheck, title: 'Verification queue', detail: 'সব verification oversight', path: '/verification/reviews' }];

  const weeklyTotal = doctorAnalytics?.last7Days.reduce((sum, day) => sum + day.count, 0) ?? 0;
  const busiestDay = doctorAnalytics?.last7Days.reduce((best, day) => day.count > best.count ? day : best, doctorAnalytics.last7Days[0] ?? { date: '', count: 0 });
  const chartData = (doctorAnalytics?.last7Days ?? []).map((day) => ({
    ...day,
    label: formatDateSafe(day.date, 'bn-BD', { weekday: 'short' }, '—', true),
  }));

  const doctorDashboardContent = <div className="app-shell doctor-analytics-dashboard"><main className="doctor-analytics-main container">
    {(doctorDashboardError || error || accountError) && <div className="error-box" role="alert">{doctorDashboardError || error || accountError}</div>}
    {(loading || contextLoading || doctorDashboardLoading) ? <DoctorDashboardSkeleton /> : account && <>{/* heading */}
      <section className="doctor-analytics-heading"><div><span>Doctor Dashboard</span><h1>স্বাগতম, {context?.full_name || account.full_name || 'ডাক্তার'}</h1><p>Appointment এবং public profile engagement এক নজরে দেখুন।</p></div><div className="doctor-dashboard-heading-actions"><button type="button" onClick={() => navigate('/doctor/analytics')}><Activity /> Analytics</button><button type="button" onClick={() => navigate('/doctor/appointments')}><CalendarDays /> সব অ্যাপয়েন্টমেন্ট</button></div></section>
      <section className="dashboard-stat-grid">
        <DashboardStatCard icon={CalendarDays} label="আজকের অ্যাপয়েন্টমেন্ট" value={doctorAnalytics?.todayAppointments ?? 0} detail="আজ নির্ধারিত মোট appointment" />
        <DashboardStatCard icon={UsersRound} label="এই মাসের patient" value={doctorAnalytics?.monthlyUniquePatients ?? 0} detail="ইউনিক patient" />
        <DashboardStatCard icon={CalendarClock} label="Pending" value={doctorAnalytics?.pendingAppointments ?? 0} detail="আপনার action অপেক্ষায়" />
        <DashboardStatCard icon={Eye} label="Profile Views" value={doctorEngagement?.profile_views ?? 0} detail="গত ৩০ দিনের public profile views" />
        <DashboardStatCard icon={PhoneCall} label="Call Clicks" value={doctorEngagement?.call_clicks ?? 0} detail="গত ৩০ দিনের call action" />
        <DashboardStatCard icon={MessageCircle} label="WhatsApp Clicks" value={doctorEngagement?.whatsapp_clicks ?? 0} detail="গত ৩০ দিনের WhatsApp action" />
        <DashboardStatCard icon={CalendarDays} label="Appointment Requests" value={doctorEngagement?.appointment_requests ?? 0} detail="গত ৩০ দিনে submit হওয়া request" />
        <DashboardStatCard icon={Heart} label="মোট অনুসারী" value={doctorEngagement?.followers ?? 0} detail={`গত ৩০ দিনে নতুন ${doctorEngagement?.followers_new ?? 0}`} />
        <DashboardStatCard icon={Star} label="মোট রিভিউ" value={doctorEngagement?.reviews ?? 0} detail={doctorEngagement?.average_rating == null ? 'এখনো rating নেই' : `গড় ${doctorEngagement.average_rating.toFixed(1)} / 5`} />
        <DashboardStatCard icon={UsersRound} label="নতুন অনুসারী" value={doctorEngagement?.followers_new ?? 0} detail={`Loss ${doctorEngagement?.followers_lost ?? 0} • Net ${doctorEngagement?.followers_net ?? 0}`} />
        <DashboardStatCard icon={Activity} label="Weekly trend" value={weeklyTotal} detail={busiestDay?.date ? `সর্বোচ্চ ${formatDateSafe(busiestDay.date, 'bn-BD', { weekday: 'short' }, '—', true)}: ${busiestDay.count}` : 'গত ৭ দিন'} />
      </section>
      <section className="doctor-dashboard-panels">
        <article className="doctor-chart-card"><header><div><small>গত ৭ দিন</small><h2>Appointment trend</h2></div><span>{weeklyTotal} total</span></header><div className="doctor-chart-wrap">{chartData.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={chartData} margin={{ top: 10, right: 6, left: -22, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" tickLine={false} axisLine={false} /><YAxis allowDecimals={false} tickLine={false} axisLine={false} /><Tooltip cursor={{ fill: 'rgba(15, 118, 110, 0.06)' }} formatter={(value) => [`${value}`, 'Appointments']} /><Bar dataKey="count" fill="#0f766e" radius={[7, 7, 0, 0]} /></BarChart></ResponsiveContainer> : <div className="doctor-chart-empty">গত ৭ দিনে appointment নেই।</div>}</div></article>
        <article className="dashboard-recent-card"><header><div><small>Latest activity</small><h2>সাম্প্রতিক ৫টি অ্যাপয়েন্টমেন্ট</h2></div><button type="button" onClick={() => navigate('/doctor/appointments')}>সব দেখুন <ChevronRight /></button></header><div className="dashboard-recent-list">{recentAppointments.length ? recentAppointments.map((appointment) => <button type="button" key={appointment.appointment_id} onClick={() => navigate('/doctor/appointments')}><span className="dashboard-recent-date"><b>{formatDateSafe(appointment.appointment_date, 'bn-BD', { day: '2-digit' }, '—', true)}</b><small>{formatDateSafe(appointment.appointment_date, 'bn-BD', { month: 'short' }, '', true)}</small></span><span className="dashboard-recent-info"><strong>{appointment.patient_name || 'রোগী'}</strong><small>{appointment.provider_name || 'চেম্বার নির্ধারিত নয়'}{appointment.start_time ? ` • ${appointment.start_time.slice(0, 5)}` : ''}</small></span><span className={`dashboard-recent-status ${appointment.status}`}>{appointment.status}</span></button>) : <p className="empty-inline">সাম্প্রতিক appointment নেই।</p>}</div></article>
      </section>
    </>}
  </main></div>;

  const patientDashboardContent = <div className="app-shell doctor-analytics-dashboard patient-dashboard-redesign"><main className="doctor-analytics-main container">
    {(loading || contextLoading || patientAppointmentsLoading) ? <PatientDashboardSkeleton /> : <>
      {(error || accountError || patientAppointmentsError) && <div className="error-box" role="alert">{error || accountError || patientAppointmentsError}</div>}
      {account && <>
        <section className="doctor-analytics-heading patient-dashboard-heading"><div><span>Patient Dashboard</span><h1>স্বাগতম, {context?.full_name || account.full_name || 'ব্যবহারকারী'}</h1><p>আপনার অ্যাপয়েন্টমেন্ট দেখুন এবং প্রয়োজন হলে দ্রুত নতুন ডাক্তার খুঁজুন।</p></div></section>
        <section className="dashboard-stat-grid patient-dashboard-stat-grid">
          <DashboardStatCard icon={CalendarDays} label="আসন্ন Appointment" value={patientMetrics.upcoming} detail="Pending বা confirmed upcoming" />
          <DashboardStatCard icon={CheckCircle2} label="সম্পন্ন Appointment" value={patientMetrics.completed} detail="মোট completed appointment" />
          <DashboardStatCard icon={CalendarClock} label="Pending" value={patientMetrics.pending} detail="Confirmation অপেক্ষায়" />
        </section>
        <section className="patient-dashboard-panels">
          <article className="dashboard-recent-card patient-recent-card"><header><div><small>Latest activity</small><h2>সাম্প্রতিক অ্যাপয়েন্টমেন্ট</h2></div><button type="button" onClick={() => navigate('/appointments')}>সব দেখুন <ChevronRight /></button></header><div className="dashboard-recent-list">{patientRecentAppointments.length ? patientRecentAppointments.map((appointment) => <button type="button" key={appointment.appointment_id} onClick={() => navigate('/appointments')}><span className="dashboard-recent-date"><b>{formatDateSafe(appointment.appointment_date, 'bn-BD', { day: '2-digit' }, '—', true)}</b><small>{formatDateSafe(appointment.appointment_date, 'bn-BD', { month: 'short' }, '', true)}</small></span><span className="dashboard-recent-info"><strong>{appointment.doctor_name || 'ডাক্তার'}</strong><small>{appointment.provider_name || 'প্রতিষ্ঠান নির্ধারিত নয়'}{appointment.start_time ? ` • ${appointment.start_time.slice(0, 5)}` : ''}</small></span><span className={`dashboard-recent-status ${appointment.status}`}>{appointment.status}</span></button>) : <p className="empty-inline">সাম্প্রতিক appointment নেই।</p>}</div></article>
          <article className="patient-find-doctor-card"><span className="patient-find-doctor-icon"><Search /></span><div><small>Need a doctor?</small><h2>ডাক্তার খুঁজুন</h2><p>বিশেষজ্ঞ, এলাকা বা হাসপাতাল অনুযায়ী ডাক্তার খুঁজে সরাসরি appointment নিন।</p><button type="button" onClick={() => navigate('/doctors?advanced=1')}>ডাক্তার খুঁজুন <ChevronRight /></button></div></article>
          <article className="patient-find-doctor-card patient-blood-bank-card"><span className="patient-find-doctor-icon"><Droplets /></span><div><small>Emergency support</small><h2>Blood Bank</h2><p>রক্তদাতা খুঁজুন, জরুরি blood request তৈরি করুন অথবা voluntary donor profile পরিচালনা করুন।</p><button type="button" onClick={() => navigate('/blood')}>Blood Bank খুলুন <ChevronRight /></button></div></article>
        </section>
      </>}
    </>}
  </main></div>;

  const dashboardContent = <div className="app-shell dashboard-page"><main className="dashboard-main container">{(loading || contextLoading) && <div className="loading-box"><LoaderCircle className="spin" /> Dashboard লোড হচ্ছে…</div>}{(error || accountError) && <div className="error-box" role="alert">{error || accountError}</div>}{!loading && !contextLoading && account && <><section className="dashboard-welcome"><div><span>{roleLabels[role]} Dashboard</span><h1>স্বাগতম, {context?.full_name || account.full_name || 'ব্যবহারকারী'}</h1><p>আপনার স্বাস্থ্যসেবা কার্যক্রম এক জায়গা থেকে পরিচালনা করুন।</p></div><div className="dashboard-profile-icon"><UserRound /></div></section><section className="dashboard-grid">{cards.map(({ icon: Icon, title, detail, path }) => <button type="button" key={title} onClick={() => path !== '#' && navigate(path)}><span><Icon /></span><div><strong>{title}</strong><small>{detail}</small></div><ChevronRight /></button>)}<button type="button"><span><Bell /></span><div><strong>নোটিফিকেশন</strong><small>আপনার সর্বশেষ update</small></div><ChevronRight /></button><button type="button" onClick={() => role === 'doctor' ? navigate('/doctor/profile') : ['hospital', 'chamber'].includes(role) ? navigate('/provider/profile') : role === 'ambulance' && navigate('/ambulance/services')}><span><Settings /></span><div><strong>অ্যাকাউন্ট সেটিংস</strong><small>ব্যক্তিগত তথ্য ও নিরাপত্তা</small></div><ChevronRight /></button></section><button className="logout-button" type="button" onClick={() => void logout()}><LogOut size={18} /> লগআউট</button></>}</main></div>;

  return role === 'doctor' ? <DashboardShell role="doctor">{doctorDashboardContent}</DashboardShell>
    : role === 'patient' ? <DashboardShell role="patient">{patientDashboardContent}</DashboardShell>
      : <DashboardShell role={role}>{dashboardContent}</DashboardShell>;
}

function DashboardStatCard({ icon: Icon, label, value, detail }: { icon: typeof CalendarDays; label: string; value: number; detail: string }) {
  return <article className="dashboard-stat-card"><span><Icon /></span><div><small>{label}</small><strong>{value.toLocaleString('bn-BD')}</strong><p>{detail}</p></div></article>;
}

function PatientDashboardSkeleton() {
  return <div className="dashboard-skeleton" aria-label="Dashboard loading"><div className="skeleton-line wide" /><div className="skeleton-line medium" /><section className="dashboard-stat-grid patient-dashboard-stat-grid">{Array.from({ length: 3 }, (_, index) => <article className="dashboard-stat-card skeleton-card" key={index}><span className="skeleton-circle" /><div><i /><i /><i /></div></article>)}</section><section className="patient-dashboard-panels"><article className="dashboard-recent-card skeleton-panel"><i /><i /><i /><i /><i /></article><article className="patient-find-doctor-card skeleton-panel"><i /><i /><i /></article></section></div>;
}

function DoctorDashboardSkeleton() {
  return <div className="dashboard-skeleton" aria-label="Dashboard loading"><div className="skeleton-line wide" /><div className="skeleton-line medium" /><section className="dashboard-stat-grid">{Array.from({ length: 4 }, (_, index) => <article className="dashboard-stat-card skeleton-card" key={index}><span className="skeleton-circle" /><div><i /><i /><i /></div></article>)}</section><section className="doctor-dashboard-panels"><article className="doctor-chart-card skeleton-panel"><i /><i /></article><article className="dashboard-recent-card skeleton-panel"><i /><i /><i /><i /><i /></article></section></div>;
}
