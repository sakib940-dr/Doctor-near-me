import {
  Ambulance,
  Building2,
  CalendarDays,
  Clock,
  LayoutDashboard,
  FileText,
  Mail,
  Search,
  ShieldCheck,
  Stethoscope,
  UserCircle,
  Users,
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export type DashboardRole = 'doctor' | 'patient' | 'admin' | 'super_admin' | 'verification_officer' | 'hospital' | 'chamber' | 'ambulance';

interface BottomNavItem {
  label: string;
  path: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
}

const bottomItems: Record<DashboardRole, BottomNavItem[]> = {
  doctor: [
    { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, exact: true },
    { label: 'Appointments', path: '/doctor/appointments', icon: CalendarDays },
    { label: 'Rx', path: '/doctor/prescriptions', icon: FileText },
    { label: 'Schedule', path: '/doctor/schedules', icon: Clock },
    { label: 'Profile', path: '/doctor/profile', icon: UserCircle },
  ],
  patient: [
    { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, exact: true },
    { label: 'Appointments', path: '/appointments', icon: CalendarDays },
    { label: 'Find Doctor', path: '/doctors', icon: Search },
    { label: 'Profile', path: '/profile', icon: UserCircle },
  ],
  admin: [
    { label: 'Dashboard', path: '/admin', icon: LayoutDashboard, exact: true },
    { label: 'Users', path: '/admin?tab=users', icon: Users, exact: true },
    { label: 'Appointments', path: '/admin?tab=appointments', icon: CalendarDays, exact: true },
    { label: 'Verify', path: '/verification/reviews', icon: ShieldCheck },
  ],
  super_admin: [
    { label: 'Control', path: '/super-admin', icon: LayoutDashboard, exact: true },
    { label: 'Users', path: '/super-admin?tab=users', icon: Users, exact: true },
    { label: 'Invites', path: '/super-admin?tab=invites', icon: Mail, exact: true },
    { label: 'Verify', path: '/verification/reviews', icon: ShieldCheck },
  ],
  verification_officer: [
    { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, exact: true },
    { label: 'Review Queue', path: '/verification/reviews', icon: ShieldCheck },
  ],
  hospital: [
    { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, exact: true },
    { label: 'Profile', path: '/provider/profile', icon: Building2 },
    { label: 'Doctors', path: '/provider/doctors', icon: Stethoscope },
    { label: 'Appointments', path: '/provider/appointments', icon: CalendarDays },
  ],
  chamber: [
    { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, exact: true },
    { label: 'Profile', path: '/provider/profile', icon: Building2 },
    { label: 'Doctors', path: '/provider/doctors', icon: Stethoscope },
    { label: 'Appointments', path: '/provider/appointments', icon: CalendarDays },
  ],
  ambulance: [
    { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, exact: true },
    { label: 'Service', path: '/ambulance/services', icon: Ambulance },
    { label: 'Hospitals', path: '/ambulance/hospitals', icon: Building2 },
  ],
};

function isActive(pathname: string, search: string, target: string, exact = false) {
  const [targetPath, targetSearch = ''] = target.split('?');
  if (targetSearch) return pathname === targetPath && search === `?${targetSearch}`;
  if (exact) return pathname === targetPath && search === '';
  return pathname === targetPath || pathname.startsWith(`${targetPath}/`);
}

export default function DashboardBottomNav({ role }: { role: DashboardRole }) {
  const { account, loading } = useAuth();
  const location = useLocation();

  if (loading || account?.role !== role) return null;
  const items = bottomItems[role];

  return (
    <nav className="dashboard-bottom-nav" aria-label={`${role} mobile navigation`}>
      {items.map(({ label, path, icon: Icon, exact }) => {
        const active = isActive(location.pathname, location.search, path, exact);
        return (
          <Link
            key={path}
            to={path}
            className={`dashboard-bottom-nav-item${active ? ' active' : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            <Icon aria-hidden="true" />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
