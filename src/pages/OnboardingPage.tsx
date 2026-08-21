import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, ArrowRight, Building2, Check, Crosshair, FileCheck2, FilePlus2,
  GraduationCap, LoaderCircle, Mail, MapPin, Phone, Save, ShieldCheck,
  Stethoscope, Trash2, UserRound,
} from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import PublicHeader from '../components/PublicHeader';
import { useAuth } from '../contexts/AuthContext';
import { captureCurrentCoordinates, validateCoordinates } from '../lib/geolocation';
import { formatDateSafe } from '../lib/dateSafe';
import { completeAccountOnboarding, finishMyRoleOnboarding, saveMyDoctorBasicOnboarding, setMyOnboardingStep } from '../services/account';
import {
  cleanupDoctorPhoto, getMyDoctorProfile, saveMyChamberSchedule, saveMyDoctorChamber,
  updateMyDoctorVisitingCardV2, uploadDoctorPhoto,
} from '../services/doctorDashboard';
import { doctorServices, doctorTreatmentCosts, getMyDoctorPublicContent, saveMyDoctorAbout } from '../services/doctorPublicContent';
import { getDistricts, getSpecialties, getUpazilas, resolveLocationContext } from '../services/discovery';
import { getMyProviderDashboard, saveMyProviderProfile } from '../services/providerDashboard';
import {
  deleteEntityVerificationDocument, getMyDoctorVerificationProfile,
  getMyEntityVerificationEvidence, submitMyDoctorVerificationApplication, updateMyDoctorVerificationInfo,
  uploadEntityVerificationDocument,
} from '../services/verification';
import type {
  District, DoctorPublicContent, MedicalType, MyDoctorProfile, OwnerVerificationEvidence,
  ProviderDashboardItem, PublicRegistrationRole, Specialty, Upazila, VerificationEvidenceDocument,
} from '../types';

const allowedRoles: PublicRegistrationRole[] = ['patient', 'doctor', 'hospital', 'ambulance'];
const roleLabels: Record<PublicRegistrationRole, string> = {
  patient: 'রোগী / সাধারণ ব্যবহারকারী', doctor: 'ডাক্তার', hospital: 'হাসপাতাল / ক্লিনিক', ambulance: 'অ্যাম্বুলেন্স সেবা',
};
const doctorSteps = ['Basic Information', 'Verification', 'Visiting Card', 'Chamber Details', 'About Doctor', 'Services', 'Treatment Cost'];
const hospitalSteps = ['Account / Basic', 'Hospital Details', 'Location & Contact', 'Verification', 'Complete'];
const days = ['রবিবার', 'সোমবার', 'মঙ্গলবার', 'বুধবার', 'বৃহস্পতিবার', 'শুক্রবার', 'শনিবার'];
const messageFrom = (error: unknown) => error instanceof Error ? error.message : 'Onboarding তথ্য সংরক্ষণ করা যায়নি।';

function isProfessionalRole(role: PublicRegistrationRole | string): role is 'doctor' | 'hospital' {
  return role === 'doctor' || role === 'hospital';
}

export default function OnboardingPage() {
  const { user, account, loading, refreshAccount } = useAuth();
  const navigate = useNavigate();
  const metadataRole = user?.user_metadata.intended_role;
  const initialRole = allowedRoles.includes(account?.role as PublicRegistrationRole)
    ? account?.role as PublicRegistrationRole
    : allowedRoles.includes(metadataRole) ? metadataRole : 'patient';
  const [role, setRole] = useState<PublicRegistrationRole>(initialRole);
  const maxInitial = initialRole === 'doctor' ? 7 : 5;
  const [step, setStep] = useState(Math.max(1, Math.min(maxInitial, account?.onboarding_step || 1)));
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const nextRole = account?.role && allowedRoles.includes(account.role as PublicRegistrationRole) ? account.role as PublicRegistrationRole : role;
    if (nextRole !== role) setRole(nextRole);
    if (account?.onboarding_step) setStep(Math.max(1, Math.min(nextRole === 'doctor' ? 7 : 5, account.onboarding_step)));
  }, [account?.role, account?.onboarding_step, role]);

  if (!loading && account?.onboarding_completed) return <Navigate to="/dashboard" replace />;
  if (!loading && !user) return <Navigate to="/auth" replace />;

  async function goStep(next: number) {
    setError(null); setNotice(null);
    if (isProfessionalRole(role)) await setMyOnboardingStep(next);
    setStep(next);
    await refreshAccount();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function finish() {
    setWorking('finish'); setError(null);
    try {
      await finishMyRoleOnboarding();
      await refreshAccount();
      navigate('/dashboard', { replace: true });
    } catch (finishError) {
      setError(messageFrom(finishError));
    } finally { setWorking(null); }
  }

  const steps = role === 'hospital' ? hospitalSteps : doctorSteps;

  return (
    <div className="app-shell onboarding-page professional-onboarding-page">
      <PublicHeader />
      <main className="onboarding-main container">
        <section className="onboarding-intro professional-onboarding-intro">
          <span>{isProfessionalRole(role) ? `${role === 'doctor' ? 'Doctor' : 'Hospital'} registration` : 'Account setup'}</span>
          <h1>{role === 'doctor' ? 'Doctor Professional Onboarding' : isProfessionalRole(role) ? 'ধাপে ধাপে onboarding সম্পূর্ণ করুন' : 'আপনার প্রোফাইল সম্পূর্ণ করুন'}</h1>
          <p>{isProfessionalRole(role) ? 'প্রতিটি ধাপ database-এ save হবে। Refresh, logout বা Previous করলে saved তথ্য অক্ষত থাকবে।' : 'সঠিক dashboard ও এলাকার সেবা দেখানোর জন্য মৌলিক তথ্য দিন।'}</p>
        </section>

        {isProfessionalRole(role) && <ProgressSteps labels={steps} current={step} />}
        {error && <div className="auth-message error onboarding-global-message" role="alert">{error}</div>}
        {notice && <div className="auth-message success onboarding-global-message">{notice}</div>}

        {step === 1 && <BasicStep
          userEmail={user?.email || account?.email || ''}
          loginPhone={account?.phone || user?.phone || ''}
          initialName={account?.full_name || user?.user_metadata.full_name || ''}
          initialRole={role}
          roleLocked={account?.role === 'doctor' || account?.role === 'hospital'}
          initialDistrictId={account?.district_id ?? null}
          initialUpazilaId={account?.upazila_id ?? null}
          onRole={setRole}
          onError={setError}
          onSaved={async (savedRole) => {
            setRole(savedRole);
            await refreshAccount();
            if (isProfessionalRole(savedRole)) setStep(2); else navigate('/dashboard', { replace: true });
          }}
        />}

        {role === 'doctor' && step === 2 && <DoctorVerificationStep onError={setError} onNext={() => goStep(3)} onPrevious={() => goStep(1)} />}
        {role === 'doctor' && step === 3 && <DoctorVisitingStep onError={setError} onNext={() => goStep(4)} onPrevious={() => goStep(2)} />}
        {role === 'doctor' && step === 4 && <DoctorChamberStep onError={setError} onNext={() => goStep(5)} onPrevious={() => goStep(3)} />}
        {role === 'doctor' && step === 5 && <DoctorAboutStep onError={setError} onNext={() => goStep(6)} onPrevious={() => goStep(4)} />}
        {role === 'doctor' && step === 6 && <DoctorServicesStep onError={setError} onNext={() => goStep(7)} onPrevious={() => goStep(5)} />}
        {role === 'doctor' && step === 7 && <DoctorTreatmentCostStep onError={setError} onComplete={() => finish()} onPrevious={() => goStep(6)} working={working === 'finish'} />}

        {role === 'hospital' && step === 2 && <HospitalDetailsStep onError={setError} onNext={() => goStep(3)} onPrevious={() => goStep(1)} />}
        {role === 'hospital' && step === 3 && <HospitalLocationStep onError={setError} onNext={() => goStep(4)} onPrevious={() => goStep(2)} />}
        {role === 'hospital' && step === 4 && <HospitalVerificationStep onError={setError} onNext={() => goStep(5)} onPrevious={() => goStep(3)} />}
        {role === 'hospital' && step === 5 && <CompleteStep role="hospital" working={working === 'finish'} onFinish={() => void finish()} onPrevious={() => void goStep(4)} />}
      </main>
    </div>
  );
}

