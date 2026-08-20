import { HeartPulse, Languages, Menu, X } from 'lucide-react';
import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useVisitorLanguage } from '../contexts/VisitorLanguageContext';
import { SITE_NAME, SITE_TAGLINE } from '../lib/brand';
import NotificationBell from './NotificationBell';

export default function PublicHeader({ mobileBottomNav = false }: { mobileBottomNav?: boolean }) {
  const [open, setOpen] = useState(false);
  const { user, account } = useAuth();
  const { language, setLanguage } = useVisitorLanguage();
  const navClass = ({ isActive }: { isActive: boolean }) => isActive ? 'is-active' : undefined;
  const roleLabel = account ? ({
    patient: language === 'bn' ? 'Patient' : 'Patient',
    doctor: language === 'bn' ? 'Doctor' : 'Doctor',
    hospital: language === 'bn' ? 'Hospital' : 'Hospital',
    chamber: language === 'bn' ? 'Chamber' : 'Chamber',
    ambulance: language === 'bn' ? 'Ambulance' : 'Ambulance',
    verification_officer: 'Verification',
    admin: 'Admin',
    super_admin: 'Super Admin',
  } as const)[account.role] : null;

  const labels = language === 'bn'
    ? { doctors: 'ডাক্তার', providers: 'হাসপাতাল', ambulance: 'অ্যাম্বুলেন্স', blood: 'রক্তদাতা', dashboard: 'Dashboard', login: 'লগইন', home: 'হোম', menuOpen: 'মেনু খুলুন', menuClose: 'মেনু বন্ধ করুন' }
    : { doctors: 'Doctors', providers: 'Hospitals', ambulance: 'Ambulance', blood: 'Blood Bank', dashboard: 'Dashboard', login: 'Login', home: 'Home', menuOpen: 'Open menu', menuClose: 'Close menu' };

  return (
    <header className={`site-header visitor-public-header ${mobileBottomNav ? 'with-bottom-nav' : ''}`}>
      <div className="container header-inner">
        <Link className="brand" to="/" aria-label={`${SITE_NAME} ${labels.home}`}>
          <span className="brand-mark"><HeartPulse size={24} /></span>
          <span><strong>{SITE_NAME}</strong><small>{SITE_TAGLINE}</small></span>
        </Link>
        <nav className={open ? 'main-nav is-open' : 'main-nav'} aria-label={language === 'bn' ? 'প্রধান নেভিগেশন' : 'Primary navigation'}>
          <NavLink className={navClass} to="/doctors" onClick={() => setOpen(false)}>{labels.doctors}</NavLink>
          <NavLink className={navClass} to="/providers" onClick={() => setOpen(false)}>{labels.providers}</NavLink>
          <a href="/#ambulance" onClick={() => setOpen(false)}>{labels.ambulance}</a>
          <a href="/#blood" onClick={() => setOpen(false)}>{labels.blood}</a>
          <Link className="login-button" to={user ? '/dashboard' : '/auth'} onClick={() => setOpen(false)}>{user ? labels.dashboard : labels.login}</Link>
        </nav>
        <div className="public-header-actions">
          <div className="public-language-toggle" role="group" aria-label="Language">
            <Languages size={15} aria-hidden="true" />
            <button type="button" className={language === 'bn' ? 'active' : ''} onClick={() => setLanguage('bn')} aria-pressed={language === 'bn'}>বাংলা</button>
            <span aria-hidden="true">|</span>
            <button type="button" className={language === 'en' ? 'active' : ''} onClick={() => setLanguage('en')} aria-pressed={language === 'en'}>EN</button>
          </div>
          {user && <NotificationBell placement="header" />}
          {roleLabel && <span className="public-header-role-label">{roleLabel}</span>}
          <button className="menu-button" type="button" aria-label={open ? labels.menuClose : labels.menuOpen} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
            {open ? <X /> : <Menu />}
          </button>
        </div>
      </div>
    </header>
  );
}
