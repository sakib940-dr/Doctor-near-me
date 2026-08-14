import { useEffect, useState } from 'react';
import { Ambulance, Bell, Building2, CalendarDays, ChevronRight, Clock3, Crown, FileCheck2, Link2, LoaderCircle, LogOut, Settings, ShieldCheck, Stethoscope, UserRound } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import PublicHeader from '../components/PublicHeader';
import { useAuth } from '../contexts/AuthContext';
import { getRoleDashboardContext } from '../services/account';
import { saveMyCurrentLocation } from '../services/discovery';
import type { DashboardContext, UserRole } from '../types';

const roleLabels: Record<UserRole, string> = { patient: 'রোগী', doctor: 'ডাক্তার', chamber: 'চেম্বার', hospital: 'হাসপাতাল', ambulance: 'অ্যাম্বুলেন্স সেবা', verification_officer: 'ভেরিফিকেশন অফিসার', admin: 'অ্যাডমিন', super_admin: 'সুপার অ্যাডমিন' };

export default function DashboardPage() {
  const { account, accountError, loading, signOut } = useAuth();
  const [context, setContext] = useState<DashboardContext | null>(null);
  const [contextLoading, setContextLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!account) { setContextLoading(false); return; }
    getRoleDashboardContext().then(setContext).catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : 'Dashboard লোড করা যায়নি।')).finally(() => setContextLoading(false));
  }, [account]);

  useEffect(() => {
    if (!account) return;

    const persist = (latitude: number, longitude: number, accuracy: number | null) => {
      void saveMyCurrentLocation({ latitude, longitude, accuracyMeters: accuracy, saveHistory: true })
        .then(() => { try { localStorage.removeItem('sirajganj-current-location'); } catch { /* ignore */ } })
        .catch(() => undefined);
    };

    // If the visitor granted location before logging in, persist that exact
    // consented location as soon as an authenticated session exists.
    try {
      const raw = localStorage.getItem('sirajganj-current-location');
      if (raw) {
        const saved = JSON.parse(raw) as { latitude?: number; longitude?: number; accuracy?: number | null; capturedAt?: number };
        if (typeof saved.latitude === 'number' && typeof saved.longitude === 'number' && (!saved.capturedAt || Date.now() - saved.capturedAt < 30 * 60 * 1000)) {
          persist(saved.latitude, saved.longitude, saved.accuracy ?? null);
          return;
        }
      }
    } catch { /* ignore invalid local storage */ }

    // Never trigger a surprise permission prompt on dashboard. If permission
    // was already granted earlier, refresh and save the current GPS point.
    if (!navigator.geolocation || !navigator.permissions?.query) return;
    void navigator.permissions.query({ name: 'geolocation' }).then((permission) => {
      if (permission.state !== 'granted') return;
      navigator.geolocation.getCurrentPosition(
        (position) => persist(position.coords.latitude, position.coords.longitude, Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null),
        () => undefined,
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
      );
    }).catch(() => undefined);
  }, [account]);

  if (!loading && account && !account.profile_completed) return <Navigate to="/onboarding" replace />;

  async function logout() { await signOut(); navigate('/', { replace: true }); }

  const role = context?.role ?? account?.role ?? 'patient';
  const cards = role === 'patient'
    ? [{ icon: CalendarDays, title: 'আমার অ্যাপয়েন্টমেন্ট', detail: 'আসন্ন ও আগের appointment দেখুন', path: '/appointments' }, { icon: UserRound, title: 'আমার প্রোফাইল', detail: 'ব্যক্তিগত ও জরুরি যোগাযোগের তথ্য', path: '/profile' }]
    : role === 'doctor'
      ? [{ icon: Stethoscope, title: 'ডাক্তার প্রোফাইল', detail: context?.doctor?.verification_status === 'approved' ? 'প্রোফাইল অনুমোদিত' : 'Verification অপেক্ষমাণ', path: '/doctor/profile' }, { icon: FileCheck2, title: 'Verification evidence', detail: 'BMDC, degree ও identity evidence', path: '/verification/evidence' }, { icon: Link2, title: 'প্রতিষ্ঠানের invitation', detail: 'Hospital/Chamber link accept বা reject করুন', path: '/doctor/invitations' }, { icon: Clock3, title: 'চেম্বার ও সময়সূচি', detail: 'Visiting day, সময় ও fee পরিচালনা করুন', path: '/doctor/schedules' }, { icon: CalendarDays, title: 'অ্যাপয়েন্টমেন্ট', detail: 'রোগীর request ও status পরিচালনা করুন', path: '/doctor/appointments' }]
      : role === 'hospital' || role === 'chamber'
        ? [{ icon: Building2, title: 'প্রতিষ্ঠানের প্রোফাইল', detail: `${context?.providers?.length ?? 0}টি প্রতিষ্ঠান যুক্ত`, path: '/provider/profile' }, { icon: FileCheck2, title: 'Verification evidence', detail: 'Trade license ও organization evidence', path: '/verification/evidence' }, { icon: Stethoscope, title: 'ডাক্তার ব্যবস্থাপনা', detail: 'Consent-based invitation ও schedule', path: '/provider/doctors' }, { icon: CalendarDays, title: 'Appointment overview', detail: 'Reception-style request queue', path: '/provider/appointments' }, ...(role === 'hospital' ? [{ icon: Ambulance, title: 'Ambulance links', detail: 'সংযোগ request approve বা reject করুন', path: '/provider/ambulances' }] : [])]
        : role === 'ambulance'
          ? [{ icon: Ambulance, title: 'Ambulance service', detail: 'গাড়ি, documents ও availability পরিচালনা করুন', path: '/ambulance/services' }, { icon: Building2, title: 'হাসপাতাল সংযোগ', detail: 'Consent-based link request পরিচালনা করুন', path: '/ambulance/hospitals' }]
          : role === 'verification_officer'
            ? [{ icon: ShieldCheck, title: 'Verification queue', detail: 'Doctor, Provider ও Ambulance review', path: '/verification/reviews' }]
            : role === 'admin'
              ? [{ icon: Settings, title: 'Admin operations', detail: 'Users, appointments ও activity oversight', path: '/admin' }, { icon: ShieldCheck, title: 'Verification queue', detail: 'Pending application review', path: '/verification/reviews' }]
              : [{ icon: Crown, title: 'Super Admin control', detail: 'Users, roles, privileged invites ও sensitive controls', path: '/super-admin' }, { icon: Settings, title: 'Admin operations', detail: 'Operational dashboard ও full audit', path: '/admin' }, { icon: ShieldCheck, title: 'Verification queue', detail: 'সব verification oversight', path: '/verification/reviews' }];

  return <div className="app-shell dashboard-page"><PublicHeader /><main className="dashboard-main container">{(loading || contextLoading) && <div className="loading-box"><LoaderCircle className="spin" /> Dashboard লোড হচ্ছে…</div>}{(error || accountError) && <div className="error-box" role="alert">{error || accountError}</div>}{!loading && !contextLoading && account && <><section className="dashboard-welcome"><div><span>{roleLabels[role]} Dashboard</span><h1>স্বাগতম, {context?.full_name || account.full_name || 'ব্যবহারকারী'}</h1><p>আপনার স্বাস্থ্যসেবা কার্যক্রম এক জায়গা থেকে পরিচালনা করুন।</p></div><div className="dashboard-profile-icon"><UserRound /></div></section><section className="dashboard-grid">{cards.map(({ icon: Icon, title, detail, path }) => <button type="button" key={title} onClick={() => path !== '#' && navigate(path)}><span><Icon /></span><div><strong>{title}</strong><small>{detail}</small></div><ChevronRight /></button>)}<button type="button"><span><Bell /></span><div><strong>নোটিফিকেশন</strong><small>আপনার সর্বশেষ update</small></div><ChevronRight /></button><button type="button" onClick={() => role === 'patient' ? navigate('/profile') : role === 'doctor' ? navigate('/doctor/profile') : ['hospital', 'chamber'].includes(role) ? navigate('/provider/profile') : role === 'ambulance' && navigate('/ambulance/services')}><span><Settings /></span><div><strong>অ্যাকাউন্ট সেটিংস</strong><small>ব্যক্তিগত তথ্য ও নিরাপত্তা</small></div><ChevronRight /></button></section><button className="logout-button" type="button" onClick={() => void logout()}><LogOut size={18} /> লগআউট</button></>}</main></div>;
}