function ProgressSteps({ labels, current }: { labels: string[]; current: number }) {
  return <ol className="onboarding-progress" aria-label="Onboarding progress">{labels.map((label, index) => {
    const number = index + 1;
    return <li key={label} className={number === current ? 'current' : number < current ? 'done' : ''}><span>{number < current ? <Check /> : number}</span><small>{label}</small></li>;
  })}</ol>;
}

function useUnsavedWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return undefined;
    const handler = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);
}

function BasicStep({ userEmail, loginPhone, initialName, initialRole, roleLocked, initialDistrictId, initialUpazilaId, onRole, onError, onSaved }: {
  userEmail: string; loginPhone: string; initialName: string; initialRole: PublicRegistrationRole; roleLocked: boolean; initialDistrictId: number | null; initialUpazilaId: number | null;
  onRole: (role: PublicRegistrationRole) => void; onError: (message: string | null) => void; onSaved: (role: PublicRegistrationRole) => Promise<void>;
}) {
  const [fullName, setFullName] = useState(initialName);
  const [role, setRole] = useState(initialRole);
  const [medicalType, setMedicalType] = useState<MedicalType | ''>('');
  const [districtId, setDistrictId] = useState(initialDistrictId ? String(initialDistrictId) : '');
  const [upazilaId, setUpazilaId] = useState(initialUpazilaId ? String(initialUpazilaId) : '');
  const [districts, setDistricts] = useState<District[]>([]);
  const [upazilas, setUpazilas] = useState<Upazila[]>([]);
  const [working, setWorking] = useState(false);
  const [dirty, setDirty] = useState(false);
  useUnsavedWarning(dirty);
  useEffect(() => { getDistricts().then(setDistricts).catch((e) => onError(messageFrom(e))); }, [onError]);
  useEffect(() => { if (!districtId) { setUpazilas([]); return; } getUpazilas(Number(districtId)).then(setUpazilas).catch((e) => onError(messageFrom(e))); }, [districtId, onError]);
  useEffect(() => {
    if (initialRole !== 'doctor') return;
    getMyDoctorProfile().then((p) => { if (p?.doctor.medical_type) setMedicalType(p.doctor.medical_type); }).catch(() => undefined);
  }, [initialRole]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); onError(null);
    if (isProfessionalRole(role) && (!districtId || !upazilaId)) { onError('জেলা এবং উপজেলা / এলাকা নির্বাচন করুন।'); return; }
    if (role === 'doctor' && !medicalType) { onError('Medical Type হিসেবে MBBS অথবা BDS নির্বাচন করুন।'); return; }
    setWorking(true);
    try {
      await completeAccountOnboarding({ fullName, phone: loginPhone || undefined, role, districtId: districtId ? Number(districtId) : null, upazilaId: upazilaId ? Number(upazilaId) : null });
      if (role === 'doctor') await saveMyDoctorBasicOnboarding(medicalType as MedicalType);
      setDirty(false);
      await onSaved(role);
    } catch (saveError) { onError(messageFrom(saveError)); }
    finally { setWorking(false); }
  }

  return <div className="onboarding-step-stack"><form className="onboarding-card professional-step-card" onSubmit={submit} onChange={() => setDirty(true)}><header><UserRound /><div><small>Step 1</small><h2>Basic Information</h2><p>Login Email ও Login Phone account credential থেকে দেখানো হচ্ছে। Phone এখানে পরিবর্তন করা হবে না।</p></div></header><div className="patient-form-grid"><label className="auth-field"><span>নাম</span><div><UserRound /><input required minLength={2} value={fullName} onChange={(e) => setFullName(e.target.value)} /></div></label><label className="auth-field"><span>Login Email</span><div><Mail /><input readOnly value={userEmail} /></div></label><label className="auth-field"><span>Login Phone</span><div><Phone /><input readOnly value={loginPhone} placeholder="Account phone" /></div></label><label className="auth-field"><span>Account Type</span><div><UserRound /><select value={role} disabled={roleLocked} onChange={(e) => { const next=e.target.value as PublicRegistrationRole; setRole(next); onRole(next); }}>{allowedRoles.map((item) => <option key={item} value={item}>{roleLabels[item]}</option>)}</select></div>{roleLocked && <small className="field-helper">Professional account type signup-এর পরে self-change করা যায় না।</small>}</label>{role === 'doctor' && <label className="auth-field"><span>Medical Type *</span><div><Stethoscope /><select required value={medicalType} onChange={(e) => setMedicalType(e.target.value as MedicalType | '')}><option value="">Select MBBS / BDS</option><option value="MBBS">MBBS</option><option value="BDS">BDS</option></select></div><small className="field-helper">Admin, search, filter এবং reporting-এ এই classification ব্যবহার হবে।</small></label>}</div><div className="onboarding-locations"><label className="auth-field"><span>জেলা *</span><div><MapPin /><select required={isProfessionalRole(role)} value={districtId} onChange={(e) => { setDistrictId(e.target.value); setUpazilaId(''); }}><option value="">জেলা নির্বাচন করুন</option>{districts.map((d) => <option key={d.id} value={d.id}>{d.name_bn}</option>)}</select></div></label><label className="auth-field"><span>উপজেলা / এলাকা *</span><div><MapPin /><select required={isProfessionalRole(role)} disabled={!districtId} value={upazilaId} onChange={(e) => setUpazilaId(e.target.value)}><option value="">উপজেলা / এলাকা নির্বাচন করুন</option>{upazilas.map((u) => <option key={u.id} value={u.id}>{u.name_bn}</option>)}</select></div></label></div><button className="auth-submit" disabled={working}>{working ? <LoaderCircle className="spin" /> : <>Save & Next <ArrowRight /></>}</button></form></div>;
}

