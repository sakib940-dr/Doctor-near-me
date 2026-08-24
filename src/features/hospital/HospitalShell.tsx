import { useState, type ReactNode } from 'react';
import {
  Activity, Ambulance, BarChart3, Bell, Building2, CalendarDays, ChevronRight, CircleHelp,
  ClipboardList, Crown, FlaskConical, GalleryHorizontal, Home, Info, LogOut,
  Menu, MessageCircle, PanelsTopLeft, Settings, ShieldCheck, Stethoscope, Users, X,
} from 'lucide-react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import AccountStateFallback from '../../components/AccountStateFallback';
import { useAuth } from '../../contexts/AuthContext';
import { SITE_NAME } from '../../lib/brand';
import './hospital.css';

const primary = [
  { label: 'Dashboard', path: '/hospital-console', icon: Home, exact: true },
  { label: 'Appointments', path: '/hospital-console/appointments', icon: CalendarDays },
  { label: 'Doctors', path: '/hospital-console/doctors', icon: Stethoscope },
  { label: 'Analytics', path: '/hospital-console/analytics', icon: BarChart3 },
];

const menu = [
  { label: 'Public Profile Management', path: '/hospital-console/public-profile', icon: PanelsTopLeft },
  { label: 'Hospital Information', path: '/hospital-console/information', icon: Info },
  { label: 'Gallery Management', path: '/hospital-console/gallery', icon: GalleryHorizontal },
  { label: 'Services Management', path: '/hospital-console/services', icon: ClipboardList },
  { label: 'Treatment Cost Management', path: '/hospital-console/treatment-costs', icon: Activity },
  { label: 'Investigation Cost Management', path: '/hospital-console/investigation-costs', icon: FlaskConical },
  { label: 'Doctor Management', path: '/hospital-console/doctors', icon: Stethoscope },
  { label: 'Reception Settings', path: '/hospital-console/reception', icon: MessageCircle },
  { label: 'Staff Management', path: '/hospital-console/staff', icon: Users },
  { label: 'Verification', path: '/hospital-console/verification', icon: ShieldCheck },
  { label: 'Premium Membership', path: '/hospital-console/premium', icon: Crown },
  { label: 'Ambulance Links', path: '/hospital-console/ambulances', icon: Ambulance },
  { label: 'Settings', path: '/hospital-console/settings', icon: Settings },
  { label: 'Support', path: '/hospital-console/support', icon: CircleHelp },
];

function activePath(current: string, target: string, exact = false) {
  return exact ? current === target : current === target || current.startsWith(`${target}/`);
}

export default function HospitalShell({ children }: { children: ReactNode }) {
  const { account, loading, accountError, refreshAccount, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  if (loading) return <AccountStateFallback loading />;
  if (!account) return <AccountStateFallback message={accountError} onRetry={refreshAccount} onSignOut={signOut} />;
  if (account.role !== 'hospital') return <Navigate to="/dashboard" replace />;

  async function logout() {
    await signOut();
    navigate('/', { replace: true });
  }

  return <div className="hospital-console-shell">
    <header className="hospital-console-topbar">
      <Link to="/hospital-console" className="hospital-console-brand"><span><Building2 /></span><div><strong>{SITE_NAME}</strong><small>Hospital Console</small></div></Link>
      <div className="hospital-console-top-actions">
        <Link to="/notifications" aria-label="Notifications"><Bell /></Link>
        <button type="button" onClick={() => setOpen(true)} aria-label="Open Hospital menu"><Menu /></button>
      </div>
    </header>

    <main className="hospital-console-content">{children}</main>

    <nav className="hospital-console-bottom-nav" aria-label="Hospital primary navigation">
      {primary.map(({ label, path, icon: Icon, exact }) => <Link key={path} to={path} className={activePath(location.pathname, path, exact) ? 'active' : ''}><Icon /><span>{label}</span></Link>)}
    </nav>

    {open && <div className="hospital-menu-backdrop" onClick={() => setOpen(false)} role="presentation">
      <aside className="hospital-menu-drawer" role="dialog" aria-modal="true" aria-label="Hospital management menu" onClick={(event) => event.stopPropagation()}>
        <header><div><Building2 /><span><strong>{account.full_name || 'Hospital'}</strong><small>Management menu</small></span></div><button type="button" onClick={() => setOpen(false)} aria-label="Close menu"><X /></button></header>
        <nav>{menu.map(({ label, path, icon: Icon }) => <Link key={path} to={path} className={activePath(location.pathname, path) ? 'active' : ''} onClick={() => setOpen(false)}><Icon /><span>{label}</span><ChevronRight /></Link>)}</nav>
        <button className="hospital-menu-logout" type="button" onClick={() => void logout()}><LogOut /> Sign out</button>
      </aside>
    </div>}
  </div>;
}

export function HospitalPageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <header className="hospital-page-header"><div><small>{eyebrow}</small><h1>{title}</h1><p>{description}</p></div>{action}</header>;
}
