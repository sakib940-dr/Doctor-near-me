import { Ambulance, Building2, HeartPulse, Home, Stethoscope } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';

export default function VisitorBottomNav() {
  const location = useLocation();
  const hashActive = (hash: string) => location.pathname === '/' && location.hash === hash;
  const itemClass = ({ isActive }: { isActive: boolean }) => isActive ? 'is-active' : undefined;

  return (
    <nav className="visitor-bottom-nav" aria-label="ভিজিটর দ্রুত নেভিগেশন">
      <NavLink end to="/" className={itemClass}><Home /><span>হোম</span></NavLink>
      <NavLink to="/doctors" className={itemClass}><Stethoscope /><span>ডাক্তার</span></NavLink>
      <NavLink to="/providers" className={itemClass}><Building2 /><span>হাসপাতাল</span></NavLink>
      <a className={hashActive('#blood') ? 'is-active' : undefined} href="/#blood"><HeartPulse /><span>ব্লাড</span></a>
      <a className={hashActive('#ambulance') ? 'is-active' : undefined} href="/#ambulance"><Ambulance /><span>অ্যাম্বুলেন্স</span></a>
    </nav>
  );
}
