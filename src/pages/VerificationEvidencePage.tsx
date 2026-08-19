import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { ArrowLeft, FileCheck2, FilePlus2, LoaderCircle, ShieldCheck, Trash2 } from 'lucide-react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getMyProviderDashboard } from '../services/providerDashboard';
import { deleteEntityVerificationDocument, getMyEntityVerificationEvidence, getVerificationDocumentUrl, uploadEntityVerificationDocument } from '../services/verification';
import type { OwnerVerificationEvidence, VerificationEvidenceDocument } from '../types';

const doctorDocuments = { bmdc_certificate: 'BMDC certificate', medical_degree: 'Medical degree', national_id: 'জাতীয় পরিচয়পত্র', other: 'অন্যান্য' };
const providerDocuments = { trade_license: 'Trade license', organization_document: 'প্রতিষ্ঠানের document', national_id: 'Owner NID', facility_photo: 'Facility photo', other: 'অন্যান্য' };
const statusLabels: Record<string, string> = { pending: 'Verification অপেক্ষমাণ', approved: 'অনুমোদিত', rejected: 'প্রত্যাখ্যাত', suspended: 'স্থগিত', expired: 'মেয়াদ শেষ' };
const messageFrom = (error: unknown) => error instanceof Error ? error.message : 'কাজটি সম্পন্ন করা যায়নি।';

export default function VerificationEvidencePage() {
  const { account, user } = useAuth();
  const [entityType, setEntityType] = useState<'doctor' | 'provider' | null>(null);
  const [entityId, setEntityId] = useState('');
  const [evidence, setEvidence] = useState<OwnerVerificationEvidence | null>(null);
  const [documentType, setDocumentType] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadEvidence = async (type: 'doctor' | 'provider', id: string) => { setEvidence(await getMyEntityVerificationEvidence(type, id)); };
  useEffect(() => {
    const initialize = async () => {
      try {
        if (account?.role === 'doctor' && user) { setEntityType('doctor'); setEntityId(user.id); setDocumentType('bmdc_certificate'); await loadEvidence('doctor', user.id); }
        else if (account && ['hospital', 'chamber'].includes(account.role)) { const providers = await getMyProviderDashboard(); if (providers[0]) { setEntityType('provider'); setEntityId(providers[0].id); setDocumentType('trade_license'); await loadEvidence('provider', providers[0].id); } }
      } catch (loadError) { setError(messageFrom(loadError)); } finally { setLoading(false); }
    };
    if (account) void initialize();
  }, [account, user]);

  if (account && !['doctor', 'hospital', 'chamber'].includes(account.role)) return <Navigate to="/dashboard" replace />;
  const labels = entityType === 'doctor' ? doctorDocuments : providerDocuments;
  const editable = evidence ? ['pending', 'rejected'].includes(evidence.status) : false;

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!entityType || !entityId || !file || !documentType) return;
    setWorking('upload'); setError(null); setNotice(null);
    try { await uploadEntityVerificationDocument({ entityType, entityId, documentType, file }); await loadEvidence(entityType, entityId); setFile(null); setNotice('Evidence upload হয়েছে এবং review queue-তে জমা হয়েছে।'); }
    catch (uploadError) { setError(messageFrom(uploadError)); } finally { setWorking(null); }
  }

  async function openDocument(document: VerificationEvidenceDocument) {
    setWorking(document.document_id); setError(null);
    try { window.open(await getVerificationDocumentUrl(document.storage_path), '_blank', 'noopener,noreferrer'); }
    catch (openError) { setError(messageFrom(openError)); } finally { setWorking(null); }
  }

  async function removeDocument(document: VerificationEvidenceDocument) {
    if (!entityType || !window.confirm('Evidence document স্থায়ীভাবে মুছে ফেলতে চান?')) return;
    setWorking(document.document_id); setError(null);
    try { await deleteEntityVerificationDocument(document.document_id); await loadEvidence(entityType, entityId); setNotice('Evidence document মুছে ফেলা হয়েছে।'); }
    catch (deleteError) { setError(messageFrom(deleteError)); } finally { setWorking(null); }
  }

  return <div className="app-shell evidence-page"><main className="evidence-main container"><Link className="back-link" to="/dashboard"><ArrowLeft /> Dashboard-এ ফিরুন</Link><div className="evidence-heading"><span><ShieldCheck /></span><div><small>Private evidence</small><h1>Verification documents</h1><p>Evidence private bucket-এ থাকে; শুধু আপনি ও authorized verification staff দেখতে পারেন।</p></div></div>{error && <div className="error-box">{error}</div>}{notice && <div className="auth-message success">{notice}</div>}{loading ? <div className="loading-box"><LoaderCircle className="spin" /> Evidence লোড হচ্ছে…</div> : !evidence ? <div className="empty-state"><span>📄</span><h3>Verification entity পাওয়া যায়নি</h3><p>আগে professional/provider profile তৈরি করুন।</p></div> : <><section className={`evidence-status ${evidence.status}`}><div><ShieldCheck /><span><strong>{statusLabels[evidence.status] || evidence.status}</strong><small>{evidence.verified_at ? new Intl.DateTimeFormat('bn-BD', { dateStyle: 'medium' }).format(new Date(evidence.verified_at)) : 'Review এখনো সম্পন্ন হয়নি'}</small></span></div>{evidence.note && <p><b>Review note:</b> {evidence.note}</p>}</section><section className="evidence-card"><div className="section-title"><div><h2>Submitted evidence</h2><p>JPG, PNG, WebP বা PDF; প্রতিটি সর্বোচ্চ ১০ MB।</p></div><b>{evidence.documents.length} files</b></div>{editable ? <form className="evidence-upload" onSubmit={upload}><select value={documentType} onChange={(event) => setDocumentType(event.target.value)}>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><label><FilePlus2 /> {file?.name || 'ফাইল নির্বাচন'}<input type="file" required accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event: ChangeEvent<HTMLInputElement>) => setFile(event.target.files?.[0] || null)} /></label><button disabled={!file || working === 'upload'}>{working === 'upload' ? <LoaderCircle className="spin" /> : 'Upload'}</button></form> : <p className="evidence-locked">Approved অবস্থায় evidence locked। Profile credential/location পরিবর্তন করে re-submit করলে নতুন evidence যোগ করতে পারবেন।</p>}<div className="evidence-document-list">{evidence.documents.map((document) => <article key={document.document_id}><FileCheck2 /><div><strong>{(labels as Record<string, string>)[document.document_type] || document.document_type}</strong><small>{new Intl.DateTimeFormat('bn-BD', { dateStyle: 'medium' }).format(new Date(document.created_at))}</small></div><button disabled={working === document.document_id} onClick={() => void openDocument(document)}>দেখুন</button>{editable && <button className="delete" disabled={working === document.document_id} onClick={() => void removeDocument(document)}><Trash2 /></button>}</article>)}{!evidence.documents.length && <p className="empty-inline">কোনো evidence upload হয়নি।</p>}</div></section></>}</main></div>;
}
