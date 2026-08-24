import { useState, type ReactNode } from 'react';
import {
  Activity, BarChart3, Bell, Building2, CalendarCog, CalendarDays, ChevronRight,
  ClipboardList, Eye, FlaskConical, Home, KeyRound, LogOut,
  Menu, MessageCircle, PanelsTopLeft, Stethoscope, Users, X,
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
  { label: bi('পাবলিক প্রোফাইল', 'Public Profile View'), path: '/hospital-console/profile-preview', icon: Eye },
];

const menuGroups = [
  { title: bi('হাসপাতাল প্রোফাইল', 'Hospital Profile'), items: [
    { label: bi('হাসপাতাল প্রোফাইল', 'Hospital profile'), path: '/hospital-console/public-profile', icon: PanelsTopLeft },
  ]},
  { title: bi('হাসপাতাল কনটেন্ট ম্যানেজমেন্ট', 'Hospital Content Management'), items: [
    { label: bi('সেবাসমূহ', 'Services'), path: '/hospital-console/services', icon: ClipboardList },
    { label: bi('চিকিৎসা খরচ', 'Treatment Cost'), path: '/hospital-console/treatment-costs', icon: Activity },
    { label: bi('পরীক্ষার খরচ', 'Investigation Cost'), path: '/hospital-console/investigation-costs', icon: FlaskConical },
  ]},
  { title: bi('রিসেপশন ম্যানেজমেন্ট', 'Reception Management'), items: [
    { label: bi('অ্যাপয়েন্টমেন্ট সেটিংস', 'Appointment settings'), path: '/hospital-console/appointment-settings', icon: CalendarCog },
  ]},
  { title: bi('স্টাফ ম্যানেজমেন্ট', 'Staff Management'), items: [
    { label: bi('স্টাফ', 'Staff'), path: '/hospital-console/staff', icon: Users },
  ]},
  { title: bi('যোগাযোগ', 'Communication'), items: [
    { label: bi('অ্যাডমিন সাপোর্ট মেসেজিং', 'Admin Support Messaging'), path: '/hospital-console/admin-support', icon: MessageCircle },
  ]},
  { title: bi('সেটিংস', 'Settings'), items: [
    { label: bi('সিকিউরিটি সেটিংস', 'Security settings'), path: '/hospital-console/security', icon: KeyRound },
  ]},
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
        <nav className="hospital-menu-groups">{menuGroups.map((group) => <section key={group.title.en}><h2>{text(group.title)}</h2>{group.items.map(({ label, path, icon: Icon }) => <Link key={path} to={path} className={activePath(location.pathname, path) ? 'active' : ''} onClick={() => setOpen(false)}><Icon /><span>{text(label)}</span><ChevronRight /></Link>)}</section>)}</nav>
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
