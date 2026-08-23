import { type ReactNode, useEffect, useMemo, useState } from 'react';
import {
  Activity, BarChart3,
  Ambulance,
  Building2,
  CalendarDays,
  CircleHelp,
  Crown,
  Bug,
  Droplets,
  FileCheck2,
  HeartPulse,
  Eye,
  KeyRound,
  LayoutDashboard,
  Link2,
  Languages,
  LogOut,
  Mail,
  MapPin,
  Menu,
  MessageCircle,
  PanelsTopLeft,
  Search,
  Settings,
  Settings2,
  ShieldCheck,
  Stethoscope,
  UserCircle,
  Users,
  X,
} from 'lucide-react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getAdminOperationalSummary } from '../services/adminDashboard';
import { getMyPendingVerificationCount } from '../services/verification';
import type { DashboardRole } from '../types';
import { SITE_NAME } from '../lib/brand';
import NotificationBell from './NotificationBell';
import AccountStateFallback from './AccountStateFallback';
import { useVisitorLanguage } from '../contexts/VisitorLanguageContext';

interface DashboardShellProps {
  role: DashboardRole;
  children: ReactNode;
}

interface DashboardMenuItem {
  label: string;
  path: string;
  icon: typeof LayoutDashboard;
  badge?: number;
  exact?: boolean;
}

function locationKey(pathname: string, search: string) {
  return `${pathname}${search}`;
}

function isRouteActive(pathname: string, search: string, target: string, exact = false) {
  const [targetPath, targetSearch = ''] = target.split('?');
  if (exact) return pathname === targetPath && (targetSearch ? search === `?${targetSearch}` : search === '');
  if (targetSearch) return pathname === targetPath && search === `?${targetSearch}`;
  if (targetPath === '/dashboard') return pathname === '/dashboard';
  return pathname === targetPath || pathname.startsWith(`${targetPath}/`);
}

