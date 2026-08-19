import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Download, FileText, LoaderCircle, Plus, Save, Trash2 } from 'lucide-react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { ClinicalAutocomplete, InstructionAutocomplete, MedicineAutocomplete } from '../components/PrescriptionAutocomplete';
import { useAuth } from '../contexts/AuthContext';
import { downloadPrescriptionPdf } from '../lib/prescriptionPdf';
import { getMyDoctorProfile } from '../services/doctorDashboard';
import {
  getMyPrescriptions,
  getPrescriptionAppointmentContext,
  saveMyPrescription,
  type ClinicalCategory,
  type PrescriptionAppointmentContext,
  type PrescriptionMedicineInput,
  type PrescriptionPayload,
  type PrescriptionSummary,
} from '../services/prescriptions';
import type { DoctorDashboardChamber, MyDoctorProfile } from '../types';

const COMMON_ADVICE = [
  'দিনে দুইবার ফ্লোরাইডযুক্ত টুথপেস্ট দিয়ে দাঁত ব্রাশ করুন।',
  'প্রতিদিন দাঁতের ফাঁক পরিষ্কার করতে ফ্লস বা ইন্টারডেন্টাল ব্রাশ ব্যবহার করুন।',
  'মুখ ও দাঁত পরিষ্কার রাখুন এবং চিকিৎসা করা অংশে অপ্রয়োজনীয় চাপ এড়িয়ে চলুন।',
  'অসাড়তা পুরোপুরি না যাওয়া পর্যন্ত চিকিৎসা করা পাশে চিবানো থেকে বিরত থাকুন।',
  'চিকিৎসা করা দাঁতে অতিরিক্ত শক্ত বা আঠালো খাবার এড়িয়ে চলুন।',
  'দাঁত তোলার পর প্রথম ২৪ ঘণ্টা জোরে কুলি বা বারবার থুতু ফেলা এড়িয়ে চলুন।',
  'দাঁত তোলার পর পরের দিন থেকে হালকা গরম লবণ পানিতে আলতোভাবে কুলি করুন।',
  'চিকিৎসার পর অস্বস্তি থাকলে কয়েক দিন নরম খাবার বেছে নিন।',
  'নির্ধারিত ফলো-আপ তারিখে পুনরায় দেখান।',
  'রক্তপাত বন্ধ না হলে, ফোলা বা ব্যথা বাড়লে, অথবা নতুন জ্বর হলে দ্রুত চিকিৎসকের সঙ্গে যোগাযোগ করুন।',
];

const SECTION_CONFIG: Array<{ label: string; category: ClinicalCategory; key: keyof ClinicalState }> = [
  { label: 'C/C', category: 'chief_complaint', key: 'chiefComplaint' },
  { label: 'H/O', category: 'history', key: 'history' },
  { label: 'O/E', category: 'on_examination', key: 'onExamination' },
  { label: 'Investigation', category: 'investigation', key: 'investigation' },
  { label: 'Treatment Plan', category: 'treatment_plan', key: 'treatmentPlan' },
];

interface ClinicalState {
  chiefComplaint: string[];
  history: string[];
  onExamination: string[];
  investigation: string[];
  treatmentPlan: string[];
}

const EMPTY_CLINICAL: ClinicalState = {
  chiefComplaint: [''],
  history: [''],
  onExamination: [''],
  investigation: [''],
  treatmentPlan: [''],
};

const EMPTY_MEDICINE: PrescriptionMedicineInput = {
  name: '',
  drug_master_id: null,
  dose: '',
  meal_instruction: '',
  duration_days: '',
};

function ageFromDob(dateOfBirth: string | null) {
  if (!dateOfBirth) return '';
  const dob = new Date(`${dateOfBirth}T12:00:00`);
  if (Number.isNaN(dob.getTime())) return '';
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const month = today.getMonth() - dob.getMonth();
  if (month < 0 || (month === 0 && today.getDate() < dob.getDate())) age -= 1;
  return age >= 0 ? String(age) : '';
}

function filterLines(lines: string[]) {
  return lines.map((line) => line.trim()).filter(Boolean);
}

