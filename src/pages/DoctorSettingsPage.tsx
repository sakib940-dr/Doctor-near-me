import { FormEvent, useState } from 'react';
import { Crown, KeyRound, LoaderCircle, LockKeyhole, ShieldCheck } from 'lucide-react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { requireSupabase } from '../lib/supabase';

const messageFrom = (error: unknown) => error instanceof Error ? error.message : 'Password update করা যায়নি।';

export default function DoctorSettingsPage() {
  const { account } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (account && account.role !== 'doctor') return <Navigate to="/dashboard" replace />;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    if (password.length < 8) { setError('নতুন password কমপক্ষে ৮ অক্ষরের হতে হবে।'); return; }
    if (password !== confirmPassword) { setError('Password এবং Confirm Password এক নয়।'); return; }
    setSaving(true);
    try {
      const { error: updateError } = await requireSupabase().auth.updateUser({ password });
      if (updateError) throw updateError;
      setPassword('');
      setConfirmPassword('');
      setNotice('Password সফলভাবে পরিবর্তন হয়েছে।');
    } catch (saveError) {
      setError(messageFrom(saveError));
    } finally {
      setSaving(false);
    }
  }

  return <div className="app-shell doctor-module-page"><main className="doctor-module-main container">
    <header className="doctor-module-heading"><span><LockKeyhole /></span><div><small>Account security</small><h1>Settings</h1><p>Doctor account security এবং membership-related settings পরিচালনা করুন।</p></div></header>

    <section className="doctor-settings-grid">
      <form className="doctor-module-card doctor-password-card" onSubmit={submit}>
        <header><KeyRound /><div><h2>Password Change</h2><p>একটি শক্তিশালী নতুন password দিন। Supabase Auth existing session-এর মাধ্যমে নিরাপদভাবে update করবে।</p></div></header>
        <label className="auth-field"><span>New Password</span><div><LockKeyhole /><input type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} /></div></label>
        <label className="auth-field"><span>Confirm New Password</span><div><ShieldCheck /><input type="password" autoComplete="new-password" minLength={8} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></div></label>
        {error && <div className="auth-message error" role="alert">{error}</div>}
        {notice && <div className="auth-message success" role="status">{notice}</div>}
        <button className="auth-submit" type="submit" disabled={saving}>{saving ? <LoaderCircle className="spin" /> : <KeyRound />} Password Update</button>
      </form>

      <article className="doctor-module-card doctor-membership-card">
        <header><Crown /><div><h2>Premium Membership</h2><p>Existing Premium Member feature এখানে preserve করা হয়েছে, যাতে পুরোনো capability হারিয়ে না যায়।</p></div></header>
        <Link className="doctor-module-primary-link" to="/doctor/premium"><Crown /> Premium Membership খুলুন</Link>
      </article>
    </section>
  </main></div>;
}
