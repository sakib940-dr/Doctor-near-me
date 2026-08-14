import { type ReactNode, useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  CalendarDays,
  Clock,
  Globe2,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  Settings,
  UserCircle,
  X,
} from 'lucide-react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getMyDoctorProviderInvitations } from '../services/providerDashboard';
import DoctorBottomNav from './DoctorBottomNav';

interface DoctorDashboardShellProps {
  children: ReactNode;
}

interface DoctorMenuItem {
  label: string;
  path: string;
  icon: typeof LayoutDashboard;
  badge?: number;
}

function isRouteActive(pathname: string, target: string) {
  if (target === '/dashboard') return pathname === '/dashboard';
  return pathname === target || pathname.startsWith(`${target}/`);
}

export default function DoctorDashboardShell({ children }: DoctorDashboardShellProps) {
  const { account, loading, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pendingInvitations, setPendingInvitations] = useState(0);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (account?.role !== 'doctor') {
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

    return () => {
      active = false;
    };
  }, [account?.role, location.pathname]);

  const menuItems = useMemo<DoctorMenuItem[]>(() => [
    { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { label: 'Appointments', path: '/doctor/appointments', icon: CalendarDays },
    { label: 'Schedule', path: '/doctor/schedules', icon: Clock },
    { label: 'Profile', path: '/doctor/profile', icon: UserCircle },
    { label: 'Providers / Invitations', path: '/doctor/invitations', icon: Mail, badge: pendingInvitations },
    { label: 'Analytics', path: '/doctor/analytics', icon: BarChart3 },
    { label: 'My Website', path: '/doctor/website', icon: Globe2 },
    { label: 'Settings', path: '/doctor/settings', icon: Settings },
  ], [pendingInvitations]);

  if (loading) return null;
  if (!account || account.role !== 'doctor') return <Navigate to="/dashboard" replace />;

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

  const navigation = (
    <>
      <div className="doctor-shell-brand">
        <span className="doctor-shell-brand-icon"><UserCircle aria-hidden="true" /></span>
        <div>
          <strong>Doctor Panel</strong>
          <small>{account.full_name || 'Doctor'}</small>
        </div>
      </div>

      <nav className="doctor-shell-nav" aria-label="Doctor dashboard navigation">
        {menuItems.map(({ label, path, icon: Icon, badge }) => {
          const active = isRouteActive(location.pathname, path);
          return (
            <Link
              key={path}
              to={path}
              className={`doctor-shell-nav-item${active ? ' active' : ''}`}
              aria-current={active ? 'page' : undefined}
            >
              <Icon aria-hidden="true" />
              <span>{label}</span>
              {typeof badge === 'number' && badge > 0 && <b className="doctor-shell-badge" aria-label={`${badge} pending invitations`}>{badge > 99 ? '99+' : badge}</b>}
            </Link>
          );
        })}
      </nav>

      <div className="doctor-shell-bottom">
        <button type="button" className="doctor-shell-logout" onClick={() => void logout()} disabled={loggingOut}>
          <LogOut aria-hidden="true" />
          <span>{loggingOut ? 'Logging out…' : 'Logout'}</span>
        </button>
      </div>
    </>
  );

  return (
    <div className="doctor-shell">
      <aside className="doctor-shell-sidebar">{navigation}</aside>

      <header className="doctor-shell-mobile-header">
        <button
          type="button"
          className="doctor-shell-menu-button"
          aria-label="Open doctor dashboard menu"
          aria-expanded={drawerOpen}
          onClick={() => setDrawerOpen(true)}
        >
          <Menu aria-hidden="true" />
        </button>
        <div>
          <strong>Doctor Panel</strong>
          <small>{account.full_name || 'Doctor'}</small>
        </div>
      </header>

      {drawerOpen && <button type="button" className="doctor-shell-backdrop" aria-label="Close doctor dashboard menu" onClick={() => setDrawerOpen(false)} />}
      <aside className={`doctor-shell-drawer${drawerOpen ? ' open' : ''}`} aria-hidden={!drawerOpen}>
        <button type="button" className="doctor-shell-drawer-close" aria-label="Close doctor dashboard menu" onClick={() => setDrawerOpen(false)}>
          <X aria-hidden="true" />
        </button>
        {navigation}
      </aside>

      <main className="doctor-shell-content">{children}</main>
      <DoctorBottomNav />
    </div>
  );
}
