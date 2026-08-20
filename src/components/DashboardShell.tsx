import { type ReactNode, useEffect, useMemo, useState } from 'react';
import {
  Activity, BarChart3,
  Ambulance,
  Building2,
  CalendarDays,
  Clock,
  Crown,
  Droplets,
  FileCheck2,
  HeartPulse,
  LayoutDashboard,
  Link2,
  LogOut,
  Mail,
  Menu,
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
import { getMyDoctorProviderInvitations } from '../services/providerDashboard';
import { getVerificationReviewQueue } from '../services/verification';
import type { DashboardRole } from '../types';
import { SITE_NAME } from '../lib/brand';
import NotificationBell from './NotificationBell';

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

const panelLabels: Record<DashboardRole, string> = {
  doctor: 'Doctor',
  patient: 'Patient',
  admin: 'Admin',
  super_admin: 'Super Admin',
  verification_officer: 'Verification',
  hospital: 'Hospital',
  chamber: 'Chamber',
  ambulance: 'Ambulance',
};

export default function DashboardShell({ role, children }: DashboardShellProps) {
  const { account, loading, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pendingInvitations, setPendingInvitations] = useState(0);
  const [pendingVerification, setPendingVerification] = useState(0);
  const [pendingAppointments, setPendingAppointments] = useState(0);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (role !== 'doctor' || account?.role !== 'doctor') {
      setPendingInvitations(0);
      return;
    }

    let active = true;
    void getMyDoctorProviderInvitations()
      .then((rows) => {
        if (active) setPendingInvitations(rows.filter((row) => row.link_status === 'pending').length);
      })
      .catch(() => {
        if (active) setPendingInvitations(0);
      });

    return () => { active = false; };
  }, [account?.role, location.pathname, role]);

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
    void getVerificationReviewQueue(null, 'pending')
      .then((rows) => { if (active) setPendingVerification(rows.length); })
      .catch(() => { if (active) setPendingVerification(0); });
    return () => { active = false; };
  }, [account?.role, location.pathname, role]);

  const menuItems = useMemo<DashboardMenuItem[]>(() => {
    switch (role) {
      case 'doctor':
        return [
          { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
          { label: 'Analytics', path: '/doctor/analytics', icon: BarChart3 },
          { label: 'Premium Member হন', path: '/doctor/premium', icon: Crown },
          { label: 'Appointments', path: '/doctor/appointments', icon: CalendarDays },
          { label: 'Prescription', path: '/doctor/prescriptions', icon: FileCheck2 },
          { label: 'Chamber Details', path: '/doctor/chambers', icon: Building2 },
          { label: 'Schedule', path: '/doctor/schedules', icon: Clock },
          { label: 'Visiting Card', path: '/doctor/visiting-card', icon: UserCircle },
          { label: 'Public Profile Content', path: '/doctor/public-profile', icon: Stethoscope },
          { label: 'Verification', path: '/doctor/verification', icon: ShieldCheck },
          { label: 'Profile', path: '/doctor/profile', icon: UserCircle },
          { label: 'Providers / Invitations', path: '/doctor/invitations', icon: Mail, badge: pendingInvitations },
        ];
      case 'patient':
        return [
          { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
          { label: 'Appointments', path: '/appointments', icon: CalendarDays },
          { label: 'ডাক্তার খুঁজুন', path: '/doctors', icon: Search },
          { label: 'Blood Bank', path: '/blood', icon: Droplets },
          { label: 'Profile', path: '/profile', icon: UserCircle },
          { label: 'Settings', path: '/settings', icon: Settings },
        ];
      case 'admin':
        return [
          { label: 'Dashboard', path: '/admin', icon: LayoutDashboard, exact: true },
          { label: 'Users', path: '/admin?tab=users', icon: Users },
          { label: 'Appointments', path: '/admin?tab=appointments', icon: CalendarDays, badge: pendingAppointments },
          { label: 'Activity', path: '/admin?tab=activity', icon: Activity },
          { label: 'CMS', path: '/admin/cms', icon: Settings2 },
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
          { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
          { label: 'Analytics', path: '/provider/analytics', icon: BarChart3 },
          { label: 'Premium Member হন', path: '/provider/premium', icon: Crown },
          { label: 'Profile & Website', path: '/provider/profile', icon: Building2 },
          { label: 'Doctors', path: '/provider/doctors', icon: Stethoscope },
          { label: 'Appointments', path: '/provider/appointments', icon: CalendarDays },
          { label: 'Ambulance links', path: '/provider/ambulances', icon: Link2 },
          { label: 'Verification evidence', path: '/verification/evidence', icon: FileCheck2 },
        ];
      case 'chamber':
        return [
          { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
          { label: 'Analytics', path: '/provider/analytics', icon: BarChart3 },
          { label: 'Premium Member হন', path: '/provider/premium', icon: Crown },
          { label: 'Profile & Website', path: '/provider/profile', icon: Building2 },
          { label: 'Doctors', path: '/provider/doctors', icon: Stethoscope },
          { label: 'Appointments', path: '/provider/appointments', icon: CalendarDays },
          { label: 'Verification evidence', path: '/verification/evidence', icon: FileCheck2 },
        ];
      case 'ambulance':
        return [
          { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
          { label: 'Service profile', path: '/ambulance/services', icon: Ambulance },
          { label: 'Hospital links', path: '/ambulance/hospitals', icon: Building2 },
        ];
    }
  }, [pendingAppointments, pendingInvitations, pendingVerification, role]);

  if (loading) return null;
  if (!account || account.role !== role) return <Navigate to="/dashboard" replace />;

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

  const panelName = panelLabels[role];

  const navigation = (
    <>
      <Link className="dashboard-shell-brand" to="/dashboard" aria-label={`${SITE_NAME} dashboard`}>
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
        <button type="button" className="dashboard-shell-logout" onClick={() => void logout()} disabled={loggingOut}>
          <LogOut aria-hidden="true" />
          <span>{loggingOut ? 'Logging out…' : 'Logout'}</span>
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
        <Link className="dashboard-shell-mobile-brand" to="/dashboard" aria-label={`${SITE_NAME} dashboard`}>
          <HeartPulse aria-hidden="true" />
          <strong>{SITE_NAME}</strong>
        </Link>
        <span className="dashboard-shell-role-label">{panelName}</span>
        <NotificationBell placement="mobile" />
      </header>

      {drawerOpen && <button type="button" className="dashboard-shell-backdrop" aria-label={`Close ${role} dashboard menu`} onClick={() => setDrawerOpen(false)} />}
      <aside className={`dashboard-shell-drawer${drawerOpen ? ' open' : ''}`} aria-hidden={!drawerOpen}>
        <button type="button" className="dashboard-shell-drawer-close" aria-label={`Close ${role} dashboard menu`} onClick={() => setDrawerOpen(false)}>
          <X aria-hidden="true" />
        </button>
        {navigation}
      </aside>

      <main className="dashboard-shell-content">{children}</main>
    </div>
  );
}
