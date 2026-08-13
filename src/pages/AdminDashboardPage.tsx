import { FormEvent, useEffect, useState } from 'react';
import { Activity, Ambulance, ArrowLeft, CalendarDays, CheckCircle2, Clock3, LoaderCircle, RefreshCw, Search, ShieldCheck, Stethoscope, UserCog, Users, X } from 'lucide-react';
import { Link, Navigate } from 'react-router-dom';
import PublicHeader from '../components/PublicHeader';
import { useAuth } from '../contexts/AuthContext';
import { getAdminActivity, getAdminAppointmentDirectory, getAdminOperationalSummary, getAdminUserDirectory, overrideAdminAppointmentStatus, setAdminUserAccountStatus } from '../services/adminDashboard';
import type { AdminActivityRow, AdminAppointmentRow, AdminOperationalSummary, AdminUserRow, AppointmentStatus, UserRole } from '../types';

type Tab = 'overview' | 'users' | 'appointments' | 'activity';
const roleLabels: Record<UserRole, string> = { patient: 'Patient', doctor: 'Doctor', chamber: 'Chamber', hospital: 'Hospital', ambulance: 'Ambulance', verification_officer: 'Verification Officer', admin: 'Admin', super_admin: 'Super Admin' };
const appointmentStatuses: AppointmentStatus[] = ['pending', 'confirmed', 'rejected', 'cancelled', 'completed', 'no_show'];
const messageFrom = (error: unknown) => error instanceof Error ? error.message : 'Admin data লোড করা যায়নি।';
const dateLabel = (value: string) => new Intl.DateTimeFormat('bn-BD', { dateStyle: 'medium' }).format(new Date(value));