function StepActions({ onPrevious, saving, label='Save & Continue', onSkip }: { onPrevious: () => void; saving: boolean; label?: string; onSkip?: () => void }) {
  return <div className="onboarding-step-actions"><button type="button" className="secondary-action" onClick={onPrevious}><ArrowLeft /> Back</button>{onSkip && <button type="button" className="secondary-action onboarding-skip-action" disabled={saving} onClick={onSkip}>Skip</button>}<button className="auth-submit" disabled={saving}>{saving ? <LoaderCircle className="spin" /> : <><Save /> {label} <ArrowRight /></>}</button></div>;
}

interface StepProps { onError: (message:string|null)=>void; onNext:()=>Promise<void>; onPrevious:()=>Promise<void>|void; }

function DoctorVerificationStep({ onError, onNext, onPrevious }: StepProps) {
  const { user }=useAuth();
  const [medicalType,setMedicalType]=useState<MedicalType | ''>(''); const [college,setCollege]=useState(''); const [session,setSession]=useState(''); const [batch,setBatch]=useState(''); const [bmdc,setBmdc]=useState('');
  const [verificationStatus,setVerificationStatus]=useState('pending'); const [submittedAt,setSubmittedAt]=useState<string|null>(null); const [evidence,setEvidence]=useState<OwnerVerificationEvidence|null>(null);
  const [file,setFile]=useState<File|null>(null); const [docType,setDocType]=useState('bmdc_certificate'); const [saving,setSaving]=useState(false); const [dirty,setDirty]=useState(false);
  useUnsavedWarning(dirty);
  const locked=verificationStatus==='approved'||(verificationStatus==='pending'&&Boolean(submittedAt));
  async function load(){if(!user)return;const [p,e]=await Promise.all([getMyDoctorVerificationProfile(),getMyEntityVerificationEvidence('doctor',user.id)]);setMedicalType(p.medical_type||'');setCollege(p.medical_college||'');setSession(p.medical_session||'');setBatch(p.medical_batch||'');setBmdc(p.bmdc_registration_no||'');setVerificationStatus(p.verification_status||'pending');setSubmittedAt(p.verification_submitted_at||null);setEvidence(e);}
  useEffect(()=>{load().catch(e=>onError(messageFrom(e)));},[user?.id, onError]);
  async function upload(){if(!user||!file||locked)return;setSaving(true);onError(null);try{await uploadEntityVerificationDocument({entityType:'doctor',entityId:user.id,documentType:docType,file});setFile(null);await load();setDirty(false);}catch(e){onError(messageFrom(e));}finally{setSaving(false);}}
  async function remove(doc:VerificationEvidenceDocument){if(locked)return;setSaving(true);try{await deleteEntityVerificationDocument(doc.document_id);await load();}catch(e){onError(messageFrom(e));}finally{setSaving(false);}}
  async function submit(e:FormEvent){e.preventDefault();onError(null);if(!locked && !evidence?.documents.length){onError('BMDC/NID related অন্তত একটি verification document upload করুন।');return;}setSaving(true);try{if(!locked){if(!medicalType) throw new Error('Medical Type নির্বাচন করুন।');await updateMyDoctorVerificationInfo({medicalType:medicalType as MedicalType,medicalCollege:college,medicalSession:session,medicalBatch:batch,bmdcRegistrationNo:bmdc});await submitMyDoctorVerificationApplication();}setDirty(false);await onNext();}catch(err){onError(messageFrom(err));}finally{setSaving(false);}}
  return <form className="onboarding-card professional-step-card" onSubmit={submit} onChange={()=>setDirty(true)}><header><FileCheck2/><div><small>Step 2</small><h2>Verification Form</h2><p>Medical education, BMDC এবং verification evidence existing verification system-এই save হবে। Save & Next করলে application review queue-তে submit হবে। Visiting Card-এর public fields verification identity থেকে আলাদা থাকবে।</p></div></header>{locked&&<div className="identity-status verified"><ShieldCheck/><span><strong>{verificationStatus==='approved'?'Verification approved':'Application pending'}</strong><small>Submitted verification identity locked।</small></span></div>}{verificationStatus==='rejected' && !locked && <div className="auth-message error"><strong>Rejected:</strong> পুনরায় তথ্য/document ঠিক করে onboarding continue করলে Re-Verification submit হবে।</div>}<div className="patient-form-grid"><label className="auth-field"><span>Medical Type</span><div><Stethoscope/><input readOnly value={medicalType}/></div></label><label className="auth-field"><span>Medical College Name *</span><div><GraduationCap/><input required minLength={2} disabled={locked} value={college} onChange={e=>setCollege(e.target.value)}/></div></label><label className="auth-field"><span>Session *</span><div><input required disabled={locked} value={session} onChange={e=>setSession(e.target.value)} placeholder="e.g. 2015-2016"/></div></label><label className="auth-field"><span>Batch *</span><div><input required disabled={locked} value={batch} onChange={e=>setBatch(e.target.value)} placeholder="e.g. 25th Batch"/></div></label><label className="auth-field"><span>BMDC Registration Number *</span><div><ShieldCheck/><input required minLength={3} disabled={locked} value={bmdc} onChange={e=>setBmdc(e.target.value)} /></div></label></div><EvidenceEditor evidence={evidence} file={file} setFile={setFile} documentType={docType} setDocumentType={setDocType} onUpload={upload} onDelete={remove} onError={onError} doctor disabled={locked}/><StepActions onPrevious={onPrevious} saving={saving} label={locked?'Continue':'Save & Next'}/></form>;
}

