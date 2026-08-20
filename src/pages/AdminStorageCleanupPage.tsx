import { FormEvent, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock3, Database, Eye, HardDrive, RefreshCw, Save, ScanSearch, ShieldCheck, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getAdminStorageCleanupPreview, getAdminStorageCleanupSummary, safeCleanupStorageObjects, saveAdminStorageCleanupPolicy } from '../services/storageCleanup';
import type { AdminStorageCleanupObject, AdminStorageCleanupSummary } from '../types';
import { formatDateSafe } from '../lib/dateSafe';

const messageFrom = (error: unknown) => error instanceof Error ? error.message : 'Storage cleanup data লোড করা যায়নি।';
const bytes = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = value; let unit = 0;
  while (size >= 1024 && unit < units.length - 1) { size /= 1024; unit += 1; }
  return `${size >= 100 || unit === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[unit]}`;
};
const dateTime = (value: string) => formatDateSafe(value, 'bn-BD', { dateStyle: 'medium', timeStyle: 'short' }, '—');

export default function AdminStorageCleanupPage() {
  const [summary, setSummary] = useState<AdminStorageCleanupSummary | null>(null);
  const [preview, setPreview] = useState<AdminStorageCleanupObject[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmCleanup, setConfirmCleanup] = useState(false);
  const [quotaMb, setQuotaMb] = useState('');
  const [graceHours, setGraceHours] = useState('24');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function scan() {
    setLoading(true); setError(null);
    try {
      const next = await getAdminStorageCleanupSummary();
      setSummary(next);
      setQuotaMb(next.quota_bytes ? String(Math.round(next.quota_bytes / 1024 / 1024)) : '');
      setGraceHours(String(next.grace_hours));
    } catch (scanError) { setError(messageFrom(scanError)); }
    finally { setLoading(false); }
  }

  async function loadPreview() {
    setPreviewLoading(true); setError(null); setNotice(null);
    try { setPreview(await getAdminStorageCleanupPreview(100)); }
    catch (previewError) { setError(messageFrom(previewError)); }
    finally { setPreviewLoading(false); }
  }

  useEffect(() => { void scan(); }, []);

  const usageTone = summary?.warning_level ?? 'unknown';
  const usageText = useMemo(() => {
    if (!summary) return '';
    if (summary.quota_bytes == null || summary.usage_percent == null) return 'Reliable quota configured নয় — percentage warning দেখানো হচ্ছে না।';
    return `${bytes(summary.total_bytes)} / ${bytes(summary.quota_bytes)} • ${summary.usage_percent.toFixed(1)}% used`;
  }, [summary]);

  async function savePolicy(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError(null); setNotice(null);
    try {
      const quota = quotaMb.trim() ? Math.round(Number(quotaMb) * 1024 * 1024) : null;
      if (quota != null && (!Number.isFinite(quota) || quota < 1024 * 1024)) throw new Error('Quota blank রাখুন অথবা কমপক্ষে 1 MB দিন।');
      const grace = Number(graceHours);
      if (!Number.isFinite(grace) || grace < 1 || grace > 168) throw new Error('Grace period 1–168 hours হতে হবে।');
      await saveAdminStorageCleanupPolicy(quota, grace);
      setNotice('Storage cleanup policy saved.');
      setPreview([]); setConfirmCleanup(false);
      await scan();
    } catch (saveError) { setError(messageFrom(saveError)); }
    finally { setSaving(false); }
  }

  async function cleanup() {
    if (!confirmCleanup || !preview.length) return;
    setCleaning(true); setError(null); setNotice(null);
    try {
      const result = await safeCleanupStorageObjects(preview);
      setNotice(`Safe Cleanup: ${result.deleted_objects} file (${bytes(result.deleted_bytes)}) removed${result.failed_objects ? ` • ${result.failed_objects} skipped/failed` : ''}${result.expired_push_subscriptions_deleted ? ` • ${result.expired_push_subscriptions_deleted} expired push subscription removed` : ''}.`);
      setConfirmCleanup(false);
      await Promise.all([scan(), loadPreview()]);
    } catch (cleanupError) { setError(messageFrom(cleanupError)); }
    finally { setCleaning(false); }
  }

  return <div className="storage-cleanup-page">
    <header className="storage-cleanup-header">
      <div><Link to="/admin" className="storage-cleanup-back"><ArrowLeft/>Admin Dashboard</Link><small>Safe maintenance</small><h1>Storage Cleanup</h1><p>Referenced media preserve করে grace period পার হওয়া genuine orphan file পরিষ্কার করুন।</p></div>
      <button type="button" onClick={() => void scan()} disabled={loading}><RefreshCw className={loading ? 'spin' : ''}/><span>Scan</span></button>
    </header>

    {error && <div className="storage-cleanup-message error" role="alert"><AlertTriangle/><span>{error}</span></div>}
    {notice && <div className="storage-cleanup-message success"><CheckCircle2/><span>{notice}</span></div>}

    <section className="storage-cleanup-kpis" aria-busy={loading}>
      {([
        { label: 'Total files', value: summary?.total_files, icon: HardDrive },
        { label: 'Referenced files', value: summary?.referenced_files, icon: ShieldCheck },
        { label: 'Orphan files', value: summary?.orphan_files, icon: Trash2 },
        { label: 'Orphan size', value: summary ? bytes(summary.orphan_bytes) : null, icon: Database },
      ] as const).map(({ label, value, icon: Icon }) => <article key={label}><span><Icon/></span><div><small>{label}</small><strong>{loading && !summary ? '…' : value ?? 0}</strong></div></article>)}
    </section>

    {summary && <section className={`storage-usage-card ${usageTone}`}>
      <div className="storage-usage-icon"><HardDrive/></div>
      <div><small>Storage warning</small><h2>{usageTone === 'unknown' ? 'Quota not configured' : usageTone[0].toUpperCase() + usageTone.slice(1)}</h2><p>{usageText}</p>
        <div className="storage-thresholds"><span>70% Notice</span><span>85% Warning</span><span>95% Critical</span></div>
      </div>
      {summary.usage_percent != null && <strong>{summary.usage_percent.toFixed(1)}%</strong>}
    </section>}

    <div className="storage-cleanup-layout">
      <section className="storage-cleanup-panel">
        <div className="storage-cleanup-section-head"><div><small>Policy</small><h2>Cleanup safety</h2></div><ShieldCheck/></div>
        <form className="storage-policy-form" onSubmit={savePolicy}>
          <label><span>Configured quota (MB)</span><input inputMode="numeric" value={quotaMb} onChange={(e) => setQuotaMb(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="Unknown / blank"/><small>Supabase quota reliably known হলে দিন; না হলে blank রাখুন।</small></label>
          <label><span>Grace period (hours)</span><input type="number" min="1" max="168" value={graceHours} onChange={(e) => setGraceHours(e.target.value)}/><small>Recent/in-progress unreferenced file cleanup হবে না।</small></label>
          <button type="submit" disabled={saving}><Save/>{saving ? 'Saving…' : 'Save policy'}</button>
        </form>
        {summary && <div className="storage-safety-stats">
          <span><Clock3/><b>{summary.recent_unreferenced_files}</b> recent unreferenced protected</span>
          <span><ShieldCheck/><b>{summary.grace_hours}h</b> grace period</span>
          <span><Database/><b>{summary.expired_push_subscriptions}</b> expired push subscriptions eligible</span>
        </div>}
      </section>

      <section className="storage-cleanup-panel">
        <div className="storage-cleanup-section-head"><div><small>Orphan review</small><h2>Preview & Safe Cleanup</h2></div><ScanSearch/></div>
        <p className="storage-cleanup-note">Preview scan-এর পরে delete-time RLS আবার reference ও grace check করে। Prescription, appointment, patient history বা review record delete করা হয় না।</p>
        <div className="storage-cleanup-actions">
          <button type="button" className="secondary" onClick={() => void loadPreview()} disabled={previewLoading || cleaning}><Eye/>{previewLoading ? 'Loading…' : 'Preview'}</button>
          <button type="button" className="danger" onClick={() => setConfirmCleanup((value) => !value)} disabled={!preview.length || cleaning}><Trash2/>Safe Cleanup</button>
        </div>
        {confirmCleanup && <div className="storage-cleanup-confirm"><AlertTriangle/><div><strong>Cleanup confirm করুন</strong><p>{preview.length} previewed orphan object delete করার চেষ্টা হবে। Reference/grace changed হলে RLS object skip করবে।</p><button type="button" onClick={() => void cleanup()} disabled={cleaning}>{cleaning ? 'Cleaning…' : 'Confirm Safe Cleanup'}</button><button type="button" className="link" onClick={() => setConfirmCleanup(false)} disabled={cleaning}>Cancel</button></div></div>}
      </section>
    </div>

    <section className="storage-preview-panel">
      <div className="storage-cleanup-section-head"><div><small>Preview</small><h2>Eligible orphan objects</h2></div><span>{preview.length} shown</span></div>
      {!preview.length && !previewLoading && <div className="storage-empty"><ShieldCheck/><strong>Preview list empty</strong><p>Preview চাপুন। Eligible orphan না থাকলে cleanup প্রয়োজন নেই।</p></div>}
      {previewLoading && <div className="storage-preview-skeleton">{Array.from({length:5},(_,index)=><span key={index}/>)}</div>}
      {!!preview.length && <div className="storage-preview-list">{preview.map((row) => <article key={`${row.bucket_id}:${row.name}`}><div><strong>{row.name.split('/').pop()}</strong><small>{row.bucket_id} • {row.name}</small></div><div><b>{bytes(row.size_bytes)}</b><small>{Math.round(row.age_hours)}h old • {dateTime(row.created_at)}</small></div></article>)}</div>}
    </section>
  </div>;
}
