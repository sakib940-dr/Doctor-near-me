import { FormEvent, useState } from 'react';
import { ArrowRight, Building2, HeartPulse, LoaderCircle, LockKeyhole, Mail, Phone, ShieldCheck, Stethoscope, UserRound } from 'lucide-react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import PublicHeader from '../components/PublicHeader';
import { useAuth } from '../contexts/AuthContext';
import { isEmailIdentifier, normalizeAuthPhone, validateEmail } from '../lib/authIdentifiers';
import { isSupabaseConfigured, requireSupabase } from '../lib/supabase';
import type { PublicRegistrationRole } from '../types';

const roles: Array<{ value: PublicRegistrationRole; title: string; detail: string; icon: typeof UserRound }> = [
  { value: 'patient', title: 'রোগী / সাধারণ ব্যবহারকারী', detail: 'ডাক্তার খুঁজুন ও অ্যাপয়েন্টমেন্ট রাখুন', icon: UserRound },
  { value: 'doctor', title: 'ডাক্তার', detail: 'প্রোফাইল, চেম্বার ও verification পরিচালনা করুন', icon: Stethoscope },
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
  const [identifier, setIdentifier] = useState(() => searchParams.get('email') || '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<PublicRegistrationRole>('patient');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (!sessionLoading && user && !submitting) return <Navigate to="/dashboard" replace />;

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
        const loginId = identifier.trim();
        const client = requireSupabase();
        const credentials = isEmailIdentifier(loginId)
          ? { email: loginId.toLowerCase(), password }
          : { phone: normalizeAuthPhone(loginId) || '', password };
        if ('phone' in credentials && !credentials.phone) throw new Error('সঠিক email অথবা phone number দিন।');

        const { error: loginError } = await client.auth.signInWithPassword(credentials);
        if (loginError) throw loginError;

        const from = (location.state as { from?: string } | null)?.from;
        navigate(from || '/dashboard', { replace: true });
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
        else setNotice('Registration request নেওয়া হয়েছে। Email confirmation চালু থাকলে confirmation link থেকে account verify করে login করুন। Phone Number account-এর সাথে সংরক্ষিত আছে। Phone/SMS verification provider পরে চালু করা যাবে; এখন onboarding verification ছাড়াই সম্পূর্ণ করা যাবে।');
      }
    } catch (submitError) {
      const message = messageFrom(submitError);
      setError(/duplicate|already|registered|phone.*use|user_already_exists/i.test(message)
        ? 'এই email/phone দিয়ে নতুন account তৈরি করা যাচ্ছে না। আগে Login চেষ্টা করুন অথবা অন্য verified contact ব্যবহার করুন।'
        : message);
    } finally {
      setSubmitting(false);
    }
  }

  async function sendReset() {
    setError(null); setNotice(null);
    if (!isSupabaseConfigured) { setError('Supabase configuration প্রয়োজন।'); return; }
    const resetEmail = identifier.trim();
    if (!isEmailIdentifier(resetEmail)) { setError('Password reset-এর জন্য account-এর Email Address লিখুন।'); return; }
    setSubmitting(true);
    const { error: resetError } = await requireSupabase().auth.resetPasswordForEmail(resetEmail.toLowerCase(), { redirectTo: `${window.location.origin}/auth` });
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
          <p>{mode === 'login' ? 'Email দিয়ে login করুন; Supabase Phone provider/linking চালু হলে একই account-এ Phone Number দিয়েও login করা যাবে।' : 'Registration-এর জন্য Email Address এবং Phone Number দুটোই required। Phone verification এখন onboarding block করবে না।'}</p>
          <ul><li>Password শুধু Supabase Auth পরিচালনা করে</li><li>Role অনুযায়ী guided onboarding</li><li>Existing verification ও RLS policy অক্ষত</li></ul>
          <Link to="/doctors">অ্যাকাউন্ট ছাড়াই ডাক্তার খুঁজুন <ArrowRight size={17} /></Link>
        </section>
        <section className="auth-card">
          <div className="auth-tabs"><button className={mode === 'login' ? 'active' : ''} type="button" onClick={() => switchMode('login')}>লগইন</button><button className={mode === 'register' ? 'active' : ''} type="button" onClick={() => switchMode('register')}>রেজিস্ট্রেশন</button></div>
          <form onSubmit={submit}>
            {mode === 'register' && <>
              <label className="auth-field"><span>পূর্ণ নাম</span><div><UserRound /><input required minLength={2} value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="আপনার পূর্ণ নাম" /></div></label>
              <fieldset className="role-picker"><legend>অ্যাকাউন্টের ধরন</legend>{roles.map((item) => { const Icon = item.icon; return <label className={role === item.value ? 'selected' : ''} key={item.value}><input type="radio" name="role" value={item.value} checked={role === item.value} onChange={() => setRole(item.value)} /><Icon /><span><strong>{item.title}</strong><small>{item.detail}</small></span></label>; })}</fieldset>
              <label className="auth-field"><span>ইমেইল Address</span><div><Mail /><input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" /></div></label>
              <label className="auth-field"><span>Phone Number</span><div><Phone /><input required inputMode="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="01XXXXXXXXX" /></div></label>
              <p className="auth-helper-note">Phone Number required এবং registration-এর সময় account profile-এ save হবে। SMS/Phone provider পরে configure করলে phone verification/linking চালু করা যাবে; onboarding-এ এখন কোনো Phone OTP নেই।</p>
            </>}
            {mode === 'login' && <label className="auth-field"><span>Email অথবা Phone Number</span><div>{isEmailIdentifier(identifier) || !identifier ? <Mail /> : <Phone />}<input required autoComplete="username" value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder="name@example.com অথবা 01XXXXXXXXX" /></div></label>}
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