function DoctorVisitingStep({ onError, onNext, onPrevious }: StepProps) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<MyDoctorProfile | null>(null); const [specialties, setSpecialties] = useState<Specialty[]>([]); const [photo, setPhoto] = useState<File | null>(null); const [removePhoto,setRemovePhoto]=useState(false); const [saving, setSaving] = useState(false); const [dirty,setDirty]=useState(false);
  useUnsavedWarning(dirty);
  useEffect(() => { Promise.all([getMyDoctorProfile(), getSpecialties()]).then(([p,s]) => { setProfile(p); setSpecialties(s); }).catch((e) => onError(messageFrom(e))); }, [onError]);
  const setDoctor = (key: keyof MyDoctorProfile['doctor'], value: string | null) => { setDirty(true); setProfile((p) => p ? ({ ...p, doctor: { ...p.doctor, [key]: value } }) : p); };
  function toggle(id: number) { setDirty(true); setProfile((p) => p ? ({ ...p, specialty_ids: p.specialty_ids.includes(id) ? p.specialty_ids.filter((x) => x!==id) : [...p.specialty_ids,id] }) : p); }
  async function submit(e: FormEvent) { e.preventDefault(); if (!profile || !user) return; if (!profile.doctor.degree?.trim()) {onError('Degree লিখুন।');return;} if (!profile.doctor.specialty_text?.trim() && !profile.specialty_ids.length) { onError('Manual Specialty অথবা অন্তত একটি Specialty Category দিন।'); return; } if(!profile.doctor.public_address?.trim()){onError('Public visiting-card address দিন।');return;} setSaving(true); onError(null); const previousPath=profile.doctor.profile_photo_url; let uploadedPath:string|null=null; try { let path=removePhoto?null:previousPath; if (photo) { uploadedPath=await uploadDoctorPhoto(photo,user.id); path=uploadedPath; } await updateMyDoctorVisitingCardV2({ fullName: profile.doctor.full_name || '', profilePhotoUrl:path, professionalTitle:profile.doctor.professional_title, degree:profile.doctor.degree, designation:profile.doctor.designation, medicalCollege:profile.doctor.medical_college, presentJob:profile.doctor.present_job, specialtyText:profile.doctor.specialty_text||null, publicAddress:profile.doctor.public_address||null, specialtyIds:profile.specialty_ids }); if ((uploadedPath||removePhoto)&&previousPath&&previousPath!==uploadedPath) await cleanupDoctorPhoto(previousPath).catch(()=>undefined); const verification=await getMyDoctorVerificationProfile(); if(verification.verification_status!=='approved' && !(verification.verification_status==='pending'&&verification.verification_submitted_at)) await submitMyDoctorVerificationApplication(); setDirty(false); await onNext(); } catch(err){if(uploadedPath) await cleanupDoctorPhoto(uploadedPath).catch(()=>undefined);onError(messageFrom(err));} finally{setSaving(false);} }
  if (!profile) return <div className="loading-box"><LoaderCircle className="spin" /> Visiting Card লোড হচ্ছে…</div>;
  const displayedPhoto=photo?URL.createObjectURL(photo):removePhoto?null:profile.doctor.profile_photo_url;
  return <form className="onboarding-card professional-step-card" onSubmit={submit}><header><Stethoscope /><div><small>Step 3</small><h2>Visiting Card Details</h2><p>এই information public doctor listing এবং doctor profile/visiting card-এ visitors দেখতে পারবে। তাই এখানে যে information দিবেন তা public display-এর জন্য ব্যবহার করা হবে। এই information পরে edit করা যাবে।</p></div></header><div className="onboarding-public-note"><ShieldCheck/><span><strong>Public Information</strong><small>এই section-এর data visitor-facing card/profile-এ ব্যবহার হবে।</small></span></div><div className="doctor-onboarding-photo">{displayedPhoto?<img src={displayedPhoto} alt="Doctor preview" onError={(e)=>{const img=e.currentTarget; if(img.src!==profile.doctor.profile_photo_url && profile.doctor.profile_photo_url){img.src=profile.doctor.profile_photo_url;} else {img.style.display='none';}}}/>:<div><UserRound/></div>}<label className="secondary-action">{displayedPhoto?'Replace Picture':'Upload Picture'}<input hidden type="file" data-skip-global-guard="true" accept="image/jpeg,image/png,image/webp,image/avif" onChange={(e)=>{const file=e.target.files?.[0]||null;e.target.value='';if(!file)return;if(file.size>3*1024*1024){onError('Image size সর্বোচ্চ 3 MB হতে হবে।');return;}onError(null);setPhoto(file);setRemovePhoto(false);setDirty(true);}}/></label>{displayedPhoto&&<button type="button" className="secondary-action danger" onClick={()=>{setPhoto(null);setRemovePhoto(true);setDirty(true);}}><Trash2/> Delete Picture</button>}</div><div className="patient-form-grid"><label className="auth-field"><span>Doctor Name *</span><div><input required value={profile.doctor.full_name || ''} onChange={(e)=>setDoctor('full_name',e.target.value)} /></div></label><label className="auth-field"><span>Degree *</span><div><input required value={profile.doctor.degree || ''} onChange={(e)=>setDoctor('degree',e.target.value)} placeholder="MBBS, FCPS / BDS, MS" /></div></label><label className="auth-field"><span>Specialty Text</span><div><input value={profile.doctor.specialty_text || ''} onChange={(e)=>setDoctor('specialty_text',e.target.value)} placeholder="Dental Surgeon / Eye Specialist" /></div></label><label className="auth-field"><span>Professional Title (existing fallback)</span><div><input value={profile.doctor.professional_title || ''} onChange={(e)=>setDoctor('professional_title',e.target.value)} /></div></label><label className="auth-field"><span>Medical College</span><div><input readOnly value={profile.doctor.medical_college || ''} /></div><small className="field-helper">Verification Step থেকে auto-loaded.</small></label><label className="auth-field"><span>Current Job Hospital / Institution</span><div><input value={profile.doctor.present_job || ''} onChange={(e)=>setDoctor('present_job',e.target.value)} /></div></label><label className="auth-field"><span>BMDC</span><div><ShieldCheck/><input readOnly value={profile.doctor.bmdc_registration_no || ''} /></div><small className="field-helper">Verification Form থেকে auto-filled; এখানে editable নয়।</small></label><label className="auth-field"><span>Designation</span><div><input value={profile.doctor.designation || ''} onChange={(e)=>setDoctor('designation',e.target.value)} /></div></label></div><label className="provider-text-field"><span>Public Visiting-card Address *</span><textarea required rows={3} value={profile.doctor.public_address||''} onChange={(e)=>setDoctor('public_address',e.target.value)} placeholder="Visitors doctor card/details page-এ যে short address দেখবে"/></label><fieldset className="specialty-picker onboarding-specialty-picker"><legend>Existing Specialty Category</legend><p className="field-helper">Manual specialty text-এর পাশাপাশি existing category filter/search-এর জন্য category select করতে পারেন।</p>{specialties.map((s)=><label key={s.id} className={profile.specialty_ids.includes(s.id)?'selected':''}><input type="checkbox" checked={profile.specialty_ids.includes(s.id)} onChange={()=>toggle(s.id)} /><span>{s.name_bn}</span></label>)}</fieldset><StepActions onPrevious={onPrevious} saving={saving} /></form>;
}

