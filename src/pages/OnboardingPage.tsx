import { FormEvent, useEffect, useState } from 'react';
import { ArrowRight, LoaderCircle, MapPin, Phone, UserRound } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import PublicHeader from '../components/PublicHeader';
import { useAuth } from '../contexts/AuthContext';
import { completeAccountOnboarding } from '../services/account';
import { getDistricts, getUpazilas } from '../services/discovery';
import type { District, PublicRegistrationRole, Upazila } from '../types';

const allowedRoles: PublicRegistrationRole[] = ['patient', 'doctor', 'hospital', 'ambulance'];
const roleLabels: Record<PublicRegistrationRole, string> = { patient: 'রোগী / সাধারণ ব্যবহারকারী', doctor: 'ডাক্তার', hospital: 'হাসপাতাল / ক্লিনিক', ambulance: 'অ্যাম্বুলেন্স সেবা' };

export default function OnboardingPage() {
  const { user, account, loading, refreshAccount } = useAuth();
  const navigate = useNavigate();
  const metadataRole = user?.user_metadata.intended_role;
  const initialRole = allowedRoles.includes(account?.role as PublicRegistrationRole) ? account?.role as PublicRegistrationRole : allowedRoles.includes(metadataRole) ? metadataRole : 'patient';
  const [fullName, setFullName] = useState(account?.full_name || user?.user_metadata.full_name || '');
  const [phone, setPhone] = useState(user?.phone || user?.user_metadata.phone || '');
  const [role, setRole] = useState<PublicRegistrationRole>(initialRole);
  const [districtId, setDistrictId] = useState('');
  const [upazilaId, setUpazilaId] = useState('');
  const [districts, setDistricts] = useState<District[]>([]);
  const [upazilas, setUpazilas] = useState<Upazila[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { getDistricts().then(setDistricts).catch(() => setError('জেলার তালিকা লোড করা যায়নি।')); }, []);
  useEffect(() => { if (!districtId) { setUpazilas([]); return; } getUpazilas(Number(districtId)).then(setUpazilas).catch(() => setError('উপজেলার তালিকা লোড করা যায়নি।')); }, [districtId]);

  if (!loading && account?.profile_completed) return <Navigate to="/dashboard" replace />;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSubmitting(true); setError(null);
    try {
      await completeAccountOnboarding({ fullName, phone, role, districtId: districtId ? Number(districtId) : null, upazilaId: upazilaId ? Number(upazilaId) : null });
      await refreshAccount();
      navigate('/dashboard', { replace: true });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Onboarding সম্পন্ন করা যায়নি।');
    } finally { setSubmitting(false); }
  }

  return <div className="app-shell onboarding-page"><PublicHeader /><main className="onboarding-main container"><section className="onboarding-intro"><span>শেষ একটি ধাপ</span><h1>আপনার প্রোফাইল সম্পূর্ণ করুন</h1><p>সঠিক dashboard ও এলাকার সেবা দেখানোর জন্য মৌলিক তথ্য দিন। সেবা প্রদানকারীর তথ্য পরে verification-এর জন্য জমা দিতে হবে।</p></section><form className="onboarding-card" onSubmit={submit}><label className="auth-field"><span>পূর্ণ নাম</span><div><UserRound /><input required minLength={2} value={fullName} onChange={(event) => setFullName(event.target.value)} /></div></label><label className="auth-field"><span>মোবাইল নম্বর</span><div><Phone /><input inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="01XXXXXXXXX" /></div></label><label className="auth-field"><span>অ্যাকাউন্টের ধরন</span><div><UserRound /><select value={role} onChange={(event) => setRole(event.target.value as PublicRegistrationRole)}>{allowedRoles.map((item) => <option key={item} value={item}>{roleLabels[item]}</option>)}</select></div></label><div className="onboarding-locations"><label className="auth-field"><span>জেলা</span><div><MapPin /><select value={districtId} onChange={(event) => { setDistrictId(event.target.value); setUpazilaId(''); }}><option value="">জেলা নির্বাচন করুন</option>{districts.map((district) => <option key={district.id} value={district.id}>{district.name_bn}</option>)}</select></div></label><label className="auth-field"><span>উপজেলা</span><div><MapPin /><select disabled={!districtId} value={upazilaId} onChange={(event) => setUpazilaId(event.target.value)}><option value="">উপজেলা নির্বাচন করুন</option>{upazilas.map((upazila) => <option key={upazila.id} value={upazila.id}>{upazila.name_bn}</option>)}</select></div></label></div>{error && <div className="auth-message error" role="alert">{error}</div>}<button className="auth-submit" type="submit" disabled={submitting}>{submitting ? <LoaderCircle className="spin" /> : <>Dashboard-এ যান <ArrowRight /></>}</button></form></main></div>;
}
