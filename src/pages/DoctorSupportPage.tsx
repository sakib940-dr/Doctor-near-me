import { FormEvent, useEffect, useRef, useState } from 'react';
import { LoaderCircle, MessageCircle, Send, ShieldCheck } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getMyDoctorSupportChat, sendMyDoctorSupportMessage, type DoctorSupportChat } from '../services/doctorSupport';

const messageFrom = (error: unknown) => error instanceof Error ? error.message : 'Support chat লোড করা যায়নি।';

export default function DoctorSupportPage() {
  const { account, user } = useAuth();
  const [chat, setChat] = useState<DoctorSupportChat>({ thread: null, messages: [] });
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  async function load() {
    const next = await getMyDoctorSupportChat();
    setChat(next);
  }

  useEffect(() => {
    setLoading(true);
    load().catch((loadError) => setError(messageFrom(loadError))).finally(() => setLoading(false));
  }, []);

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }); }, [chat.messages.length]);

  if (account && account.role !== 'doctor') return <Navigate to="/dashboard" replace />;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clean = message.trim();
    if (!clean) return;
    setSending(true); setError(null);
    try {
      await sendMyDoctorSupportMessage(clean);
      setMessage('');
      await load();
    } catch (sendError) { setError(messageFrom(sendError)); }
    finally { setSending(false); }
  }

  return <div className="app-shell doctor-module-page"><main className="doctor-module-main container">
    <header className="doctor-module-heading"><span><MessageCircle /></span><div><small>Doctor ↔ Admin</small><h1>Support / Chat with Admin</h1><p>Account, verification, appointment, prescription অথবা technical issue নিয়ে Admin-এর সাথে message করুন।</p></div></header>
    {error && <div className="error-box" role="alert">{error}</div>}
    <section className="doctor-support-card">
      <header><div><ShieldCheck /><span><strong>Admin Support</strong><small>{chat.thread?.status === 'closed' ? 'Closed thread • নতুন message দিলে আবার open হবে' : 'Support thread open'}</small></span></div></header>
      <div className="doctor-support-messages" aria-live="polite">
        {loading ? <div className="loading-box"><LoaderCircle className="spin" /> Chat লোড হচ্ছে…</div> : chat.messages.length ? chat.messages.map((item) => {
          const mine = item.sender_id === user?.id;
          return <article className={mine ? 'mine' : 'admin'} key={item.id}><div><strong>{mine ? 'আপনি' : item.sender_name || 'Admin'}</strong><small>{new Intl.DateTimeFormat('bn-BD', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.created_at))}</small></div><p>{item.message}</p></article>;
        }) : <div className="doctor-support-empty"><MessageCircle /><h2>Support conversation শুরু করুন</h2><p>নিচে আপনার প্রশ্ন বা সমস্যা লিখুন।</p></div>}
        <div ref={endRef} />
      </div>
      <form className="doctor-support-composer" onSubmit={submit}><textarea rows={3} maxLength={4000} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Admin-কে message লিখুন…" /><button type="submit" disabled={sending || !message.trim()}>{sending ? <LoaderCircle className="spin" /> : <Send />} Send</button></form>
    </section>
  </main></div>;
}
