import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Bug, CheckCircle2, LoaderCircle, MessageCircle, RefreshCcw, Send } from 'lucide-react';
import {
  getAdminDoctorFeedback,
  getAdminDoctorSupportChat,
  getAdminDoctorSupportThreads,
  sendAdminDoctorSupportMessage,
  setAdminDoctorSupportStatus,
  updateAdminDoctorFeedback,
  type AdminDoctorSupportThread,
  type DoctorFeedbackReport,
  type DoctorSupportChat,
} from '../services/doctorSupport';

const messageFrom = (error: unknown) => error instanceof Error ? error.message : 'তথ্য লোড করা যায়নি।';

export default function AdminDoctorSupportPage() {
  const [tab, setTab] = useState<'chat' | 'feedback'>('chat');
  const [threads, setThreads] = useState<AdminDoctorSupportThread[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [chat, setChat] = useState<DoctorSupportChat | null>(null);
  const [feedback, setFeedback] = useState<DoctorFeedbackReport[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadThreads = useCallback(async () => {
    const rows = await getAdminDoctorSupportThreads();
    setThreads(rows);
    setSelectedId((current) => current && rows.some((row) => row.thread_id === current) ? current : rows[0]?.thread_id || '');
  }, []);

  const loadFeedback = useCallback(async () => setFeedback(await getAdminDoctorFeedback()), []);

  useEffect(() => {
    setLoading(true); setError(null);
    Promise.all([loadThreads(), loadFeedback()]).catch((loadError) => setError(messageFrom(loadError))).finally(() => setLoading(false));
  }, [loadFeedback, loadThreads]);

  useEffect(() => {
    if (!selectedId) { setChat(null); return; }
    getAdminDoctorSupportChat(selectedId).then(setChat).catch((loadError) => setError(messageFrom(loadError)));
  }, [selectedId]);

  async function reply(event: FormEvent) {
    event.preventDefault();
    if (!selectedId || !message.trim()) return;
    setWorking(true); setError(null);
    try {
      await sendAdminDoctorSupportMessage(selectedId, message.trim());
      setMessage('');
      setChat(await getAdminDoctorSupportChat(selectedId));
      await loadThreads();
    } catch (replyError) { setError(messageFrom(replyError)); }
    finally { setWorking(false); }
  }

  async function toggleStatus() {
    if (!selectedId || !chat?.thread) return;
    setWorking(true); setError(null);
    try {
      const next = chat.thread.status === 'closed' ? 'open' : 'closed';
      await setAdminDoctorSupportStatus(selectedId, next);
      setChat(await getAdminDoctorSupportChat(selectedId));
      await loadThreads();
    } catch (statusError) { setError(messageFrom(statusError)); }
    finally { setWorking(false); }
  }

  async function updateFeedback(row: DoctorFeedbackReport, status: DoctorFeedbackReport['status'], note: string | null) {
    setWorking(true); setError(null);
    try { await updateAdminDoctorFeedback(row.id, status, note); await loadFeedback(); }
    catch (updateError) { setError(messageFrom(updateError)); }
    finally { setWorking(false); }
  }

  return <main className="admin-doctor-support-page container">
    <header className="admin-doctor-support-heading"><div><span><MessageCircle /> Doctor Support</span><h1>Doctor Support & Feedback</h1><p>Doctor chat, feedback এবং technical bug reports এক জায়গা থেকে পরিচালনা করুন।</p></div><button type="button" onClick={() => void Promise.all([loadThreads(), loadFeedback()])}><RefreshCcw /> Refresh</button></header>
    <div className="admin-doctor-support-tabs"><button className={tab === 'chat' ? 'active' : ''} onClick={() => setTab('chat')}><MessageCircle /> Support Chats</button><button className={tab === 'feedback' ? 'active' : ''} onClick={() => setTab('feedback')}><Bug /> Feedback / Bug</button></div>
    {error && <div className="error-box">{error}</div>}
    {loading ? <div className="loading-box"><LoaderCircle className="spin" /> Support data লোড হচ্ছে…</div> : tab === 'chat' ? <div className="admin-support-layout">
      <aside className="admin-support-thread-list">{threads.map((row) => <button type="button" className={selectedId === row.thread_id ? 'active' : ''} key={row.thread_id} onClick={() => setSelectedId(row.thread_id)}><strong>{row.doctor_name || 'Doctor'}</strong><span>{row.status} • {row.message_count} messages</span><small>{new Intl.DateTimeFormat('bn-BD', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(row.last_message_at))}</small></button>)}{!threads.length && <p>কোনো support chat নেই।</p>}</aside>
      <section className="admin-support-chat-panel">{chat?.thread ? <><header><div><strong>{chat.thread.doctor_name || 'Doctor'}</strong><small>{chat.thread.status}</small></div><button type="button" disabled={working} onClick={() => void toggleStatus()}><CheckCircle2 /> {chat.thread.status === 'closed' ? 'Reopen' : 'Close'}</button></header><div className="doctor-support-messages">{chat.messages.map((item) => <article className={item.sender_role === 'doctor' ? 'doctor' : 'admin'} key={item.id}><strong>{item.sender_name || item.sender_role}</strong><p>{item.message}</p><small>{new Intl.DateTimeFormat('bn-BD', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.created_at))}</small></article>)}</div><form className="doctor-support-compose" onSubmit={reply}><textarea rows={3} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Reply to doctor…" /><button disabled={working || !message.trim()}>{working ? <LoaderCircle className="spin" /> : <Send />} Send</button></form></> : <div className="empty-state"><MessageCircle /><h3>Thread নির্বাচন করুন</h3></div>}</section>
    </div> : <div className="admin-feedback-list">{feedback.map((row) => <FeedbackRow key={row.id} row={row} working={working} onSave={updateFeedback} />)}{!feedback.length && <div className="empty-state"><Bug /><h3>কোনো feedback নেই</h3></div>}</div>}
  </main>;
}

function FeedbackRow({ row, working, onSave }: { row: DoctorFeedbackReport; working: boolean; onSave: (row: DoctorFeedbackReport, status: DoctorFeedbackReport['status'], note: string | null) => Promise<void> }) {
  const [status, setStatus] = useState(row.status);
  const [note, setNote] = useState(row.admin_note || '');
  useEffect(() => { setStatus(row.status); setNote(row.admin_note || ''); }, [row.admin_note, row.status]);
  return <article><header><div><span>{row.report_type === 'bug' ? <Bug /> : <MessageCircle />}{row.report_type}</span><h2>{row.subject}</h2><small>{row.doctor_name || 'Doctor'} • {new Intl.DateTimeFormat('bn-BD', { dateStyle: 'medium' }).format(new Date(row.created_at))}</small></div></header><p>{row.message}</p><div className="admin-feedback-controls"><select value={status} onChange={(event) => setStatus(event.target.value as DoctorFeedbackReport['status'])}><option value="open">Open</option><option value="reviewed">Reviewed</option><option value="resolved">Resolved</option></select><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Admin note (doctor can see this)" /><button disabled={working} onClick={() => void onSave(row, status, note.trim() || null)}>Save</button></div></article>;
}
