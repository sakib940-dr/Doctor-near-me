import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { FileCheck2, FilePlus2, GraduationCap, LoaderCircle, Save, ShieldCheck, Trash2 } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import VerifiedBadge from '../components/VerifiedBadge';
import {
  deleteEntityVerificationDocument,
  getMyDoctorVerificationProfile,
  getMyEntityVerificationEvidence,
  getVerificationDocumentUrl,
  updateMyDoctorVerificationInfo,
  uploadEntityVerificationDocument,
} from '../services/verification';
import type { DoctorVerificationProfile, OwnerVerificationEvidence, VerificationEvidenceDocument } from '../types';

const doctorDocuments = {
  bmdc_certificate: 'BMDC certificate',
  medical_degree: 'Medical degree',
  national_id: 'জাতীয় পরিচয়পত্র',
  other: 'অন্যান্য',
};

const statusLabels: Record<DoctorVerificationProfile['verification_status'], string> = {
  pending: 'Not verified yet',
  approved: 'Verified',
  rejected: 'Verification rejected',
  expired: 'Verification expired',
};

const messageFrom = (error: unknown) => error instanceof Error ? error.message : 'Verification তথ্য সংরক্ষণ করা যায়নি।';

export default function DoctorVerificationPage() {
  const { account, user } = useAuth();
  const [profile, setProfile] = useState<DoctorVerificationProfile | null>(null);
  const [evidence, setEvidence] = useState<OwnerVerificationEvidence | null>(null);
  const [medicalCollege, setMedicalCollege] = useState('');
  const [medicalSession, setMedicalSession] = useState('');
  const [medicalBatch, setMedicalBatch] = useState('');
  const [documentType, setDocumentType] = useState('bmdc_certificate');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    if (!user) return;
    const [nextProfile, nextEvidence] = await Promise.all([
      getMyDoctorVerificationProfile(),
      getMyEntityVerificationEvidence('doctor', user.id),
    ]);
    setProfile(nextProfile);
    setEvidence(nextEvidence);
    setMedicalCollege(nextProfile.medical_college || '');
    setMedicalSession(nextProfile.medical_session || '');
    setMedicalBatch(nextProfile.medical_batch || '');
  }

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    load().catch((loadError: unknown) => setError(messageFrom(loadError))).finally(() => setLoading(false));
  }, [user?.id]);

  if (account && account.role !== 'doctor') return <Navigate to="/dashboard" replace />;

  const verified = profile?.verification_status === 'approved';
  const evidenceEditable = evidence ? ['pending', 'rejected'].includes(evidence.status) : false;

  async function saveInformation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile) return;
    setWorking('save'); setError(null); setNotice(null);
    try {
      const result = await updateMyDoctorVerificationInfo({
        medicalCollege,
        medicalSession,
        medicalBatch,
      });
      await load();
      setNotice(result.information_changed
        ? 'Verification information সংরক্ষিত হয়েছে। তথ্য পরিবর্তনের কারণে review status pending করা হয়েছে।'
        : 'Verification information সংরক্ষিত আছে।');
    } catch (saveError) {
      setError(messageFrom(saveError));
    } finally {
      setWorking(null);
    }
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || !file) return;
    setWorking('upload'); setError(null); setNotice(null);
    try {
      await uploadEntityVerificationDocument({ entityType: 'doctor', entityId: user.id, documentType, file });
      setFile(null);
      await load();
      setNotice('Evidence upload হয়েছে এবং existing verification queue-তে জমা হয়েছে।');
    } catch (uploadError) {
      setError(messageFrom(uploadError));
    } finally {
      setWorking(null);
    }
  }

  async function openDocument(document: VerificationEvidenceDocument) {
    setWorking(document.document_id); setError(null);
    try {
      window.open(await getVerificationDocumentUrl(document.storage_path), '_blank', 'noopener,noreferrer');
    } catch (openError) {
      setError(messageFrom(openError));
    } finally {
      setWorking(null);
    }
  }

  async function removeDocument(document: VerificationEvidenceDocument) {
    if (!window.confirm('Evidence document স্থায়ীভাবে মুছে ফেলতে চান?')) return;
    setWorking(document.document_id); setError(null); setNotice(null);
    try {
      await deleteEntityVerificationDocument(document.document_id);
      await load();
      setNotice('Evidence document মুছে ফেলা হয়েছে।');
    } catch (deleteError) {
      setError(messageFrom(deleteError));
    } finally {
      setWorking(null);
    }
  }

  return (
    <div className="app-shell doctor-dashboard-page doctor-verification-page">
      <main className="doctor-dashboard-main container">
        <div className="doctor-page-heading doctor-verification-heading">
          <span><ShieldCheck /></span>
          <div>
            <small>Professional verification</small>
            <h1>Verification</h1>
            <p>Medical education information এবং existing private evidence review system এখান থেকে পরিচালনা করুন।</p>
          </div>
        </div>

        {loading ? <div className="loading-box"><LoaderCircle className="spin" /> Verification তথ্য লোড হচ্ছে…</div> : !profile || !evidence ? (
          <div className="error-box">Doctor verification profile পাওয়া যায়নি।</div>
        ) : <>
          <section className={`doctor-verification-status-card ${profile.verification_status}`}>
            <div>
              <VerifiedBadge verified={verified} label={verified ? 'Verified' : 'Not verified yet'} />
              <span>
                <strong>{statusLabels[profile.verification_status]}</strong>
                <small>{profile.verified_at ? `শেষ review: ${new Intl.DateTimeFormat('bn-BD', { dateStyle: 'medium' }).format(new Date(profile.verified_at))}` : 'Admin/Verification Officer review এখনো সম্পন্ন হয়নি'}</small>
              </span>
            </div>
            <p>{verified
              ? 'আপনার verification approved। নিচের identity তথ্য পরিবর্তন করলে status আবার pending হবে।'
              : 'Account active থাকলে platform publication policy অনুযায়ী profile “Not verified yet” badge সহ public হতে পারে।'}</p>
            {profile.verification_note && <div className="doctor-verification-review-note"><b>Review note:</b> {profile.verification_note}</div>}
          </section>

          <div className="doctor-verification-layout">
            <form className="doctor-verification-info-card" onSubmit={saveInformation}>
              <header><GraduationCap /><div><h2>Medical education information</h2><p>এই তথ্য existing Doctor verification record-এর অংশ।</p></div></header>
              <div className="patient-form-grid doctor-verification-form-grid">
                <label className="auth-field"><span>Medical College Name</span><div><input required minLength={2} value={medicalCollege} onChange={(event) => setMedicalCollege(event.target.value)} placeholder="Medical college / institute" /></div></label>
                <label className="auth-field"><span>Session</span><div><input required value={medicalSession} onChange={(event) => setMedicalSession(event.target.value)} placeholder="যেমন: 2015–2016" /></div></label>
                <label className="auth-field"><span>Batch</span><div><input required value={medicalBatch} onChange={(event) => setMedicalBatch(event.target.value)} placeholder="যেমন: 42nd Batch" /></div></label>
              </div>
              <div className="doctor-verification-readonly-grid">
                <div><small>BMDC Number</small><strong>{profile.bmdc_registration_no || 'যোগ করা হয়নি'}</strong></div>
                <div><small>Degree</small><strong>{profile.degree || 'যোগ করা হয়নি'}</strong></div>
              </div>
              <p className="doctor-verification-security-note">Medical College, Session বা Batch পরিবর্তন হলে existing approval invalidated হয়ে verification আবার pending হবে।</p>
              <button className="auth-submit" disabled={working === 'save'}>{working === 'save' ? <LoaderCircle className="spin" /> : <><Save /> Verification information save</>}</button>
            </form>

            <section className="doctor-verification-evidence-card">
              <header><FileCheck2 /><div><h2>Verification evidence</h2><p>Existing private verification-documents bucket এবং existing review queue reuse করা হচ্ছে।</p></div><b>{evidence.documents.length} files</b></header>
              {evidenceEditable ? (
                <form className="evidence-upload doctor-verification-upload" onSubmit={upload}>
                  <select value={documentType} onChange={(event) => setDocumentType(event.target.value)}>
                    {Object.entries(doctorDocuments).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                  </select>
                  <label><FilePlus2 /> {file?.name || 'ফাইল নির্বাচন'}<input type="file" required accept="image/jpeg,image/png,image/webp,image/avif,application/pdf" onChange={(event: ChangeEvent<HTMLInputElement>) => setFile(event.target.files?.[0] || null)} /></label>
                  <small className="image-upload-hint">ছবি হলে প্রস্তাবিত সর্বোচ্চ 2200×2200 px • সর্বোচ্চ 3 MB • আপলোডের পর ছবি স্বয়ংক্রিয়ভাবে অপটিমাইজ হবে • PDF অপরিবর্তিত</small>
                  <button disabled={!file || working === 'upload'}>{working === 'upload' ? <LoaderCircle className="spin" /> : 'Upload'}</button>
                </form>
              ) : <p className="evidence-locked">Approved অবস্থায় existing evidence locked থাকে। Verified identity information বদলালে review আবার pending হবে।</p>}

              <div className="evidence-document-list doctor-verification-documents">
                {evidence.documents.map((document) => <article key={document.document_id}>
                  <FileCheck2 />
                  <div><strong>{doctorDocuments[document.document_type as keyof typeof doctorDocuments] || document.document_type}</strong><small>{new Intl.DateTimeFormat('bn-BD', { dateStyle: 'medium' }).format(new Date(document.created_at))}</small></div>
                  <button disabled={working === document.document_id} onClick={() => void openDocument(document)}>দেখুন</button>
                  {evidenceEditable && <button className="delete" disabled={working === document.document_id} onClick={() => void removeDocument(document)}><Trash2 /></button>}
                </article>)}
                {!evidence.documents.length && <p className="empty-inline">কোনো evidence upload হয়নি।</p>}
              </div>
            </section>
          </div>
        </>}

        {error && <div className="auth-message error" role="alert">{error}</div>}
        {notice && <div className="auth-message success">{notice}</div>}
      </main>
    </div>
  );
}
