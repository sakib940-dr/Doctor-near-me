import { Ambulance, Building2, HeartPulse, Home, Stethoscope } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function VisitorBottomNav() {
  return (
    <nav className="visitor-bottom-nav" aria-label="ভিজিটর দ্রুত নেভিগেশন">
      <Link to="/"><Home /><span>হোম</span></Link>
      <Link to="/doctors"><Stethoscope /><span>ডাক্তার</span></Link>
      <Link to="/providers"><Building2 /><span>হাসপাতাল</span></Link>
      <a href="/#blood"><HeartPulse /><span>ব্লাড</span></a>
      <a href="/#ambulance"><Ambulance /><span>অ্যাম্বুলেন্স</span></a>
    </nav>
  );
}
