import { type FormEvent, useState } from 'react';
import { CalendarCheck, KeyRound, LoaderCircle, LockKeyhole, ShieldCheck } from 'lucide-react';
import { Link, Navigate } from 'react-router-dom';
import { requireSupabase } from '../../../lib/supabase';
import { HospitalPageHeader } from '../HospitalShell';
import { bi, useHospitalLanguage } from '../i18n';
import { useHospital } from '../useHospital';

export function HospitalProfilePreviewPage() {
  const { text } = useHospitalLanguage();
  const { provider, loading } = useHospital();
  if (loading) return <div className="hospital-empty"><LoaderCircle className="spin" /></div>;
  return provider ? <Navigate to={`/hospital/${provider.id}`} replace /> : <div className="hospital-empty">{text(bi('Hospital profile পাওয়া যায়নি।', 'Hospital profile was not found.'))}</div>;
}

export function HospitalAppointmentSettingsPage() {
  const { text } = useHospitalLanguage();
  const { provider } = useHospital();
  return <><HospitalPageHeader eyebrow={bi('রিসেপশন ওয়ার্কফ্লো', 'Reception Workflow')} title={bi('অ্যাপয়েন্টমেন্ট সেটিংস', 'Appointment Settings')} description={bi('Hospital-controlled Doctor card থেকে আসা request-এর reception flow ও contact readiness দেখুন।', 'Review reception flow and contact readiness for Hospital-controlled Doctor-card requests.')} /><section className="hospital-grid hospital-settings-cards"><article className="hospital-panel"><CalendarCheck /><h2>{text(bi('Reception-managed queue', 'Reception-managed queue'))}</h2><p>{text(bi('Patient request প্রথমে Pending হবে। Reception Accept করলে serial দেওয়া যাবে, তারপর Complete বা Cancel করা যাবে।', 'Requests start as Pending. Reception can Accept with a serial, then Complete or Cancel.'))}</p></article><article className="hospital-panel"><ShieldCheck /><h2>{text(bi('Contact fallback', 'Contact fallback'))}</h2><p>{provider?.phone ? `${text(bi('ডিফল্ট রিসেপশন ফোন:', 'Default reception phone:'))} ${provider.phone}` : text(bi('রিসেপশন ফোন সেট করা হয়নি।', 'Reception phone is not configured.'))}</p><Link className="hospital-primary-button" to="/hospital-console/reception">{text(bi('রিসেপশন সেটিংস খুলুন', 'Open reception settings'))}</Link></article></section></>;
}

export function HospitalSecurityPage() {
  const { text } = useHospitalLanguage();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(null); setNotice(null);
    if (password.length < 8) { setError(text(bi('Password কমপক্ষে ৮ অক্ষরের হতে হবে।', 'Password must be at least 8 characters.'))); return; }
    if (password !== confirm) { setError(text(bi('Password দুটি মিলছে না।', 'Passwords do not match.'))); return; }
    setBusy(true);
    try { const { error: updateError } = await requireSupabase().auth.updateUser({ password }); if (updateError) throw updateError; setPassword(''); setConfirm(''); setNotice(text(bi('Password সফলভাবে পরিবর্তন হয়েছে।', 'Password changed successfully.'))); }
    catch { setError(text(bi('Password পরিবর্তন করা যায়নি। আবার চেষ্টা করুন।', 'Password could not be changed. Please try again.'))); }
    finally { setBusy(false); }
  }
  return <><HospitalPageHeader eyebrow={bi('অ্যাকাউন্ট সুরক্ষা', 'Account Security')} title={bi('সিকিউরিটি সেটিংস', 'Security Settings')} description={bi('Hospital account-এর password নিরাপদভাবে পরিবর্তন করুন।', 'Securely change the Hospital account password.')} /><form className="hospital-panel hospital-form hospital-security-card" onSubmit={submit}><header><LockKeyhole /><div><h2>{text(bi('Password পরিবর্তন', 'Change password'))}</h2><p>{text(bi('কমপক্ষে ৮ অক্ষরের একটি শক্তিশালী password ব্যবহার করুন।', 'Use a strong password with at least 8 characters.'))}</p></div></header><label>{text(bi('নতুন Password', 'New password'))}<span className="hospital-input-with-icon"><KeyRound /><input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /></span></label><label>{text(bi('নতুন Password নিশ্চিত করুন', 'Confirm new password'))}<span className="hospital-input-with-icon"><ShieldCheck /><input type="password" required minLength={8} autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} /></span></label>{error && <div className="hospital-error">{error}</div>}{notice && <div className="hospital-notice">{notice}</div>}<button className="hospital-primary-button" disabled={busy}>{busy ? <LoaderCircle className="spin" /> : <KeyRound />} {text(bi('Password আপডেট করুন', 'Update password'))}</button></form></>;
}
