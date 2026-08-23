import { FormEvent, useEffect, useState } from 'react';
import { Building2, Eye, EyeOff, HeartPulse, LoaderCircle, LockKeyhole, Mail, Phone, ShieldCheck, Stethoscope, UserRound } from 'lucide-react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import PublicHeader from '../components/PublicHeader';
import { useAuth } from '../contexts/AuthContext';
import { isEmailIdentifier, normalizeAuthPhone, validateEmail } from '../lib/authIdentifiers';
import { isSupabaseConfigured, requireSupabase } from '../lib/supabase';
import type { PublicRegistrationRole } from '../types';

const roles: Array<{ value: PublicRegistrationRole; title: string; detail: string; icon: typeof UserRound }> = [
  { value: 'patient', title: 'রোগী / সাধারণ ব্যবহারকারী', detail: 'ডাক্তার খুঁজুন, সংরক্ষণ ও অ্যাপয়েন্টমেন্ট নিন', icon: UserRound },
  { value: 'doctor', title: 'ডাক্তার', detail: 'Public profile, chamber, schedule ও appointment পরিচালনা করুন', icon: Stethoscope },
  { value: 'hospital', title: 'হাসপাতাল / ক্লিনিক', detail: 'প্রতিষ্ঠান, সেবা ও linked Doctor profile পরিচালনা করুন', icon: Building2 },
  { value: 'ambulance', title: 'অ্যাম্বুলেন্স সেবা', detail: 'সেবা ও availability তথ্য প্রকাশ করুন', icon: HeartPulse },
];

const messageFrom = (error: unknown) => error instanceof Error ? error.message : 'অনুরোধটি সম্পন্ন করা যায়নি।';

