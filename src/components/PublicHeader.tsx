import { HeartPulse, Menu, X } from 'lucide-react';
import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function PublicHeader() {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  const navClass = ({ isActive }: { isActive: boolean }) => isActive ? 'is-active' : undefined;

  return (
    <header className="site-header visitor-public-header">
      <div className="container header-inner">
        <Link className="brand" to="/" aria-label="সিরাজগঞ্জ ডাক্তার হোম">
          <span className="brand-mark"><HeartPulse size={24} /></span>
          <span><strong>সিরাজগঞ্জ ডাক্তার</strong><small>স্বাস্থ্যের বিশ্বস্ত ঠিকানা</small></span>
        </Link>
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
