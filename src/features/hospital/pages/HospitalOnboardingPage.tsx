import { useEffect, useMemo, useState } from 'react';
import { Activity, Building2, Check, ChevronRight, ClipboardList, FlaskConical, GalleryHorizontal, Image, LoaderCircle, MessageCircle, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  providerInvestigationCosts, providerServices, providerSlider, providerTreatmentCosts,
} from '../../../services/providerWebsiteContent';
import { HospitalPageHeader } from '../HospitalShell';
import { bi, useHospitalLanguage } from '../i18n';
import { useHospital } from '../useHospital';

type Counts = { gallery: number; services: number; treatment: number; investigation: number };

export default function HospitalOnboardingPage() {
  const { text } = useHospitalLanguage();
  const { provider, loading: providerLoading } = useHospital();
  const [counts, setCounts] = useState<Counts>({ gallery: 0, services: 0, treatment: 0, investigation: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!provider) { setLoading(false); return; }
    setLoading(true); setError(null);
    Promise.all([
      providerSlider.getAll(provider.id), providerServices.getAll(provider.id),
      providerTreatmentCosts.getAll(provider.id), providerInvestigationCosts.getAll(provider.id),
    ]).then(([gallery, services, treatment, investigation]) => setCounts({ gallery: gallery.length, services: services.length, treatment: treatment.length, investigation: investigation.length }))
      .catch(() => setError(text(bi('Onboarding progress লোড করা যায়নি।', 'Onboarding progress could not be loaded.'))))
      .finally(() => setLoading(false));
  }, [provider?.id]);

  const steps = useMemo(() => provider ? [
    { icon: ShieldCheck, title: bi('বেসিক প্রোফাইল ও ভেরিফিকেশন', 'Basic profile & verification'), detail: bi('নাম, যোগাযোগ, ঠিকানা এবং verification evidence', 'Name, contact, address and verification evidence'), path: '/hospital-console/verification', done: Boolean(provider.name_bn && provider.phone && provider.address && provider.verified) },
    { icon: Image, title: bi('লোগো / প্রোফাইল ছবি', 'Logo / profile image'), detail: bi('পরিষ্কার হাসপাতাল logo upload করুন', 'Upload a clear Hospital logo'), path: '/hospital-console/information?section=media', done: Boolean(provider.logo_url) },
    { icon: GalleryHorizontal, title: bi('চারটি গ্যালারি ছবি', 'Four gallery images'), detail: bi('পাবলিক প্রোফাইল slider-এর ৪টি ছবি', 'Four public profile slider images'), path: '/hospital-console/gallery', done: counts.gallery >= 4 },
    { icon: Building2, title: bi('হাসপাতালের তথ্য', 'Hospital information'), detail: bi('About, location, contact ও opening information', 'About, location, contact and opening information'), path: '/hospital-console/information?section=details', done: Boolean(provider.about_bn && provider.address && provider.phone) },
    { icon: ClipboardList, title: bi('সেবা সেটআপ', 'Services setup'), detail: bi('হাসপাতালের public services যোগ করুন', 'Add public Hospital services'), path: '/hospital-console/services', done: counts.services > 0 },
    { icon: Activity, title: bi('চিকিৎসা খরচ', 'Treatment cost setup'), detail: bi('স্বচ্ছ treatment/service cost যোগ করুন', 'Add transparent treatment/service costs'), path: '/hospital-console/treatment-costs', done: counts.treatment > 0 },
    { icon: FlaskConical, title: bi('পরীক্ষার খরচ', 'Investigation cost setup'), detail: bi('Investigation ও diagnostic cost যোগ করুন', 'Add investigation and diagnostic costs'), path: '/hospital-console/investigation-costs', done: counts.investigation > 0 },
    { icon: MessageCircle, title: bi('রিসেপশন সেটিংস', 'Reception settings'), detail: bi('Default phone ও WhatsApp নিশ্চিত করুন', 'Confirm default phone and WhatsApp'), path: '/hospital-console/reception', done: Boolean(provider.phone && (provider.whatsapp || provider.phone)) },
  ] : [], [provider, counts]);
  const completed = steps.filter((step) => step.done).length;

  return <>
    <HospitalPageHeader eyebrow={bi('ধাপে ধাপে সেটআপ', 'Step-by-step setup')} title={bi('হাসপাতাল Onboarding', 'Hospital Onboarding')} description={bi('প্রতিটি ধাপ আলাদাভাবে save করুন। সংরক্ষিত database data থেকে progress তৈরি হয়, তাই refresh করলেও হারাবে না।', 'Save each step independently. Progress is derived from saved database data and survives refresh.')} />
    {error && <div className="hospital-error">{error}</div>}
    {providerLoading || loading ? <div className="hospital-empty"><LoaderCircle className="spin" /> {text(bi('Progress লোড হচ্ছে…', 'Loading progress…'))}</div> : !provider ? <div className="hospital-empty">{text(bi('আগে Hospital basic profile তৈরি করুন।', 'Create the Hospital basic profile first.'))}<Link className="hospital-primary-button" to="/hospital-console/information">{text(bi('বেসিক প্রোফাইল তৈরি করুন', 'Create basic profile'))}</Link></div> : <>
      <section className="hospital-panel hospital-onboarding-summary"><div><span>{completed}/8</span><div><strong>{text(bi('সম্পন্ন ধাপ', 'steps completed'))}</strong><small>{completed === 8 ? text(bi('আপনার Hospital profile সম্পূর্ণ প্রস্তুত।', 'Your Hospital profile is ready.')) : text(bi('অসম্পূর্ণ ধাপগুলো পরে আবার edit করা যাবে।', 'Incomplete steps can be edited later.'))}</small></div></div><progress max={8} value={completed} /></section>
      <section className="hospital-onboarding-steps">{steps.map(({ icon: Icon, title, detail, path, done }, index) => <Link to={path} className={`hospital-onboarding-step${done ? ' complete' : ''}`} key={index}><b>{done ? <Check /> : index + 1}</b><span><Icon /></span><div><strong>{text(title)}</strong><small>{text(detail)}</small></div><em>{done ? text(bi('সম্পন্ন', 'Complete')) : text(bi('সেটআপ করুন', 'Set up'))}</em><ChevronRight /></Link>)}</section>
    </>}
  </>;
}