function DoctorChamberStep({ onError, onNext, onPrevious }: StepProps) {
  const [profile,setProfile]=useState<MyDoctorProfile|null>(null); const [districts,setDistricts]=useState<District[]>([]); const [upazilas,setUpazilas]=useState<Upazila[]>([]); const [saving,setSaving]=useState(false); const [gps,setGps]=useState(false); const [dirty,setDirty]=useState(false);
  useUnsavedWarning(dirty);
  const owned=useMemo(()=>profile?.chambers.find((c)=>c.owned_by_doctor) || null,[profile]);
  const [form,setForm]=useState({providerId:null as string|null,name:'',address:'',phone:'',whatsapp:'',districtId:null as number|null,upazilaId:null as number|null,latitude:null as number|null,longitude:null as number|null,day:0,start:'',end:'',fee:''});
  useEffect(()=>{Promise.all([getMyDoctorProfile(),getDistricts()]).then(([p,d])=>{setProfile(p);setDistricts(d); const c=p?.chambers.find((x)=>x.owned_by_doctor); if(c){const sch=c.schedules[0];setForm({providerId:c.id,name:c.name_bn,address:c.address||'',phone:c.phone||p?.doctor.phone||'',whatsapp:c.whatsapp||'',districtId:c.district_id??null,upazilaId:c.upazila_id??null,latitude:c.latitude??null,longitude:c.longitude??null,day:sch?.day_of_week??0,start:sch?.start_time?.slice(0,5)||'',end:sch?.end_time?.slice(0,5)||'',fee:sch?.fee!=null?String(sch.fee):''});} else {setForm(f=>({...f,phone:p?.doctor.phone||'',districtId:p?.doctor.district_id??null,upazilaId:p?.doctor.upazila_id??null}));}}).catch(e=>onError(messageFrom(e)));},[onError]);
  useEffect(()=>{if(!form.districtId){setUpazilas([]);return;} getUpazilas(form.districtId).then(setUpazilas).catch(e=>onError(messageFrom(e)));},[form.districtId,onError]);
  const patch=(values:Partial<typeof form>)=>{setDirty(true);setForm(f=>({...f,...values}));};
  async function capture(){setGps(true);onError(null);try{const c=await captureCurrentCoordinates();const loc=await resolveLocationContext(c.latitude,c.longitude);patch({latitude:c.latitude,longitude:c.longitude,districtId:loc?.district_id??form.districtId,upazilaId:loc?.upazila_id??form.upazilaId});}catch(e){onError(messageFrom(e));}finally{setGps(false);}}
  async function submit(e:FormEvent){e.preventDefault();if(!form.districtId||!form.upazilaId){onError('Chamber District এবং Upazila / Area নির্বাচন করুন।');return;}const coordErr=validateCoordinates(form.latitude,form.longitude);if(coordErr){onError(coordErr);return;}setSaving(true);onError(null);try{const r=await saveMyDoctorChamber({providerId:form.providerId,nameBn:form.name,address:form.address,districtId:form.districtId,upazilaId:form.upazilaId,phone:form.phone||null,whatsapp:form.whatsapp||null,latitude:form.latitude,longitude:form.longitude});if(form.start&&form.end)await saveMyChamberSchedule({providerId:r.provider_id,dayOfWeek:form.day,startTime:form.start,endTime:form.end,fee:form.fee?Number(form.fee):null,isActive:true,scheduleId:owned?.schedules[0]?.id||null});setDirty(false);await onNext();}catch(err){onError(messageFrom(err));}finally{setSaving(false);}}
  return <form className="onboarding-card professional-step-card" onSubmit={submit}><header><Building2 /><div><small>Step 4</small><h2>Chamber Details</h2><p>এই information public হবে। Visitor doctor details page-এ chamber information, phone number, WhatsApp এবং location দেখতে পারবে এবং appointment/contact-এর জন্য ব্যবহার করতে পারবে। এই information পরে edit করা যাবে।</p></div></header><div className="onboarding-public-note"><MapPin/><span><strong>Public Chamber Information</strong><small>Call, WhatsApp এবং Map action saved chamber data থেকেই তৈরি হবে।</small></span></div><div className="provider-location-guide onboarding-location-guide"><Crosshair/><div><strong>Google Map / GPS Location</strong><p>Latitude/Longitude manually দিতে পারেন অথবা browser/device permission দিয়ে current GPS location ব্যবহার করুন।</p></div><button type="button" onClick={()=>void capture()} disabled={gps}>{gps?<LoaderCircle className="spin"/>:<Crosshair/>} Use My Current Location</button></div><div className="patient-form-grid"><label className="auth-field"><span>Chamber Name *</span><div><input required minLength={2} value={form.name} onChange={(e)=>patch({name:e.target.value})}/></div></label><label className="auth-field"><span>Chamber Phone *</span><div><Phone/><input required inputMode="tel" value={form.phone} onChange={(e)=>patch({phone:e.target.value})} placeholder="01XXXXXXXXX"/></div></label><label className="auth-field"><span>WhatsApp Number</span><div><Phone/><input inputMode="tel" value={form.whatsapp} onChange={(e)=>patch({whatsapp:e.target.value})} placeholder="+8801XXXXXXXXX"/><small className="field-helper">Example: +8801XXXXXXXXX (country code সহ)</small></div></label><label className="auth-field"><span>District *</span><div><MapPin/><select required value={form.districtId??''} onChange={(e)=>patch({districtId:e.target.value?Number(e.target.value):null,upazilaId:null})}><option value="">নির্বাচন করুন</option>{districts.map(d=><option key={d.id} value={d.id}>{d.name_bn}</option>)}</select></div></label><label className="auth-field"><span>Upazila / Area *</span><div><MapPin/><select required value={form.upazilaId??''} onChange={(e)=>patch({upazilaId:e.target.value?Number(e.target.value):null})}><option value="">নির্বাচন করুন</option>{upazilas.map(u=><option key={u.id} value={u.id}>{u.name_bn}</option>)}</select></div></label><label className="auth-field"><span>Latitude</span><div><input type="number" step="any" min={-90} max={90} value={form.latitude??''} onChange={(e)=>patch({latitude:e.target.value?Number(e.target.value):null})}/></div></label><label className="auth-field"><span>Longitude</span><div><input type="number" step="any" min={-180} max={180} value={form.longitude??''} onChange={(e)=>patch({longitude:e.target.value?Number(e.target.value):null})}/></div></label><label className="auth-field"><span>Visiting Day</span><div><select value={form.day} onChange={(e)=>patch({day:Number(e.target.value)})}>{days.map((d,i)=><option key={d} value={i}>{d}</option>)}</select></div></label><label className="auth-field"><span>Visiting Time</span><div className="time-pair"><input type="time" value={form.start} onChange={(e)=>patch({start:e.target.value})}/><input type="time" value={form.end} onChange={(e)=>patch({end:e.target.value})}/></div></label></div><label className="provider-text-field"><span>Chamber Address *</span><textarea required rows={3} value={form.address} onChange={(e)=>patch({address:e.target.value})}/></label><StepActions onPrevious={onPrevious} saving={saving}/></form>;
}

function DoctorAboutStep({onError,onNext,onPrevious}:StepProps){
  const [bn,setBn]=useState('');const [en,setEn]=useState('');const [saving,setSaving]=useState(false);const [dirty,setDirty]=useState(false);useUnsavedWarning(dirty);
  useEffect(()=>{getMyDoctorPublicContent().then(c=>{setBn(c?.bio_bn||'');setEn(c?.bio_en||'');}).catch(e=>onError(messageFrom(e)));},[onError]);
  async function save(e:FormEvent){e.preventDefault();setSaving(true);onError(null);try{await saveMyDoctorAbout(bn,en);setDirty(false);await onNext();}catch(e){onError(messageFrom(e));}finally{setSaving(false);}}
  return <form className="onboarding-card professional-step-card" onSubmit={save}><header><UserRound/><div><small>Step 5</small><h2>About Doctor</h2><p>Professional experience, area of expertise বা career information লিখুন। এই section public profile-এ show হবে এবং optional।</p></div></header><div className="onboarding-public-note"><ShieldCheck/><span><strong>Public & Optional</strong><small>এখন Skip করতে পারেন; পরে Public Content Management থেকে add/edit করা যাবে।</small></span></div><label className="provider-text-field"><span>About Doctor</span><textarea rows={6} value={bn} onChange={e=>{setBn(e.target.value);setDirty(true);}} placeholder="Professional experience, expertise, career information..."/></label><label className="provider-text-field"><span>English (optional)</span><textarea rows={4} value={en} onChange={e=>{setEn(e.target.value);setDirty(true);}}/></label><StepActions onPrevious={onPrevious} saving={saving} onSkip={()=>void onNext()}/></form>;
}

