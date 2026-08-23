import { Bookmark, Grid2X2, Home, Search, UserRound } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useVisitorLanguage } from '../contexts/VisitorLanguageContext';

export default function VisitorBottomNav() {
  const { user } = useAuth();
  const { language } = useVisitorLanguage();
  const labels = language === 'bn'
    ? { aria: 'ভিজিটর দ্রুত নেভিগেশন', home: 'হোম', search: 'খুঁজুন', categories: 'ক্যাটাগরি', saved: 'সংরক্ষিত', profile: 'প্রোফাইল' }
    : { aria: 'Visitor quick navigation', home: 'Home', search: 'Search', categories: 'Categories', saved: 'Saved', profile: 'Profile' };
  const itemClass = ({ isActive }: { isActive: boolean }) => isActive ? 'is-active' : undefined;

  return (
    <nav className="visitor-bottom-nav" aria-label={labels.aria}>
      <NavLink end to="/" className={itemClass}><Home /><span>{labels.home}</span></NavLink>
      <NavLink to="/doctors?advanced=1" className={itemClass}><Search /><span>{labels.search}</span></NavLink>
      <NavLink to="/categories" className={itemClass}><Grid2X2 /><span>{labels.categories}</span></NavLink>
      <NavLink to={user ? '/saved' : '/auth'} state={user ? undefined : { from: '/saved' }} className={itemClass}><Bookmark /><span>{labels.saved}</span></NavLink>
      <NavLink to={user ? '/profile' : '/auth'} className={itemClass}><UserRound /><span>{labels.profile}</span></NavLink>
    </nav>
  );
}
