import { HeartPulse, Menu, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function PublicHeader() {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  return (
    <header className="site-header">
      <div className="container header-inner">
        <Link className="brand" to="/" aria-label="সিরাজগঞ্জ ডাক্তার হোম">
          <span className="brand-mark"><HeartPulse size={24} /></span>
          <span><strong>সিরাজগঞ্জ ডাক্তার</strong><small>স্বাস্থ্যের বিশ্বস্ত ঠিকানা</small></span>
        </Link>
        <nav className={open ? 'main-nav is-open' : 'main-nav'} aria-label="প্রধান নেভিগেশন">
          <Link className="nav-active" to="/doctors" onClick={() => setOpen(false)}>ডাক্তার</Link>
          <Link to="/?service=hospital" onClick={() => setOpen(false)}>হাসপাতাল</Link>
          <Link to="/?service=ambulance" onClick={() => setOpen(false)}>অ্যাম্বুলেন্স</Link>
          <Link to="/?service=blood" onClick={() => setOpen(false)}>রক্তদাতা</Link>
          <Link className="login-button" to={user ? '/dashboard' : '/auth'} onClick={() => setOpen(false)}>{user ? 'Dashboard' : 'লগইন'}</Link>
        </nav>
        <button className="menu-button" type="button" aria-label={open ? 'মেনু বন্ধ করুন' : 'মেনু খুলুন'} onClick={() => setOpen((value) => !value)}>
          {open ? <X /> : <Menu />}
        </button>
      </div>
    </header>
  );
}