function DoctorServicesStep({onError,onNext,onPrevious}:StepProps){
  const [content,setContent]=useState<DoctorPublicContent|null>(null);const [name,setName]=useState('');const [description,setDescription]=useState('');const [saving,setSaving]=useState(false);
  async function load(){setContent(await getMyDoctorPublicContent());}
  useEffect(()=>{load().catch(e=>onError(messageFrom(e)));},[onError]);
  async function add(){if(!name.trim())return;setSaving(true);onError(null);try{await doctorServices.create({name:{bn:name.trim()},description:description.trim()?{bn:description.trim()}: {},is_active:true,sort_order:(content?.services.length||0)+1});setName('');setDescription('');await load();}catch(e){onError(messageFrom(e));}finally{setSaving(false);}}
  async function remove(id:number){setSaving(true);try{await doctorServices.remove(id);await load();}catch(e){onError(messageFrom(e));}finally{setSaving(false);}}
  return <section className="onboarding-card professional-step-card"><header><Stethoscope/><div><small>Step 6</small><h2>Service List</h2><p>Existing service management system reuse হচ্ছে। Service না দিয়েও continue করা যাবে।</p></div></header><div className="onboarding-public-note"><ShieldCheck/><span><strong>Public & Optional</strong><small>Later Public Content Management থেকে add/edit/delete করা যাবে।</small></span></div><div className="onboarding-inline-editor"><input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Dental Consultation"/><input value={description} onChange={e=>setDescription(e.target.value)} placeholder="Short description (optional)"/><button type="button" className="secondary-action" disabled={saving||!name.trim()} onClick={()=>void add()}><Save/> Add Service</button></div><div className="onboarding-simple-list">{content?.services?.length?content.services.map(item=><div key={item.id}><span><strong>{item.name.bn||item.name.en||'Service'}</strong><small>{item.description?.bn||item.description?.en||''}</small></span><button type="button" disabled={saving} onClick={()=>void remove(item.id)} aria-label="Delete service"><Trash2/></button></div>):<p>কোনো service যোগ করা হয়নি। চাইলে Skip করুন।</p>}</div><div className="onboarding-step-actions"><button type="button" className="secondary-action" onClick={onPrevious}><ArrowLeft/> Back</button><button type="button" className="secondary-action onboarding-skip-action" disabled={saving} onClick={()=>void onNext()}>Skip</button><button type="button" className="auth-submit" disabled={saving} onClick={()=>void onNext()}>Save & Continue <ArrowRight/></button></div></section>;
}

function DoctorTreatmentCostStep({onError,onComplete,onPrevious,working}:{onError:(m:string|null)=>void;onComplete:()=>Promise<void>;onPrevious:()=>Promise<void>|void;working:boolean}){
  const [content,setContent]=useState<DoctorPublicContent|null>(null);const [name,setName]=useState('');const [min,setMin]=useState('');const [max,setMax]=useState('');const [note,setNote]=useState('');const [saving,setSaving]=useState(false);
  async function load(){setContent(await getMyDoctorPublicContent());}
  useEffect(()=>{load().catch(e=>onError(messageFrom(e)));},[onError]);
  async function add(){if(!name.trim())return;setSaving(true);onError(null);try{await doctorTreatmentCosts.create({name:{bn:name.trim()},cost:{min:min?Number(min):null,max:max?Number(max):null,note_bn:note.trim()||null},sort_order:(content?.treatment_costs.length||0)+1});setName('');setMin('');setMax('');setNote('');await load();}catch(e){onError(messageFrom(e));}finally{setSaving(false);}}
  async function remove(id:number){setSaving(true);try{await doctorTreatmentCosts.remove(id);await load();}catch(e){onError(messageFrom(e));}finally{setSaving(false);}}
  return <section className="onboarding-card professional-step-card"><header><GraduationCap/><div><small>Step 7</small><h2>Treatment Cost</h2><p>Treatment/service অনুযায়ী cost add করুন। এই step optional এবং existing treatment-cost structure reuse করে।</p></div></header><div className="onboarding-public-note"><ShieldCheck/><span><strong>Public & Optional</strong><small>Skip করেও onboarding complete করা যাবে; পরে add/edit করা যাবে।</small></span></div><div className="onboarding-inline-editor cost"><input value={name} onChange={e=>setName(e.target.value)} placeholder="Treatment / Service"/><input type="number" min="0" value={min} onChange={e=>setMin(e.target.value)} placeholder="Min cost"/><input type="number" min="0" value={max} onChange={e=>setMax(e.target.value)} placeholder="Max cost"/><input value={note} onChange={e=>setNote(e.target.value)} placeholder="Note (optional)"/><button type="button" className="secondary-action" disabled={saving||!name.trim()} onClick={()=>void add()}><Save/> Add Cost</button></div><div className="onboarding-simple-list">{content?.treatment_costs?.length?content.treatment_costs.map(item=><div key={item.id}><span><strong>{item.name.bn||item.name.en||'Treatment'}</strong><small>{[item.cost.min,item.cost.max].filter(v=>v!=null).join(' – ') || item.cost.note_bn || 'Cost note'}</small></span><button type="button" disabled={saving} onClick={()=>void remove(item.id)} aria-label="Delete cost"><Trash2/></button></div>):<p>কোনো treatment cost যোগ করা হয়নি।</p>}</div><div className="onboarding-complete-note"><Check/><span><strong>Onboarding Complete</strong><small>Complete করলে server required data validate করবে এবং Doctor Dashboard-এ redirect করবে।</small></span></div><div className="onboarding-step-actions"><button type="button" className="secondary-action" onClick={onPrevious}><ArrowLeft/> Back</button><button type="button" className="secondary-action onboarding-skip-action" disabled={working||saving} onClick={()=>void onComplete()}>Skip & Complete</button><button type="button" className="auth-submit" disabled={working||saving} onClick={()=>void onComplete()}>{working?<LoaderCircle className="spin"/>:<><Check/> Complete Onboarding</>}</button></div></section>;
}

