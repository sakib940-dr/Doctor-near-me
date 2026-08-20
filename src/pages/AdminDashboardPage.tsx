import { FormEvent, useEffect, useState } from 'react';
import { Activity, AlertTriangle, Ambulance, ArrowRight, BadgeCheck, Bell, Building2, CalendarDays, CheckCircle2, Clock3, Crown, Eye, FileText, Flag, HardDrive, Heart, LoaderCircle, MessageCircle, MessageSquareText, MapPin, PhoneCall, RefreshCw, Search, Settings2, Share2, ShieldCheck, Sparkles, Star, Stethoscope, TrendingUp, UserCog, UserRound, Users, X } from 'lucide-react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useAuth } from '../contexts/AuthContext';
import { getImageUrl } from '../lib/storage';
import { getAdminActivity, getAdminAppointmentDirectory, getAdminHighLevelAnalytics, getAdminHospitalEngagementAnalytics, getAdminTopDoctorsAnalytics, getAdminOperationalSummary, getAdminOperationalTrends, getAdminUserDirectory, overrideAdminAppointmentStatus, setAdminUserAccountStatus } from '../services/adminDashboard';
import type { AdminActivityRow, AdminAnalyticsRangeKey, AdminAppointmentRow, AdminHighLevelAnalytics, AdminHospitalEngagementAnalytics, AdminOperationalSummary, AdminOperationalTrendRow, AdminTopDoctorMetricKey, AdminTopHospitalMetricKey, AdminTopDoctorRangeKey, AdminTopDoctorsAnalytics, AdminUserRow, AppointmentStatus, UserRole } from '../types';

type Tab = 'overview' | 'users' | 'appointments' | 'activity';
const roleLabels: Record<UserRole, string> = { patient: 'Patient', doctor: 'Doctor', chamber: 'Chamber', hospital: 'Hospital', ambulance: 'Ambulance', verification_officer: 'Verification Officer', admin: 'Admin', super_admin: 'Super Admin' };
const appointmentStatuses: AppointmentStatus[] = ['pending', 'confirmed', 'rejected', 'cancelled', 'completed', 'no_show'];
const ADMIN_LIST_PAGE_SIZE = 30;
const topDoctorRankingConfig: readonly [AdminTopDoctorMetricKey, string, typeof FileText][] = [
  ['prescriptions', 'Top Prescription Generator', FileText],
  ['follows', 'Most Saved/Followed Doctor', Heart],
  ['calls', 'Most Call Clicks', PhoneCall],
  ['whatsapp', 'Most WhatsApp Clicks', MessageCircle],
  ['appointments', 'Most Appointment Requests', CalendarDays],
  ['views', 'Most Profile Views', Eye],
  ['reviews', 'Most Reviewed Doctor', MessageSquareText],
  ['rating', 'Highest Rated Doctor', Star],
];
const topHospitalRankingConfig: readonly [AdminTopHospitalMetricKey, string, typeof Heart][] = [
  ['follows', 'Most Saved/Followed', Heart],
  ['calls', 'Most Call Clicks', PhoneCall],
  ['whatsapp', 'Most WhatsApp Clicks', MessageCircle],
  ['appointments', 'Most Appointments/Contact Requests', CalendarDays],
  ['views', 'Most Profile Views', Eye],
  ['reviews', 'Most Reviews', MessageSquareText],
  ['rating', 'Highest Rated', Star],
];
const topEntityStatusLabels: Record<string,string> = { premium:'Premium', verified:'Verified', new:'New', unverified:'Unverified' };

type AdminRankingDisplayItem = {
  id: string; rank: number; name: string; photoUrl: string | null; imageBucket: string; subtitle: string;
  status: string; statusLabel: string; metricText: string; metricDetail?: string; path: string;
};
type AdminRankingDisplayCard = { key: string; title: string; icon: typeof Heart; items: AdminRankingDisplayItem[] };

function AdminRankingCards({ cards }: { cards: AdminRankingDisplayCard[] }) {
  return <div className="admin-top-doctors-grid">{cards.map((card) => {
    const Icon=card.icon;
    return <article className="admin-top-ranking-card" key={card.key}>
      <header><span><Icon/></span><div><small>Ranking</small><h3>{card.title}</h3></div></header>
      <div className="admin-top-ranking-list">
        {card.items.map((item) => <div className="admin-top-doctor-row" key={`${card.key}-${item.id}`}>
          <b className="admin-top-rank">#{item.rank}</b>
          <div className="admin-top-doctor-avatar"><span>{item.name.slice(0,1).toUpperCase()}</span>{item.photoUrl && <img src={getImageUrl(item.photoUrl,item.imageBucket,'thumbnail') || item.photoUrl} alt="" loading="lazy" decoding="async" onError={(event)=>{event.currentTarget.style.display='none';}}/>}</div>
          <div className="admin-top-doctor-info"><strong>{item.name}</strong><small>{item.subtitle || '—'}</small><span className={`admin-top-doctor-status ${item.status}`}>{item.statusLabel}</span></div>
          <div className="admin-top-doctor-metric"><strong>{item.metricText}</strong>{item.metricDetail && <small>{item.metricDetail}</small>}</div>
          <Link className="admin-top-doctor-view" to={item.path}>View Profile</Link>
        </div>)}
        {!card.items.length && <div className="empty-inline">এই period-এ ranking data নেই।</div>}
      </div>
    </article>;
  })}</div>;
}
function AdminOverviewSkeleton() {
  return <div className="admin-overview-skeleton" aria-label="Admin dashboard loading" aria-busy="true">
    <section className="admin-skeleton-panel"><span className="admin-skeleton-line short"/><span className="admin-skeleton-line medium"/><div className="admin-skeleton-grid four">{Array.from({ length: 8 }, (_, index) => <span className="admin-skeleton-card" key={index}/>)}</div></section>
    <section className="admin-skeleton-panel"><span className="admin-skeleton-line short"/><span className="admin-skeleton-line medium"/><div className="admin-skeleton-grid two"><span className="admin-skeleton-chart"/><span className="admin-skeleton-chart"/></div></section>
  </div>;
}

function AdminAnalyticsSkeleton({ rows = 6 }: { rows?: number }) {
  return <div className="admin-analytics-skeleton" aria-busy="true">{Array.from({ length: rows }, (_, index) => <span key={index}/>)}</div>;
}

function AdminRetryState({ message, onRetry, disabled = false }: { message: string; onRetry: () => void; disabled?: boolean }) {
  return <div className="admin-inline-error" role="alert"><AlertTriangle/><span>{message}</span><button type="button" onClick={onRetry} disabled={disabled}><RefreshCw/>Retry</button></div>;
}

const messageFrom = (error: unknown) => error instanceof Error ? error.message : 'Admin data লোড করা যায়নি।';
const dateLabel = (value: string) => new Intl.DateTimeFormat('bn-BD', { dateStyle: 'medium' }).format(new Date(value));

