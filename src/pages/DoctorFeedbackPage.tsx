import { FormEvent, useEffect, useState } from 'react';
import { Bug, LoaderCircle, MessageSquareText, Send } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getMyDoctorFeedback, submitMyDoctorFeedback, type DoctorFeedbackReport } from '../services/doctorSupport';

const messageFrom = (error: unknown) => error instanceof Error ? error.message : 'Feedback submit করা যায়নি।';

export default function DoctorFeedbackPage() {
  const { account } = useAuth();
  const [type, setType] = useState<'feedback' | 'bug'>('feedback');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [rows, setRows] = useState<DoctorFeedbackReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() { setRows(await getMyDoctorFeedback()); }
  useEffect(() => { load().catch((e) => setError(messageFrom(e))).finally(() => setLoading(false)); }, []);
  if (account && account.role !== 'doctor') return <Navigate to="/dashboard" replace />;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(null); setNotice(null);
    try {
      await submitMyDoctorFeedback(type, subject, message);
      setSubject(''); setMessage('');
      setNotice(type === 'bug' ? 'Bug report submit হয়েছে।' : 'Feedback submit হয়েছে।');
      await load();
    } catch (saveError) { setError(messageFrom(saveError)); }
    finally { setSaving(false); }
  }

  return <div className="app-shell doctor-module-page"><main className="doctor-module-main container">
    <header className="doctor-module-heading"><span><MessageSquareText /></span><div><small>Product feedback</small><h1>Feedback / Bug Report</h1><p>Feature feedback অথবা technical problem structuredভাবে submit করুন।</p></div></header>
    <div className="doctor-feedback-layout">
      <form className="doctor-module-card doctor-feedback-form" onSubmit={submit}>
        <div className="doctor-feedback-type" role="group" aria-label="Report type"><button type="button" className={type === 'feedback' ? 'active' : ''} onClick={() => setType('feedback')}><MessageSquareText /> Feedback</button><button type="button" className={type === 'bug' ? 'active' : ''} onClick={() => setType('bug')}><Bug /> Bug Report</button></div>
        <label><span>Subject</span><input required minLength={2} maxLength={160} value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="সংক্ষেপে বিষয় লিখুন" /></label>
        <label><span>Details</span><textarea required minLength={2} maxLength={5000} rows={7} value={message} onChange={(event) => setMessage(event.target.value)} placeholder={type === 'bug' ? 'কী করতে গিয়ে সমস্যা হয়েছে, কী দেখেছেন, expected result কী ছিল লিখুন।' : 'আপনার suggestion বা feedback লিখুন।'} /></label>
        {error && <div className="auth-message error">{error}</div>}{notice && <div className="auth-message success">{notice}</div>}
        <button className="auth-submit" disabled={saving}>{saving ? <LoaderCircle className="spin" /> : <Send />} Submit</button>
      </form>
      <section className="doctor-module-card doctor-feedback-history"><header><MessageSquareText /><div><h2>Recent submissions</h2><p>আপনার আগের feedback এবং Admin status.</p></div></header>{loading ? <div className="loading-box"><LoaderCircle className="spin" /> লোড হচ্ছে…</div> : rows.length ? <div className="doctor-feedback-list">{rows.map((row) => <article key={row.id}><div><span className={row.report_type}>{row.report_type === 'bug' ? 'Bug' : 'Feedback'}</span><b className={`status-${row.status}`}>{row.status}</b></div><h3>{row.subject}</h3><p>{row.message}</p>{row.admin_note && <small><strong>Admin note:</strong> {row.admin_note}</small>}</article>)}</div> : <p className="empty-inline">এখনো কিছু submit করা হয়নি।</p>}</section>
    </div>
  </main></div>;
}