export default function DashboardShell({ role, children }: DashboardShellProps) {
  const { account, loading, accountError, refreshAccount, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pendingVerification, setPendingVerification] = useState(0);
  const [pendingAppointments, setPendingAppointments] = useState(0);
  const [loggingOut, setLoggingOut] = useState(false);
  const { language, setLanguage } = useVisitorLanguage();
  const tr = (bn: string, en: string) => language === 'bn' ? bn : en;

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!['admin', 'super_admin'].includes(role) || account?.role !== role) {
      setPendingAppointments(0);
      if (role !== 'verification_officer') setPendingVerification(0);
      return;
    }

    let active = true;
    void getAdminOperationalSummary()
      .then((summary) => {
        if (!active) return;
        setPendingVerification(summary.pending_verifications ?? 0);
        setPendingAppointments(summary.pending_appointments ?? 0);
      })
      .catch(() => {
        if (!active) return;
        setPendingVerification(0);
        setPendingAppointments(0);
      });

    return () => { active = false; };
  }, [account?.role, location.pathname, role]);

  useEffect(() => {
    if (role !== 'verification_officer' || account?.role !== 'verification_officer') {
      return;
    }
    let active = true;
    void getMyPendingVerificationCount()
      .then((count) => { if (active) setPendingVerification(count); })
      .catch(() => { if (active) setPendingVerification(0); });
    return () => { active = false; };
  }, [account?.role, location.pathname, role]);

  const menuItems = useMemo<DashboardMenuItem[]>(() => {
    switch (role) {
      case 'doctor':
        return [
          { label: tr('অবস্থান ও পাবলিক ম্যাপ', 'Location & Public Map'), path: '/doctor/chambers', icon: MapPin },
          { label: tr('সেটিংস', 'Settings'), path: '/doctor/settings', icon: KeyRound },
          { label: tr('পাবলিক কনটেন্ট ব্যবস্থাপনা', 'Public Content Management'), path: '/doctor/public-content', icon: PanelsTopLeft },
          { label: tr('ভেরিফিকেশন আবেদন', 'Verification Application'), path: '/doctor/verification', icon: ShieldCheck },
          { label: tr('অ্যাডমিন সহায়তা', 'Support / Chat with Admin'), path: '/doctor/support', icon: MessageCircle },
          { label: tr('মতামত / সমস্যা জানান', 'Feedback / Bug Report'), path: '/doctor/feedback', icon: Bug },
          { label: tr('সাধারণ প্রশ্ন / সহায়তা', 'FAQ / Help'), path: '/doctor/help', icon: CircleHelp },
        ];
      case 'patient':
        return [
          { label: tr('ড্যাশবোর্ড', 'Dashboard'), path: '/dashboard', icon: LayoutDashboard },
          { label: tr('অ্যাপয়েন্টমেন্ট', 'Appointments'), path: '/appointments', icon: CalendarDays },
          { label: tr('ডাক্তার খুঁজুন', 'Find Doctors'), path: '/doctors', icon: Search },
          { label: tr('ব্লাড ব্যাংক', 'Blood Bank'), path: '/blood', icon: Droplets },
          { label: tr('প্রোফাইল', 'Profile'), path: '/profile', icon: UserCircle },
          { label: tr('সেটিংস', 'Settings'), path: '/settings', icon: Settings },
        ];
      case 'admin':
        return [
          { label: 'Dashboard', path: '/admin', icon: LayoutDashboard, exact: true },
          { label: 'Users', path: '/admin?tab=users', icon: Users },
          { label: 'Appointments', path: '/admin?tab=appointments', icon: CalendarDays, badge: pendingAppointments },
          { label: 'Activity', path: '/admin?tab=activity', icon: Activity },
          { label: 'CMS', path: '/admin/cms', icon: Settings2 },
          { label: 'Doctor Support', path: '/admin/doctor-support', icon: MessageCircle },
          { label: 'Premium', path: '/admin/premium', icon: Crown },
          { label: 'Verification queue', path: '/verification/reviews', icon: ShieldCheck, badge: pendingVerification },
        ];
      case 'super_admin':
        return [
          { label: 'Dashboard', path: '/super-admin', icon: LayoutDashboard, exact: true },
          { label: 'Users control', path: '/super-admin?tab=users', icon: Users },
          { label: 'Invites', path: '/super-admin?tab=invites', icon: Mail },
          { label: 'Admin operations', path: '/admin', icon: Activity },
          { label: 'Appointments', path: '/admin?tab=appointments', icon: CalendarDays, badge: pendingAppointments },
          { label: 'CMS', path: '/admin/cms', icon: Settings2 },
          { label: 'Doctor Support', path: '/admin/doctor-support', icon: MessageCircle },
          { label: 'Premium', path: '/admin/premium', icon: Crown },
          { label: 'Verification queue', path: '/verification/reviews', icon: ShieldCheck, badge: pendingVerification },
        ];
      case 'verification_officer':
        return [
          { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
          { label: 'Verification queue', path: '/verification/reviews', icon: ShieldCheck, badge: pendingVerification },
        ];
      case 'hospital':
        return [
          { label: tr('ড্যাশবোর্ড', 'Dashboard'), path: '/dashboard', icon: LayoutDashboard },
          { label: tr('পরিসংখ্যান', 'Analytics'), path: '/provider/analytics', icon: BarChart3 },
          { label: tr('প্রিমিয়াম সদস্যতা', 'Premium Membership'), path: '/provider/premium', icon: Crown },
          { label: tr('প্রোফাইল ও ওয়েবসাইট', 'Profile & Website'), path: '/provider/profile', icon: Building2 },
          { label: tr('ডাক্তার', 'Doctors'), path: '/provider/doctors', icon: Stethoscope },
          { label: tr('অ্যাপয়েন্টমেন্ট', 'Appointments'), path: '/provider/appointments', icon: CalendarDays },
          { label: tr('অ্যাম্বুলেন্স সংযোগ', 'Ambulance Links'), path: '/provider/ambulances', icon: Link2 },
          { label: tr('ভেরিফিকেশন প্রমাণপত্র', 'Verification Evidence'), path: '/verification/evidence', icon: FileCheck2 },
        ];
      case 'chamber':
        return [
          { label: tr('ড্যাশবোর্ড', 'Dashboard'), path: '/dashboard', icon: LayoutDashboard },
          { label: tr('পরিসংখ্যান', 'Analytics'), path: '/provider/analytics', icon: BarChart3 },
          { label: tr('প্রিমিয়াম সদস্যতা', 'Premium Membership'), path: '/provider/premium', icon: Crown },
          { label: tr('প্রোফাইল ও ওয়েবসাইট', 'Profile & Website'), path: '/provider/profile', icon: Building2 },
          { label: tr('ডাক্তার', 'Doctors'), path: '/provider/doctors', icon: Stethoscope },
          { label: tr('অ্যাপয়েন্টমেন্ট', 'Appointments'), path: '/provider/appointments', icon: CalendarDays },
          { label: tr('ভেরিফিকেশন প্রমাণপত্র', 'Verification Evidence'), path: '/verification/evidence', icon: FileCheck2 },
        ];
      case 'ambulance':
        return [
          { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
          { label: 'Service profile', path: '/ambulance/services', icon: Ambulance },
          { label: 'Hospital links', path: '/ambulance/hospitals', icon: Building2 },
        ];
    }
  }, [language, pendingAppointments, pendingVerification, role]);

  const doctorPrimaryItems = role === 'doctor' ? [
    { label: tr('অ্যাপয়েন্টমেন্ট ব্যবস্থাপনা', 'Appointment Management'), path: '/doctor/appointments', icon: CalendarDays },
    { label: tr('প্রেসক্রিপশন', 'Prescription'), path: '/doctor/prescriptions', icon: FileCheck2 },
    { label: tr('পরিসংখ্যান', 'Analytics'), path: '/doctor/analytics', icon: BarChart3 },
    { label: tr('আমার প্রোফাইল', 'My Profile'), path: '/doctor/profile', icon: UserCircle },
    { label: tr('পাবলিক প্রোফাইল দেখুন', 'Public Profile View'), path: '/doctor/public-view', icon: Eye },
  ] : [];

  if (loading) return <AccountStateFallback loading />;
  if (!account) return <AccountStateFallback message={accountError} onRetry={refreshAccount} onSignOut={signOut} />;
  if (account.role !== role) return <Navigate to="/dashboard" replace />;

  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await signOut();
      navigate('/', { replace: true });
    } finally {
      setLoggingOut(false);
    }
  }

  const panelName = ({
    doctor: tr('ডাক্তার', 'Doctor'), patient: tr('রোগী', 'Patient'), admin: tr('অ্যাডমিন', 'Admin'),
    super_admin: tr('সুপার অ্যাডমিন', 'Super Admin'), verification_officer: tr('যাচাইকরণ', 'Verification'),
    hospital: tr('হাসপাতাল', 'Hospital'), chamber: tr('চেম্বার', 'Chamber'), ambulance: tr('অ্যাম্বুলেন্স', 'Ambulance'),
  } as Record<DashboardRole, string>)[role];

  const navigation = (
    <>
      <Link className="dashboard-shell-brand" to={role === 'doctor' ? '/doctor/appointments' : '/dashboard'} aria-label={`${SITE_NAME} dashboard`}>
        <span className="dashboard-shell-brand-icon"><HeartPulse aria-hidden="true" /></span>
        <div>
          <strong>{SITE_NAME}</strong>
          <small>{panelName}</small>
        </div>
      </Link>

      <div className="dashboard-shell-notification-slot"><NotificationBell placement="sidebar" /></div>

      <nav className="dashboard-shell-nav" aria-label={`${role} dashboard navigation`}>
        {menuItems.map(({ label, path, icon: Icon, badge, exact }) => {
          const active = isRouteActive(location.pathname, location.search, path, exact);
          return (
            <Link
              key={path}
              to={path}
              className={`dashboard-shell-nav-item${active ? ' active' : ''}`}
              aria-current={active ? 'page' : undefined}
            >
              <Icon aria-hidden="true" />
              <span>{label}</span>
              {typeof badge === 'number' && badge > 0 && (
                <b className="dashboard-shell-badge" aria-label={`${badge} pending items`}>{badge > 99 ? '99+' : badge}</b>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="dashboard-shell-bottom">
        <div className="public-language-toggle dashboard-language-toggle" role="group" aria-label="Language">
          <Languages size={15} aria-hidden="true" />
          <button type="button" className={language === 'bn' ? 'active' : ''} onClick={() => setLanguage('bn')} aria-pressed={language === 'bn'}>বাংলা</button>
          <span aria-hidden="true">|</span>
          <button type="button" className={language === 'en' ? 'active' : ''} onClick={() => setLanguage('en')} aria-pressed={language === 'en'}>EN</button>
        </div>
        <button type="button" className="dashboard-shell-logout" onClick={() => void logout()} disabled={loggingOut}>
          <LogOut aria-hidden="true" />
          <span>{loggingOut ? tr('লগআউট হচ্ছে…', 'Logging out…') : tr('লগআউট', 'Logout')}</span>
        </button>
      </div>
    </>
  );

  return (
    <div className="dashboard-shell" data-role={role} data-location={locationKey(location.pathname, location.search)}>
      <aside className="dashboard-shell-sidebar">{navigation}</aside>

      <header className="dashboard-shell-mobile-header">
        <button
          type="button"
          className="dashboard-shell-menu-button"
          aria-label={`Open ${role} dashboard menu`}
          aria-expanded={drawerOpen}
          onClick={() => setDrawerOpen(true)}
        >
          <Menu aria-hidden="true" />
        </button>
        <Link className="dashboard-shell-mobile-brand" to={role === 'doctor' ? '/doctor/appointments' : '/dashboard'} aria-label={`${SITE_NAME} dashboard`}>
          <HeartPulse aria-hidden="true" />
          <strong>{SITE_NAME}</strong>
        </Link>
        <span className="dashboard-shell-role-label">{panelName}</span>
        <div className="public-language-toggle dashboard-mobile-language-toggle" role="group" aria-label="Language"><button type="button" className={language === 'bn' ? 'active' : ''} onClick={() => setLanguage('bn')}>বাং</button><span>|</span><button type="button" className={language === 'en' ? 'active' : ''} onClick={() => setLanguage('en')}>EN</button></div>
        <NotificationBell placement="mobile" />
      </header>

      {drawerOpen && <button type="button" className="dashboard-shell-backdrop" aria-label={`Close ${role} dashboard menu`} onClick={() => setDrawerOpen(false)} />}
      <aside className={`dashboard-shell-drawer${drawerOpen ? ' open' : ''}`} aria-hidden={!drawerOpen}>
        <button type="button" className="dashboard-shell-drawer-close" aria-label={`Close ${role} dashboard menu`} onClick={() => setDrawerOpen(false)}>
          <X aria-hidden="true" />
        </button>
        {navigation}
      </aside>

      <main className={`dashboard-shell-content${role === 'doctor' ? ' doctor-shell-content' : ''}`}>
        {role === 'doctor' && <nav className="doctor-primary-nav" aria-label="Doctor primary navigation">{doctorPrimaryItems.map(({ label, path, icon: Icon }) => { const active = isRouteActive(location.pathname, location.search, path); return <Link key={path} to={path} className={active ? 'active' : ''} aria-current={active ? 'page' : undefined}><Icon /><span>{label}</span></Link>; })}</nav>}
        {children}
      </main>
    </div>
  );
}