export default function AdminDashboardPage() {
  const { account } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab') as Tab | null;
  const [tab, setTab] = useState<Tab>(requestedTab && ['overview', 'users', 'appointments', 'activity'].includes(requestedTab) ? requestedTab : 'overview');
  const [summary, setSummary] = useState<AdminOperationalSummary | null>(null);
  const [trends, setTrends] = useState<AdminOperationalTrendRow[]>([]);
  const [analytics, setAnalytics] = useState<AdminHighLevelAnalytics | null>(null);
  const [analyticsRange, setAnalyticsRange] = useState<AdminAnalyticsRangeKey>('30d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [topDoctors, setTopDoctors] = useState<AdminTopDoctorsAnalytics | null>(null);
  const [topDoctorRange, setTopDoctorRange] = useState<AdminTopDoctorRangeKey>('30d');
  const [topDoctorsLoading, setTopDoctorsLoading] = useState(false);
  const [topDoctorsError, setTopDoctorsError] = useState<string | null>(null);
  const [hospitalAnalytics, setHospitalAnalytics] = useState<AdminHospitalEngagementAnalytics | null>(null);
  const [hospitalRange, setHospitalRange] = useState<AdminTopDoctorRangeKey>('30d');
  const [hospitalAnalyticsLoading, setHospitalAnalyticsLoading] = useState(false);
  const [hospitalAnalyticsError, setHospitalAnalyticsError] = useState<string | null>(null);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [appointments, setAppointments] = useState<AdminAppointmentRow[]>([]);
  const [activity, setActivity] = useState<AdminActivityRow[]>([]);
  const [usersHasMore, setUsersHasMore] = useState(false);
  const [appointmentsHasMore, setAppointmentsHasMore] = useState(false);
  const [usersLoadingMore, setUsersLoadingMore] = useState(false);
  const [appointmentsLoadingMore, setAppointmentsLoadingMore] = useState(false);
  const [role, setRole] = useState<UserRole | 'all'>('all');
  const [userStatus, setUserStatus] = useState('all');
  const [userSearch, setUserSearch] = useState('');
  const [appointmentStatus, setAppointmentStatus] = useState<AppointmentStatus | 'all'>('all');
  const [appointmentSearch, setAppointmentSearch] = useState('');
  const [userAction, setUserAction] = useState<{ user: AdminUserRow; status: 'active' | 'suspended' } | null>(null);
  const [appointmentAction, setAppointmentAction] = useState<{ item: AdminAppointmentRow; status: AppointmentStatus } | null>(null);
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [bulkUserReason, setBulkUserReason] = useState('');
  const [bulkUserWorking, setBulkUserWorking] = useState(false);
  const [bulkUserConfirm, setBulkUserConfirm] = useState<'active' | 'suspended' | null>(null);

  async function loadOverview() {
    setLoading(true); setError(null);
    try {
      const [summaryData, trendData] = await Promise.all([getAdminOperationalSummary(), getAdminOperationalTrends()]);
      setSummary(summaryData); setTrends(trendData);
    } catch (loadError) { setError(messageFrom(loadError)); } finally { setLoading(false); }
  }

  async function loadUsers(reset = true) {
    const offset = reset ? 0 : users.length;
    if (reset) setLoading(true); else setUsersLoadingMore(true);
    setError(null);
    try {
      const userData = await getAdminUserDirectory({
        role: role === 'all' ? null : role,
        status: userStatus === 'all' ? null : userStatus,
        search: userSearch,
        limit: ADMIN_LIST_PAGE_SIZE,
        offset,
      });
      setUsers((current) => {
        if (reset) return userData;
        const seen = new Set(current.map((user) => user.user_id));
        return [...current, ...userData.filter((user) => !seen.has(user.user_id))];
      });
      const total = Number(userData[0]?.total_count ?? offset + userData.length);
      setUsersHasMore(userData.length === ADMIN_LIST_PAGE_SIZE && offset + userData.length < total);
      if (reset) setSelectedUserIds((current) => current.filter((id) => userData.some((user) => user.user_id === id)));
    } catch (loadError) { setError(messageFrom(loadError)); }
    finally { if (reset) setLoading(false); else setUsersLoadingMore(false); }
  }

  async function loadAppointments(reset = true) {
    const offset = reset ? 0 : appointments.length;
    if (reset) setLoading(true); else setAppointmentsLoadingMore(true);
    setError(null);
    try {
      const nextRows = await getAdminAppointmentDirectory({
        status: appointmentStatus === 'all' ? null : appointmentStatus,
        search: appointmentSearch,
        limit: ADMIN_LIST_PAGE_SIZE,
        offset,
      });
      setAppointments((current) => {
        if (reset) return nextRows;
        const seen = new Set(current.map((item) => item.appointment_id));
        return [...current, ...nextRows.filter((item) => !seen.has(item.appointment_id))];
      });
      const total = Number(nextRows[0]?.total_count ?? offset + nextRows.length);
      setAppointmentsHasMore(nextRows.length === ADMIN_LIST_PAGE_SIZE && offset + nextRows.length < total);
    }
    catch (loadError) { setError(messageFrom(loadError)); }
    finally { if (reset) setLoading(false); else setAppointmentsLoadingMore(false); }
  }

  async function loadActivity() {
    setLoading(true); setError(null);
    try { setActivity(await getAdminActivity()); }
    catch (loadError) { setError(messageFrom(loadError)); } finally { setLoading(false); }
  }

  async function loadAnalytics(nextRange: AdminAnalyticsRangeKey = analyticsRange, from = customFrom, to = customTo) {
    if (nextRange === 'custom' && (!from || !to)) { setAnalyticsError('Custom range-এর শুরু ও শেষ তারিখ দিন।'); return; }
    setAnalyticsLoading(true); setAnalyticsError(null);
    try {
      const data = await getAdminHighLevelAnalytics({ range: nextRange, from, to });
      setAnalytics(data); setAnalyticsRange(nextRange);
    } catch (loadError) { setAnalyticsError(messageFrom(loadError)); } finally { setAnalyticsLoading(false); }
  }

  async function loadTopDoctors(nextRange: AdminTopDoctorRangeKey = topDoctorRange) {
    setTopDoctorsLoading(true); setTopDoctorsError(null);
    try {
      const data = await getAdminTopDoctorsAnalytics(nextRange,5);
      setTopDoctors(data); setTopDoctorRange(nextRange);
    } catch (loadError) { setTopDoctorsError(messageFrom(loadError)); } finally { setTopDoctorsLoading(false); }
  }

  async function loadHospitalAnalytics(nextRange: AdminTopDoctorRangeKey = hospitalRange) {
    setHospitalAnalyticsLoading(true); setHospitalAnalyticsError(null);
    try {
      const data = await getAdminHospitalEngagementAnalytics(nextRange,5);
      setHospitalAnalytics(data); setHospitalRange(nextRange);
    } catch (loadError) { setHospitalAnalyticsError(messageFrom(loadError)); } finally { setHospitalAnalyticsLoading(false); }
  }

  useEffect(() => {
    if (!account || !['admin', 'super_admin'].includes(account.role)) return;
    if (tab === 'overview') {
      void loadOverview();
      void loadAnalytics(analyticsRange);
      void loadTopDoctors(topDoctorRange);
      void loadHospitalAnalytics(hospitalRange);
      return;
    }
    if (tab === 'users') { void loadUsers(true); return; }
    if (tab === 'appointments') { void loadAppointments(true); return; }
    if (tab === 'activity') void loadActivity();
  }, [account?.user_id, account?.role, tab]);
  useEffect(() => {
    const next = searchParams.get('tab') as Tab | null;
    if (next && ['overview', 'users', 'appointments', 'activity'].includes(next) && next !== tab) setTab(next);
    if (!next && tab !== 'overview') setTab('overview');
  }, [searchParams]);
  if (account && !['admin', 'super_admin'].includes(account.role)) return <Navigate to="/dashboard" replace />;

  async function searchUsers(event: FormEvent) { event.preventDefault(); setSelectedUserIds([]); await loadUsers(true); }
  async function searchAppointments(event: FormEvent) { event.preventDefault(); await loadAppointments(true); }
  function closeAction() { setUserAction(null); setAppointmentAction(null); setReason(''); setConfirmed(false); }

  async function applyUserStatus() {
    if (!userAction) return;
    if (userAction.status === 'suspended' && reason.trim().length < 3) { setError('Suspend করার কারণ কমপক্ষে ৩ অক্ষরে লিখুন।'); return; }
    if (!confirmed) { setConfirmed(true); return; }
    setWorking(true); setError(null);
    try { await setAdminUserAccountStatus({ userId: userAction.user.user_id, status: userAction.status, reason }); setNotice(`${userAction.user.full_name || 'User'} account ${userAction.status} করা হয়েছে।`); closeAction(); await loadUsers(); }
    catch (actionError) { setError(messageFrom(actionError)); } finally { setWorking(false); }
  }


  const canBulkManageUser = (user: AdminUserRow) => user.user_id !== account?.user_id
    && !['admin', 'super_admin'].includes(user.role)
    && (user.account_status !== 'banned' || account?.role === 'super_admin');
  const bulkManageableUsers = users.filter(canBulkManageUser);
  const allBulkUsersSelected = bulkManageableUsers.length > 0 && bulkManageableUsers.every((user) => selectedUserIds.includes(user.user_id));

  function toggleUserSelection(userId: string) {
    setBulkUserConfirm(null);
    setSelectedUserIds((current) => current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId]);
  }

  function toggleAllUsers() {
    setBulkUserConfirm(null);
    setSelectedUserIds(allBulkUsersSelected ? [] : bulkManageableUsers.map((user) => user.user_id));
  }

  async function applyBulkUserStatus(status: 'active' | 'suspended') {
    const targets = users.filter((user) => selectedUserIds.includes(user.user_id) && canBulkManageUser(user));
    if (!targets.length) return;
    if (status === 'suspended' && bulkUserReason.trim().length < 3) { setError('Bulk suspend-এর common reason কমপক্ষে ৩ অক্ষরে লিখুন।'); return; }
    if (bulkUserConfirm !== status) { setBulkUserConfirm(status); return; }
    setBulkUserWorking(true); setError(null); setNotice(null);
    const results = await Promise.allSettled(targets.map((user) => setAdminUserAccountStatus({ userId: user.user_id, status, reason: bulkUserReason })));
    const failed = results.filter((result) => result.status === 'rejected').length;
    const succeeded = results.length - failed;
    setNotice(`${succeeded}টি account ${status === 'suspended' ? 'suspend' : 'restore'} করা হয়েছে${failed ? `, ${failed}টি ব্যর্থ হয়েছে` : ''}।`);
    if (failed) setError('কিছু account update হয়নি। Permission/status conflict থাকতে পারে; তালিকা refresh করে আবার চেষ্টা করুন।');
    setSelectedUserIds([]); setBulkUserReason(''); setBulkUserConfirm(null); setBulkUserWorking(false);
    await loadUsers();
  }

  async function applyAppointmentStatus() {
    if (!appointmentAction) return;
    if (reason.trim().length < 3) { setError('Override করার কারণ কমপক্ষে ৩ অক্ষরে লিখুন।'); return; }
    if (!confirmed) { setConfirmed(true); return; }
    setWorking(true); setError(null);
    try { await overrideAdminAppointmentStatus({ appointmentId: appointmentAction.item.appointment_id, status: appointmentAction.status, reason }); setNotice('Appointment status override করা হয়েছে।'); closeAction(); await loadAppointments(); }
    catch (actionError) { setError(messageFrom(actionError)); } finally { setWorking(false); }
  }

  function refreshCurrent() {
    if (tab === 'overview') {
      void loadOverview(); void loadAnalytics(); void loadTopDoctors(); void loadHospitalAnalytics();
      return;
    }
    if (tab === 'users') { void loadUsers(true); return; }
    if (tab === 'appointments') { void loadAppointments(true); return; }
    void loadActivity();
  }
  const analyticsBusy = analyticsLoading || topDoctorsLoading || hospitalAnalyticsLoading;
  const refreshBusy = loading || (tab === 'overview' && analyticsBusy);

  const trendChartData = trends.map((item) => ({
    ...item,
    label: new Intl.DateTimeFormat('bn-BD', { month: 'short', day: 'numeric' }).format(new Date(`${item.day}T00:00:00`)),
  }));

  const analyticsMetric = (key: keyof NonNullable<AdminHighLevelAnalytics['metrics']>) => analytics?.metrics[key] ?? { current: 0, previous: 0, growth_pct: 0 };
  const growthLabel = (growth: number | null) => growth == null ? 'নতুন' : `${growth > 0 ? '+' : ''}${growth.toLocaleString('en-US')}%`;
  const analyticsChartData = (analytics?.series ?? []).map((item) => ({
    ...item,
    label: new Intl.DateTimeFormat('bn-BD', analytics?.range.bucket === 'month' ? { month: 'short', year: '2-digit' } : { month: 'short', day: 'numeric' }).format(new Date(`${item.period}T00:00:00`)),
  }));
  const engagementDonut = [
    { name: 'Call', value: analyticsMetric('calls').current, fill: '#51479b' },
    { name: 'WhatsApp', value: analyticsMetric('whatsapp').current, fill: '#0f766e' },
    { name: 'Follow/Save', value: analyticsMetric('follows').current, fill: '#316bb2' },
    { name: 'Reviews', value: analyticsMetric('reviews').current, fill: '#a85168' },
  ].filter((item) => item.value > 0);
  const percent = (value: number, total: number) => total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  const topDoctorMetricText = (metric: AdminTopDoctorMetricKey, value: number) => metric === 'rating' ? `${Number(value).toFixed(2)} ★` : Math.round(Number(value)).toLocaleString('en-US');
  const topHospitalMetricText = (metric: AdminTopHospitalMetricKey, value: number) => metric === 'rating' ? `${Number(value).toFixed(2)} ★` : Math.round(Number(value)).toLocaleString('en-US');
  const topDoctorRankingCards: AdminRankingDisplayCard[] = topDoctorRankingConfig.map(([metric,title,icon]) => ({
    key:`doctor-${metric}`, title, icon, items:(topDoctors?.rankings[metric] ?? []).map((doctor) => ({
      id:doctor.doctor_id, rank:doctor.rank, name:doctor.name, photoUrl:doctor.photo_url, imageBucket:'avatars',
      subtitle:[doctor.degree,doctor.specialty].filter(Boolean).join(' • ') || 'Doctor', status:doctor.status,
      statusLabel:topEntityStatusLabels[doctor.status] || doctor.verification_status || doctor.status,
      metricText:topDoctorMetricText(metric,doctor.metric_value),
      metricDetail:metric==='rating' && doctor.sample_count>0 ? `${doctor.sample_count} review${doctor.sample_count===1?'':'s'}` : undefined,
      path:doctor.profile_slug?`/doctor/${doctor.profile_slug}`:`/doctors/${doctor.doctor_id}`,
    })),
  }));
  const topHospitalRankingCards: AdminRankingDisplayCard[] = topHospitalRankingConfig.map(([metric,title,icon]) => ({
    key:`hospital-${metric}`, title, icon, items:(hospitalAnalytics?.rankings[metric] ?? []).map((hospital) => ({
      id:hospital.provider_id, rank:hospital.rank, name:hospital.name, photoUrl:hospital.photo_url, imageBucket:'public-images',
      subtitle:hospital.subtitle || 'Hospital', status:hospital.status,
      statusLabel:topEntityStatusLabels[hospital.status] || hospital.verification_status || hospital.status,
      metricText:topHospitalMetricText(metric,hospital.metric_value),
      metricDetail:metric==='rating' && hospital.sample_count>0 ? `${hospital.sample_count} review${hospital.sample_count===1?'':'s'}` : metric==='appointments' && hospital.sample_count>0 ? `${hospital.sample_count} submitted` : undefined,
      path:hospital.slug?`/hospital/${hospital.slug}`:`/hospital/${hospital.provider_id}`,
    })),
  }));
  const visitorEngagement = hospitalAnalytics?.engagement ?? { doctor_saves:0,hospital_saves:0,calls:0,whatsapp:0,appointments:0,reviews:0,shares:0,map_clicks:0 };
  const visitorEngagementDonut = [
    {name:'Doctor Saves',value:visitorEngagement.doctor_saves,fill:'#6257ad'},
    {name:'Hospital Saves',value:visitorEngagement.hospital_saves,fill:'#0f766e'},
    {name:'Calls',value:visitorEngagement.calls,fill:'#316bb2'},
    {name:'WhatsApp',value:visitorEngagement.whatsapp,fill:'#239b6c'},
    {name:'Appointments',value:visitorEngagement.appointments,fill:'#a66c16'},
    {name:'Reviews',value:visitorEngagement.reviews,fill:'#a85168'},
    {name:'Shares',value:visitorEngagement.shares,fill:'#7b63c3'},
    {name:'Map / Direction',value:visitorEngagement.map_clicks,fill:'#397d78'},
  ].filter((item)=>item.value>0);
  const visitorEngagementCards: { label:string; value:number; icon:typeof Heart }[] = [
    {label:'Doctor Saves',value:visitorEngagement.doctor_saves,icon:Heart},
    {label:'Hospital Saves',value:visitorEngagement.hospital_saves,icon:Building2},
    {label:'Calls',value:visitorEngagement.calls,icon:PhoneCall},
    {label:'WhatsApp',value:visitorEngagement.whatsapp,icon:MessageCircle},
    {label:'Appointments',value:visitorEngagement.appointments,icon:CalendarDays},
    {label:'Reviews',value:visitorEngagement.reviews,icon:MessageSquareText},
    {label:'Shares',value:visitorEngagement.shares,icon:Share2},
    {label:'Map / Direction',value:visitorEngagement.map_clicks,icon:MapPin},
  ];

  const roles = (['patient', 'doctor', 'hospital', 'chamber', 'ambulance', 'verification_officer', ...(account?.role === 'super_admin' ? ['admin', 'super_admin'] : [])] as UserRole[]);
  const summaryCards = summary ? [
    { label: 'Total Doctors', value: summary.doctors ?? 0, icon: Stethoscope, tone: 'violet' },
    { label: 'Total Hospitals', value: summary.hospitals ?? summary.role_counts.hospital ?? 0, icon: Building2, tone: 'teal' },
    { label: 'Total Patients', value: summary.patients ?? summary.role_counts.patient ?? 0, icon: UserRound, tone: 'blue' },
    { label: 'Premium Members', value: summary.premium_members ?? 0, icon: Crown, tone: 'amber' },
    { label: 'Verified Doctors', value: summary.verified_doctors ?? 0, icon: BadgeCheck, tone: 'green' },
    { label: 'Appointments', value: summary.total_appointments ?? 0, icon: CalendarDays, tone: 'indigo' },
    { label: 'Prescriptions', value: summary.total_prescriptions ?? 0, icon: FileText, tone: 'rose' },
    { label: 'Reviews', value: summary.total_reviews ?? 0, icon: MessageSquareText, tone: 'cyan' },
  ] as const : [];

  const pendingActions = summary ? [
    { label: 'Pending Doctor Verification', count: summary.pending_doctor_verifications ?? summary.pending_doctors ?? 0, path: '/verification/reviews', icon: ShieldCheck, detail: 'Doctor verification queue review করুন', tone: 'verification' },
    { label: 'Pending Hospital Verification', count: summary.pending_hospital_verifications ?? 0, path: '/verification/reviews', icon: Building2, detail: 'Hospital verification queue review করুন', tone: 'verification' },
    { label: 'Premium Requests', count: summary.premium_requests ?? summary.pending_premium_memberships ?? 0, path: '/admin/premium?filter=pending', icon: Crown, detail: 'Pending Premium requests সিদ্ধান্ত দিন', tone: 'premium' },
    { label: 'Expiring Premium', count: summary.expiring_premium_memberships ?? 0, path: '/admin/premium?filter=expiring', icon: Clock3, detail: 'আগামী 30 দিনের expiry review করুন', tone: 'expiry' },
    ...(summary.flagged_reviews_supported ? [{ label: 'Reported / Flagged Reviews', count: summary.flagged_reviews ?? 0, path: '/admin?tab=activity', icon: Flag, detail: 'Existing review reports queue দেখুন', tone: 'review' }] : []),
    { label: 'Pending Appointments', count: summary.pending_appointments ?? 0, path: '/admin?tab=appointments', icon: CalendarDays, detail: 'Pending appointment oversight খুলুন', tone: 'appointment' },
    { label: 'Push Delivery Issues', count: summary.failed_push_deliveries ?? 0, path: '/admin?tab=activity', icon: AlertTriangle, detail: 'Failed push delivery activity review করুন', tone: 'system' },
  ].filter((item) => item.count > 0) : [];
  const pendingActionTotal = pendingActions.reduce((total, item) => total + Number(item.count || 0), 0);

  const quickActions = [
    { label: 'Doctor Verification', path: '/verification/reviews', icon: ShieldCheck },
    { label: 'Hospital Management', path: '/admin?tab=users', icon: Building2 },
    { label: 'Premium Management', path: '/admin/premium', icon: Crown },
    { label: 'Categories', path: '/admin/cms?tab=specialties', icon: Settings2 },
    { label: 'Prescription Footer', path: '/admin/cms?tab=prescription', icon: FileText },
    { label: 'Notifications', path: '/notifications', icon: Bell },
    { label: 'Users', path: '/admin?tab=users', icon: Users },
    { label: 'Appointments', path: '/admin?tab=appointments', icon: CalendarDays },
    { label: 'Activity Log', path: '/admin?tab=activity', icon: Activity },
    { label: 'Storage Cleanup', path: '/admin/storage-cleanup', icon: HardDrive },
    ...(account?.role === 'super_admin' ? [{ label: 'Super Admin', path: '/super-admin', icon: UserCog }] : []),
  ];
  return <div className="app-shell admin-page"><main className="admin-main container">
    <header className="admin-command-header">
      <div className="admin-command-title">
        <span className="admin-command-icon"><UserCog /></span>
        <div><small>Operations control</small><h1>Admin Dashboard</h1><p>অপারেশন, যাচাই ও কনটেন্ট দ্রুত পরিচালনা করুন।</p></div>
      </div>
      <button className="admin-refresh-button" onClick={refreshCurrent} disabled={refreshBusy}><RefreshCw className={refreshBusy ? 'spin' : ''} /><span>{refreshBusy ? 'Updating' : 'Refresh'}</span></button>
    </header>

    <nav className="admin-tabs" aria-label="Admin dashboard sections">{([['overview', Activity, 'Overview'], ['users', Users, 'Users'], ['appointments', CalendarDays, 'Appointments'], ['activity', Clock3, 'Activity']] as const).map(([value, Icon, label]) => <button className={tab === value ? 'active' : ''} key={value} onClick={() => { setTab(value); setSearchParams(value === 'overview' ? {} : { tab: value }); }}><Icon /> <span>{label}</span></button>)}</nav>
    {error && <div className="error-box">{error}</div>}
    {notice && <div className="auth-message success">{notice}</div>}
    {loading && tab === 'overview' && <AdminOverviewSkeleton/>}
    {loading && tab !== 'overview' && <div className="admin-list-skeleton" aria-busy="true">{Array.from({length:5},(_,index)=><span key={index}/>)}</div>}

    {!loading && tab === 'overview' && summary && <div className="admin-overview-stack">
      <section className="admin-priority-panel admin-action-center" aria-labelledby="admin-priority-title">
        <div className="admin-section-heading"><div><small>Priority operations</small><h2 id="admin-priority-title">Action Center</h2><p>Verification, Premium এবং operational queue এক নজরে।</p></div><span className={pendingActions.length ? 'attention' : 'clear'}>{pendingActions.length ? `${pendingActionTotal.toLocaleString('en-US')} pending` : 'সব ঠিক আছে'}</span></div>
        {pendingActions.length ? <div className="admin-priority-grid">{pendingActions.map(({ label, count, path, icon: Icon, detail, tone }) => <Link key={label} to={path} className={`admin-priority-card tone-${tone}`}><span><Icon /></span><div><strong>{Number(count).toLocaleString('en-US')}</strong><b>{label}</b><small>{detail}</small></div><ArrowRight /></Link>)}</div> : <div className="admin-priority-empty"><CheckCircle2 /><div><strong>কোনো urgent pending action নেই</strong><small>নতুন verification, appointment, Premium request বা system issue এলে এখানে দেখা যাবে।</small></div></div>}
      </section>

      <section className="admin-summary-section" aria-labelledby="admin-summary-title">
        <div className="admin-section-heading"><div><small>Live summary</small><h2 id="admin-summary-title">Platform overview</h2></div><span>বর্তমান ডেটা</span></div>
        <div className="admin-summary-grid">{summaryCards.map(({ label, value, icon: Icon, tone }) => <article key={label} className={`admin-summary-card ${tone}`}><span><Icon /></span><div><strong>{Number(value).toLocaleString('en-US')}</strong><small>{label}</small></div></article>)}</div>
      </section>

      <section className="admin-quick-section" aria-labelledby="admin-quick-title">
        <div className="admin-section-heading"><div><small>Shortcuts</small><h2 id="admin-quick-title">Quick Actions</h2></div><Sparkles /></div>
        <div className="admin-quick-grid">{quickActions.map(({ label, path, icon: Icon }) => <Link key={`${label}-${path}`} to={path}><span><Icon /></span><b>{label}</b><ArrowRight /></Link>)}</div>
      </section>


      <section className="admin-analytics-section" aria-labelledby="admin-analytics-title">
        <header className="admin-analytics-header">
          <div><small>Actual database activity</small><h2 id="admin-analytics-title">High-Level Analytics</h2><p>Selected period-এর activity আগের একই দৈর্ঘ্যের period-এর সঙ্গে compare করা হচ্ছে।</p></div>
          <div className="admin-analytics-range" aria-label="Analytics range">
            {([['today','Today'],['7d','7 Days'],['30d','30 Days'],['90d','3 Months'],['1y','1 Year'],['custom','Custom']] as const).map(([value,label]) => <button key={value} className={analyticsRange===value?'active':''} disabled={analyticsLoading} onClick={() => { if(value==='custom'){ setAnalyticsRange('custom'); return; } void loadAnalytics(value); }}>{label}</button>)}
          </div>
        </header>
        {analyticsRange==='custom' && <div className="admin-analytics-custom"><label>From<input type="date" value={customFrom} max={customTo || undefined} onChange={(event)=>setCustomFrom(event.target.value)} /></label><label>To<input type="date" value={customTo} min={customFrom || undefined} max={new Date().toISOString().slice(0,10)} onChange={(event)=>setCustomTo(event.target.value)} /></label><button disabled={analyticsLoading || !customFrom || !customTo} onClick={()=>void loadAnalytics('custom',customFrom,customTo)}>{analyticsLoading?<LoaderCircle className="spin"/>:'Apply'}</button></div>}
        {analyticsError && !analytics && <AdminRetryState message={analyticsError} onRetry={()=>void loadAnalytics()} disabled={analyticsLoading}/>} 
        {analyticsError && analytics && <div className="error-box admin-analytics-error">{analyticsError}</div>}
        {analyticsLoading && !analytics && <AdminAnalyticsSkeleton rows={8}/>} 
        {analyticsLoading && analytics && <div className="admin-section-updating"><LoaderCircle className="spin"/> Analytics update হচ্ছে…</div>}
        {analytics && <>
          <div className="admin-analytics-kpis">
            {([
              ['Total users growth','users',Users],['Doctor growth','doctors',Stethoscope],['Hospital growth','hospitals',Building2],['Patient growth','patients',UserRound],['Appointments','appointments',CalendarDays],['Prescriptions','prescriptions',FileText],['Followers / Saved','follows',Heart],['Reviews','reviews',MessageSquareText],['Premium growth','premium',Crown],
            ] as const).map(([label,key,Icon])=>{const m=analyticsMetric(key);return <article key={key}><span><Icon/></span><div><strong>{(key==='users'?summary.total_users:m.current).toLocaleString('en-US')}</strong><small>{label}{key==='users'?` • ${m.current.toLocaleString('en-US')} new`:''}</small><em className={m.growth_pct!=null&&m.growth_pct<0?'down':'up'}><TrendingUp/> {growthLabel(m.growth_pct)} vs previous</em></div></article>})}
            <article className="actions"><span><PhoneCall/></span><div><strong>{analyticsMetric('calls').current.toLocaleString('en-US')} <small>calls</small></strong><strong>{analyticsMetric('whatsapp').current.toLocaleString('en-US')} <small>WhatsApp</small></strong><em><MessageCircle/> Profile actions</em></div></article>
          </div>

          <div className="admin-analytics-chart-grid">
            <article className="admin-analytics-chart-card wide"><header><div><small>Growth</small><h3>Users & provider growth</h3></div><span>{analytics.range.from} → {analytics.range.to}</span></header><div className="admin-analytics-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={analyticsChartData} margin={{top:10,right:8,left:-20,bottom:0}}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={18}/><YAxis allowDecimals={false} tickLine={false} axisLine={false}/><Tooltip/><Legend/><Line type="monotone" dataKey="users" name="Users" stroke="#51479b" strokeWidth={2} dot={analyticsChartData.length<=1}/><Line type="monotone" dataKey="doctors" name="Doctors" stroke="#0f766e" strokeWidth={2} dot={analyticsChartData.length<=1}/><Line type="monotone" dataKey="hospitals" name="Hospitals" stroke="#316bb2" strokeWidth={2} dot={analyticsChartData.length<=1}/><Line type="monotone" dataKey="patients" name="Patients" stroke="#a85168" strokeWidth={2} dot={analyticsChartData.length<=1}/><Line type="monotone" dataKey="premium" name="Premium" stroke="#a66c16" strokeWidth={2} dot={analyticsChartData.length<=1}/></LineChart></ResponsiveContainer></div></article>

            <article className="admin-analytics-chart-card"><header><div><small>Clinical activity</small><h3>Appointments & prescriptions</h3></div></header><div className="admin-analytics-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={analyticsChartData} margin={{top:10,right:6,left:-22,bottom:0}}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={18}/><YAxis allowDecimals={false} tickLine={false} axisLine={false}/><Tooltip/><Legend/><Bar dataKey="appointments" name="Appointments" fill="#51479b" radius={[4,4,0,0]}/><Bar dataKey="prescriptions" name="Prescriptions" fill="#0f766e" radius={[4,4,0,0]}/><Bar dataKey="follows" name="Follow/Save" fill="#316bb2" radius={[4,4,0,0]}/><Bar dataKey="reviews" name="Reviews" fill="#a85168" radius={[4,4,0,0]}/></BarChart></ResponsiveContainer></div></article>

            <article className="admin-analytics-chart-card"><header><div><small>Engagement</small><h3>Action mix</h3></div></header><div className="admin-analytics-donut">{engagementDonut.length?<ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={engagementDonut} dataKey="value" nameKey="name" innerRadius="54%" outerRadius="78%" paddingAngle={2}>{engagementDonut.map((entry)=><Cell key={entry.name} fill={entry.fill}/>)}</Pie><Tooltip/><Legend verticalAlign="bottom" height={38}/></PieChart></ResponsiveContainer>:<div className="empty-inline">এই period-এ engagement event নেই।</div>}</div></article>
          </div>

          <div className="admin-analytics-progress-grid">
            {[
              {label:'Active account ratio',value:summary.active_users,total:summary.total_users},
              {label:'Verified doctor coverage',value:summary.verified_doctors??0,total:summary.doctors??0},
              {label:'Premium coverage',value:summary.premium_members??0,total:(summary.doctors??0)+(summary.hospitals??0)},
            ].map((item)=>{const pct=percent(item.value,item.total);return <article key={item.label}><div className="admin-circular-kpi" style={{background:`conic-gradient(#51479b ${pct*3.6}deg,#edf0ef 0deg)`}}><span>{pct}%</span></div><div><strong>{item.label}</strong><small>{item.value.toLocaleString('en-US')} of {item.total.toLocaleString('en-US')}</small></div></article>})}
          </div>
        </>}
      </section>

      <section className="admin-top-doctors-section" aria-labelledby="admin-top-doctors-title">
        <header className="admin-top-doctors-header">
          <div><small>Actual Doctor activity</small><h2 id="admin-top-doctors-title">Top Doctors</h2><p>Prescription, Saved/Follow, profile actions, appointments এবং genuine patient reviews-এর ranking.</p></div>
          <div className="admin-top-doctors-range" aria-label="Top Doctors range">
            {([['today','Today'],['7d','7 Days'],['30d','30 Days'],['all','All Time']] as const).map(([value,label]) => <button key={value} className={topDoctorRange===value?'active':''} disabled={topDoctorsLoading} onClick={()=>void loadTopDoctors(value)}>{label}</button>)}
          </div>
        </header>
        {topDoctorsError && !topDoctors && <AdminRetryState message={topDoctorsError} onRetry={()=>void loadTopDoctors()} disabled={topDoctorsLoading}/>} 
        {topDoctorsError && topDoctors && <div className="error-box admin-top-doctors-error">{topDoctorsError}</div>}
        {topDoctorsLoading && !topDoctors && <AdminAnalyticsSkeleton rows={6}/>} 
        {topDoctorsLoading && topDoctors && <div className="admin-section-updating"><LoaderCircle className="spin"/> Ranking update হচ্ছে…</div>}
        {topDoctors && <AdminRankingCards cards={topDoctorRankingCards}/>}
      </section>

      <section className="admin-top-doctors-section admin-hospital-engagement-section" aria-labelledby="admin-top-hospitals-title">
        <header className="admin-top-doctors-header">
          <div><small>Hospital + visitor activity</small><h2 id="admin-top-hospitals-title">Top Hospitals & Visitor Engagement</h2><p>Hospital rankings এবং public Doctor/Hospital interaction summary একই actual event sources থেকে aggregate করা হচ্ছে।</p></div>
          <div className="admin-top-doctors-range" aria-label="Hospital analytics range">
            {([['today','Today'],['7d','7 Days'],['30d','30 Days'],['all','All Time']] as const).map(([value,label]) => <button key={value} className={hospitalRange===value?'active':''} disabled={hospitalAnalyticsLoading} onClick={()=>void loadHospitalAnalytics(value)}>{label}</button>)}
          </div>
        </header>
        {hospitalAnalyticsError && !hospitalAnalytics && <AdminRetryState message={hospitalAnalyticsError} onRetry={()=>void loadHospitalAnalytics()} disabled={hospitalAnalyticsLoading}/>} 
        {hospitalAnalyticsError && hospitalAnalytics && <div className="error-box admin-top-doctors-error">{hospitalAnalyticsError}</div>}
        {hospitalAnalyticsLoading && !hospitalAnalytics && <AdminAnalyticsSkeleton rows={6}/>} 
        {hospitalAnalyticsLoading && hospitalAnalytics && <div className="admin-section-updating"><LoaderCircle className="spin"/> Hospital analytics update হচ্ছে…</div>}
        {hospitalAnalytics && <>
          <div className="admin-visitor-engagement-layout">
            <div className="admin-visitor-engagement-kpis">
              {visitorEngagementCards.map(({label,value,icon:Icon}) => <article key={label}><span><Icon/></span><div><strong>{value.toLocaleString('en-US')}</strong><small>{label}</small></div></article>)}
            </div>
            <article className="admin-visitor-engagement-donut-card"><header><small>Interaction distribution</small><h3>Visitor action mix</h3></header><div className="admin-visitor-engagement-donut">{visitorEngagementDonut.length?<ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={visitorEngagementDonut} dataKey="value" nameKey="name" innerRadius="52%" outerRadius="76%" paddingAngle={2}>{visitorEngagementDonut.map((entry)=><Cell key={entry.name} fill={entry.fill}/>)}</Pie><Tooltip/><Legend verticalAlign="bottom" height={52}/></PieChart></ResponsiveContainer>:<div className="empty-inline">এই period-এ visitor engagement নেই।</div>}</div></article>
          </div>
          <AdminRankingCards cards={topHospitalRankingCards}/>
        </>}
      </section>

      <section className="admin-trend-card"><header><div><small>গত ৩০ দিন</small><h2>Signup & appointment trend</h2><p>Daily নতুন user signup এবং appointment creation activity.</p></div><span>{trends.reduce((total, item) => total + item.new_users, 0)} users • {trends.reduce((total, item) => total + item.appointments, 0)} appointments</span></header><div className="admin-trend-chart">{trendChartData.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={trendChartData} margin={{ top: 12, right: 8, left: -18, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={18} /><YAxis allowDecimals={false} tickLine={false} axisLine={false} /><Tooltip cursor={{ fill: 'rgba(81, 71, 155, 0.06)' }} /><Legend /><Bar dataKey="new_users" name="New users" fill="#51479b" radius={[5, 5, 0, 0]} /><Bar dataKey="appointments" name="Appointments" fill="#0f766e" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer> : <div className="empty-inline">Trend data নেই।</div>}</div></section>

      <section className="admin-support-grid">
        <article><header><h2>Account health</h2><Users /></header><dl><div><dt>Active</dt><dd>{summary.active_users}</dd></div><div><dt>Suspended</dt><dd>{summary.suspended_users}</dd></div><div><dt>Banned</dt><dd>{summary.banned_users}</dd></div></dl><Link to="/admin?tab=users">User management <ArrowRight /></Link></article>
        <article><header><h2>Service queue</h2><Ambulance /></header><dl><div><dt>Pending Doctors</dt><dd>{summary.pending_doctors}</dd></div><div><dt>Pending Providers</dt><dd>{summary.pending_providers}</dd></div><div><dt>Pending Ambulances</dt><dd>{summary.pending_ambulances}</dd></div></dl><Link to="/verification/reviews">Review queue <ArrowRight /></Link></article>
        <article><header><h2>Role distribution</h2><Stethoscope /></header><div className="admin-role-compact">{Object.entries(summary.role_counts).map(([key, value]) => <span key={key}><b>{roleLabels[key as UserRole] || key}</b><small>{value}</small></span>)}</div><Link to="/admin/cms">CMS & settings <ArrowRight /></Link></article>
      </section>
    </div>}

  {!loading && tab === 'users' && <section className="admin-panel"><div className="admin-panel-title"><div><h2>User management</h2><p>Admin/Super Admin ছাড়া operational account suspend বা restore করুন।</p></div><b>{users[0]?.total_count ?? 0} users</b></div><form className="admin-filters" onSubmit={searchUsers}><select value={role} onChange={(event) => setRole(event.target.value as UserRole | 'all')}><option value="all">সব role</option>{roles.map((item) => <option value={item} key={item}>{roleLabels[item]}</option>)}</select><select value={userStatus} onChange={(event) => setUserStatus(event.target.value)}><option value="all">সব status</option><option value="active">Active</option><option value="suspended">Suspended</option><option value="banned">Banned</option></select><label><Search /><input value={userSearch} onChange={(event) => setUserSearch(event.target.value)} placeholder="নাম, ইমেইল বা ফোন" /></label><button>খুঁজুন</button></form>{selectedUserIds.length > 0 && <div className="admin-bulk-bar"><div><strong>{selectedUserIds.length} selected</strong><small>প্রতিটি account action আলাদা audit log তৈরি করবে।</small></div><input value={bulkUserReason} onChange={(event) => { setBulkUserReason(event.target.value); setBulkUserConfirm(null); }} placeholder="Common reason (suspend-এর জন্য required)" /><button className={bulkUserConfirm === 'suspended' ? 'danger confirming' : 'danger'} disabled={bulkUserWorking} onClick={() => void applyBulkUserStatus('suspended')}>{bulkUserWorking ? <LoaderCircle className="spin" /> : bulkUserConfirm === 'suspended' ? 'Confirm suspend' : 'Suspend selected'}</button><button className={bulkUserConfirm === 'active' ? 'primary confirming' : 'primary'} disabled={bulkUserWorking} onClick={() => void applyBulkUserStatus('active')}>{bulkUserConfirm === 'active' ? 'Confirm restore' : 'Restore selected'}</button><button onClick={() => { setSelectedUserIds([]); setBulkUserConfirm(null); }}>Clear</button></div>}<div className="admin-user-select-all"><label><input type="checkbox" checked={allBulkUsersSelected} onChange={toggleAllUsers} disabled={!bulkManageableUsers.length} /> <span>এই পাতার manageable users নির্বাচন</span></label></div><div className="admin-user-list">{users.map((user) => { const manageable = canBulkManageUser(user); return <article key={user.user_id} className={selectedUserIds.includes(user.user_id) ? 'selected' : ''}><label className="admin-user-checkbox" title={manageable ? 'Select user' : 'এই user bulk action-এ নেওয়া যাবে না'}><input type="checkbox" checked={selectedUserIds.includes(user.user_id)} onChange={() => toggleUserSelection(user.user_id)} disabled={!manageable} /></label><div className="admin-user-avatar">{(user.full_name || 'U').slice(0, 1).toUpperCase()}</div><div><strong>{user.full_name || 'নাম দেওয়া হয়নি'}</strong><small>{user.email || user.phone || 'যোগাযোগ নেই'}</small><p>{roleLabels[user.role]} {user.professional_status && <b>{user.professional_status}</b>}</p></div><span className={`admin-status ${user.account_status}`}>{user.account_status}</span>{manageable && <button className={user.account_status === 'active' ? 'suspend' : 'activate'} onClick={() => { setUserAction({ user, status: user.account_status === 'active' ? 'suspended' : 'active' }); setReason(''); setConfirmed(false); }}>{user.account_status === 'active' ? 'Suspend' : 'Restore'}</button>}</article>; })}{!users.length && <p className="empty-inline">কোনো user পাওয়া যায়নি।</p>}</div>{usersHasMore && <div className="public-load-more-wrap"><button className="public-load-more-button" type="button" disabled={usersLoadingMore} onClick={() => void loadUsers(false)}>{usersLoadingMore ? <LoaderCircle className="spin" /> : null}{usersLoadingMore ? 'আরও লোড হচ্ছে…' : 'আরও users দেখুন'}</button></div>}</section>}

  {!loading && tab === 'appointments' && <section className="admin-panel"><div className="admin-panel-title"><div><h2>Appointment oversight</h2><p>বিরোধ বা support case-এ reason সহ status override করুন।</p></div><b>{appointments[0]?.total_count ?? 0} appointments</b></div><form className="admin-filters admin-appointment-filters" onSubmit={searchAppointments}><select value={appointmentStatus} onChange={(event) => setAppointmentStatus(event.target.value as AppointmentStatus | 'all')}><option value="all">সব status</option>{appointmentStatuses.map((item) => <option key={item} value={item}>{item}</option>)}</select><label><Search /><input value={appointmentSearch} onChange={(event) => setAppointmentSearch(event.target.value)} placeholder="Patient, Doctor বা Provider" /></label><button>খুঁজুন</button></form><div className="admin-appointment-list">{appointments.map((item) => <article key={item.appointment_id}><div><strong>{item.patient_name} <small>→</small> {item.doctor_name}</strong><p>{item.provider_name || 'Provider নেই'} • {dateLabel(item.appointment_date)} {item.start_time?.slice(0, 5)}</p>{item.patient_note && <small>Note: {item.patient_note}</small>}</div><span className={`appointment-status ${item.status}`}>{item.status}</span><select value="" onChange={(event) => { if (event.target.value) { setAppointmentAction({ item, status: event.target.value as AppointmentStatus }); setReason(''); setConfirmed(false); } }}><option value="">Override…</option>{appointmentStatuses.filter((statusItem) => statusItem !== item.status).map((statusItem) => <option key={statusItem} value={statusItem}>{statusItem}</option>)}</select></article>)}{!appointments.length && <p className="empty-inline">কোনো appointment পাওয়া যায়নি।</p>}</div>{appointmentsHasMore && <div className="public-load-more-wrap"><button className="public-load-more-button" type="button" disabled={appointmentsLoadingMore} onClick={() => void loadAppointments(false)}>{appointmentsLoadingMore ? <LoaderCircle className="spin" /> : null}{appointmentsLoadingMore ? 'আরও লোড হচ্ছে…' : 'আরও appointments দেখুন'}</button></div>}</section>}

  {!loading && tab === 'activity' && <section className="admin-panel"><div className="admin-panel-title"><div><h2>{account?.role === 'super_admin' ? 'Sensitive audit trail' : 'আমার সাম্প্রতিক activity'}</h2><p>{account?.role === 'super_admin' ? 'সব privileged actor-এর immutable action history।' : 'Admin হিসেবে আপনার করা action-গুলো; full audit শুধুমাত্র Super Admin দেখতে পারেন।'}</p></div><b>{activity.length} records</b></div><div className="admin-activity-list">{activity.map((item) => <article key={item.audit_id}><span><Activity /></span><div><strong>{item.action.replaceAll('_', ' ')}</strong><p>{item.actor_name || 'System'} • {item.target_type || 'target'} {item.target_id?.slice(0, 8) || ''}</p><small>{Object.entries(item.metadata).slice(0, 3).map(([key, value]) => `${key}: ${String(value ?? '—')}`).join(' • ')}</small></div><time>{dateLabel(item.created_at)}</time></article>)}{!activity.length && <p className="empty-inline">কোনো activity নেই।</p>}</div></section>}

  {(userAction || appointmentAction) && <div className="verification-overlay" role="dialog" aria-modal="true"><section className="admin-action-dialog"><header><div><small>Audited operation</small><h2>{userAction ? `${userAction.status === 'suspended' ? 'Suspend' : 'Restore'} user account` : 'Override appointment status'}</h2></div><button onClick={closeAction}><X /></button></header><p>{userAction ? `${userAction.user.full_name || 'User'} (${roleLabels[userAction.user.role]})` : `${appointmentAction?.item.patient_name} → ${appointmentAction?.item.doctor_name}: ${appointmentAction?.item.status} → ${appointmentAction?.status}`}</p><label>কারণ {userAction?.status === 'active' && <small>ঐচ্ছিক</small>}<textarea rows={4} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Support case বা operational কারণ লিখুন" /></label>{confirmed && <div className="admin-confirm"><ShieldCheck /> এই action notification ও audit log তৈরি করবে। নিশ্চিত?</div>}<footer><button onClick={closeAction}>বাতিল</button><button className="primary" disabled={working} onClick={() => void (userAction ? applyUserStatus() : applyAppointmentStatus())}>{working ? <LoaderCircle className="spin" /> : confirmed ? <><CheckCircle2 /> হ্যাঁ, প্রয়োগ করুন</> : 'পরবর্তী ধাপ'}</button></footer></section></div>}</main></div>;
}
