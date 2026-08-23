import { FormEvent, useState } from 'react';
import { ArrowLeft, BadgeCheck, CheckCircle2, LoaderCircle, Save } from 'lucide-react';
import { Link } from 'react-router-dom';
import { adminUpdateDoctorBmdc } from '../services/verification';

const messageFrom = (error: unknown) => error instanceof Error ? error.message : 'BMDC সংশোধন করা যায়নি।';

export default function AdminBmdcCorrectionPage() {
  const [doctorId, setDoctorId] = useState('');
  const [bmdc, setBmdc] = useState('');
  const [reason, setReason] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null); setNotice(null);
    if (!/^[0-9a-f-]{36}$/i.test(doctorId.trim())) { setError('সঠিক Doctor UUID দিন।'); return; }
    if (bmdc.trim().length < 3) { setError('সঠিক BMDC নম্বর দিন।'); return; }
    if (reason.trim().length < 3) { setError('সংশোধনের কারণ লিখুন।'); return; }
    setWorking(true);
    try {
      await adminUpdateDoctorBmdc({ doctorId: doctorId.trim(), bmdcRegistrationNo: bmdc, reason });
      setNotice('BMDC সংশোধন হয়েছে। Doctor notification পেয়েছেন এবং verification pending হয়েছে; public contact/appointment চালু থাকবে।');
      setBmdc(''); setReason('');
    } catch (saveError) { setError(messageFrom(saveError)); }
    finally { setWorking(false); }
  }

  return <div className="app-shell admin-bmdc-page"><main className="provider-dashboard-main container">
    <Link className="back-link" to="/admin"><ArrowLeft /> Admin Dashboard</Link>
    <div className="provider-page-heading"><span><BadgeCheck /></span><div><small>Audited Admin-only correction</small><h1>Doctor BMDC সংশোধন</h1><p>Doctor নিজে প্রথমবার BMDC দেওয়ার পর পরিবর্তন করতে পারবেন না। প্রতিটি Admin correction audit log-এ থাকবে।</p></div></div>
    <form className="provider-profile-form" onSubmit={submit}>
      <section className="provider-form-section"><h2>BMDC correction</h2><div className="patient-form-grid">
        <label className="auth-field"><span>Doctor UUID</span><div><input required value={doctorId} onChange={(event) => setDoctorId(event.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" /></div></label>
        <label className="auth-field"><span>নতুন BMDC Number</span><div><input required minLength={3} maxLength={100} value={bmdc} onChange={(event) => setBmdc(event.target.value)} /></div></label>
      </div><label className="provider-text-field"><span>সংশোধনের কারণ</span><textarea required minLength={3} maxLength={1000} rows={4} value={reason} onChange={(event) => setReason(event.target.value)} /></label></section>
      {error && <div className="auth-message error" role="alert">{error}</div>}
      {notice && <div className="auth-message success"><CheckCircle2 /> {notice}</div>}
      <button className="auth-submit provider-save" disabled={working}>{working ? <LoaderCircle className="spin" /> : <><Save /> BMDC সংশোধন করুন</>}</button>
    </form>
  </main></div>;
}
