import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronLeft, ChevronRight, CircleDashed, LoaderCircle, PanelsTopLeft } from 'lucide-react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getMyDoctorProfile } from '../services/doctorDashboard';
import { getMyDoctorPublicContent } from '../services/doctorPublicContent';
import type { DoctorPublicContent, MyDoctorProfile } from '../types';
import DoctorChamberDetailsPage from './DoctorChamberDetailsPage';
import DoctorPublicProfileContentPage from './DoctorPublicProfileContentPage';
import DoctorVisitingCardPage from './DoctorVisitingCardPage';

const steps = [
  { title: 'Visiting Card Input', short: 'Visiting Card' },
  { title: 'Chamber Details + Location Setup', short: 'Chamber & Location' },
  { title: 'About Doctor', short: 'About' },
  { title: 'Service List Setup', short: 'Services' },
  { title: 'Treatment Cost List Setup', short: 'Treatment Cost' },
  { title: 'Investigation Cost List Setup', short: 'Investigation Cost' },
] as const;

function completion(profile: MyDoctorProfile | null, content: DoctorPublicContent | null) {
  const doctor = profile?.doctor;
  const ownedChambers = profile?.chambers?.filter((item) => item.owned_by_doctor === true) ?? [];
  return [
    Boolean(doctor?.full_name && ((profile?.specialty_ids?.length ?? 0) > 0 || doctor?.professional_title || doctor?.degree || doctor?.bmdc_registration_no)),
    ownedChambers.some((item) => Boolean(item.name_bn && item.address && item.district_id && (item.upazila_id || (item.latitude != null && item.longitude != null)))),
    Boolean(content?.bio_bn?.trim() || content?.bio_en?.trim()),
    (content?.services?.length ?? 0) > 0,
    (content?.treatment_costs?.length ?? 0) > 0,
    (content?.investigation_costs?.length ?? 0) > 0,
  ];
}

export default function DoctorPublicContentManagementPage() {
  const { account } = useAuth();
  const [params, setParams] = useSearchParams();
  const requestedStep = Number(params.get('step') || '1');
  const step = Number.isFinite(requestedStep) ? Math.min(6, Math.max(1, Math.trunc(requestedStep))) : 1;
  const [profile, setProfile] = useState<MyDoctorProfile | null>(null);
  const [content, setContent] = useState<DoctorPublicContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshStatus = useCallback(async (showLoader = false) => {
    if (showLoader) setLoading(true);
    setError(null);
    try {
      const [nextProfile, nextContent] = await Promise.all([getMyDoctorProfile(), getMyDoctorPublicContent()]);
      setProfile(nextProfile);
      setContent(nextContent);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Public content status লোড করা যায়নি।');
    } finally {
      if (showLoader) setLoading(false);
    }
  }, []);

  useEffect(() => { void refreshStatus(true); }, [refreshStatus]);
  useEffect(() => {
    const onFocus = () => { void refreshStatus(false); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refreshStatus]);

  const statuses = useMemo(() => completion(profile, content), [profile, content]);
  const completed = statuses.filter(Boolean).length;

  if (account && account.role !== 'doctor') return <Navigate to="/dashboard" replace />;

  async function move(next: number) {
    await refreshStatus(false);
    setParams({ step: String(Math.min(6, Math.max(1, next))) });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const body = step === 1 ? <DoctorVisitingCardPage onSaved={() => refreshStatus(false)} />
    : step === 2 ? <DoctorChamberDetailsPage onSaved={() => refreshStatus(false)} />
      : step === 3 ? <DoctorPublicProfileContentPage section="about" embedded onSaved={() => refreshStatus(false)} />
        : step === 4 ? <DoctorPublicProfileContentPage section="services" embedded onSaved={() => refreshStatus(false)} />
          : step === 5 ? <DoctorPublicProfileContentPage section="treatment" embedded onSaved={() => refreshStatus(false)} />
            : <DoctorPublicProfileContentPage section="investigation" embedded onSaved={() => refreshStatus(false)} />;

  return <div className="doctor-content-wizard-page">
    <section className="doctor-content-wizard-header">
      <div className="doctor-content-wizard-title"><span><PanelsTopLeft /></span><div><small>Public Content Management</small><h1>Public Profile Setup</h1><p>প্রতিটি ধাপ আলাদাভাবে save হয়। Refresh বা logout করলেও database-এ saved data অক্ষত থাকবে।</p></div></div>
      <div className="doctor-content-progress"><strong>{completed}/6</strong><span>steps saved</span><div><i style={{ width: `${(completed / 6) * 100}%` }} /></div></div>
    </section>

    <nav className="doctor-content-stepper" aria-label="Public content setup steps">
      {steps.map((item, index) => {
        const number = index + 1;
        const saved = statuses[index];
        return <button type="button" key={item.title} className={`${number === step ? 'active' : ''} ${saved ? 'saved' : 'incomplete'}`} onClick={() => void move(number)}>
          <span className="doctor-content-step-number">{saved ? <CheckCircle2 /> : <CircleDashed />}</span>
          <span><small>Step {number}</small><strong>{item.short}</strong><em>{saved ? 'Saved' : 'Incomplete'}</em></span>
        </button>;
      })}
    </nav>

    {loading ? <div className="loading-box"><LoaderCircle className="spin" /> Setup status লোড হচ্ছে…</div> : <>
      {error && <div className="error-box" role="alert">{error}</div>}
      <section className="doctor-content-wizard-current"><small>Step {step} of 6</small><h2>{steps[step - 1].title}</h2><span className={statuses[step - 1] ? 'saved' : 'incomplete'}>{statuses[step - 1] ? 'Saved' : 'Incomplete'}</span></section>
      <div className="doctor-content-wizard-body">{body}</div>
      <div className="doctor-content-wizard-navigation">
        <button type="button" disabled={step === 1} onClick={() => void move(step - 1)}><ChevronLeft /> Previous</button>
        <button type="button" className="primary" disabled={step === 6} onClick={() => void move(step + 1)}>Next <ChevronRight /></button>
      </div>
    </>}
  </div>;
}
