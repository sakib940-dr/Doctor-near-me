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
import { completeAccountOnboarding, finishMyRoleOnboarding, setMyOnboardingStep } from '../services/account';
import {
  cleanupDoctorPhoto, getMyDoctorProfile, saveMyChamberSchedule, saveMyDoctorChamber,
  updateMyDoctorVisitingCard, uploadDoctorPhoto,
} from '../services/doctorDashboard';
import { getDistricts, getSpecialties, getUpazilas, resolveLocationContext } from '../services/discovery';
import { getMyProviderDashboard, saveMyProviderProfile } from '../services/providerDashboard';
import {
  deleteEntityVerificationDocument, getMyDoctorVerificationProfile,
  getMyEntityVerificationEvidence, updateMyDoctorVerificationInfo,
  uploadEntityVerificationDocument,
} from '../services/verification';
import type {
  District, MyDoctorProfile, OwnerVerificationEvidence,
  ProviderDashboardItem, PublicRegistrationRole, Specialty, Upazila, VerificationEvidenceDocument,
} from '../types';

const allowedRoles: PublicRegistrationRole[] = ['patient', 'doctor', 'hospital', 'ambulance'];
const roleLabels: Record<PublicRegistrationRole, string> = {
  patient: 'রোগী / সাধারণ ব্যবহারকারী', doctor: 'ডাক্তার', hospital: 'হাসপাতাল / ক্লিনিক', ambulance: 'অ্যাম্বুলেন্স সেবা',
};
const doctorSteps = ['Account / Basic', 'Visiting Card', 'Chamber Details', 'Verification', 'Complete'];
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
  const [step, setStep] = useState(Math.max(1, Math.min(5, account?.onboarding_step || 1)));
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (account?.role && allowedRoles.includes(account.role as PublicRegistrationRole)) setRole(account.role as PublicRegistrationRole);
    if (account?.onboarding_step) setStep(Math.max(1, Math.min(5, account.onboarding_step)));
  }, [account?.role, account?.onboarding_step]);

  if (!loading && account?.onboarding_completed) return <Navigate to="/dashboard" replace />;
  if (!loading && !user) return <Navigate to="/auth" replace />;

  async function goStep(next: number) {
    setError(null); setNotice(null);
    if (isProfessionalRole(role)) await setMyOnboardingStep(next);
    setStep(next);
    await refreshAccount();
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
            <h1>{isProfessionalRole(role) ? 'ধাপে ধাপে onboarding সম্পূর্ণ করুন' : 'আপনার প্রোফাইল সম্পূর্ণ করুন'}</h1>
            <p>{isProfessionalRole(role) ? 'প্রতিটি ধাপ database-এ save হবে। Refresh বা Previous করলে saved তথ্য হারাবে না।' : 'সঠিক dashboard ও এলাকার সেবা দেখানোর জন্য মৌলিক তথ্য দিন।'}</p>
          </section>

          {isProfessionalRole(role) && <ProgressSteps labels={steps} current={step} />}
          {error && <div className="auth-message error onboarding-global-message" role="alert">{error}</div>}
          {notice && <div className="auth-message success onboarding-global-message">{notice}</div>}

          {step === 1 && <BasicStep
            userEmail={user?.email || account?.email || ''}
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

          {role === 'doctor' && step === 2 && <DoctorVisitingStep onError={setError} onNext={() => goStep(3)} onPrevious={() => goStep(1)} />}
          {role === 'doctor' && step === 3 && <DoctorChamberStep onError={setError} onNext={() => goStep(4)} onPrevious={() => goStep(2)} />}
          {role === 'doctor' && step === 4 && <DoctorVerificationStep onError={setError} onNext={() => goStep(5)} onPrevious={() => goStep(3)} />}
          {role === 'doctor' && step === 5 && <CompleteStep role="doctor" working={working === 'finish'} onFinish={() => void finish()} onPrevious={() => void goStep(4)} />}

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

function BasicStep({ userEmail, initialName, initialRole, roleLocked, initialDistrictId, initialUpazilaId, onRole, onError, onSaved }: {
  userEmail: string; initialName: string; initialRole: PublicRegistrationRole; roleLocked: boolean; initialDistrictId: number | null; initialUpazilaId: number | null;
  onRole: (role: PublicRegistrationRole) => void; onError: (message: string | null) => void; onSaved: (role: PublicRegistrationRole) => Promise<void>;
}) {
  const [fullName, setFullName] = useState(initialName);
  const [role, setRole] = useState(initialRole);
  const [districtId, setDistrictId] = useState(initialDistrictId ? String(initialDistrictId) : '');
  const [upazilaId, setUpazilaId] = useState(initialUpazilaId ? String(initialUpazilaId) : '');
  const [districts, setDistricts] = useState<District[]>([]);
  const [upazilas, setUpazilas] = useState<Upazila[]>([]);
  const [working, setWorking] = useState(false);
  useEffect(() => { getDistricts().then(setDistricts).catch((e) => onError(messageFrom(e))); }, []);
  useEffect(() => { if (!districtId) { setUpazilas([]); return; } getUpazilas(Number(districtId)).then(setUpazilas).catch((e) => onError(messageFrom(e))); }, [districtId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); onError(null);
    setWorking(true);
    try {
      await completeAccountOnboarding({ fullName, role, districtId: districtId ? Number(districtId) : null, upazilaId: upazilaId ? Number(upazilaId) : null });
      await onSaved(role);
    } catch (saveError) { onError(messageFrom(saveError)); }
    finally { setWorking(false); }
  }

  return <div className="onboarding-step-stack"><form className="onboarding-card professional-step-card" onSubmit={submit}><header><UserRound /><div><small>Step 1</small><h2>Account / Basic Information</h2><p>Phone Number registration-এর সময় account-এ save হয়েছে। Onboarding-এ কোনো Phone OTP বা verification step নেই।</p></div></header><div className="patient-form-grid"><label className="auth-field"><span>পূর্ণ নাম</span><div><UserRound /><input required minLength={2} value={fullName} onChange={(e) => setFullName(e.target.value)} /></div></label><label className="auth-field"><span>Email Address</span><div><Mail /><input readOnly value={userEmail} /></div></label><label className="auth-field"><span>Account Type</span><div><UserRound /><select value={role} disabled={roleLocked} onChange={(e) => { const next=e.target.value as PublicRegistrationRole; setRole(next); onRole(next); }}>{allowedRoles.map((item) => <option key={item} value={item}>{roleLabels[item]}</option>)}</select></div>{roleLocked && <small className="field-helper">Professional account type signup-এর পরে self-change করা যায় না।</small>}</label></div><div className="onboarding-locations"><label className="auth-field"><span>জেলা</span><div><MapPin /><select value={districtId} onChange={(e) => { setDistrictId(e.target.value); setUpazilaId(''); }}><option value="">জেলা নির্বাচন করুন</option>{districts.map((d) => <option key={d.id} value={d.id}>{d.name_bn}</option>)}</select></div></label><label className="auth-field"><span>উপজেলা / এলাকা</span><div><MapPin /><select disabled={!districtId} value={upazilaId} onChange={(e) => setUpazilaId(e.target.value)}><option value="">উপজেলা / এলাকা নির্বাচন করুন</option>{upazilas.map((u) => <option key={u.id} value={u.id}>{u.name_bn}</option>)}</select></div></label></div><button className="auth-submit" disabled={working}>{working ? <LoaderCircle className="spin" /> : <>Save & Continue <ArrowRight /></>}</button></form></div>;
}

function StepActions({ onPrevious, saving, label='Save & Continue' }: { onPrevious: () => void; saving: boolean; label?: string }) {
  return <div className="onboarding-step-actions"><button type="button" className="secondary-action" onClick={onPrevious}><ArrowLeft /> Previous</button><button className="auth-submit" disabled={saving}>{saving ? <LoaderCircle className="spin" /> : <><Save /> {label} <ArrowRight /></>}</button></div>;
}

function DoctorVisitingStep({ onError, onNext, onPrevious }: StepProps) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<MyDoctorProfile | null>(null);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [photo, setPhoto] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { Promise.all([getMyDoctorProfile(), getSpecialties()]).then(([p,s]) => { setProfile(p); setSpecialties(s); }).catch((e) => onError(messageFrom(e))); }, []);
  const setDoctor = (key: keyof MyDoctorProfile['doctor'], value: string | null) => setProfile((p) => p ? ({ ...p, doctor: { ...p.doctor, [key]: value } }) : p);
  function toggle(id: number) { setProfile((p) => p ? ({ ...p, specialty_ids: p.specialty_ids.includes(id) ? p.specialty_ids.filter((x) => x!==id) : [...p.specialty_ids,id] }) : p); }
  async function submit(e: FormEvent) { e.preventDefault(); if (!profile || !user) return; if (!profile.specialty_ids.length) { onError('কমপক্ষে একটি Specialty নির্বাচন করুন।'); return; } setSaving(true); onError(null); const previousPath=profile.doctor.profile_photo_url; let uploadedPath:string|null=null; try { let path=previousPath; if (photo) { uploadedPath=await uploadDoctorPhoto(photo,user.id); path=uploadedPath; } await updateMyDoctorVisitingCard({ fullName: profile.doctor.full_name || '', profilePhotoUrl:path, professionalTitle:profile.doctor.professional_title, degree:profile.doctor.degree, designation:profile.doctor.designation, bmdcRegistrationNo:profile.doctor.bmdc_registration_no, medicalCollege:profile.doctor.medical_college, presentJob:profile.doctor.present_job, specialtyIds:profile.specialty_ids }); if(uploadedPath&&previousPath&&previousPath!==uploadedPath) await cleanupDoctorPhoto(previousPath).catch(()=>undefined); await onNext(); } catch(err){if(uploadedPath) await cleanupDoctorPhoto(uploadedPath).catch(()=>undefined);onError(messageFrom(err));} finally{setSaving(false);} }
  if (!profile) return <div className="loading-box"><LoaderCircle className="spin" /> Visiting Card লোড হচ্ছে…</div>;
  return <form className="onboarding-card professional-step-card" onSubmit={submit}><header><Stethoscope /><div><small>Step 2</small><h2>Visiting Card</h2><p>Existing Doctor Visiting Card data source-এই save হবে।</p></div></header><div className="patient-form-grid"><label className="auth-field"><span>Doctor Name</span><div><input required value={profile.doctor.full_name || ''} onChange={(e)=>setDoctor('full_name',e.target.value)} /></div></label><label className="auth-field"><span>Professional Title</span><div><input value={profile.doctor.professional_title || ''} onChange={(e)=>setDoctor('professional_title',e.target.value)} /></div></label><label className="auth-field"><span>Degree</span><div><input value={profile.doctor.degree || ''} onChange={(e)=>setDoctor('degree',e.target.value)} placeholder="MBBS, FCPS" /></div></label><label className="auth-field"><span>Designation</span><div><input value={profile.doctor.designation || ''} onChange={(e)=>setDoctor('designation',e.target.value)} /></div></label><label className="auth-field"><span>BMDC Number</span><div><input value={profile.doctor.bmdc_registration_no || ''} onChange={(e)=>setDoctor('bmdc_registration_no',e.target.value)} /></div></label><label className="auth-field"><span>Medical College</span><div><input value={profile.doctor.medical_college || ''} onChange={(e)=>setDoctor('medical_college',e.target.value)} /></div></label><label className="auth-field"><span>Present Job / Hospital</span><div><input value={profile.doctor.present_job || ''} onChange={(e)=>setDoctor('present_job',e.target.value)} /></div></label><label className="auth-field"><span>Profile Photo</span><div><input type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={(e)=>setPhoto(e.target.files?.[0] || null)} /></div><small className="image-upload-hint">প্রস্তাবিত সাইজ: 800×800 px • সর্বোচ্চ 3 MB • আপলোডের পর ছবি স্বয়ংক্রিয়ভাবে অপটিমাইজ হবে</small></label></div><fieldset className="specialty-picker onboarding-specialty-picker"><legend>Specialty</legend>{specialties.map((s)=><label key={s.id} className={profile.specialty_ids.includes(s.id)?'selected':''}><input type="checkbox" checked={profile.specialty_ids.includes(s.id)} onChange={()=>toggle(s.id)} /><span>{s.name_bn}</span></label>)}</fieldset><StepActions onPrevious={onPrevious} saving={saving} /></form>;
}

