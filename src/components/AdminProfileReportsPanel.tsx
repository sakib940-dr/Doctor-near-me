import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, ExternalLink, Flag, LoaderCircle, RefreshCw, ShieldAlert, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getAdminProfileReportQueue, moderateProfileReports } from '../services/profileReports';
import type { AdminProfileReportQueueRow, ProfileReportReason } from '../types';

const reasonLabels: Record<ProfileReportReason, string> = {
  fake_doctor: 'Fake Doctor',
  fake_bmdc_information: 'Fake BMDC information',
  wrong_degree: 'Wrong Degree',
  fake_hospital_chamber: 'Fake Hospital/Chamber',
  wrong_phone_number: 'Wrong Phone Number',
  inappropriate_content: 'Inappropriate Content',
  other: 'Other',
};

const messageFrom = (error: unknown) => error instanceof Error ? error.message : 'Report queue লোড করা যায়নি।';

function profilePath(row: AdminProfileReportQueueRow) {
  const identifier = encodeURIComponent(row.public_slug || row.target_id);
  if (row.target_type === 'doctor') return `/doctor/${identifier}`;
  return row.provider_type === 'chamber' ? `/chamber/${identifier}` : `/hospital/${identifier}`;
}

export default function AdminProfileReportsPanel() {
  const [rows, setRows] = useState<AdminProfileReportQueueRow[]>([]);
  const [openOnly, setOpenOnly] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [action, setAction] = useState<{ row: AdminProfileReportQueueRow; value: 'reviewed' | 'dismissed' | 'suspend_listing' } | null>(null);
  const [note, setNote] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [working, setWorking] = useState(false);

  async function load(nextOpenOnly = openOnly) {
    setLoading(true); setError(null);
    try { setRows(await getAdminProfileReportQueue(nextOpenOnly)); }
    catch (loadError) { setError(messageFrom(loadError)); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(openOnly); }, [openOnly]);

  function begin(row: AdminProfileReportQueueRow, value: 'reviewed' | 'dismissed' | 'suspend_listing') {
    setAction({ row, value }); setNote(''); setConfirmed(false); setError(null); setNotice(null);
  }

  async function apply() {
    if (!action) return;
    if (note.trim().length < 3) { setError('Admin note কমপক্ষে ৩ অক্ষরে লিখুন।'); return; }
    if (action.value === 'suspend_listing' && !confirmed) { setConfirmed(true); return; }
    setWorking(true); setError(null);
    try {
      await moderateProfileReports({ targetType: action.row.target_type, targetId: action.row.target_id, action: action.value, adminNote: note });
      setNotice(`${action.row.target_name}-এর report moderation সম্পন্ন হয়েছে।`);
      setAction(null); setNote(''); setConfirmed(false);
      await load();
    } catch (applyError) { setError(messageFrom(applyError)); }
    finally { setWorking(false); }
  }

  return <section className="admin-report-panel">
    <header className="admin-panel-title"><div><h2><Flag /> Doctor/Hospital reports</h2><p>Pending report বেশি পাওয়া profile স্বয়ংক্রিয়ভাবে সবার উপরে দেখানো হচ্ছে।</p></div><div className="admin-report-toolbar"><label><input type="checkbox" checked={!openOnly} onChange={(event) => setOpenOnly(!event.target.checked)} /> Resolved-ও দেখান</label><button type="button" onClick={() => void load()} disabled={loading}><RefreshCw className={loading ? 'spin' : ''} /> Refresh</button></div></header>
    {error && <div className="error-box" role="alert">{error}</div>}
    {notice && <div className="auth-message success">{notice}</div>}
    {loading ? <div className="loading-box"><LoaderCircle className="spin" /> Report queue লোড হচ্ছে…</div> : <div className="admin-report-list">
      {rows.map((row, index) => <article key={`${row.target_type}-${row.target_id}`} className={row.pending_report_count >= 3 ? 'high-priority' : ''}>
        <div className="admin-report-rank">#{index + 1}</div>
        <div className="admin-report-body">
          <header><div><span>{row.target_type === 'doctor' ? 'Doctor' : row.provider_type === 'chamber' ? 'Chamber' : 'Hospital'}</span><h3>{row.target_name}</h3><small>Listing status: {row.target_status}</small></div><div className="admin-report-count"><strong>{row.pending_report_count}</strong><span>pending</span><small>{row.total_report_count} total</small></div></header>
          <div className="admin-report-reasons">{Object.entries(row.reason_counts).map(([reason, count]) => <span key={reason}>{reasonLabels[reason as ProfileReportReason] || reason} <b>{count}</b></span>)}</div>
          <details><summary>সাম্প্রতিক report details ({row.recent_reports.length})</summary><div>{row.recent_reports.map((report) => <p key={report.id}><b>{reasonLabels[report.reason]}</b>{report.details ? ` — ${report.details}` : ''}<small>{new Intl.DateTimeFormat('bn-BD', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(report.created_at))} • {report.status}</small></p>)}</div></details>
          <footer><Link to={profilePath(row)} target="_blank">Profile দেখুন <ExternalLink /></Link>{row.pending_report_count > 0 && <><button type="button" onClick={() => begin(row, 'reviewed')}><CheckCircle2 /> Reviewed/close</button><button type="button" onClick={() => begin(row, 'dismissed')}>Dismiss reports</button><button type="button" className="danger" onClick={() => begin(row, 'suspend_listing')}><ShieldAlert /> Suspend listing</button></>}</footer>
        </div>
      </article>)}
      {!rows.length && <div className="admin-report-empty"><CheckCircle2 /><h3>কোনো pending profile report নেই</h3><p>নতুন report এলে report সংখ্যার ভিত্তিতে এখানে priority পাবে।</p></div>}
    </div>}

    {action && <div className="verification-overlay" role="dialog" aria-modal="true"><section className="admin-action-dialog"><header><div><small>Audited moderation</small><h2>{action.value === 'suspend_listing' ? 'Public listing suspend করবেন?' : action.value === 'dismissed' ? 'Reports dismiss করবেন?' : 'Review সম্পন্ন করবেন?'}</h2></div><button type="button" onClick={() => setAction(null)} disabled={working}><X /></button></header><p><strong>{action.row.target_name}</strong> • {action.row.pending_report_count}টি pending report</p><label>Admin note<textarea rows={4} minLength={3} maxLength={1000} value={note} onChange={(event) => { setNote(event.target.value); setConfirmed(false); }} placeholder="যাচাইয়ের ফলাফল ও সিদ্ধান্তের কারণ লিখুন" /></label>{confirmed && <div className="admin-confirm"><AlertTriangle /> Listing সঙ্গে সঙ্গে public search/profile থেকে বন্ধ হবে। আবার নিশ্চিত করুন।</div>}<footer><button type="button" onClick={() => setAction(null)} disabled={working}>বাতিল</button><button type="button" className={action.value === 'suspend_listing' ? 'danger' : 'primary'} disabled={working} onClick={() => void apply()}>{working ? <LoaderCircle className="spin" /> : action.value === 'suspend_listing' && !confirmed ? 'পরবর্তী ধাপ' : 'সিদ্ধান্ত প্রয়োগ করুন'}</button></footer></section></div>}
  </section>;
}