function HospitalDetailsStep({ onError, onNext, onPrevious }: StepProps) {
  const { account } = useAuth();
  const [provider,setProvider]=useState<ProviderDashboardItem|null>(null);const [name,setName]=useState('');const [nameEn,setNameEn]=useState('');const [description,setDescription]=useState('');const [departments,setDepartments]=useState('');const [services,setServices]=useState('');const [saving,setSaving]=useState(false);
  useEffect(()=>{getMyProviderDashboard().then(rows=>{const p=rows[0]||null;setProvider(p);if(p){setName(p.name_bn);setNameEn(p.name_en||'');setDescription(p.short_description||'');setDepartments(p.departments.join(', '));setServices(p.services.join(', '));}}).catch(e=>onError(messageFrom(e)));},[]);
  async function submit(e:FormEvent){e.preventDefault();setSaving(true);onError(null);try{const input=providerBase(provider);const r=await saveMyProviderProfile({...input,providerId:provider?.id||null,nameBn:name,nameEn:nameEn||null,shortDescription:description||null,phone:provider?.phone||account?.phone||null,email:provider?.email||account?.email||null,departments:splitCsv(departments),services:splitCsv(services)});if(!provider){const rows=await getMyProviderDashboard();setProvider(rows.find(x=>x.id===r.provider_id)||rows[0]||null);}await onNext();}catch(err){onError(messageFrom(err));}finally{setSaving(false);}}
  return <form className="onboarding-card professional-step-card" onSubmit={submit}><header><Building2/><div><small>Step 2</small><h2>Hospital Details</h2><p>Existing Provider profile-এই save হবে।</p></div></header><div className="patient-form-grid"><label className="auth-field"><span>Hospital / Clinic Name</span><div><input required minLength={2} value={name} onChange={e=>setName(e.target.value)}/></div></label><label className="auth-field"><span>English Name</span><div><input value={nameEn} onChange={e=>setNameEn(e.target.value)}/></div></label></div><label className="provider-text-field"><span>Short Description</span><textarea rows={4} value={description} onChange={e=>setDescription(e.target.value)}/></label><label className="provider-text-field"><span>Departments <small>comma separated</small></span><textarea rows={2} value={departments} onChange={e=>setDepartments(e.target.value)}/></label><label className="provider-text-field"><span>Services <small>comma separated</small></span><textarea rows={2} value={services} onChange={e=>setServices(e.target.value)}/></label><StepActions onPrevious={onPrevious} saving={saving}/></form>;
}

function HospitalLocationStep({ onError, onNext, onPrevious }: StepProps) {
  const [provider,setProvider]=useState<ProviderDashboardItem|null>(null);const [districts,setDistricts]=useState<District[]>([]);const [upazilas,setUpazilas]=useState<Upazila[]>([]);const [saving,setSaving]=useState(false);const [gps,setGps]=useState(false);
  useEffect(()=>{Promise.all([getMyProviderDashboard(),getDistricts()]).then(([rows,d])=>{setProvider(rows[0]||null);setDistricts(d);}).catch(e=>onError(messageFrom(e)));},[]);
  useEffect(()=>{if(!provider?.district_id){setUpazilas([]);return;}getUpazilas(provider.district_id).then(setUpazilas).catch(e=>onError(messageFrom(e)));},[provider?.district_id]);
  const set=(key:keyof ProviderDashboardItem,value:unknown)=>setProvider(p=>p?({...p,[key]:value} as ProviderDashboardItem):p);
  async function capture(){setGps(true);onError(null);try{const c=await captureCurrentCoordinates();const loc=await resolveLocationContext(c.latitude,c.longitude);setProvider(p=>p?({...p,latitude:c.latitude,longitude:c.longitude,district_id:loc?.district_id??p.district_id,upazila_id:loc?.upazila_id??p.upazila_id}):p);}catch(e){onError(messageFrom(e));}finally{setGps(false);}}
  async function submit(e:FormEvent){e.preventDefault();if(!provider){onError('আগে Hospital Details save করুন।');return;}const ce=validateCoordinates(provider.latitude,provider.longitude);if(ce){onError(ce);return;}setSaving(true);onError(null);try{await saveMyProviderProfile(providerBase(provider));await onNext();}catch(err){onError(messageFrom(err));}finally{setSaving(false);}}
  if(!provider)return <div className="loading-box"><LoaderCircle className="spin"/> Hospital profile লোড হচ্ছে…</div>;
  return <form className="onboarding-card professional-step-card" onSubmit={submit}><header><MapPin/><div><small>Step 3</small><h2>Location & Contact</h2><p>Hospital-specific existing provider model ব্যবহার হচ্ছে।</p></div></header><div className="provider-location-guide onboarding-location-guide"><Crosshair/><div><strong>সঠিক Hospital location সেট করুন</strong><p>প্রতিষ্ঠানে physically উপস্থিত থেকে Current Location ব্যবহার করা ভালো। GPS permission দিন, coordinate/district verify করে Save করুন।</p></div><button type="button" disabled={gps} onClick={()=>void capture()}>{gps?<LoaderCircle className="spin"/>:<Crosshair/>} Current Location</button></div><div className="patient-form-grid"><label className="auth-field"><span>Phone</span><div><Phone/><input inputMode="tel" value={provider.phone||''} onChange={e=>set('phone',e.target.value)}/></div></label><label className="auth-field"><span>Email</span><div><Mail/><input type="email" value={provider.email||''} onChange={e=>set('email',e.target.value)}/></div></label><label className="auth-field"><span>WhatsApp</span><div><Phone/><input inputMode="tel" value={provider.whatsapp||''} onChange={e=>set('whatsapp',e.target.value)}/></div></label><label className="auth-field"><span>District</span><div><MapPin/><select required value={provider.district_id??''} onChange={e=>{set('district_id',e.target.value?Number(e.target.value):null);set('upazila_id',null)}}><option value="">নির্বাচন করুন</option>{districts.map(d=><option key={d.id} value={d.id}>{d.name_bn}</option>)}</select></div></label><label className="auth-field"><span>Upazila / Area</span><div><MapPin/><select value={provider.upazila_id??''} onChange={e=>set('upazila_id',e.target.value?Number(e.target.value):null)}><option value="">নির্বাচন করুন</option>{upazilas.map(u=><option key={u.id} value={u.id}>{u.name_bn}</option>)}</select></div></label><label className="auth-field"><span>Latitude</span><div><input type="number" min={-90} max={90} step="any" value={provider.latitude??''} onChange={e=>set('latitude',e.target.value?Number(e.target.value):null)}/></div></label><label className="auth-field"><span>Longitude</span><div><input type="number" min={-180} max={180} step="any" value={provider.longitude??''} onChange={e=>set('longitude',e.target.value?Number(e.target.value):null)}/></div></label></div><label className="provider-text-field"><span>Address</span><textarea required rows={3} value={provider.address||''} onChange={e=>set('address',e.target.value)}/></label><StepActions onPrevious={onPrevious} saving={saving}/></form>;
}