interface StepProps { onError: (message:string|null)=>void; onNext:()=>Promise<void>; onPrevious:()=>Promise<void>|void; }

function DoctorChamberStep({ onError, onNext, onPrevious }: StepProps) {
  const [profile,setProfile]=useState<MyDoctorProfile|null>(null); const [districts,setDistricts]=useState<District[]>([]); const [upazilas,setUpazilas]=useState<Upazila[]>([]); const [saving,setSaving]=useState(false); const [gps,setGps]=useState(false);
  const owned=useMemo(()=>profile?.chambers.find((c)=>c.owned_by_doctor) || null,[profile]);
  const [form,setForm]=useState({providerId:null as string|null,name:'',address:'',phone:'',districtId:null as number|null,upazilaId:null as number|null,latitude:null as number|null,longitude:null as number|null,day:0,start:'',end:'',fee:''});
  useEffect(()=>{Promise.all([getMyDoctorProfile(),getDistricts()]).then(([p,d])=>{setProfile(p);setDistricts(d); const c=p?.chambers.find((x)=>x.owned_by_doctor); if(c){const sch=c.schedules[0];setForm({providerId:c.id,name:c.name_bn,address:c.address||'',phone:c.phone||p?.doctor.phone||'',districtId:c.district_id??null,upazilaId:c.upazila_id??null,latitude:c.latitude??null,longitude:c.longitude??null,day:sch?.day_of_week??0,start:sch?.start_time?.slice(0,5)||'',end:sch?.end_time?.slice(0,5)||'',fee:sch?.fee!=null?String(sch.fee):''});} else {setForm(f=>({...f,phone:p?.doctor.phone||''}));}}).catch(e=>onError(messageFrom(e)));},[]);
  useEffect(()=>{if(!form.districtId){setUpazilas([]);return;} getUpazilas(form.districtId).then(setUpazilas).catch(e=>onError(messageFrom(e)));},[form.districtId]);
  async function capture(){setGps(true);onError(null);try{const c=await captureCurrentCoordinates();const loc=await resolveLocationContext(c.latitude,c.longitude);setForm(f=>({...f,latitude:c.latitude,longitude:c.longitude,districtId:loc?.district_id??f.districtId,upazilaId:loc?.upazila_id??f.upazilaId}));}catch(e){onError(messageFrom(e));}finally{setGps(false);}}
  async function submit(e:FormEvent){e.preventDefault();const coordErr=validateCoordinates(form.latitude,form.longitude);if(coordErr){onError(coordErr);return;}setSaving(true);onError(null);try{const r=await saveMyDoctorChamber({providerId:form.providerId,nameBn:form.name,address:form.address,districtId:form.districtId,upazilaId:form.upazilaId,phone:form.phone||null,latitude:form.latitude,longitude:form.longitude});if(form.start&&form.end)await saveMyChamberSchedule({providerId:r.provider_id,dayOfWeek:form.day,startTime:form.start,endTime:form.end,fee:form.fee?Number(form.fee):null,isActive:true,scheduleId:owned?.schedules[0]?.id||null});await onNext();}catch(err){onError(messageFrom(err));}finally{setSaving(false);}}
  return <form className="onboarding-card professional-step-card" onSubmit={submit}><header><Building2 /><div><small>Step 3</small><h2>Chamber Details</h2><p>Existing providers + doctor_provider_links + chamber_schedules model reuse হচ্ছে।</p></div></header><div className="provider-location-guide onboarding-location-guide"><Crosshair/><div><strong>সঠিক chamber location সেট করুন</strong><p>Chamber-এ physically থাকলে Current Location ব্যবহার করুন। GPS permission দিন, coordinate/district verify করে Save করুন। ভুল হলে পরে Chamber Details থেকে update করা যাবে।</p></div><button type="button" onClick={()=>void capture()} disabled={gps}>{gps?<LoaderCircle className="spin"/>:<Crosshair/>} Current Location</button></div><div className="patient-form-grid"><label className="auth-field"><span>Chamber / Hospital Name</span><div><input required minLength={2} value={form.name} onChange={(e)=>setForm(f=>({...f,name:e.target.value}))}/></div></label><label className="auth-field"><span>Contact Number</span><div><input inputMode="tel" value={form.phone} onChange={(e)=>setForm(f=>({...f,phone:e.target.value}))}/></div></label><label className="auth-field"><span>District</span><div><MapPin/><select required value={form.districtId??''} onChange={(e)=>setForm(f=>({...f,districtId:e.target.value?Number(e.target.value):null,upazilaId:null}))}><option value="">নির্বাচন করুন</option>{districts.map(d=><option key={d.id} value={d.id}>{d.name_bn}</option>)}</select></div></label><label className="auth-field"><span>Upazila / Area</span><div><MapPin/><select value={form.upazilaId??''} onChange={(e)=>setForm(f=>({...f,upazilaId:e.target.value?Number(e.target.value):null}))}><option value="">নির্বাচন করুন</option>{upazilas.map(u=><option key={u.id} value={u.id}>{u.name_bn}</option>)}</select></div></label><label className="auth-field"><span>Latitude</span><div><input type="number" step="any" min={-90} max={90} value={form.latitude??''} onChange={(e)=>setForm(f=>({...f,latitude:e.target.value?Number(e.target.value):null}))}/></div></label><label className="auth-field"><span>Longitude</span><div><input type="number" step="any" min={-180} max={180} value={form.longitude??''} onChange={(e)=>setForm(f=>({...f,longitude:e.target.value?Number(e.target.value):null}))}/></div></label><label className="auth-field"><span>Visiting Day</span><div><select value={form.day} onChange={(e)=>setForm(f=>({...f,day:Number(e.target.value)}))}>{days.map((d,i)=><option key={d} value={i}>{d}</option>)}</select></div></label><label className="auth-field"><span>Visiting Time</span><div className="time-pair"><input type="time" value={form.start} onChange={(e)=>setForm(f=>({...f,start:e.target.value}))}/><input type="time" value={form.end} onChange={(e)=>setForm(f=>({...f,end:e.target.value}))}/></div></label></div><label className="provider-text-field"><span>Address</span><textarea required rows={3} value={form.address} onChange={(e)=>setForm(f=>({...f,address:e.target.value}))}/></label><StepActions onPrevious={onPrevious} saving={saving}/></form>;
}

