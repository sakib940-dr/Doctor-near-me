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
import { bi, type HospitalCopy, useHospitalLanguage } from './i18n';
import './hospital.css';

const primary = [
  { label: bi('হোম', 'Dashboard'), path: '/hospital-console', icon: Home, exact: true },
  { label: bi('অ্যাপয়েন্টমেন্ট', 'Appointments'), path: '/hospital-console/appointments', icon: CalendarDays },
  { label: bi('ডাক্তার', 'Doctors'), path: '/hospital-console/doctors', icon: Stethoscope },
  { label: bi('অ্যানালিটিক্স', 'Analytics'), path: '/hospital-console/analytics', icon: BarChart3 },
];

const menu = [
  { label: bi('পাবলিক প্রোফাইল', 'Public Profile'), path: '/hospital-console/public-profile', icon: PanelsTopLeft },
  { label: bi('হাসপাতালের তথ্য', 'Hospital Information'), path: '/hospital-console/information', icon: Info },
  { label: bi('গ্যালারি ম্যানেজমেন্ট', 'Gallery Management'), path: '/hospital-console/gallery', icon: GalleryHorizontal },
  { label: bi('সেবা ম্যানেজমেন্ট', 'Services Management'), path: '/hospital-console/services', icon: ClipboardList },
  { label: bi('চিকিৎসা খরচ', 'Treatment Costs'), path: '/hospital-console/treatment-costs', icon: Activity },
  { label: bi('পরীক্ষার খরচ', 'Investigation Costs'), path: '/hospital-console/investigation-costs', icon: FlaskConical },
  { label: bi('ডাক্তার ম্যানেজমেন্ট', 'Doctor Management'), path: '/hospital-console/doctors', icon: Stethoscope },
  { label: bi('রিসেপশন সেটিংস', 'Reception Settings'), path: '/hospital-console/reception', icon: MessageCircle },
  { label: bi('স্টাফ ম্যানেজমেন্ট', 'Staff Management'), path: '/hospital-console/staff', icon: Users },
  { label: bi('ভেরিফিকেশন', 'Verification'), path: '/hospital-console/verification', icon: ShieldCheck },
  { label: bi('প্রিমিয়াম মেম্বারশিপ', 'Premium Membership'), path: '/hospital-console/premium', icon: Crown },
  { label: bi('অ্যাম্বুলেন্স সংযোগ', 'Ambulance Links'), path: '/hospital-console/ambulances', icon: Ambulance },
  { label: bi('সেটিংস', 'Settings'), path: '/hospital-console/settings', icon: Settings },
  { label: bi('সহায়তা', 'Support'), path: '/hospital-console/support', icon: CircleHelp },
];

function activePath(current: string, target: string, exact = false) {
  return exact ? current === target : current === target || current.startsWith(`${target}/`);
}

export default function HospitalShell({ children }: { children: ReactNode }) {
  const { account, loading, accountError, refreshAccount, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { language, setLanguage, text } = useHospitalLanguage();
  if (loading) return <AccountStateFallback loading />;
  if (!account) return <AccountStateFallback message={accountError} onRetry={refreshAccount} onSignOut={signOut} />;
  if (account.role !== 'hospital') return <Navigate to="/dashboard" replace />;

  async function logout() {
    await signOut();
    navigate('/', { replace: true });
  }

  return <div className="hospital-console-shell">
    <header className="hospital-console-topbar">
      <Link to="/hospital-console" className="hospital-console-brand"><span><Building2 /></span><div><strong>{SITE_NAME}</strong><small>{text(bi('হাসপাতাল কনসোল', 'Hospital Console'))}</small></div></Link>
      <div className="hospital-console-top-actions">
        <div className="hospital-language-toggle" role="group" aria-label="Language"><button type="button" className={language === 'bn' ? 'active' : ''} onClick={() => setLanguage('bn')}>বাংলা</button><button type="button" className={language === 'en' ? 'active' : ''} onClick={() => setLanguage('en')}>EN</button></div>
        <Link to="/notifications" aria-label={text(bi('নোটিফিকেশন', 'Notifications'))}><Bell /></Link>
        <button className="hospital-menu-trigger" type="button" onClick={() => setOpen(true)} aria-label={text(bi('মেনু খুলুন', 'Open menu'))}><Menu /></button>
      </div>
    </header>

    <main className="hospital-console-content">{children}</main>

    <nav className="hospital-console-bottom-nav" aria-label={text(bi('হাসপাতালের প্রধান নেভিগেশন', 'Hospital primary navigation'))}>
      {primary.map(({ label, path, icon: Icon, exact }) => <Link key={path} to={path} className={activePath(location.pathname, path, exact) ? 'active' : ''}><Icon /><span>{text(label)}</span></Link>)}
    </nav>

    {open && <div className="hospital-menu-backdrop" onClick={() => setOpen(false)} role="presentation">
      <aside className="hospital-menu-drawer" role="dialog" aria-modal="true" aria-label={text(bi('হাসপাতাল ম্যানেজমেন্ট মেনু', 'Hospital management menu'))} onClick={(event) => event.stopPropagation()}>
        <header><div><Building2 /><span><strong>{account.full_name || text(bi('হাসপাতাল', 'Hospital'))}</strong><small>{text(bi('ম্যানেজমেন্ট মেনু', 'Management menu'))}</small></span></div><button type="button" onClick={() => setOpen(false)} aria-label={text(bi('মেনু বন্ধ করুন', 'Close menu'))}><X /></button></header>
        <nav>{menu.map(({ label, path, icon: Icon }) => <Link key={path} to={path} className={activePath(location.pathname, path) ? 'active' : ''} onClick={() => setOpen(false)}><Icon /><span>{text(label)}</span><ChevronRight /></Link>)}</nav>
        <button className="hospital-menu-logout" type="button" onClick={() => void logout()}><LogOut /> {text(bi('সাইন আউট', 'Sign out'))}</button>
      </aside>
    </div>}
  </div>;
}

export function HospitalPageHeader({ eyebrow, title, description, action }: { eyebrow: HospitalCopy | string; title: HospitalCopy | string; description: HospitalCopy | string; action?: ReactNode }) {
  const { text } = useHospitalLanguage();
  const show = (value: HospitalCopy | string) => typeof value === 'string' ? value : text(value);
  return <header className="hospital-page-header"><div><small>{show(eyebrow)}</small><h1>{show(title)}</h1><p>{show(description)}</p></div>{action}</header>;
}