function HospitalVerificationStep({ onError, onNext, onPrevious }: StepProps) {
  const [provider,setProvider]=useState<ProviderDashboardItem|null>(null);const [evidence,setEvidence]=useState<OwnerVerificationEvidence|null>(null);const [file,setFile]=useState<File|null>(null);const [docType,setDocType]=useState('trade_license');const [saving,setSaving]=useState(false);
  async function load(){const rows=await getMyProviderDashboard();const p=rows[0]||null;setProvider(p);if(p)setEvidence(await getMyEntityVerificationEvidence('provider',p.id));}
  useEffect(()=>{load().catch(e=>onError(messageFrom(e)));},[]);
  async function upload(){if(!provider||!file)return;setSaving(true);onError(null);try{await uploadEntityVerificationDocument({entityType:'provider',entityId:provider.id,documentType:docType,file});setFile(null);await load();}catch(e){onError(messageFrom(e));}finally{setSaving(false);}}
  async function remove(doc:VerificationEvidenceDocument){setSaving(true);try{await deleteEntityVerificationDocument(doc.document_id);await load();}catch(e){onError(messageFrom(e));}finally{setSaving(false);}}
  async function submit(e:FormEvent){e.preventDefault();await onNext();}
  if(!provider)return <div className="loading-box"><LoaderCircle className="spin"/> Hospital verification লোড হচ্ছে…</div>;
  return <form className="onboarding-card professional-step-card" onSubmit={submit}><header><FileCheck2/><div><small>Step 4</small><h2>Hospital Verification</h2><p>Existing provider verification evidence ও review queue preserve করা হয়েছে।</p></div></header><div className={`identity-status ${provider.verified?'verified':'pending'}`}><ShieldCheck/><span><strong>{provider.verified?'Verified':'Not verified yet'}</strong><small>Publication-এর existing Hospital verification policy অপরিবর্তিত।</small></span></div><EvidenceEditor evidence={evidence} file={file} setFile={setFile} documentType={docType} setDocumentType={setDocType} onUpload={upload} onDelete={remove} onError={onError}/><StepActions onPrevious={onPrevious} saving={saving} label="Continue"/></form>;
}

function EvidenceEditor({ evidence,file,setFile,documentType,setDocumentType,onUpload,onDelete,onError,doctor=false,disabled=false }:{evidence:OwnerVerificationEvidence|null;file:File|null;setFile:(f:File|null)=>void;documentType:string;setDocumentType:(v:string)=>void;onUpload:()=>Promise<void>;onDelete:(d:VerificationEvidenceDocument)=>Promise<void>;onError:(message:string|null)=>void;doctor?:boolean;disabled?:boolean}) {
  const options=doctor?[['bmdc_certificate','BMDC certificate'],['medical_degree','Medical degree'],['national_id','National ID'],['other','Other']]:[['trade_license','Trade license'],['organization_document','Organization document'],['facility_photo','Facility photo'],['other','Other']];
  const [preview,setPreview]=useState<string|null>(null);
  useEffect(()=>{if(!file){setPreview(null);return;}if(!file.type.startsWith('image/')){setPreview(null);return;}const url=URL.createObjectURL(file);setPreview(url);return()=>URL.revokeObjectURL(url);},[file]);
  function handleSelect(e:ChangeEvent<HTMLInputElement>){
    const selected=e.target.files?.[0]||null;
    e.target.value='';
    if(!selected)return;
    const isPdf=selected.type==='application/pdf';
    const isImage=selected.type.startsWith('image/');
    if(!isPdf && !isImage){onError('JPG, PNG, WebP, AVIF অথবা PDF document দিন।');setFile(null);return;}
    if(selected.size>3*1024*1024){onError('ছবি/document সর্বোচ্চ 3 MB হতে হবে। এই ফাইলটি এর চেয়ে বড়, তাই select হয়নি।');setFile(null);return;}
    onError(null);
    setFile(selected);
  }
  return <section className="onboarding-evidence"><header><FilePlus2/><div><h3>Verification evidence</h3><p>Documents private verification-documents bucket-এ থাকবে। ছবি select করার সাথে সাথে preview দেখা যাবে।</p></div></header><div className="evidence-upload-row"><select disabled={disabled} value={documentType} onChange={e=>setDocumentType(e.target.value)}>{options.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select><input disabled={disabled} type="file" data-skip-global-guard="true" accept="image/jpeg,image/png,image/webp,image/avif,application/pdf" onChange={handleSelect}/>{preview&&<img src={preview} alt="Selected document preview" style={{maxWidth:'160px',maxHeight:'120px',objectFit:'contain'}}/>}{file&&!preview&&<small>{file.name} নির্বাচিত হয়েছে (PDF preview হয় না)</small>}<small className="image-upload-hint">ছবি হলে সর্বোচ্চ 3 MB • select করার সাথে preview দেখা যাবে • upload-এর সময় auto compress হবে • PDF অপরিবর্তিত</small><button type="button" className="secondary-action" disabled={disabled||!file} onClick={()=>void onUpload()}><FilePlus2/> Upload</button></div><div className="onboarding-evidence-list">{evidence?.documents.length ? evidence.documents.map(doc=><div key={doc.document_id}><FileCheck2/><span><strong>{doc.document_type.replaceAll('_',' ')}</strong><small>{formatDateSafe(doc.created_at, 'bn-BD', { dateStyle: 'medium' }, 'তারিখ নেই')}</small></span><button type="button" disabled={disabled} onClick={()=>void onDelete(doc)} aria-label="Delete document"><Trash2/></button></div>):<p>Evidence এখনো upload করা হয়নি। চাইলে পরে dashboard থেকেও যোগ করতে পারবেন।</p>}</div></section>;
}

function CompleteStep({ role,working,onFinish,onPrevious }:{role:'doctor'|'hospital';working:boolean;onFinish:()=>void;onPrevious:()=>void}) {
  return <section className="onboarding-card professional-step-card onboarding-complete-card"><span className="complete-icon"><Check/></span><small>Step 5</small><h2>Registration setup সম্পূর্ণ করার জন্য প্রস্তুত</h2><p>{role==='doctor'?'Visiting Card, Chamber Details এবং Verification information canonical records-এ save হয়েছে।':'Hospital profile, location/contact এবং verification evidence existing provider records-এ save হয়েছে।'}</p><div className="onboarding-complete-note"><ShieldCheck/><span><strong>Final server validation</strong><small>Required role data যাচাই হবে। Identity OTP/Phone verification এই onboarding flow-এর অংশ নয়।</small></span></div><div className="onboarding-step-actions"><button className="secondary-action" type="button" onClick={onPrevious}><ArrowLeft/> Previous</button><button className="auth-submit" type="button" disabled={working} onClick={onFinish}>{working?<LoaderCircle className="spin"/>:<><Check/> Complete & Open Dashboard</>}</button></div></section>;
}

function splitCsv(value:string){return value.split(',').map(x=>x.trim()).filter(Boolean);}
function providerBase(provider:ProviderDashboardItem|null){return {providerId:provider?.id||null,nameBn:provider?.name_bn||'',nameEn:provider?.name_en||null,shortDescription:provider?.short_description||null,aboutBn:provider?.about_bn||null,aboutEn:provider?.about_en||null,logoUrl:provider?.logo_url||null,bannerUrl:provider?.banner_url||null,phone:provider?.phone||null,whatsapp:provider?.whatsapp||null,email:provider?.email||null,facebookUrl:provider?.facebook_url||null,websiteUrl:provider?.website_url||null,address:provider?.address||null,districtId:provider?.district_id||null,upazilaId:provider?.upazila_id||null,latitude:provider?.latitude||null,longitude:provider?.longitude||null,googleMapsUrl:provider?.google_maps_url||null,openingNote:provider?.opening_note||null,emergencyAvailable:provider?.emergency_available||false,departments:provider?.departments||[],services:provider?.services||[],galleryPaths:provider?.gallery_paths||[]};}
