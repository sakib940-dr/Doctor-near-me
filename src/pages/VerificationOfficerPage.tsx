import { useEffect, useState } from 'react';
import { Ambulance, ArrowLeft, Building2, Check, FileCheck2, LoaderCircle, MapPin, RefreshCw, ShieldCheck, Stethoscope, X } from 'lucide-react';
import { Link, Navigate } from 'react-router-dom';
import PublicHeader from '../components/PublicHeader';
import { useAuth } from '../contexts/AuthContext';
import { decideVerificationReview, getVerificationDocumentUrl, getVerificationReviewDetail, getVerificationReviewQueue } from '../services/verification';
import type { VerificationEntityType, VerificationQueueRow, VerificationReviewDetail } from '../types';

const entityLabels: Record<VerificationEntityType, string> = { doctor: 'Doctor', provider: 'Hospital/Chamber', ambulance: 'Ambulance' };
const fieldLabels: Record<string, string> = { full_name: 'পূর্ণ নাম', email: 'ইমেইল', phone: 'ফোন', district_id: 'District ID', upazila_id: 'Upazila ID', degree: 'ডিগ্রি', designation: 'Designation', professional_title: 'Professional title', bmdc_registration_no: 'BMDC number', experience_years: 'অভিজ্ঞতা', specialties: 'Specialties', provider_type: 'Provider type', name_bn: 'বাংলা নাম', name_en: 'ইংরেজি নাম', address: 'ঠিকানা', short_description: 'বিবরণ', website_url: 'Website', departments: 'Departments', services: 'Services', operator_name: 'Operator', driver_name: 'Driver', secondary_phone: 'বিকল্প ফোন', vehicle_registration_no: 'Vehicle registration', vehicle_type: 'Vehicle type', capabilities: 'Capabilities', service_area: 'Service area', latitude: 'Latitude', longitude: 'Longitude', operates_24_hours: '২৪ ঘণ্টা' };
const messageFrom = (error: unknown) => error instanceof Error ? error.message : 'Review data লোড করা যায়নি।';

function EntityIcon({ type }: { type: VerificationEntityType }) { return type === 'doctor' ? <Stethoscope /> : type === 'provider' ? <Building2 /> : <Ambulance />; }
function formatValue(value: unknown) { if (value == null || value === '') return '—'; if (Array.isArray(value)) return value.length ? value.join(', ') : '—'; if (typeof value === 'boolean') return value ? 'হ্যাঁ' : 'না'; if (typeof value === 'object') return JSON.stringify(value); return String(value); }

