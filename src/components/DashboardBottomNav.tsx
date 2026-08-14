import { CalendarDays, Clock, LayoutDashboard, Search, UserCircle } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export type DashboardRole = 'doctor' | 'patient';

interface BottomNavItem {
  label: string;
  path: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
}

const doctorItems: BottomNavItem[] = [
  { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, end: true },
  { label: 'Appointments', path: '/doctor/appointments', icon: CalendarDays },
  { label: 'Schedule', path: '/doctor/schedules', icon: Clock },
  { label: 'Profile', path: '/doctor/profile', icon: UserCircle },
];

const patientItems: BottomNavItem[] = [
  { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, end: true },
  { label: 'Appointments', path: '/appointments', icon: CalendarDays },
  { label: 'Find Doctor', path: '/doctors', icon: Search },
  { label: 'Profile', path: '/profile', icon: UserCircle },
];

export default function DashboardBottomNav({ role }: { role: DashboardRole }) {
  const { account, loading } = useAuth();

  if (loading || account?.role !== role) return null;
  const items = role === 'doctor' ? doctorItems : patientItems;

  return (
    <nav className="dashboard-bottom-nav" aria-label={`${role} mobile navigation`}>
      {items.map(({ label, path, icon: Icon, end }) => (
        <NavLink
          key={path}
          to={path}
          end={end}
          className={({ isActive }) => `dashboard-bottom-nav-item${isActive ? ' active' : ''}`}
        >
          <Icon aria-hidden="true" />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
