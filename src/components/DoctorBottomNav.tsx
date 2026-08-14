import { CalendarDays, Clock, LayoutDashboard, UserCircle } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const items = [
  { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, end: true },
  { label: 'Appointments', path: '/doctor/appointments', icon: CalendarDays },
  { label: 'Schedule', path: '/doctor/schedules', icon: Clock },
  { label: 'Profile', path: '/doctor/profile', icon: UserCircle },
] as const;

export default function DoctorBottomNav() {
  const { account, loading } = useAuth();

  if (loading || account?.role !== 'doctor') return null;

  return (
    <nav className="doctor-bottom-nav" aria-label="Doctor mobile navigation">
      {items.map((item) => {
        const Icon = item.icon;
        const end = 'end' in item ? item.end : undefined;

        return (
          <NavLink
            key={item.path}
            to={item.path}
            end={end}
            className={({ isActive }) => `doctor-bottom-nav-item${isActive ? ' active' : ''}`}
          >
            <Icon aria-hidden="true" />
            <span>{item.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}