export default function VerificationOfficerPage() {
  const { account } = useAuth();
  const [entityType, setEntityType] = useState<VerificationEntityType | 'all'>('all');
  const [status, setStatus] = useState('pending');
  const [rows, setRows] = useState<VerificationQueueRow[]>([]);
  const [detail, setDetail] = useState<VerificationReviewDetail | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [confirmDecision, setConfirmDecision] = useState<'approved' | 'rejected' | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => { setLoading(true); setError(null); getVerificationReviewQueue(entityType === 'all' ? null : entityType, status === 'all' ? null : status).then(setRows).catch((loadError: unknown) => setError(messageFrom(loadError))).finally(() => setLoading(false)); };
  useEffect(load, [entityType, status]);
  if (account && !['verification_officer', 'admin', 'super_admin'].includes(account.role)) return <Navigate to="/dashboard" replace />;

  async function openReview(row: VerificationQueueRow) {
    setDetailLoading(true); setError(null); setConfirmDecision(null);
    try { const item = await getVerificationReviewDetail(row.entity_type, row.entity_id); setDetail(item); setReviewNote(item.note || ''); }
    catch (detailError) { setError(messageFrom(detailError)); } finally { setDetailLoading(false); }
  }

  async function openDocument(path: string) {
    try { window.open(await getVerificationDocumentUrl(path), '_blank', 'noopener,noreferrer'); }
    catch (documentError) { setError(messageFrom(documentError)); }
  }

  async function decide(decision: 'approved' | 'rejected') {
    if (!detail) return;
    if (decision === 'rejected' && reviewNote.trim().length < 3) { setError('Reject করার কারণ কমপক্ষে ৩ অক্ষরে লিখুন।'); return; }
    if (confirmDecision !== decision) { setConfirmDecision(decision); return; }
    setWorking(true); setError(null);
    try { await decideVerificationReview({ entityType: detail.entity_type, entityId: detail.entity_id, status: decision, reviewNote }); setDetail(null); setConfirmDecision(null); load(); }
    catch (decisionError) { setError(messageFrom(decisionError)); } finally { setWorking(false); }
  }

  const visibleData = detail ? Object.entries(detail.data).filter(([key]) => !['profile_photo_url', 'logo_url', 'banner_url', 'gallery_paths'].includes(key)) : [];

  return <div className="app-shell verification-page"><PublicHeader /><main className="verification-main container"><Link className="back-link" to="/dashboard"><ArrowLeft /> Dashboard-এ ফিরুন</Link><div className="verification-heading"><span><ShieldCheck /></span><div><small>Least-privilege operations</small><h1>Verification review queue</h1><p>Oldest submission আগে। Profile data read-only; কেবল approve/reject ও review note দেওয়া যাবে।</p></div><button onClick={load}><RefreshCw /> Refresh</button></div><section className="verification-stats"><article><strong>{rows.length}</strong><small>এই filter-এ applications</small></article><article><strong>{rows.reduce((total, row) => total + Number(row.evidence_count), 0)}</strong><small>Evidence files</small></article><article><strong>{status === 'pending' ? 'Oldest first' : status}</strong><small>Queue order/status</small></article></section><div className="verification-filters"><div>{(['all', 'doctor', 'provider', 'ambulance'] as const).map((type) => <button className={entityType === type ? 'active' : ''} key={type} onClick={() => setEntityType(type)}>{type === 'all' ? 'সব' : entityLabels[type]}</button>)}</div><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="pending">Pending</option><option value="rejected">Rejected</option><option value="approved">Approved</option><option value="all">সব status</option></select></div>{error && <div className="error-box">{error}</div>}{loading ? <div className="loading-box"><LoaderCircle className="spin" /> Queue লোড হচ্ছে…</div> : rows.length ? <div className="verification-queue">{rows.map((row) => <button key={`${row.entity_type}-${row.entity_id}`} onClick={() => void openReview(row)}><span className={`entity-${row.entity_type}`}><EntityIcon type={row.entity_type} /></span><div><strong>{row.display_name}</strong><small>{entityLabels[row.entity_type]} • {row.subtitle || 'তথ্য নেই'}</small><p><MapPin /> District {row.district_id || '—'} / Upazila {row.upazila_id || '—'}</p></div><b>{row.evidence_count} evidence</b><time>{new Intl.DateTimeFormat('bn-BD', { dateStyle: 'medium' }).format(new Date(row.submitted_at))}</time></button>)}</div> : <div className="empty-state"><span>✅</span><h3>এই filter-এ কোনো application নেই</h3></div>}{detailLoading && <div className="verification-overlay"><div className="verification-dialog loading-box"><LoaderCircle className="spin" /> Detail লোড হচ্ছে…</div></div>}{detail && <div className="verification-overlay" role="dialog" aria-modal="true"><section className="verification-dialog"><header><span className={`entity-${detail.entity_type}`}><EntityIcon type={detail.entity_type} /></span><div><small>{entityLabels[detail.entity_type]}</small><h2>{formatValue(detail.data.full_name || detail.data.name_bn || detail.data.operator_name)}</h2><p>Status: {detail.status}</p></div><button aria-label="বন্ধ করুন" onClick={() => setDetail(null)}><X /></button></header><div className="verification-detail-body"><section><h3>Submitted data <small>read-only</small></h3><dl>{visibleData.map(([key, value]) => <div key={key}><dt>{fieldLabels[key] || key.replaceAll('_', ' ')}</dt><dd>{formatValue(value)}</dd></div>)}</dl></section><section><h3>Evidence ({detail.documents.length})</h3><div className="review-documents">{detail.documents.map((document) => <button key={document.document_id} onClick={() => void openDocument(document.storage_path)}><FileCheck2 /><span><strong>{document.document_type.replaceAll('_', ' ')}</strong><small>{new Intl.DateTimeFormat('bn-BD', { dateStyle: 'medium' }).format(new Date(document.created_at))}</small></span></button>)}{!detail.documents.length && <p className="empty-inline">Evidence file নেই। Submitted data যাচাই করে সিদ্ধান্ত নিন।</p>}</div></section><section className="review-decision"><h3>Review decision</h3><label>Review note {confirmDecision === 'rejected' && <b>Reject-এর জন্য বাধ্যতামূলক</b>}<textarea rows={4} value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} placeholder="যাচাইয়ের ফল বা rejection reason" /></label><div>{confirmDecision && <span>আপনি কি নিশ্চিত?</span>}<button className={confirmDecision === 'approved' ? 'approve confirming' : 'approve'} disabled={working} onClick={() => void decide('approved')}><Check /> {confirmDecision === 'approved' ? 'হ্যাঁ, Approve' : 'Approve'}</button><button className={confirmDecision === 'rejected' ? 'reject confirming' : 'reject'} disabled={working} onClick={() => void decide('rejected')}><X /> {confirmDecision === 'rejected' ? 'হ্যাঁ, Reject' : 'Reject'}</button>{confirmDecision && <button onClick={() => setConfirmDecision(null)}>ফিরে যান</button>}</div></section></div></section></div>}</main></div>;
}
