import { HeartPulse, Menu, X } from 'lucide-react';
import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { SITE_NAME, SITE_TAGLINE } from '../lib/brand';

export default function PublicHeader({ mobileBottomNav = false }: { mobileBottomNav?: boolean }) {
  const [open, setOpen] = useState(false);
  const { user, account } = useAuth();
  const navClass = ({ isActive }: { isActive: boolean }) => isActive ? 'is-active' : undefined;
  const roleLabel = account ? ({
    patient: 'Patient',
    doctor: 'Doctor',
    hospital: 'Hospital',
    chamber: 'Chamber',
    ambulance: 'Ambulance',
    verification_officer: 'Verification',
    admin: 'Admin',
    super_admin: 'Super Admin',
  } as const)[account.role] : null;

  return (
    <header className={`site-header visitor-public-header ${mobileBottomNav ? 'with-bottom-nav' : ''}`}>
      <div className="container header-inner">
        <Link className="brand" to="/" aria-label={`${SITE_NAME} হোম`}>
          <span className="brand-mark"><HeartPulse size={24} /></span>
          <span><strong>{SITE_NAME}</strong><small>{SITE_TAGLINE}</small></span>
        </Link>
        {roleLabel && <span className="public-header-role-label">{roleLabel}</span>}
        <nav className={open ? 'main-nav is-open' : 'main-nav'} aria-label="প্রধান নেভিগেশন">
          <NavLink className={navClass} to="/doctors" onClick={() => setOpen(false)}>ডাক্তার</NavLink>
          <NavLink className={navClass} to="/providers" onClick={() => setOpen(false)}>হাসপাতাল</NavLink>
          <a href="/#ambulance" onClick={() => setOpen(false)}>অ্যাম্বুলেন্স</a>
          <a href="/#blood" onClick={() => setOpen(false)}>রক্তদাতা</a>
          <Link className="login-button" to={user ? '/dashboard' : '/auth'} onClick={() => setOpen(false)}>{user ? 'Dashboard' : 'লগইন'}</Link>
        </nav>
        <button className="menu-button" type="button" aria-label={open ? 'মেনু বন্ধ করুন' : 'মেনু খুলুন'} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          {open ? <X /> : <Menu />}
        </button>
      </div>
    </header>
  );
}
