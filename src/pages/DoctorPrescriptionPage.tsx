import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Download, Eye, FileText, LoaderCircle, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { ClinicalAutocomplete, InstructionAutocomplete, MedicineAutocomplete } from '../components/PrescriptionAutocomplete';
import { useAuth } from '../contexts/AuthContext';
import { downloadPrescriptionPdf } from '../lib/prescriptionPdf';
import { getMyDoctorProfile } from '../services/doctorDashboard';
import {
  DEFAULT_PRESCRIPTION_FOOTER,
  getMyAdviceTemplates,
  getMyPrescription,
  getMyPrescriptions,
  getMyPrescriptionSettings,
  getPrescriptionAppointmentContext,
  getPrescriptionFooter,
  saveMyPrescription,
  updateMyPrescription,
  type AdviceTemplate,
  type ClinicalCategory,
  type DoctorPrescriptionRecord,
  type PrescriptionAppointmentContext,
  type PrescriptionMedicineInput,
  type PrescriptionPayload,
  type PrescriptionSettings,
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

function editableLines(lines: unknown) {
  if (!Array.isArray(lines)) return [''];
  const values = lines.filter((line): line is string => typeof line === 'string');
  return values.length ? values : [''];
}

const PRESCRIPTION_WEEKDAYS = ['রবি', 'সোম', 'মঙ্গল', 'বুধ', 'বৃহস্পতি', 'শুক্র', 'শনি'];
const PRESCRIPTION_HEADER_MAX_CHARS = 800;
const PRESCRIPTION_HEADER_MAX_LINES = 12;
const HISTORY_PAGE_SIZE = 20;

function limitPrescriptionHeader(value: string) {
  return value.replace(/\r\n/g, '\n').split('\n').slice(0, PRESCRIPTION_HEADER_MAX_LINES).join('\n').slice(0, PRESCRIPTION_HEADER_MAX_CHARS);
}

function compactTime(value: string) {
  return value?.slice(0, 5) || '';
}

function formatChamberVisitingTime(chamber: DoctorDashboardChamber | null) {
  if (!chamber) return null;
  const active = chamber.schedules.filter((schedule) => schedule.is_active);
  if (!active.length) return null;
  return active.map((schedule) => {
    const day = PRESCRIPTION_WEEKDAYS[schedule.day_of_week] ?? `Day ${schedule.day_of_week}`;
    return `${day} ${compactTime(schedule.start_time)}–${compactTime(schedule.end_time)}`;
  }).join('; ');
}

function buildDoctorHeaderText(profile: MyDoctorProfile | null) {
  if (!profile) return '';
  const specialty = (profile.specialties ?? [])
    .map((item) => item.name_en || item.name_bn)
    .filter(Boolean)
    .join(', ');
  const doctor = profile.doctor;
  const lines = [
    doctor.full_name ? `DR. ${doctor.full_name}` : 'Doctor',
    doctor.professional_title,
    doctor.degree,
    specialty || doctor.specialty_text,
    doctor.designation,
    doctor.present_job,
    doctor.medical_college,
    doctor.bmdc_registration_no ? `BMDC Reg No: ${doctor.bmdc_registration_no}` : null,
    doctor.public_address,
  ].filter((line): line is string => Boolean(line));
  return lines.filter((line, index) => lines.findIndex((item) => item.trim().toLowerCase() === line.trim().toLowerCase()) === index).join('\n');
}

function buildChamberHeaderText(
  chamber: DoctorDashboardChamber | null,
  appointment: PrescriptionAppointmentContext | null,
) {
  const name = chamber?.name_bn ?? appointment?.provider_name ?? null;
  const address = chamber?.address ?? appointment?.provider_address ?? null;
  const phone = chamber?.phone ?? appointment?.provider_phone ?? null;
  const whatsapp = chamber?.whatsapp ?? null;
  const visiting = formatChamberVisitingTime(chamber);
  return [
    'Chamber',
    name,
    address,
    phone ? `Mobile: ${phone}` : null,
    whatsapp && whatsapp !== phone ? `WhatsApp: ${whatsapp}` : null,
    visiting ? `Visiting: ${visiting}` : null,
  ].filter(Boolean).join('\n');
}

function recordToPayload(record: DoctorPrescriptionRecord): PrescriptionPayload {
  return {
    appointment_id: record.appointment_id,
    provider_id: record.provider_id,
    doctor_header_text: record.doctor_header_text ?? '',
    chamber_header_text: record.chamber_header_text ?? '',
    patient_name: record.patient_name ?? '',
    patient_age: record.patient_age ?? '',
    patient_address: record.patient_address ?? '',
    patient_mobile: record.patient_mobile ?? '',
    patient_gender: record.patient_gender ?? '',
    chief_complaint: Array.isArray(record.chief_complaint) ? record.chief_complaint : [],
    history: Array.isArray(record.history) ? record.history : [],
    on_examination: Array.isArray(record.on_examination) ? record.on_examination : [],
    investigation: Array.isArray(record.investigation) ? record.investigation : [],
    treatment_plan: Array.isArray(record.treatment_plan) ? record.treatment_plan : [],
    medicines: Array.isArray(record.medicines) ? record.medicines : [],
    advice: Array.isArray(record.advice) ? record.advice : [],
    note: record.note ?? '',
  };
}

export default function DoctorPrescriptionPage() {
  const { account } = useAuth();
  const [searchParams] = useSearchParams();
  const appointmentId = searchParams.get('appointment');
  const [doctorProfile, setDoctorProfile] = useState<MyDoctorProfile | null>(null);
  const [appointmentContext, setAppointmentContext] = useState<PrescriptionAppointmentContext | null>(null);
  const [linkedAppointmentId, setLinkedAppointmentId] = useState<string | null>(null);
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
  const [templateSelection, setTemplateSelection] = useState<string[]>([]);
  const [adviceTemplates, setAdviceTemplates] = useState<AdviceTemplate[]>([]);
  const [customAdvice, setCustomAdvice] = useState('');
  const [note, setNote] = useState('');
  const [recent, setRecent] = useState<PrescriptionSummary[]>([]);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [loadingMoreHistory, setLoadingMoreHistory] = useState(false);
  const [prescriptionFooter, setPrescriptionFooter] = useState(DEFAULT_PRESCRIPTION_FOOTER);
  const [prescriptionSettings, setPrescriptionSettings] = useState<PrescriptionSettings | null>(null);
  const [doctorHeaderText, setDoctorHeaderText] = useState('');
  const [chamberHeaderText, setChamberHeaderText] = useState('');
  const [editingPrescriptionId, setEditingPrescriptionId] = useState<string | null>(null);
  const [historyPreview, setHistoryPreview] = useState<DoctorPrescriptionRecord | null>(null);
  const [historyWorkingId, setHistoryWorkingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pdfWorking, setPdfWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const previousChamberIdRef = useRef<string>('');

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [profile, history, footerText, settings, templates, context] = await Promise.all([
          getMyDoctorProfile(),
          getMyPrescriptions(HISTORY_PAGE_SIZE, 0).catch(() => []),
          getPrescriptionFooter().catch(() => DEFAULT_PRESCRIPTION_FOOTER),
          getMyPrescriptionSettings().catch(() => null),
          getMyAdviceTemplates().catch(() => []),
          appointmentId ? getPrescriptionAppointmentContext(appointmentId) : Promise.resolve(null),
        ]);
        if (!active) return;

        setDoctorProfile(profile);
        setRecent(history);
        setHasMoreHistory(history.length === HISTORY_PAGE_SIZE);
        setPrescriptionFooter(footerText);
        setPrescriptionSettings(settings);
        setAdviceTemplates(templates);
        setAppointmentContext(context);
        setLinkedAppointmentId(context?.appointment_id ?? null);

        const approved = profile?.chambers.filter((chamber) => chamber.link_status === 'approved' && chamber.provider_status === 'approved') ?? [];
        const initialChamberId = context?.provider_id ?? approved[0]?.id ?? '';
        const initialChamber = profile?.chambers.find((chamber) => chamber.id === initialChamberId) ?? null;
        previousChamberIdRef.current = initialChamberId;
        setSelectedChamberId(initialChamberId);
        setDoctorHeaderText(limitPrescriptionHeader(settings?.default_doctor_header_text ?? buildDoctorHeaderText(profile)));
        setChamberHeaderText(limitPrescriptionHeader(settings?.default_chamber_header_text ?? buildChamberHeaderText(initialChamber, context)));

        if (context) {
          setPatientName(context.patient_name ?? '');
          setPatientAge(ageFromDob(context.patient_date_of_birth));
          setPatientGender(context.patient_gender ?? '');
          setPatientMobile(context.patient_mobile ?? '');
          setPatientAddress(context.patient_address ?? '');
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

  const recentlyUsedTemplates = useMemo(() => adviceTemplates
    .filter((template) => Boolean(template.last_used_at))
    .sort((a, b) => new Date(b.last_used_at || 0).getTime() - new Date(a.last_used_at || 0).getTime())
    .slice(0, 5), [adviceTemplates]);

  useEffect(() => {
    if (loading || previousChamberIdRef.current === selectedChamberId) return;
    previousChamberIdRef.current = selectedChamberId;
    setChamberHeaderText(limitPrescriptionHeader(buildChamberHeaderText(selectedChamber, appointmentContext)));
  }, [appointmentContext, loading, selectedChamber, selectedChamberId]);

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

  function toggleTemplateSelection(id: string) {
    setTemplateSelection((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function addSelectedTemplateAdvice() {
    const selectedTexts = adviceTemplates
      .filter((template) => templateSelection.includes(template.id))
      .map((template) => template.advice_text);
    if (!selectedTexts.length) return;
    setAdvice((current) => Array.from(new Set([...current, ...selectedTexts])));
    setTemplateSelection([]);
  }

  function buildPayload(): PrescriptionPayload {
    return {
      appointment_id: linkedAppointmentId,
      provider_id: selectedChamberId || null,
      doctor_header_text: limitPrescriptionHeader(doctorHeaderText.trim()),
      chamber_header_text: limitPrescriptionHeader(chamberHeaderText.trim()),
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

  function validatePayload(payload: PrescriptionPayload) {
    if (!payload.patient_name) {
      setError('Patient name দিন।');
      return false;
    }
    if (!payload.medicines.length) {
      setError('কমপক্ষে একটি medicine ADD করুন।');
      return false;
    }
    return true;
  }

  async function refreshHistoryAndTemplates() {
    const [history, templates] = await Promise.all([
      getMyPrescriptions(Math.max(HISTORY_PAGE_SIZE, Math.min(recent.length, 100)), 0),
      getMyAdviceTemplates().catch(() => adviceTemplates),
    ]);
    setRecent(history);
    setHasMoreHistory(history.length >= Math.max(HISTORY_PAGE_SIZE, Math.min(recent.length, 100)));
    setAdviceTemplates(templates);
  }

  async function loadMoreHistory() {
    setLoadingMoreHistory(true);
    setError(null);
    try {
      const rows = await getMyPrescriptions(HISTORY_PAGE_SIZE, recent.length);
      setRecent((current) => [...current, ...rows.filter((row) => !current.some((item) => item.id === row.id))]);
      setHasMoreHistory(rows.length === HISTORY_PAGE_SIZE);
    } catch (historyError) {
      setError(historyError instanceof Error ? historyError.message : 'আরও prescription history লোড করা যায়নি।');
    } finally {
      setLoadingMoreHistory(false);
    }
  }

  async function savePrescription() {
    const payload = buildPayload();
    if (!validatePayload(payload)) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      if (editingPrescriptionId) {
        await updateMyPrescription(editingPrescriptionId, payload);
        setSuccess('Prescription update হয়েছে। এই edited header এখন আপনার নতুন permanent default হিসেবেও save হয়েছে।');
      } else {
        await saveMyPrescription(payload);
        setSuccess('Prescription save হয়েছে। Edited header permanent default হয়েছে এবং template usage Recent Advice-এ update হয়েছে।');
      }
      if (doctorProfile) {
        setPrescriptionSettings({
          doctor_id: doctorProfile.doctor.id,
          default_doctor_header_text: payload.doctor_header_text,
          default_chamber_header_text: payload.chamber_header_text,
          updated_at: new Date().toISOString(),
        });
      }
      await refreshHistoryAndTemplates();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Prescription save করা যায়নি।');
    } finally {
      setSaving(false);
    }
  }

  async function downloadPayloadPdf(payload: PrescriptionPayload, chamber: DoctorDashboardChamber | null) {
    if (!doctorProfile) return;
    const currentFooter = await getPrescriptionFooter().catch(() => prescriptionFooter);
    setPrescriptionFooter(currentFooter);
    const specialty = (doctorProfile.specialties ?? [])
      .map((item) => item.name_en || item.name_bn)
      .filter(Boolean)
      .join(', ');
    await downloadPrescriptionPdf(payload, {
      doctorName: doctorProfile.doctor.full_name || account?.full_name || 'Doctor',
      degree: doctorProfile.doctor.degree,
      designation: doctorProfile.doctor.designation,
      specialty: specialty || doctorProfile.doctor.specialty_text || doctorProfile.doctor.professional_title,
      bmdcRegistrationNo: doctorProfile.doctor.bmdc_registration_no,
      presentJob: doctorProfile.doctor.present_job,
      chamberName: chamber?.name_bn ?? null,
      chamberAddress: chamber?.address ?? null,
      chamberPhone: chamber?.phone ?? null,
      chamberVisitingTime: formatChamberVisitingTime(chamber),
      doctorHeaderText: payload.doctor_header_text,
      chamberHeaderText: payload.chamber_header_text,
      footerText: currentFooter,
    });
  }

  async function downloadPdf() {
    const payload = buildPayload();
    if (!validatePayload(payload) || !doctorProfile) return;
    setPdfWorking(true);
    setError(null);
    try {
      await downloadPayloadPdf(payload, selectedChamber);
    } catch (pdfError) {
      setError(pdfError instanceof Error ? pdfError.message : 'PDF তৈরি করা যায়নি।');
    } finally {
      setPdfWorking(false);
    }
  }

  async function loadHistoryRecord(id: string) {
    const record = await getMyPrescription(id);
    if (!record) throw new Error('Prescription পাওয়া যায়নি।');
    return record;
  }

  async function viewHistoricalPrescription(id: string) {
    setHistoryWorkingId(id);
    setError(null);
    try {
      setHistoryPreview(await loadHistoryRecord(id));
    } catch (historyError) {
      setError(historyError instanceof Error ? historyError.message : 'Prescription preview লোড করা যায়নি।');
    } finally {
      setHistoryWorkingId(null);
    }
  }

  function applyRecordToEditor(record: DoctorPrescriptionRecord) {
    previousChamberIdRef.current = record.provider_id ?? '';
    setEditingPrescriptionId(record.id);
    setLinkedAppointmentId(record.appointment_id);
    setSelectedChamberId(record.provider_id ?? '');
    setPatientName(record.patient_name ?? '');
    setPatientAge(record.patient_age ?? '');
    setPatientGender(record.patient_gender ?? '');
    setPatientMobile(record.patient_mobile ?? '');
    setPatientAddress(record.patient_address ?? '');
    setClinical({
      chiefComplaint: editableLines(record.chief_complaint),
      history: editableLines(record.history),
      onExamination: editableLines(record.on_examination),
      investigation: editableLines(record.investigation),
      treatmentPlan: editableLines(record.treatment_plan),
    });
    setMedicineDraft(EMPTY_MEDICINE);
    setMedicines(Array.isArray(record.medicines) ? record.medicines : []);
    setAdvice(Array.isArray(record.advice) ? record.advice : []);
    setTemplateSelection([]);
    setCustomAdvice('');
    setNote(record.note ?? '');
    setDoctorHeaderText(limitPrescriptionHeader(record.doctor_header_text ?? buildDoctorHeaderText(doctorProfile)));
    const recordChamber = doctorProfile?.chambers.find((chamber) => chamber.id === record.provider_id) ?? null;
    setChamberHeaderText(limitPrescriptionHeader(record.chamber_header_text ?? buildChamberHeaderText(recordChamber, null)));
    setHistoryPreview(null);
    setSuccess('Previous prescription edit mode-এ লোড হয়েছে। Save করলে existing prescription update হবে।');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function editHistoricalPrescription(id: string) {
    setHistoryWorkingId(id);
    setError(null);
    try {
      applyRecordToEditor(await loadHistoryRecord(id));
    } catch (historyError) {
      setError(historyError instanceof Error ? historyError.message : 'Prescription edit mode-এ লোড করা যায়নি।');
    } finally {
      setHistoryWorkingId(null);
    }
  }

  async function downloadHistoricalPrescription(id: string) {
    setHistoryWorkingId(id);
    setError(null);
    try {
      const record = await loadHistoryRecord(id);
      const payload = recordToPayload(record);
      const chamber = doctorProfile?.chambers.find((item) => item.id === record.provider_id) ?? null;
      await downloadPayloadPdf(payload, chamber);
    } catch (historyError) {
      setError(historyError instanceof Error ? historyError.message : 'Prescription PDF download করা যায়নি।');
    } finally {
      setHistoryWorkingId(null);
    }
  }

  function resetToNewPrescription() {
    const approved = doctorProfile?.chambers.filter((chamber) => chamber.link_status === 'approved' && chamber.provider_status === 'approved') ?? [];
    const initialChamberId = appointmentContext?.provider_id ?? approved[0]?.id ?? '';
    const chamber = doctorProfile?.chambers.find((item) => item.id === initialChamberId) ?? null;
    previousChamberIdRef.current = initialChamberId;
    setEditingPrescriptionId(null);
    setLinkedAppointmentId(appointmentContext?.appointment_id ?? null);
    setSelectedChamberId(initialChamberId);
    setPatientName(appointmentContext?.patient_name ?? '');
    setPatientAge(ageFromDob(appointmentContext?.patient_date_of_birth ?? null));
    setPatientGender(appointmentContext?.patient_gender ?? '');
    setPatientMobile(appointmentContext?.patient_mobile ?? '');
    setPatientAddress(appointmentContext?.patient_address ?? '');
    setClinical(EMPTY_CLINICAL);
    setMedicineDraft(EMPTY_MEDICINE);
    setMedicines([]);
    setAdvice([]);
    setTemplateSelection([]);
    setCustomAdvice('');
    setNote('');
    setDoctorHeaderText(limitPrescriptionHeader(prescriptionSettings?.default_doctor_header_text ?? buildDoctorHeaderText(doctorProfile)));
    setChamberHeaderText(limitPrescriptionHeader(prescriptionSettings?.default_chamber_header_text ?? buildChamberHeaderText(chamber, appointmentContext)));
    setSuccess(null);
    setError(null);
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
            <h1>{editingPrescriptionId ? 'Edit Prescription' : 'Prescription'}</h1>
            <p>Verified medicine catalog, recent-first autocomplete, clinical suggestions এবং Bangla PDF.</p>
          </div>
          <div className="prescription-heading-actions">
            {editingPrescriptionId && <button type="button" className="rx-secondary-button" onClick={resetToNewPrescription}><X /> Cancel Edit</button>}
            <button type="button" className="rx-secondary-button" onClick={() => void downloadPdf()} disabled={pdfWorking}>
              {pdfWorking ? <LoaderCircle className="spin" /> : <Download />} PDF
            </button>
            <button type="button" className="rx-primary-button" onClick={() => void savePrescription()} disabled={saving}>
              {saving ? <LoaderCircle className="spin" /> : <Save />} {editingPrescriptionId ? 'Update' : 'Save'}
            </button>
          </div>
        </header>

        {error && <div className="error-box" role="alert">{error}</div>}
        {success && <div className="rx-success-box">{success}</div>}

        <section className="rx-card rx-prescription-header-card">
          <div className="rx-section-title">
            <div>
              <h2>Prescription header</h2>
              <p>Visiting Card ও Chamber Details থেকে auto-filled। Save করলে edited version আপনার permanent default হবে; নতুন prescription-এ সেটিই আগে load হবে।</p>
            </div>
          </div>
          <div className="rx-header-editor-grid">
            <label className="rx-header-editor">
              <span><strong>Doctor / Visiting Card</strong><small>{doctorHeaderText.length}/{PRESCRIPTION_HEADER_MAX_CHARS}</small></span>
              <textarea
                value={doctorHeaderText}
                maxLength={PRESCRIPTION_HEADER_MAX_CHARS}
                rows={6}
                onChange={(event) => setDoctorHeaderText(limitPrescriptionHeader(event.target.value))}
                placeholder="Doctor name, degree, specialty, designation, BMDC…"
              />
              <button type="button" className="rx-reset-header" onClick={() => setDoctorHeaderText(buildDoctorHeaderText(doctorProfile))}>Visiting Card source থেকে reset</button>
            </label>
            <label className="rx-header-editor">
              <span><strong>Chamber Details</strong><small>{chamberHeaderText.length}/{PRESCRIPTION_HEADER_MAX_CHARS}</small></span>
              <textarea
                value={chamberHeaderText}
                maxLength={PRESCRIPTION_HEADER_MAX_CHARS}
                rows={6}
                onChange={(event) => setChamberHeaderText(limitPrescriptionHeader(event.target.value))}
                placeholder="Chamber name, address, contact, visiting time…"
              />
              <button type="button" className="rx-reset-header" onClick={() => setChamberHeaderText(buildChamberHeaderText(selectedChamber, appointmentContext))}>Chamber Details source থেকে reset</button>
            </label>
          </div>
        </section>

        <section className="rx-card rx-patient-card">
          <div className="rx-section-title"><FileText /><div><h2>Patient information</h2>{linkedAppointmentId && <p>Appointment থেকে তথ্য auto-filled হয়েছে; প্রয়োজনে edit করতে পারবেন।</p>}</div></div>
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

              {recentlyUsedTemplates.length > 0 && (
                <div className="rx-advice-template-group">
                  <div className="rx-advice-template-group-title"><strong>Recently Used</strong><small>আপনার template history থেকে</small></div>
                  <div className="rx-advice-list">
                    {recentlyUsedTemplates.map((template) => (
                      <label key={`recent-${template.id}`}>
                        <input type="checkbox" checked={templateSelection.includes(template.id)} onChange={() => toggleTemplateSelection(template.id)} />
                        <span>{template.advice_text}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="rx-advice-template-group">
                <div className="rx-advice-template-group-title"><strong>All Advice Templates</strong><small>My Profile থেকে create/edit/delete করুন</small></div>
                {adviceTemplates.length ? (
                  <div className="rx-advice-list">
                    {adviceTemplates.map((template) => (
                      <label key={template.id}>
                        <input type="checkbox" checked={templateSelection.includes(template.id)} onChange={() => toggleTemplateSelection(template.id)} />
                        <span>{template.advice_text}</span>
                      </label>
                    ))}
                  </div>
                ) : <p className="rx-empty-hint">My Profile → Prescription Advice Templates থেকে personal template তৈরি করতে পারবেন।</p>}
                {adviceTemplates.length > 0 && (
                  <button type="button" className="rx-add-selected-advice" disabled={!templateSelection.length} onClick={addSelectedTemplateAdvice}>
                    <Plus /> Add Selected Advice ({templateSelection.length})
                  </button>
                )}
              </div>

              <div className="rx-advice-template-group">
                <div className="rx-advice-template-group-title"><strong>Built-in Advice</strong><small>Existing quick options</small></div>
                <div className="rx-advice-list">
                  {COMMON_ADVICE.map((text) => <label key={text}><input type="checkbox" checked={advice.includes(text)} onChange={() => setAdvice((current) => current.includes(text) ? current.filter((item) => item !== text) : [...current, text])} /><span>{text}</span></label>)}
                </div>
              </div>

              <div className="rx-custom-advice"><input value={customAdvice} onChange={(event) => setCustomAdvice(event.target.value)} placeholder="নিজের advice লিখুন" /><button type="button" onClick={() => { const text = customAdvice.trim(); if (text && !advice.includes(text)) setAdvice((current) => [...current, text]); setCustomAdvice(''); }}>Add</button></div>

              {advice.length > 0 && (
                <div className="rx-selected-advice-list">
                  <strong>Prescription-এ যোগ করা Advice</strong>
                  {advice.map((item) => <div key={item} className="rx-custom-advice-item"><span>{item}</span><button type="button" onClick={() => setAdvice((current) => current.filter((text) => text !== item))}><Trash2 /></button></div>)}
                </div>
              )}
            </div>

            <label className="rx-note-field">Note<textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional note" /></label>
          </section>
        </div>

        <section className="rx-card rx-recent-prescriptions">
          <div className="rx-section-title"><div><h2>Prescription History</h2><p>Previous prescriptions View, Edit অথবা updated PDF হিসেবে re-download করুন।</p></div></div>
          {recent.length ? (
            <div className="rx-recent-grid">
              {recent.map((item) => (
                <article key={item.id} className={editingPrescriptionId === item.id ? 'is-editing' : ''}>
                  <strong>{item.patient_name}</strong>
                  <span>{new Intl.DateTimeFormat('bn-BD', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.created_at))}</span>
                  <small>Doctor: {doctorProfile?.doctor.full_name || account?.full_name || 'Doctor'}</small>
                  <small>{item.medicines_count} medicine{item.patient_mobile ? ` • ${item.patient_mobile}` : ''}</small>
                  <div className="rx-history-actions">
                    <button type="button" onClick={() => void viewHistoricalPrescription(item.id)} disabled={historyWorkingId === item.id}>{historyWorkingId === item.id ? <LoaderCircle className="spin" /> : <Eye />} View</button>
                    <button type="button" onClick={() => void editHistoricalPrescription(item.id)} disabled={historyWorkingId === item.id}><Pencil /> Edit</button>
                    <button type="button" onClick={() => void downloadHistoricalPrescription(item.id)} disabled={historyWorkingId === item.id}><Download /> Download</button>
                  </div>
                </article>
              ))}
            </div>
          ) : <p className="rx-empty-hint">এখনও কোনো prescription save করা হয়নি।</p>}
          {recent.length > 0 && hasMoreHistory && (
            <button type="button" className="rx-history-load-more" onClick={() => void loadMoreHistory()} disabled={loadingMoreHistory}>
              {loadingMoreHistory ? <LoaderCircle className="spin" /> : <Plus />} Load more prescriptions
            </button>
          )}
        </section>
      </main>

      {historyPreview && (
        <div className="rx-history-preview-backdrop" role="dialog" aria-modal="true" aria-label="Prescription preview">
          <article className="rx-history-preview-modal">
            <header>
              <div><small>Saved Prescription</small><h2>{historyPreview.patient_name}</h2><span>{new Intl.DateTimeFormat('bn-BD', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(historyPreview.created_at))}</span></div>
              <button type="button" aria-label="Close preview" onClick={() => setHistoryPreview(null)}><X /></button>
            </header>
            <div className="rx-history-preview-headers">
              <pre>{historyPreview.doctor_header_text || buildDoctorHeaderText(doctorProfile)}</pre>
              <pre>{historyPreview.chamber_header_text || 'Chamber details not saved'}</pre>
            </div>
            <div className="rx-history-preview-patient">
              <span><strong>Age</strong>{historyPreview.patient_age || '—'}</span>
              <span><strong>Sex</strong>{historyPreview.patient_gender || '—'}</span>
              <span><strong>Mobile</strong>{historyPreview.patient_mobile || '—'}</span>
              <span><strong>Address</strong>{historyPreview.patient_address || '—'}</span>
            </div>
            <div className="rx-history-preview-body">
              <section>
                {SECTION_CONFIG.map((section) => {
                  const keyMap: Record<keyof ClinicalState, keyof DoctorPrescriptionRecord> = {
                    chiefComplaint: 'chief_complaint', history: 'history', onExamination: 'on_examination', investigation: 'investigation', treatmentPlan: 'treatment_plan',
                  };
                  const values = historyPreview[keyMap[section.key]];
                  return Array.isArray(values) && values.length ? <div key={section.key}><strong>{section.label}</strong><ul>{values.map((value, index) => <li key={`${section.key}-${index}`}>{String(value)}</li>)}</ul></div> : null;
                })}
              </section>
              <section>
                <h3>Rx</h3>
                {historyPreview.medicines.map((medicine, index) => <div className="rx-history-medicine" key={`${medicine.name}-${index}`}><strong>{index + 1}. {medicine.name}</strong><span>{[medicine.dose, medicine.meal_instruction, medicine.duration_days ? `${medicine.duration_days} দিন` : ''].filter(Boolean).join(' — ')}</span></div>)}
                {historyPreview.advice.length > 0 && <div className="rx-history-advice"><strong>Advice</strong><ul>{historyPreview.advice.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul></div>}
                {historyPreview.note && <div className="rx-history-note"><strong>Note</strong><p>{historyPreview.note}</p></div>}
              </section>
            </div>
            <footer>
              <button type="button" className="rx-secondary-button" onClick={() => applyRecordToEditor(historyPreview)}><Pencil /> Edit</button>
              <button type="button" className="rx-primary-button" onClick={() => void downloadHistoricalPrescription(historyPreview.id)}><Download /> Re-download PDF</button>
            </footer>
          </article>
        </div>
      )}
    </div>
  );
}