export default function DoctorPrescriptionPage() {
  const { account } = useAuth();
  const [searchParams] = useSearchParams();
  const appointmentId = searchParams.get('appointment');
  const [doctorProfile, setDoctorProfile] = useState<MyDoctorProfile | null>(null);
  const [appointmentContext, setAppointmentContext] = useState<PrescriptionAppointmentContext | null>(null);
  const [selectedChamberId, setSelectedChamberId] = useState('');
  const [patientName, setPatientName] = useState('');
  const [patientAge, setPatientAge] = useState('');
  const [patientGender, setPatientGender] = useState('');
  const [patientMobile, setPatientMobile] = useState('');
  const [patientAddress, setPatientAddress] = useState('');
  const [clinical, setClinical] = useState<ClinicalState>(EMPTY_CLINICAL);
  const [medicineDraft, setMedicineDraft] = useState<PrescriptionMedicineInput>(EMPTY_MEDICINE);
  const [medicines, setMedicines] = useState<PrescriptionMedicineInput[]>([]);
  const [advice, setAdvice] = useState<string[]>([]);
  const [customAdvice, setCustomAdvice] = useState('');
  const [note, setNote] = useState('');
  const [recent, setRecent] = useState<PrescriptionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pdfWorking, setPdfWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [profile, history] = await Promise.all([getMyDoctorProfile(), getMyPrescriptions(12, 0).catch(() => [])]);
        if (!active) return;
        setDoctorProfile(profile);
        setRecent(history);
        const approved = profile?.chambers.filter((chamber) => chamber.link_status === 'approved' && chamber.provider_status === 'approved') ?? [];
        if (approved[0]) setSelectedChamberId(approved[0].id);

        if (appointmentId) {
          const context = await getPrescriptionAppointmentContext(appointmentId);
          if (!active) return;
          setAppointmentContext(context);
          if (context) {
            setPatientName(context.patient_name ?? '');
            setPatientAge(ageFromDob(context.patient_date_of_birth));
            setPatientGender(context.patient_gender ?? '');
            setPatientMobile(context.patient_mobile ?? '');
            setPatientAddress(context.patient_address ?? '');
            if (context.provider_id) setSelectedChamberId(context.provider_id);
          }
        }
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Prescription module লোড করা যায়নি।');
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [appointmentId]);

  const selectedChamber = useMemo<DoctorDashboardChamber | null>(() => {
    return doctorProfile?.chambers.find((chamber) => chamber.id === selectedChamberId) ?? null;
  }, [doctorProfile?.chambers, selectedChamberId]);

  if (account && account.role !== 'doctor') return <Navigate to="/dashboard" replace />;

  function updateClinicalLine(key: keyof ClinicalState, index: number, value: string) {
    setClinical((current) => ({
      ...current,
      [key]: current[key].map((line, lineIndex) => (lineIndex === index ? value : line)),
    }));
  }

  function addClinicalLine(key: keyof ClinicalState) {
    setClinical((current) => ({ ...current, [key]: [...current[key], ''] }));
  }

  function removeClinicalLine(key: keyof ClinicalState, index: number) {
    setClinical((current) => {
      const next = current[key].filter((_, lineIndex) => lineIndex !== index);
      return { ...current, [key]: next.length ? next : [''] };
    });
  }

  function addMedicine() {
    if (!medicineDraft.name.trim()) {
      setError('Medicine name দিন।');
      return;
    }
    setMedicines((current) => [...current, { ...medicineDraft, duration_days: medicineDraft.duration_days.replace(/\D/g, '') }]);
    setMedicineDraft(EMPTY_MEDICINE);
    setError(null);
  }

  function editMedicine(index: number) {
    setMedicineDraft(medicines[index]);
    setMedicines((current) => current.filter((_, itemIndex) => itemIndex !== index));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function buildPayload(): PrescriptionPayload {
    return {
      appointment_id: appointmentContext?.appointment_id ?? null,
      patient_name: patientName.trim(),
      patient_age: patientAge.trim(),
      patient_address: patientAddress.trim(),
      patient_mobile: patientMobile.trim(),
      patient_gender: patientGender.trim(),
      chief_complaint: filterLines(clinical.chiefComplaint),
      history: filterLines(clinical.history),
      on_examination: filterLines(clinical.onExamination),
      investigation: filterLines(clinical.investigation),
      treatment_plan: filterLines(clinical.treatmentPlan),
      medicines: medicines.filter((medicine) => medicine.name.trim()),
      advice,
      note: note.trim(),
    };
  }

  async function savePrescription() {
    const payload = buildPayload();
    if (!payload.patient_name) {
      setError('Patient name দিন।');
      return;
    }
    if (!payload.medicines.length) {
      setError('কমপক্ষে একটি medicine ADD করুন।');
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await saveMyPrescription(payload);
      setSuccess('Prescription save হয়েছে। নতুন dose/খাওয়ার নিয়ম ও clinical text এখন আপনার Recent suggestion-এ থাকবে।');
      setRecent(await getMyPrescriptions(12, 0));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Prescription save করা যায়নি।');
    } finally {
      setSaving(false);
    }
  }

  async function downloadPdf() {
    const payload = buildPayload();
    if (!payload.patient_name) {
      setError('Patient name দিন।');
      return;
    }
    if (!payload.medicines.length) {
      setError('কমপক্ষে একটি medicine ADD করুন।');
      return;
    }
    if (!doctorProfile) return;
    setPdfWorking(true);
    setError(null);
    try {
      await downloadPrescriptionPdf(payload, {
        doctorName: doctorProfile.doctor.full_name || account?.full_name || 'Doctor',
        degree: doctorProfile.doctor.degree,
        designation: doctorProfile.doctor.designation,
        bmdcRegistrationNo: doctorProfile.doctor.bmdc_registration_no,
        chamberName: appointmentContext?.provider_name ?? selectedChamber?.name_bn ?? null,
        chamberAddress: appointmentContext?.provider_address ?? selectedChamber?.address ?? null,
        chamberPhone: appointmentContext?.provider_phone ?? selectedChamber?.phone ?? null,
      });
    } catch (pdfError) {
      setError(pdfError instanceof Error ? pdfError.message : 'PDF তৈরি করা যায়নি।');
    } finally {
      setPdfWorking(false);
    }
  }

  if (loading) {
    return <div className="app-shell doctor-dashboard-page"><main className="doctor-dashboard-main container"><div className="loading-box"><LoaderCircle className="spin" /> Prescription module লোড হচ্ছে…</div></main></div>;
  }

  return (
    <div className="app-shell doctor-dashboard-page prescription-page">
      
      <main className="doctor-dashboard-main container">
        <Link className="back-link" to={appointmentId ? '/doctor/appointments' : '/dashboard'}><ArrowLeft /> ফিরে যান</Link>

        <header className="prescription-page-heading">
          <div>
            <span>Doctor module</span>
            <h1>Prescription</h1>
            <p>Verified medicine catalog, recent-first autocomplete, clinical suggestions এবং Bangla PDF.</p>
          </div>
          <div className="prescription-heading-actions">
            <button type="button" className="rx-secondary-button" onClick={() => void downloadPdf()} disabled={pdfWorking}>
              {pdfWorking ? <LoaderCircle className="spin" /> : <Download />} PDF
            </button>
            <button type="button" className="rx-primary-button" onClick={() => void savePrescription()} disabled={saving}>
              {saving ? <LoaderCircle className="spin" /> : <Save />} Save
            </button>
          </div>
        </header>

        {error && <div className="error-box" role="alert">{error}</div>}
        {success && <div className="rx-success-box">{success}</div>}

        <section className="rx-card rx-patient-card">
          <div className="rx-section-title"><FileText /><div><h2>Patient information</h2>{appointmentId && <p>Appointment থেকে তথ্য auto-filled হয়েছে; প্রয়োজনে edit করতে পারবেন।</p>}</div></div>
          <div className="rx-patient-grid">
            <label>নাম<input value={patientName} onChange={(event) => setPatientName(event.target.value)} /></label>
            <label>বয়স<input value={patientAge} onChange={(event) => setPatientAge(event.target.value)} inputMode="numeric" /></label>
            <label>Sex<input value={patientGender} onChange={(event) => setPatientGender(event.target.value)} /></label>
            <label>মোবাইল<input value={patientMobile} onChange={(event) => setPatientMobile(event.target.value)} /></label>
            <label className="rx-address-field">ঠিকানা<input value={patientAddress} onChange={(event) => setPatientAddress(event.target.value)} /></label>
            {doctorProfile && doctorProfile.chambers.length > 0 && (
              <label>চেম্বার
                <select value={selectedChamberId} onChange={(event) => setSelectedChamberId(event.target.value)}>
                  <option value="">চেম্বার নির্বাচন করুন</option>
                  {doctorProfile.chambers.filter((chamber) => chamber.link_status === 'approved').map((chamber) => <option key={chamber.id} value={chamber.id}>{chamber.name_bn}</option>)}
                </select>
              </label>
            )}
          </div>
        </section>

        <div className="rx-workspace">
          <section className="rx-card rx-clinical-card">
            <div className="rx-section-title"><h2>Clinical notes</h2></div>
            {SECTION_CONFIG.map((section) => (
              <div className="rx-clinical-section" key={section.key}>
                <strong>{section.label}</strong>
                <div className="rx-clinical-lines">
                  {clinical[section.key].map((line, index) => (
                    <div className="rx-clinical-line" key={`${section.key}-${index}`}>
                      <ClinicalAutocomplete
                        value={line}
                        category={section.category}
                        onChange={(value) => updateClinicalLine(section.key, index, value)}
                        placeholder={`${section.label} লিখুন`}
                      />
                      {clinical[section.key].length > 1 && <button type="button" aria-label="Remove line" onClick={() => removeClinicalLine(section.key, index)}><Trash2 /></button>}
                    </div>
                  ))}
                  <button type="button" className="rx-add-line" onClick={() => addClinicalLine(section.key)}><Plus /> Add line</button>
                </div>
              </div>
            ))}
          </section>

          <section className="rx-card rx-medicine-card-wrap">
            <div className="rx-section-title"><div><h2>Rx</h2><p>একবারে একটি medicine লিখে ADD করুন।</p></div></div>

            <div className="rx-medicine-composer">
              <label className="rx-med-row"><span>1. Medicine</span><MedicineAutocomplete
                value={medicineDraft.name}
                onChange={(value) => setMedicineDraft((current) => ({ ...current, name: value, drug_master_id: null }))}
                onSelect={(item) => setMedicineDraft((current) => ({ ...current, name: item.display_name, drug_master_id: item.id }))}
              /></label>

              <label className="rx-med-row"><span>2. Dose</span><InstructionAutocomplete
                value={medicineDraft.dose}
                category="dose"
                onChange={(value) => setMedicineDraft((current) => ({ ...current, dose: value }))}
              /></label>

              <label className="rx-med-row"><span>3. খাওয়ার নিয়ম</span><InstructionAutocomplete
                value={medicineDraft.meal_instruction}
                category="meal_instruction"
                onChange={(value) => setMedicineDraft((current) => ({ ...current, meal_instruction: value }))}
              /></label>

              <label className="rx-med-row"><span>4. মেয়াদ</span><div className="rx-days-input"><input
                value={medicineDraft.duration_days}
                onChange={(event) => setMedicineDraft((current) => ({ ...current, duration_days: event.target.value.replace(/\D/g, '') }))}
                inputMode="numeric"
                placeholder="3"
              /><b>দিন</b></div></label>

              <button type="button" className="rx-add-medicine" onClick={addMedicine}><Plus /> ADD MEDICINE</button>
            </div>

            <div className="rx-added-medicines">
              {medicines.map((medicine, index) => (
                <article key={`${medicine.name}-${index}`}>
                  <div><strong>{index + 1}. {medicine.name}</strong><p>{[medicine.dose, medicine.meal_instruction, medicine.duration_days ? `${medicine.duration_days} দিন` : ''].filter(Boolean).join('   —   ')}</p></div>
                  <div><button type="button" onClick={() => editMedicine(index)}>Edit</button><button type="button" className="danger" onClick={() => setMedicines((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 /></button></div>
                </article>
              ))}
              {!medicines.length && <p className="rx-empty-hint">Medicine ADD করলে এখানে দুই লাইনে preview হবে।</p>}
            </div>

            <div className="rx-advice-section">
              <h3>Advice</h3>
              <div className="rx-advice-list">
                {COMMON_ADVICE.map((text) => <label key={text}><input type="checkbox" checked={advice.includes(text)} onChange={() => setAdvice((current) => current.includes(text) ? current.filter((item) => item !== text) : [...current, text])} /><span>{text}</span></label>)}
              </div>
              <div className="rx-custom-advice"><input value={customAdvice} onChange={(event) => setCustomAdvice(event.target.value)} placeholder="নিজের advice লিখুন" /><button type="button" onClick={() => { const text = customAdvice.trim(); if (text && !advice.includes(text)) setAdvice((current) => [...current, text]); setCustomAdvice(''); }}>Add</button></div>
              {advice.filter((item) => !COMMON_ADVICE.includes(item)).map((item) => <div key={item} className="rx-custom-advice-item"><span>{item}</span><button type="button" onClick={() => setAdvice((current) => current.filter((text) => text !== item))}><Trash2 /></button></div>)}
            </div>

            <label className="rx-note-field">Note<textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional note" /></label>
          </section>
        </div>

        <section className="rx-card rx-recent-prescriptions">
          <div className="rx-section-title"><div><h2>Recent prescriptions</h2><p>আপনার account-এর সাম্প্রতিক saved prescription.</p></div></div>
          {recent.length ? <div className="rx-recent-grid">{recent.map((item) => <article key={item.id}><strong>{item.patient_name}</strong><span>{new Intl.DateTimeFormat('bn-BD', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.created_at))}</span><small>{item.medicines_count} medicine{item.patient_mobile ? ` • ${item.patient_mobile}` : ''}</small></article>)}</div> : <p className="rx-empty-hint">এখনও কোনো prescription save করা হয়নি।</p>}
        </section>
      </main>
    </div>
  );
}