function DoctorVerificationStep({ onError, onNext, onPrevious }: StepProps) {
  const { user }=useAuth(); const [college,setCollege]=useState('');const [session,setSession]=useState('');const [batch,setBatch]=useState('');const [evidence,setEvidence]=useState<OwnerVerificationEvidence|null>(null);const [file,setFile]=useState<File|null>(null);const [docType,setDocType]=useState('bmdc_certificate');const [saving,setSaving]=useState(false);
  async function load(){if(!user)return;const [p,e]=await Promise.all([getMyDoctorVerificationProfile(),getMyEntityVerificationEvidence('doctor',user.id)]);setCollege(p.medical_college||'');setSession(p.medical_session||'');setBatch(p.medical_batch||'');setEvidence(e);}
  useEffect(()=>{load().catch(e=>onError(messageFrom(e)));},[user?.id]);
  async function upload(){if(!user||!file)return;setSaving(true);onError(null);try{await uploadEntityVerificationDocument({entityType:'doctor',entityId:user.id,documentType:docType,file});setFile(null);await load();}catch(e){onError(messageFrom(e));}finally{setSaving(false);}}
  async function remove(doc:VerificationEvidenceDocument){setSaving(true);try{await deleteEntityVerificationDocument(doc.document_id);await load();}catch(e){onError(messageFrom(e));}finally{setSaving(false);}}
  async function submit(e:FormEvent){e.preventDefault();setSaving(true);onError(null);try{await updateMyDoctorVerificationInfo({medicalCollege:college,medicalSession:session,medicalBatch:batch});await onNext();}catch(err){onError(messageFrom(err));}finally{setSaving(false);}}
  return <form className="onboarding-card professional-step-card" onSubmit={submit}><header><FileCheck2/><div><small>Step 4</small><h2>Verification</h2><p>Existing verification evidence ও review queue-ই ব্যবহার হবে।</p></div></header><div className="patient-form-grid"><label className="auth-field"><span>Medical College Name</span><div><GraduationCap/><input required minLength={2} value={college} onChange={e=>setCollege(e.target.value)}/></div></label><label className="auth-field"><span>Session</span><div><input required value={session} onChange={e=>setSession(e.target.value)}/></div></label><label className="auth-field"><span>Batch</span><div><input required value={batch} onChange={e=>setBatch(e.target.value)}/></div></label></div><EvidenceEditor evidence={evidence} file={file} setFile={setFile} documentType={docType} setDocumentType={setDocType} onUpload={upload} onDelete={remove} doctor/><StepActions onPrevious={onPrevious} saving={saving}/></form>;
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
  return <form className="onboarding-card professional-step-card" onSubmit={submit}><header><FileCheck2/><div><small>Step 4</small><h2>Hospital Verification</h2><p>Existing provider verification evidence ও review queue preserve করা হয়েছে।</p></div></header><div className={`identity-status ${provider.verified?'verified':'pending'}`}><ShieldCheck/><span><strong>{provider.verified?'Verified':'Not verified yet'}</strong><small>Publication-এর existing Hospital verification policy অপরিবর্তিত।</small></span></div><EvidenceEditor evidence={evidence} file={file} setFile={setFile} documentType={docType} setDocumentType={setDocType} onUpload={upload} onDelete={remove}/><StepActions onPrevious={onPrevious} saving={saving} label="Continue"/></form>;
}