export default function AdminDashboardPage() {
  const { account } = useAuth();
  const [tab, setTab] = useState<Tab>('overview');
  const [summary, setSummary] = useState<AdminOperationalSummary | null>(null);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [appointments, setAppointments] = useState<AdminAppointmentRow[]>([]);
  const [activity, setActivity] = useState<AdminActivityRow[]>([]);
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

  async function loadAll() {
    setLoading(true); setError(null);
    try {
      const [summaryData, userData, appointmentData, activityData] = await Promise.all([
        getAdminOperationalSummary(),
        getAdminUserDirectory({ role: role === 'all' ? null : role, status: userStatus === 'all' ? null : userStatus, search: userSearch }),
        getAdminAppointmentDirectory({ status: appointmentStatus === 'all' ? null : appointmentStatus, search: appointmentSearch }),
        getAdminActivity(),
      ]);
      setSummary(summaryData); setUsers(userData); setAppointments(appointmentData); setActivity(activityData);
    } catch (loadError) { setError(messageFrom(loadError)); } finally { setLoading(false); }
  }

  useEffect(() => { if (account && ['admin', 'super_admin'].includes(account.role)) void loadAll(); }, [account]);
  if (account && !['admin', 'super_admin'].includes(account.role)) return <Navigate to="/dashboard" replace />;

  async function searchUsers(event: FormEvent) { event.preventDefault(); setLoading(true); setError(null); try { setUsers(await getAdminUserDirectory({ role: role === 'all' ? null : role, status: userStatus === 'all' ? null : userStatus, search: userSearch })); } catch (searchError) { setError(messageFrom(searchError)); } finally { setLoading(false); } }
  async function searchAppointments(event: FormEvent) { event.preventDefault(); setLoading(true); setError(null); try { setAppointments(await getAdminAppointmentDirectory({ status: appointmentStatus === 'all' ? null : appointmentStatus, search: appointmentSearch })); } catch (searchError) { setError(messageFrom(searchError)); } finally { setLoading(false); } }
  function closeAction() { setUserAction(null); setAppointmentAction(null); setReason(''); setConfirmed(false); }

  async function applyUserStatus() {
    if (!userAction) return;
    if (userAction.status === 'suspended' && reason.trim().length < 3) { setError('Suspend করার কারণ কমপক্ষে ৩ অক্ষরে লিখুন।'); return; }
    if (!confirmed) { setConfirmed(true); return; }
    setWorking(true); setError(null);
    try { await setAdminUserAccountStatus({ userId: userAction.user.user_id, status: userAction.status, reason }); setNotice(`${userAction.user.full_name || 'User'} account ${userAction.status} করা হয়েছে।`); closeAction(); await loadAll(); }
    catch (actionError) { setError(messageFrom(actionError)); } finally { setWorking(false); }
  }

  async function applyAppointmentStatus() {
    if (!appointmentAction) return;
    if (reason.trim().length < 3) { setError('Override করার কারণ কমপক্ষে ৩ অক্ষরে লিখুন।'); return; }
    if (!confirmed) { setConfirmed(true); return; }
    setWorking(true); setError(null);
    try { await overrideAdminAppointmentStatus({ appointmentId: appointmentAction.item.appointment_id, status: appointmentAction.status, reason }); setNotice('Appointment status override করা হয়েছে।'); closeAction(); await loadAll(); }
    catch (actionError) { setError(messageFrom(actionError)); } finally { setWorking(false); }
  }

  const roles = (['patient', 'doctor', 'hospital', 'chamber', 'ambulance', 'verification_officer', ...(account?.role === 'super_admin' ? ['admin', 'super_admin'] : [])] as UserRole[]);
  return <div className="app-shell admin-page"><PublicHeader /><main className="admin-main container"><Link className="back-link" to="/dashboard"><ArrowLeft /> Dashboard-এ ফিরুন</Link><header className="admin-heading"><span><UserCog /></span><div><small>Operations control</small><h1>Admin dashboard</h1><p>Users, verification, appointments ও operational activity এক জায়গা থেকে পরিচালনা করুন।</p></div><button onClick={() => void loadAll()}><RefreshCw /> Refresh</button></header><nav className="admin-tabs">{([['overview', Activity, 'Overview'], ['users', Users, 'Users'], ['appointments', CalendarDays, 'Appointments'], ['activity', Clock3, 'Activity']] as const).map(([value, Icon, label]) => <button className={tab === value ? 'active' : ''} key={value} onClick={() => setTab(value)}><Icon /> {label}</button>)}</nav>{error && <div className="error-box">{error}</div>}{notice && <div className="auth-message success">{notice}</div>}{loading && <div className="loading-box"><LoaderCircle className="spin" /> Admin data লোড হচ্ছে…</div>}

  {!loading && tab === 'overview' && summary && <><section className="admin-stats"><article><span><Users /></span><div><strong>{summary.total_users}</strong><small>মোট ব্যবহারকারী</small></div></article><article><span><ShieldCheck /></span><div><strong>{summary.pending_verifications}</strong><small>Pending verification</small></div></article><article><span><CalendarDays /></span><div><strong>{summary.appointments_today}</strong><small>আজকের appointment</small></div></article><article><span><Clock3 /></span><div><strong>{summary.pending_appointments}</strong><small>Pending appointment</small></div></article></section><section className="admin-overview-grid"><article><h2>Service overview</h2><div className="admin-service-counts"><span><Stethoscope /><b>{summary.doctors}</b><small>Doctors</small></span><span><Users /><b>{summary.providers}</b><small>Providers</small></span><span><Ambulance /><b>{summary.ambulances}</b><small>Ambulances</small></span></div><p>{summary.active_users} active • {summary.suspended_users} suspended • {summary.banned_users} banned</p></article><article><h2>Verification oversight</h2><dl><div><dt>Doctor</dt><dd>{summary.pending_doctors}</dd></div><div><dt>Provider</dt><dd>{summary.pending_providers}</dd></div><div><dt>Ambulance</dt><dd>{summary.pending_ambulances}</dd></div></dl><Link to="/verification/reviews"><ShieldCheck /> Review queue খুলুন</Link></article><article><h2>Role distribution</h2><div className="admin-role-counts">{Object.entries(summary.role_counts).map(([key, value]) => <span key={key}><b>{roleLabels[key as UserRole] || key}</b><small>{value}</small></span>)}</div></article></section></>}

  {!loading && tab === 'users' && <section className="admin-panel"><div className="admin-panel-title"><div><h2>User management</h2><p>Admin/Super Admin ছাড়া operational account suspend বা restore করুন।</p></div><b>{users[0]?.total_count ?? 0} users</b></div><form className="admin-filters" onSubmit={searchUsers}><select value={role} onChange={(event) => setRole(event.target.value as UserRole | 'all')}><option value="all">সব role</option>{roles.map((item) => <option value={item} key={item}>{roleLabels[item]}</option>)}</select><select value={userStatus} onChange={(event) => setUserStatus(event.target.value)}><option value="all">সব status</option><option value="active">Active</option><option value="suspended">Suspended</option><option value="banned">Banned</option></select><label><Search /><input value={userSearch} onChange={(event) => setUserSearch(event.target.value)} placeholder="নাম, ইমেইল বা ফোন" /></label><button>খুঁজুন</button></form><div className="admin-user-list">{users.map((user) => <article key={user.user_id}><div className="admin-user-avatar">{(user.full_name || 'U').slice(0, 1).toUpperCase()}</div><div><strong>{user.full_name || 'নাম দেওয়া হয়নি'}</strong><small>{user.email || user.phone || 'যোগাযোগ নেই'}</small><p>{roleLabels[user.role]} {user.professional_status && <b>{user.professional_status}</b>}</p></div><span className={`admin-status ${user.account_status}`}>{user.account_status}</span>{user.user_id !== account?.user_id && !['admin', 'super_admin'].includes(user.role) && (user.account_status !== 'banned' || account?.role === 'super_admin') && <button className={user.account_status === 'active' ? 'suspend' : 'activate'} onClick={() => { setUserAction({ user, status: user.account_status === 'active' ? 'suspended' : 'active' }); setReason(''); setConfirmed(false); }}>{user.account_status === 'active' ? 'Suspend' : 'Restore'}</button>}</article>)}{!users.length && <p className="empty-inline">কোনো user পাওয়া যায়নি।</p>}</div></section>}

  {!loading && tab === 'appointments' && <section className="admin-panel"><div className="admin-panel-title"><div><h2>Appointment oversight</h2><p>বিরোধ বা support case-এ reason সহ status override করুন।</p></div><b>{appointments[0]?.total_count ?? 0} appointments</b></div><form className="admin-filters admin-appointment-filters" onSubmit={searchAppointments}><select value={appointmentStatus} onChange={(event) => setAppointmentStatus(event.target.value as AppointmentStatus | 'all')}><option value="all">সব status</option>{appointmentStatuses.map((item) => <option key={item} value={item}>{item}</option>)}</select><label><Search /><input value={appointmentSearch} onChange={(event) => setAppointmentSearch(event.target.value)} placeholder="Patient, Doctor বা Provider" /></label><button>খুঁজুন</button></form><div className="admin-appointment-list">{appointments.map((item) => <article key={item.appointment_id}><div><strong>{item.patient_name} <small>→</small> {item.doctor_name}</strong><p>{item.provider_name || 'Provider নেই'} • {dateLabel(item.appointment_date)} {item.start_time?.slice(0, 5)}</p>{item.patient_note && <small>Note: {item.patient_note}</small>}</div><span className={`appointment-status ${item.status}`}>{item.status}</span><select value="" onChange={(event) => { if (event.target.value) { setAppointmentAction({ item, status: event.target.value as AppointmentStatus }); setReason(''); setConfirmed(false); } }}><option value="">Override…</option>{appointmentStatuses.filter((statusItem) => statusItem !== item.status).map((statusItem) => <option key={statusItem} value={statusItem}>{statusItem}</option>)}</select></article>)}{!appointments.length && <p className="empty-inline">কোনো appointment পাওয়া যায়নি।</p>}</div></section>}

  {!loading && tab === 'activity' && <section className="admin-panel"><div className="admin-panel-title"><div><h2>{account?.role === 'super_admin' ? 'Sensitive audit trail' : 'আমার সাম্প্রতিক activity'}</h2><p>{account?.role === 'super_admin' ? 'সব privileged actor-এর immutable action history।' : 'Admin হিসেবে আপনার করা action-গুলো; full audit শুধুমাত্র Super Admin দেখতে পারেন।'}</p></div><b>{activity.length} records</b></div><div className="admin-activity-list">{activity.map((item) => <article key={item.audit_id}><span><Activity /></span><div><strong>{item.action.replaceAll('_', ' ')}</strong><p>{item.actor_name || 'System'} • {item.target_type || 'target'} {item.target_id?.slice(0, 8) || ''}</p><small>{Object.entries(item.metadata).slice(0, 3).map(([key, value]) => `${key}: ${String(value ?? '—')}`).join(' • ')}</small></div><time>{dateLabel(item.created_at)}</time></article>)}{!activity.length && <p className="empty-inline">কোনো activity নেই।</p>}</div></section>}

  {(userAction || appointmentAction) && <div className="verification-overlay" role="dialog" aria-modal="true"><section className="admin-action-dialog"><header><div><small>Audited operation</small><h2>{userAction ? `${userAction.status === 'suspended' ? 'Suspend' : 'Restore'} user account` : 'Override appointment status'}</h2></div><button onClick={closeAction}><X /></button></header><p>{userAction ? `${userAction.user.full_name || 'User'} (${roleLabels[userAction.user.role]})` : `${appointmentAction?.item.patient_name} → ${appointmentAction?.item.doctor_name}: ${appointmentAction?.item.status} → ${appointmentAction?.status}`}</p><label>কারণ {userAction?.status === 'active' && <small>ঐচ্ছিক</small>}<textarea rows={4} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Support case বা operational কারণ লিখুন" /></label>{confirmed && <div className="admin-confirm"><ShieldCheck /> এই action notification ও audit log তৈরি করবে। নিশ্চিত?</div>}<footer><button onClick={closeAction}>বাতিল</button><button className="primary" disabled={working} onClick={() => void (userAction ? applyUserStatus() : applyAppointmentStatus())}>{working ? <LoaderCircle className="spin" /> : confirmed ? <><CheckCircle2 /> হ্যাঁ, প্রয়োগ করুন</> : 'পরবর্তী ধাপ'}</button></footer></section></div>}</main></div>;
}
