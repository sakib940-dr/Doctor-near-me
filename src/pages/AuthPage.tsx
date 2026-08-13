import { FormEvent, useState } from 'react';
import { ArrowRight, Building2, HeartPulse, LoaderCircle, LockKeyhole, Mail, Phone, ShieldCheck, Stethoscope, UserRound } from 'lucide-react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import PublicHeader from '../components/PublicHeader';
import { useAuth } from '../contexts/AuthContext';
import { isSupabaseConfigured, requireSupabase } from '../lib/supabase';
import type { PublicRegistrationRole } from '../types';

const roles: Array<{ value: PublicRegistrationRole; title: string; detail: string; icon: typeof UserRound }> = [
  { value: 'patient', title: 'রোগী / সাধারণ ব্যবহারকারী', detail: 'ডাক্তার খুঁজুন ও অ্যাপয়েন্টমেন্ট রাখুন', icon: UserRound },
  { value: 'doctor', title: 'ডাক্তার', detail: 'প্রোফাইল ও চেম্বার পরিচালনা করুন', icon: Stethoscope },
  { value: 'hospital', title: 'হাসপাতাল / ক্লিনিক', detail: 'প্রতিষ্ঠান ও ডাক্তার তালিকা পরিচালনা করুন', icon: Building2 },
  { value: 'ambulance', title: 'অ্যাম্বুলেন্স সেবা', detail: 'সেবা নিবন্ধন ও availability দিন', icon: HeartPulse },
];

const messageFrom = (error: unknown) => error instanceof Error ? error.message : 'অনুরোধটি সম্পন্ন করা যায়নি।';

export default function AuthPage() {
  const { user, loading: sessionLoading } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const mode = searchParams.get('mode') === 'register' ? 'register' : 'login';
  const navigate = useNavigate();
  const location = useLocation();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState(() => searchParams.get('email') || '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<PublicRegistrationRole>('patient');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (!sessionLoading && user) return <Navigate to="/dashboard" replace />;

  function switchMode(next: 'login' | 'register') {
    setSearchParams(next === 'register' ? { mode: 'register' } : {});
    setError(null);
    setNotice(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    if (!isSupabaseConfigured) {
      setError('লাইভ authentication-এর জন্য Supabase environment variables যোগ করুন।');
      return;
    }
    if (mode === 'register' && password !== confirmPassword) {
      setError('দুইটি পাসওয়ার্ড মিলছে না।');
      return;
    }
    setSubmitting(true);
    try {
      if (mode === 'login') {
        const { error: loginError } = await requireSupabase().auth.signInWithPassword({ email: email.trim(), password });
        if (loginError) throw loginError;
        const from = (location.state as { from?: string } | null)?.from;
        navigate(from || '/dashboard', { replace: true });
      } else {
        const { data, error: signupError } = await requireSupabase().auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,
            data: { full_name: fullName.trim(), phone: phone.trim() || null, intended_role: role },
          },
        });
        if (signupError) throw signupError;
        if (data.session) navigate(searchParams.get('email') ? '/dashboard' : '/onboarding', { replace: true });
        else setNotice('আপনার ইমেইলে confirmation link পাঠানো হয়েছে। ইমেইল confirm করে লগইন করুন।');
      }
    } catch (submitError) {
      setError(messageFrom(submitError));
    } finally {
      setSubmitting(false);
    }
  }

  async function sendReset() {
    setError(null); setNotice(null);
    if (!isSupabaseConfigured) { setError('Supabase configuration প্রয়োজন।'); return; }
    if (!email.trim()) { setError('আগে আপনার ইমেইল লিখুন।'); return; }
    setSubmitting(true);
    const { error: resetError } = await requireSupabase().auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/auth` });
    setSubmitting(false);
    if (resetError) setError(resetError.message); else setNotice('Password reset link ইমেইলে পাঠানো হয়েছে।');
  }

  return (
    <div className="app-shell auth-page">
      <PublicHeader />
      <main className="auth-main container">
        <section className="auth-benefits">
          <span className="auth-kicker"><ShieldCheck size={17} /> নিরাপদ স্বাস্থ্যসেবা অ্যাকাউন্ট</span>
          <h1>{mode === 'login' ? 'আবার স্বাগতম' : 'আপনার অ্যাকাউন্ট তৈরি করুন'}</h1>
          <p>একটি অ্যাকাউন্ট দিয়ে ডাক্তার খোঁজা, অ্যাপয়েন্টমেন্ট, সেবা নিবন্ধন এবং role-based dashboard ব্যবহার করুন।</p>
          <ul><li>নিরাপদ Supabase authentication</li><li>Role অনুযায়ী আলাদা dashboard</li><li>Doctor/provider তথ্য প্রকাশের আগে verification</li></ul>
          <Link to="/doctors">অ্যাকাউন্ট ছাড়াই ডাক্তার খুঁজুন <ArrowRight size={17} /></Link>
        </section>
        <section className="auth-card">
          <div className="auth-tabs"><button className={mode === 'login' ? 'active' : ''} type="button" onClick={() => switchMode('login')}>লগইন</button><button className={mode === 'register' ? 'active' : ''} type="button" onClick={() => switchMode('register')}>রেজিস্ট্রেশন</button></div>
          <form onSubmit={submit}>
            {mode === 'register' && <>
              <label className="auth-field"><span>পূর্ণ নাম</span><div><UserRound /><input required minLength={2} value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="আপনার পূর্ণ নাম" /></div></label>
              <label className="auth-field"><span>মোবাইল নম্বর <small>(ঐচ্ছিক)</small></span><div><Phone /><input inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="01XXXXXXXXX" /></div></label>
              <fieldset className="role-picker"><legend>অ্যাকাউন্টের ধরন</legend>{roles.map((item) => { const Icon = item.icon; return <label className={role === item.value ? 'selected' : ''} key={item.value}><input type="radio" name="role" value={item.value} checked={role === item.value} onChange={() => setRole(item.value)} /><Icon /><span><strong>{item.title}</strong><small>{item.detail}</small></span></label>; })}</fieldset>
            </>}
            <label className="auth-field"><span>ইমেইল</span><div><Mail /><input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" /></div></label>
            <label className="auth-field"><span>পাসওয়ার্ড</span><div><LockKeyhole /><input required minLength={8} type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="কমপক্ষে ৮ অক্ষর" /></div></label>
            {mode === 'register' && <label className="auth-field"><span>পাসওয়ার্ড নিশ্চিত করুন</span><div><LockKeyhole /><input required minLength={8} type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="পাসওয়ার্ডটি আবার লিখুন" /></div></label>}
            {mode === 'login' && <button className="forgot-link" type="button" onClick={() => void sendReset()}>পাসওয়ার্ড ভুলে গেছেন?</button>}
            {error && <div className="auth-message error" role="alert">{error}</div>}
            {notice && <div className="auth-message success" role="status">{notice}</div>}
            <button className="auth-submit" type="submit" disabled={submitting}>{submitting ? <LoaderCircle className="spin" /> : mode === 'login' ? 'লগইন করুন' : 'অ্যাকাউন্ট তৈরি করুন'}</button>
            <p className="auth-terms">রেজিস্ট্রেশন করে আপনি প্ল্যাটফর্মের Terms ও Privacy Policy মেনে নিচ্ছেন।</p>
          </form>
        </section>
      </main>
    </div>
  );
}
