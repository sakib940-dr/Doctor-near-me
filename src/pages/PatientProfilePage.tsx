import { FormEvent, useEffect, useState } from 'react';
import { ArrowLeft, LoaderCircle, MapPin, Save, ShieldCheck, UserRound } from 'lucide-react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getMyPatientProfile, updateMyPatientProfile } from '../services/appointments';
import { getDistricts, getUpazilas } from '../services/discovery';
import type { District, PatientProfile, Upazila } from '../types';

const bloodGroups = ['', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const emptyProfile: PatientProfile = { user_id: '', full_name: '', email: '', phone: '', date_of_birth: null, gender: null, blood_group: null, address_line: '', district_id: null, upazila_id: null, emergency_contact_name: '', emergency_contact_phone: '', preferred_language: 'bn', profile_completed: false };
const messageFrom = (error: unknown) => error instanceof Error ? error.message : 'প্রোফাইল সংরক্ষণ করা যায়নি।';

export default function PatientProfilePage() {
  const { account, refreshAccount } = useAuth();
  const [profile, setProfile] = useState<PatientProfile>(emptyProfile);
  const [districts, setDistricts] = useState<District[]>([]);
  const [upazilas, setUpazilas] = useState<Upazila[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getMyPatientProfile(), getDistricts()])
      .then(([patient, districtRows]) => { if (patient) setProfile(patient); setDistricts(districtRows); })
      .catch((loadError: unknown) => setError(messageFrom(loadError)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!profile.district_id) { setUpazilas([]); return; }
    getUpazilas(profile.district_id).then(setUpazilas).catch(() => setError('উপজেলার তালিকা লোড করা যায়নি।'));
  }, [profile.district_id]);

  if (account && account.role !== 'patient') return <Navigate to="/dashboard" replace />;

  function set<K extends keyof PatientProfile>(key: K, value: PatientProfile[K]) {
    setProfile((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(null); setNotice(null);
    try {
      await updateMyPatientProfile({ full_name: profile.full_name, phone: profile.phone, date_of_birth: profile.date_of_birth, gender: profile.gender, blood_group: profile.blood_group, address_line: profile.address_line, district_id: profile.district_id, upazila_id: profile.upazila_id, emergency_contact_name: profile.emergency_contact_name, emergency_contact_phone: profile.emergency_contact_phone });
      await refreshAccount();
      setNotice('প্রোফাইল সফলভাবে সংরক্ষণ হয়েছে।');
    } catch (saveError) { setError(messageFrom(saveError)); } finally { setSaving(false); }
  }

  return <div className="app-shell patient-profile-page"><main className="patient-main container"><Link className="back-link" to="/dashboard"><ArrowLeft /> Dashboard-এ ফিরুন</Link><div className="patient-page-heading"><span><UserRound /></span><div><h1>আমার প্রোফাইল</h1><p>Appointment ও জরুরি যোগাযোগের জন্য সঠিক তথ্য রাখুন।</p></div></div>{loading ? <div className="loading-box"><LoaderCircle className="spin" /> প্রোফাইল লোড হচ্ছে…</div> : <form className="patient-form" onSubmit={submit}><section><h2>ব্যক্তিগত তথ্য</h2><div className="patient-form-grid"><label className="auth-field"><span>পূর্ণ নাম</span><div><input required minLength={2} value={profile.full_name || ''} onChange={(event) => set('full_name', event.target.value)} /></div></label><label className="auth-field"><span>ইমেইল</span><div><input disabled value={profile.email || ''} /></div></label><label className="auth-field"><span>মোবাইল নম্বর</span><div><input inputMode="tel" value={profile.phone || ''} onChange={(event) => set('phone', event.target.value)} /></div></label><label className="auth-field"><span>জন্মতারিখ</span><div><input type="date" value={profile.date_of_birth || ''} onChange={(event) => set('date_of_birth', event.target.value || null)} /></div></label><label className="auth-field"><span>লিঙ্গ</span><div><select value={profile.gender || ''} onChange={(event) => set('gender', (event.target.value || null) as PatientProfile['gender'])}><option value="">নির্বাচন করুন</option><option value="male">পুরুষ</option><option value="female">নারী</option><option value="other">অন্যান্য</option></select></div></label><label className="auth-field"><span>রক্তের গ্রুপ</span><div><select value={profile.blood_group || ''} onChange={(event) => set('blood_group', event.target.value || null)}>{bloodGroups.map((group) => <option key={group} value={group}>{group || 'নির্বাচন করুন'}</option>)}</select></div></label></div></section><section><h2>ঠিকানা</h2><label className="auth-field"><span>বিস্তারিত ঠিকানা</span><div><input value={profile.address_line || ''} onChange={(event) => set('address_line', event.target.value)} placeholder="গ্রাম/রোড/এলাকা" /></div></label><div className="patient-form-grid"><label className="auth-field"><span>জেলা</span><div><MapPin /><select value={profile.district_id ?? ''} onChange={(event) => { set('district_id', event.target.value ? Number(event.target.value) : null); set('upazila_id', null); }}><option value="">নির্বাচন করুন</option>{districts.map((district) => <option key={district.id} value={district.id}>{district.name_bn}</option>)}</select></div></label><label className="auth-field"><span>উপজেলা</span><div><MapPin /><select disabled={!profile.district_id} value={profile.upazila_id ?? ''} onChange={(event) => set('upazila_id', event.target.value ? Number(event.target.value) : null)}><option value="">নির্বাচন করুন</option>{upazilas.map((upazila) => <option key={upazila.id} value={upazila.id}>{upazila.name_bn}</option>)}</select></div></label></div></section><section><h2>জরুরি যোগাযোগ</h2><div className="patient-form-grid"><label className="auth-field"><span>যোগাযোগের ব্যক্তির নাম</span><div><input value={profile.emergency_contact_name || ''} onChange={(event) => set('emergency_contact_name', event.target.value)} /></div></label><label className="auth-field"><span>জরুরি মোবাইল নম্বর</span><div><input inputMode="tel" value={profile.emergency_contact_phone || ''} onChange={(event) => set('emergency_contact_phone', event.target.value)} /></div></label></div></section>{error && <div className="auth-message error" role="alert">{error}</div>}{notice && <div className="auth-message success"><ShieldCheck /> {notice}</div>}<button className="auth-submit" type="submit" disabled={saving}>{saving ? <LoaderCircle className="spin" /> : <><Save /> প্রোফাইল সংরক্ষণ করুন</>}</button></form>}</main></div>;
}
