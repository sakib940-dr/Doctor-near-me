import { type FormEvent, useEffect, useState } from 'react';
import { ArrowLeft, Headphones, LoaderCircle, MessageCircle, Plus, RefreshCw, Send } from 'lucide-react';
import { HospitalPageHeader } from '../HospitalShell';
import { bi, useHospitalLanguage } from '../i18n';
import {
  createMyHospitalSupportConversation, getMyHospitalSupportChat, getMyHospitalSupportThreads,
  sendMyHospitalSupportMessage, type HospitalSupportChat, type HospitalSupportThread,
} from '../services/hospitalSupport';
import { useHospital } from '../useHospital';

const friendlyError = (text: (copy: { bn: string; en: string }) => string) => text(bi('সাপোর্ট মেসেজ পাঠানো যায়নি। আবার চেষ্টা করুন।', 'Support message could not be sent. Please try again.'));

export default function HospitalAdminSupportPage() {
  const { text } = useHospitalLanguage();
  const { provider, loading: providerLoading } = useHospital();
  const [threads, setThreads] = useState<HospitalSupportThread[]>([]);
  const [chat, setChat] = useState<HospitalSupportChat | null>(null);
  const [creating, setCreating] = useState(false);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadThreads() {
    if (!provider) return;
    setLoading(true); setError(null);
    try { setThreads(await getMyHospitalSupportThreads(provider.id)); }
    catch { setError(friendlyError(text)); }
    finally { setLoading(false); }
  }

  async function openThread(threadId: string) {
    if (!provider) return;
    setLoading(true); setError(null);
    try { setChat(await getMyHospitalSupportChat(provider.id, threadId)); setCreating(false); }
    catch { setError(friendlyError(text)); }
    finally { setLoading(false); }
  }

  useEffect(() => { void loadThreads(); }, [provider?.id]);

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!provider) return;
    setBusy(true); setError(null);
    try {
      const threadId = await createMyHospitalSupportConversation(provider.id, subject, message);
      setSubject(''); setMessage(''); await loadThreads(); await openThread(threadId);
    } catch { setError(friendlyError(text)); }
    finally { setBusy(false); }
  }

  async function reply(event: FormEvent) {
    event.preventDefault();
    if (!provider || !chat || !message.trim()) return;
    setBusy(true); setError(null);
    try { await sendMyHospitalSupportMessage(provider.id, chat.thread.id, message); setMessage(''); await openThread(chat.thread.id); await loadThreads(); }
    catch { setError(friendlyError(text)); }
    finally { setBusy(false); }
  }

  if (providerLoading) return <div className="hospital-empty"><LoaderCircle className="spin" /> {text(bi('লোড হচ্ছে…', 'Loading…'))}</div>;
  return <>
    <HospitalPageHeader eyebrow={bi('সরাসরি অ্যাডমিন যোগাযোগ', 'Direct Admin Communication')} title={bi('অ্যাডমিন সাপোর্ট', 'Admin Support')} description={bi('নতুন conversation খুলুন, আগের মেসেজ দেখুন এবং অ্যাডমিনের উত্তর গ্রহণ করুন।', 'Open conversations, review message history and receive Admin replies.')} action={<button type="button" onClick={() => { setCreating(true); setChat(null); setMessage(''); }}><Plus /> {text(bi('নতুন conversation', 'New conversation'))}</button>} />
    {error && <div className="hospital-error" role="alert">{error}</div>}
    {!provider ? <div className="hospital-empty">{text(bi('আগে হাসপাতাল প্রোফাইল তৈরি করুন।', 'Create the Hospital profile first.'))}</div> :
      <section className="hospital-support-layout">
        <aside className={`hospital-panel hospital-support-list${chat || creating ? ' mobile-hidden' : ''}`}>
          <div className="hospital-panel-title"><div><h2>{text(bi('কথোপকথন', 'Conversations'))}</h2><p>{threads.length} {text(bi('টি সাপোর্ট থ্রেড', 'support threads'))}</p></div><button className="hospital-secondary-button" type="button" onClick={() => void loadThreads()} aria-label={text(bi('রিফ্রেশ', 'Refresh'))}><RefreshCw /></button></div>
          {loading && !threads.length ? <div className="hospital-empty"><LoaderCircle className="spin" /></div> : threads.map((thread) => <button type="button" className="hospital-support-thread" key={thread.id} onClick={() => void openThread(thread.id)}><span><MessageCircle /></span><span><strong>{thread.subject}</strong><small>{thread.last_message || text(bi('কোনো মেসেজ নেই', 'No message'))}</small></span><b className={`hospital-support-status ${thread.status}`}>{thread.status}</b></button>)}
          {!loading && !threads.length && <div className="hospital-empty"><Headphones /> {text(bi('এখনও কোনো conversation নেই।', 'No conversation yet.'))}</div>}
        </aside>

        <div className={`hospital-panel hospital-support-chat${!chat && !creating ? ' mobile-hidden' : ''}`}>
          <button className="hospital-support-back" type="button" onClick={() => { setChat(null); setCreating(false); setMessage(''); }}><ArrowLeft /> {text(bi('কথোপকথন তালিকা', 'Conversations'))}</button>
          {creating ? <form className="hospital-form hospital-support-create" onSubmit={create}><div className="hospital-panel-title"><div><h2>{text(bi('নতুন সাপোর্ট conversation', 'New support conversation'))}</h2><p>{text(bi('সমস্যার বিষয় ও বিস্তারিত লিখুন।', 'Describe the subject and details.'))}</p></div></div><label>{text(bi('বিষয়', 'Subject'))}<input required minLength={3} maxLength={160} value={subject} onChange={(event) => setSubject(event.target.value)} /></label><label>{text(bi('মেসেজ', 'Message'))}<textarea required minLength={1} maxLength={4000} rows={6} value={message} onChange={(event) => setMessage(event.target.value)} /></label><button className="hospital-primary-button" disabled={busy}>{busy ? <LoaderCircle className="spin" /> : <Send />} {text(bi('Conversation শুরু করুন', 'Start conversation'))}</button></form> : chat ? <>
            <header className="hospital-support-chat-head"><div><h2>{chat.thread.subject}</h2><span className={`hospital-support-status ${chat.thread.status}`}>{chat.thread.status}</span></div><button className="hospital-secondary-button" type="button" onClick={() => void openThread(chat.thread.id)}><RefreshCw /></button></header>
            <div className="hospital-support-messages">{chat.messages.map((row) => <article className={row.sender_role === 'hospital' ? 'mine' : 'admin'} key={row.id}><small>{row.sender_role === 'hospital' ? text(bi('আপনি', 'You')) : text(bi('অ্যাডমিন সাপোর্ট', 'Admin Support'))}</small><p>{row.message}</p><time>{new Date(row.created_at).toLocaleString()}</time></article>)}</div>
            {chat.thread.status === 'closed' ? <div className="hospital-notice">{text(bi('এই conversation বন্ধ করা হয়েছে। নতুন সহায়তার জন্য আরেকটি conversation খুলুন।', 'This conversation is closed. Open a new one for further help.'))}</div> : <form className="hospital-support-reply" onSubmit={reply}><textarea aria-label={text(bi('উত্তর লিখুন', 'Write a reply'))} required maxLength={4000} rows={3} value={message} onChange={(event) => setMessage(event.target.value)} placeholder={text(bi('আপনার মেসেজ লিখুন…', 'Write your message…'))} /><button className="hospital-primary-button" disabled={busy || !message.trim()}>{busy ? <LoaderCircle className="spin" /> : <Send />} {text(bi('পাঠান', 'Send'))}</button></form>}
          </> : <div className="hospital-empty"><Headphones /> {text(bi('একটি conversation নির্বাচন করুন।', 'Select a conversation.'))}</div>}
        </div>
      </section>}
  </>;
}