function EvidenceEditor({ evidence,file,setFile,documentType,setDocumentType,onUpload,onDelete,doctor=false }:{evidence:OwnerVerificationEvidence|null;file:File|null;setFile:(f:File|null)=>void;documentType:string;setDocumentType:(v:string)=>void;onUpload:()=>Promise<void>;onDelete:(d:VerificationEvidenceDocument)=>Promise<void>;doctor?:boolean}) {
  const options=doctor?[['bmdc_certificate','BMDC certificate'],['medical_degree','Medical degree'],['national_id','National ID'],['other','Other']]:[['trade_license','Trade license'],['organization_document','Organization document'],['facility_photo','Facility photo'],['other','Other']];
  return <section className="onboarding-evidence"><header><FilePlus2/><div><h3>Verification evidence</h3><p>Documents private verification-documents bucket-এ থাকবে।</p></div></header><div className="evidence-upload-row"><select value={documentType} onChange={e=>setDocumentType(e.target.value)}>{options.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select><input type="file" accept="image/jpeg,image/png,image/webp,image/avif,application/pdf" onChange={(e:ChangeEvent<HTMLInputElement>)=>setFile(e.target.files?.[0]||null)}/><small className="image-upload-hint">ছবি হলে প্রস্তাবিত সর্বোচ্চ 2200×2200 px • সর্বোচ্চ 3 MB • আপলোডের পর ছবি স্বয়ংক্রিয়ভাবে অপটিমাইজ হবে • PDF অপরিবর্তিত</small><button type="button" className="secondary-action" disabled={!file} onClick={()=>void onUpload()}><FilePlus2/> Upload</button></div><div className="onboarding-evidence-list">{evidence?.documents.length ? evidence.documents.map(doc=><div key={doc.document_id}><FileCheck2/><span><strong>{doc.document_type.replaceAll('_',' ')}</strong><small>{formatDateSafe(doc.created_at, 'bn-BD', { dateStyle: 'medium' }, 'তারিখ নেই')}</small></span><button type="button" onClick={()=>void onDelete(doc)} aria-label="Delete document"><Trash2/></button></div>):<p>Evidence এখনো upload করা হয়নি। চাইলে পরে dashboard থেকেও যোগ করতে পারবেন।</p>}</div></section>;
}

function CompleteStep({ role,working,onFinish,onPrevious }:{role:'doctor'|'hospital';working:boolean;onFinish:()=>void;onPrevious:()=>void}) {
  return <section className="onboarding-card professional-step-card onboarding-complete-card"><span className="complete-icon"><Check/></span><small>Step 5</small><h2>Registration setup সম্পূর্ণ করার জন্য প্রস্তুত</h2><p>{role==='doctor'?'Visiting Card, Chamber Details এবং Verification information canonical records-এ save হয়েছে।':'Hospital profile, location/contact এবং verification evidence existing provider records-এ save হয়েছে।'}</p><div className="onboarding-complete-note"><ShieldCheck/><span><strong>Final server validation</strong><small>Required role data যাচাই হবে। Identity OTP/Phone verification এই onboarding flow-এর অংশ নয়।</small></span></div><div className="onboarding-step-actions"><button className="secondary-action" type="button" onClick={onPrevious}><ArrowLeft/> Previous</button><button className="auth-submit" type="button" disabled={working} onClick={onFinish}>{working?<LoaderCircle className="spin"/>:<><Check/> Complete & Open Dashboard</>}</button></div></section>;
}

function splitCsv(value:string){return value.split(',').map(x=>x.trim()).filter(Boolean);}
function providerBase(provider:ProviderDashboardItem|null){return {providerId:provider?.id||null,nameBn:provider?.name_bn||'',nameEn:provider?.name_en||null,shortDescription:provider?.short_description||null,aboutBn:provider?.about_bn||null,aboutEn:provider?.about_en||null,logoUrl:provider?.logo_url||null,bannerUrl:provider?.banner_url||null,phone:provider?.phone||null,whatsapp:provider?.whatsapp||null,email:provider?.email||null,facebookUrl:provider?.facebook_url||null,websiteUrl:provider?.website_url||null,address:provider?.address||null,districtId:provider?.district_id||null,upazilaId:provider?.upazila_id||null,latitude:provider?.latitude||null,longitude:provider?.longitude||null,googleMapsUrl:provider?.google_maps_url||null,openingNote:provider?.opening_note||null,emergencyAvailable:provider?.emergency_available||false,departments:provider?.departments||[],services:provider?.services||[],galleryPaths:provider?.gallery_paths||[]};}