export default function AuthPage() {
  const { user, account, loading: sessionLoading } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const mode = searchParams.get('mode') === 'register' ? 'register' : 'login';
  const navigate = useNavigate();
  const location = useLocation();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState(() => searchParams.get('email') || '');
  const [identifier, setIdentifier] = useState(() => searchParams.get('email') || '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [role, setRole] = useState<PublicRegistrationRole>('patient');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const referral = searchParams.get('ref')?.trim().toUpperCase();
    if (referral) localStorage.setItem('docbd-referral-code', referral);
  }, [searchParams]);

  if (!sessionLoading && user && !submitting) return <Navigate to={account?.role === 'patient' ? '/' : '/dashboard'} replace />;

  function switchMode(next: 'login' | 'register') {
    setSearchParams(next === 'register' ? { mode: 'register' } : {});
    setError(null);
    setNotice(null);
    setAcceptedTerms(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    if (!isSupabaseConfigured) {
      setError('Authentication service configuration পাওয়া যায়নি।');
      return;
    }
    if (mode === 'register' && password !== confirmPassword) {
      setError('দুইটি পাসওয়ার্ড মিলছে না।');
      return;
    }
    if (!acceptedTerms) { setError('Terms & Conditions এবং Privacy Policy-তে সম্মতি দিন।'); return; }

    setSubmitting(true);
    try {
      if (mode === 'login') {
        const loginId = identifier.trim();
        const client = requireSupabase();
        const credentials = isEmailIdentifier(loginId)
          ? { email: loginId.toLowerCase(), password }
          : { phone: normalizeAuthPhone(loginId) || '', password };
        if ('phone' in credentials && !credentials.phone) throw new Error('সঠিক email অথবা phone number দিন।');

        const { error: loginError } = await client.auth.signInWithPassword(credentials);
        if (loginError) throw loginError;

        const from = (location.state as { from?: string } | null)?.from;
        navigate(from || (account?.role === 'patient' ? '/' : '/dashboard'), { replace: true });
      } else {
        const emailError = validateEmail(email);
        if (emailError) throw new Error(emailError);
        const normalizedPhone = normalizeAuthPhone(phone);
        if (!normalizedPhone) throw new Error('Phone Number প্রয়োজন। বাংলাদেশি নম্বর 01XXXXXXXXX format-এ দিতে পারেন।');

        const { data, error: signupError } = await requireSupabase().auth.signUp({
          email: email.trim().toLowerCase(),
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/onboarding`,
            data: { full_name: fullName.trim(), phone: normalizedPhone, intended_role: role },
          },
        });
        if (signupError) throw signupError;
        if (data.session) navigate('/onboarding', { replace: true });
        else setNotice('Registration সম্পন্ন হয়েছে। প্রয়োজন হলে আপনার Email confirmation link ব্যবহার করে তারপর Login করুন।');
      }
    } catch (submitError) {
      const message = messageFrom(submitError);
      setError(/duplicate|already|registered|phone.*use|user_already_exists/i.test(message)
        ? 'এই email/phone দিয়ে নতুন account তৈরি করা যাচ্ছে না। আগে Login চেষ্টা করুন অথবা অন্য contact ব্যবহার করুন।'
        : message);
    } finally {
      setSubmitting(false);
    }
  }

  async function sendReset() {
    setError(null); setNotice(null);
    if (!isSupabaseConfigured) { setError('Authentication service configuration পাওয়া যায়নি।'); return; }
    const resetEmail = identifier.trim();
    if (!isEmailIdentifier(resetEmail)) { setError('Password reset-এর জন্য account-এর Email Address লিখুন।'); return; }
    setSubmitting(true);
    const { error: resetError } = await requireSupabase().auth.resetPasswordForEmail(resetEmail.toLowerCase(), { redirectTo: `${window.location.origin}/auth` });
    setSubmitting(false);
    if (resetError) setError(resetError.message); else setNotice('Password reset link ইমেইলে পাঠানো হয়েছে।');
  }

  return (
    <div className="app-shell auth-page auth-page-premium">
      <PublicHeader />
      <main className="auth-main container auth-main-premium">
        <section className="auth-benefits auth-benefits-premium"><div className="auth-brand-mark"><ShieldCheck /></div><span className="auth-kicker">docbd.info secure access</span><h1>স্বাস্থ্যসেবা ব্যবস্থাপনা, সহজ ও নিরাপদ</h1><p>Patient, Doctor এবং Hospital-এর জন্য একটি নির্ভরযোগ্য medical platform.</p></section>

        <section className="auth-card auth-card-premium">
          <div className="auth-card-heading">
            <small>{mode === 'login' ? 'Welcome back' : 'Create account'}</small>
            <h2>{mode === 'login' ? 'আপনার account-এ লগইন করুন' : 'নতুন account তৈরি করুন'}</h2>
          </div>
          <div className="auth-tabs"><button className={mode === 'login' ? 'active' : ''} type="button" onClick={() => switchMode('login')}>লগইন</button><button className={mode === 'register' ? 'active' : ''} type="button" onClick={() => switchMode('register')}>রেজিস্ট্রেশন</button></div>
          <form onSubmit={submit}>
            {mode === 'register' && <>
              <label className="auth-field"><span>পূর্ণ নাম</span><div><UserRound /><input required minLength={2} value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="আপনার পূর্ণ নাম" /></div></label>
              <fieldset className="role-picker"><legend>অ্যাকাউন্টের ধরন</legend>{roles.map((item) => { const Icon = item.icon; return <label className={role === item.value ? 'selected' : ''} key={item.value}><input type="radio" name="role" value={item.value} checked={role === item.value} onChange={() => setRole(item.value)} /><Icon /><span><strong>{item.title}</strong><small>{item.detail}</small></span></label>; })}</fieldset>
              <label className="auth-field"><span>ইমেইল Address</span><div><Mail /><input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" /></div></label>
              <label className="auth-field"><span>Phone Number</span><div><Phone /><input required inputMode="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="01XXXXXXXXX" /></div></label>
              <p className="auth-helper-note">Email ও Phone Number দুটোই সঠিকভাবে দিন, যাতে account information নির্ভুল থাকে।</p>
            </>}
            {mode === 'login' && <label className="auth-field"><span>Email অথবা Phone Number</span><div>{isEmailIdentifier(identifier) || !identifier ? <Mail /> : <Phone />}<input required autoComplete="username" value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder="name@example.com অথবা 01XXXXXXXXX" /></div></label>}
            <label className="auth-field"><span>পাসওয়ার্ড</span><div><LockKeyhole /><input required minLength={8} type={showPassword ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="কমপক্ষে ৮ অক্ষর" /><button className="auth-password-toggle" type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Password লুকান' : 'Password দেখুন'}>{showPassword ? <EyeOff /> : <Eye />}</button></div></label>
            {mode === 'register' && <label className="auth-field"><span>পাসওয়ার্ড নিশ্চিত করুন</span><div><LockKeyhole /><input required minLength={8} type={showConfirmPassword ? 'text' : 'password'} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="পাসওয়ার্ডটি আবার লিখুন" /><button className="auth-password-toggle" type="button" onClick={() => setShowConfirmPassword((value) => !value)} aria-label={showConfirmPassword ? 'Password লুকান' : 'Password দেখুন'}>{showConfirmPassword ? <EyeOff /> : <Eye />}</button></div></label>}
            {mode === 'login' && <button className="forgot-link" type="button" onClick={() => void sendReset()}>পাসওয়ার্ড ভুলে গেছেন?</button>}
            <label className="auth-terms-consent"><input type="checkbox" checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} /><span><Link to="/terms" target="_blank">Terms & Conditions</Link> এবং <Link to="/privacy" target="_blank">Privacy Policy</Link> পড়েছি ও সম্মত।</span></label>
            {error && <div className="auth-message error" role="alert">{error}</div>}
            {notice && <div className="auth-message success" role="status">{notice}</div>}
            <button className="auth-submit" type="submit" disabled={submitting || !acceptedTerms}>{submitting ? <LoaderCircle className="spin" /> : mode === 'login' ? 'লগইন করুন' : 'অ্যাকাউন্ট তৈরি করুন'}</button>
          </form>
        </section>
      </main>
    </div>
  );
}
