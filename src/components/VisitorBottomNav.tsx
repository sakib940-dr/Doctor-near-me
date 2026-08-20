import { Bookmark, Grid2X2, Home, Search, UserRound } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function VisitorBottomNav() {
  const { user } = useAuth();
  const itemClass = ({ isActive }: { isActive: boolean }) => isActive ? 'is-active' : undefined;

  return (
    <nav className="visitor-bottom-nav" aria-label="ভিজিটর দ্রুত নেভিগেশন">
      <NavLink end to="/" className={itemClass}><Home /><span>হোম</span></NavLink>
      <NavLink to="/doctors?advanced=1" className={itemClass}><Search /><span>খুঁজুন</span></NavLink>
      <NavLink to="/categories" className={itemClass}><Grid2X2 /><span>ক্যাটাগরি</span></NavLink>
      <NavLink to={user ? '/saved' : '/auth'} state={user ? undefined : { from: '/saved' }} className={itemClass}><Bookmark /><span>সংরক্ষিত</span></NavLink>
      <NavLink to={user ? '/profile' : '/auth'} className={itemClass}><UserRound /><span>প্রোফাইল</span></NavLink>
    </nav>
  );
}
