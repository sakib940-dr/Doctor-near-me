import { type FormEvent, useEffect, useState } from 'react';
import { Archive, Camera, Eye, EyeOff, LoaderCircle, Pencil, Plus, RotateCcw, Save, Stethoscope, X } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { getImageUrl } from '../../../lib/storage';
import { validateSelectedImage } from '../../../lib/imageOptimization';
import { HospitalPageHeader } from '../HospitalShell';
import { bi, useHospitalLanguage } from '../i18n';
import {
  archiveHospitalDoctor, cleanupHospitalDoctorPhoto, getMyHospitalDoctors, saveMyHospitalDoctor,
  setHospitalDoctorVisibility, uploadHospitalDoctorPhoto,
} from '../services/hospitalDoctors';
import type { HospitalContactMode, HospitalDoctorCard } from '../types';
import { useHospital } from '../useHospital';

type DoctorForm = {
  id: string | null; name: string; photo: string; degree: string; designation: string; specialty: string;
  bmdc: string; experience: string; fee: string; visiting: string; note: string; room: string;
  contactMode: HospitalContactMode; phone: string; whatsapp: string; active: boolean; sortOrder: number;
};

const empty: DoctorForm = { id:null,name:'',photo:'',degree:'',designation:'',specialty:'',bmdc:'',experience:'',fee:'',visiting:'',note:'',room:'',contactMode:'reception',phone:'',whatsapp:'',active:true,sortOrder:0 };
const message = (reason: unknown) => reason instanceof Error ? reason.message : 'The request could not be completed.';

export default function HospitalDoctorsPage() {
  const { text } = useHospitalLanguage();
  const { account } = useAuth();
  const { provider, loading: providerLoading } = useHospital();
  const [rows, setRows] = useState<HospitalDoctorCard[]>([]);
  const [form, setForm] = useState<DoctorForm>(empty);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    if (!provider) return;
    setLoading(true);
    try { setRows(await getMyHospitalDoctors(provider.id)); }
    catch (reason) { setError(message(reason)); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [provider?.id]);

  function edit(row: HospitalDoctorCard) {
    setForm({ id:row.id,name:row.doctor_name,photo:row.photo_path||'',degree:row.degree||'',designation:row.designation||'',specialty:row.specialty||'',bmdc:row.bmdc_registration_no||'',experience:row.experience_years==null?'':String(row.experience_years),fee:row.consultation_fee==null?'':String(row.consultation_fee),visiting:row.visiting_schedule||'',note:row.appointment_note||'',room:row.room_information||'',contactMode:row.contact_mode||'reception',phone:row.individual_phone||'',whatsapp:row.individual_whatsapp||'',active:row.is_active??true,sortOrder:row.sort_order });
    setFile(null); setError(null); setNotice(null); window.scrollTo({ top:0,behavior:'smooth' });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!provider || !account) return;
    setSaving(true); setError(null); setNotice(null);
    let uploaded: string | null = null;
    try {
      if (file) uploaded = await uploadHospitalDoctorPhoto(file, account.user_id);
      await saveMyHospitalDoctor({
        id:form.id,provider_id:provider.id,doctor_name:form.name,photo_path:uploaded||form.photo||null,
        degree:form.degree.trim()||null,designation:form.designation.trim()||null,specialty:form.specialty.trim()||null,
        bmdc_registration_no:form.bmdc.trim()||null,experience_years:form.experience?Number(form.experience):null,
        consultation_fee:form.fee?Number(form.fee):null,visiting_schedule:form.visiting.trim()||null,
        appointment_note:form.note.trim()||null,room_information:form.room.trim()||null,contact_mode:form.contactMode,
        individual_phone:form.contactMode==='individual'?(form.phone.trim()||null):null,
        individual_whatsapp:form.contactMode==='individual'?(form.whatsapp.trim()||null):null,
        is_active:form.active,sort_order:form.sortOrder,
      });
      if (uploaded && form.photo && uploaded !== form.photo) await cleanupHospitalDoctorPhoto(form.photo).catch(() => undefined);
      setForm(empty); setFile(null); setNotice(form.id ? text(bi('ডাক্তারের তথ্য আপডেট হয়েছে।', 'Doctor information updated.')) : text(bi('হাসপাতালের ডিরেক্টরিতে ডাক্তার যোগ হয়েছে।', 'Doctor added to the Hospital directory.'))); await load();
    } catch (reason) {
      if (uploaded) await cleanupHospitalDoctorPhoto(uploaded).catch(() => undefined);
      setError(message(reason));
    } finally { setSaving(false); }
  }

  async function visibility(row: HospitalDoctorCard) {
    if (!provider) return;
    try { await setHospitalDoctorVisibility(provider.id,row.id,!(row.is_active??true)); await load(); }
    catch (reason) { setError(message(reason)); }
  }
  async function archive(row: HospitalDoctorCard, restore = false) {
    if (!provider) return;
    if (!restore && !window.confirm(text(bi('এই ডাক্তারকে পাবলিক ডিরেক্টরি থেকে সরাবেন? অ্যাপয়েন্টমেন্ট ইতিহাস সংরক্ষিত থাকবে।', 'Remove this Doctor from the public directory? Appointment history will remain available.')))) return;
    try { await archiveHospitalDoctor(provider.id,row.id,restore); await load(); }
    catch (reason) { setError(message(reason)); }
  }

  const preview = file ? URL.createObjectURL(file) : getImageUrl(form.photo,'public-images','thumbnail');
  if (providerLoading) return <div className="hospital-empty">{text(bi('হাসপাতাল প্রোফাইল লোড হচ্ছে…', 'Hospital profile loading…'))}</div>;

  return <>
    <HospitalPageHeader eyebrow={bi('হাসপাতাল নিয়ন্ত্রিত ডিরেক্টরি', 'Hospital-controlled Directory')} title={bi('ডাক্তার ম্যানেজমেন্ট', 'Doctor Management')} description={bi('কোনো invitation বা Doctor account ছাড়াই ডাক্তারের তথ্য প্রকাশ ও পরিচালনা করুন।', 'Publish and manage Doctor information without invitations or Doctor-account dependencies.')} action={<button type="button" onClick={() => { setForm(empty); setFile(null); }}><Plus /> {text(bi('নতুন ডাক্তার', 'New Doctor'))}</button>} />
    {error && <div className="hospital-error">{error}</div>}{notice && <div className="hospital-notice">{notice}</div>}
    {!provider ? <div className="hospital-empty">{text(bi('আগে হাসপাতাল প্রোফাইল তৈরি করুন।', 'Create the Hospital profile first.'))}</div> : <>
      <form className="hospital-panel hospital-form" onSubmit={submit}>
        <div className="hospital-panel-title"><div><h2>{form.id ? text(bi('ডাক্তার সম্পাদনা', 'Edit Doctor')) : text(bi('ডাক্তার যোগ করুন', 'Add Doctor'))}</h2><p>{text(bi(`${provider.name_bn} এই তথ্য পরিচালনা ও প্রকাশ করবে।`, `Information is managed and published by ${provider.name_bn}.`))}</p></div>{form.id && <button className="hospital-secondary-button" type="button" onClick={() => { setForm(empty); setFile(null); }} aria-label={text(bi('ফর্ম বন্ধ করুন', 'Close form'))}><X /></button>}</div>
        <div className="hospital-form-grid">
          <label>{text(bi('ডাক্তারের ছবি', 'Doctor photo'))}<div className="hospital-doctor-photo-fallback">{preview ? <img src={preview} alt={text(bi('ডাক্তারের ছবির প্রিভিউ', 'Doctor preview'))} /> : <Stethoscope />}</div><span className="hospital-secondary-button"><Camera /> {text(bi('ছবি বেছে নিন', 'Choose photo'))}<input hidden type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={(event) => { const selected=event.target.files?.[0]||null; try { setFile(validateSelectedImage(selected)); } catch (reason) { setError(message(reason)); } }} /></span><small>{text(bi('সর্বোচ্চ ৫ MB। আপলোডের আগে ছবি অপ্টিমাইজ হবে।', 'Maximum 5 MB. The image is optimized before upload.'))}</small></label>
          <div className="hospital-form-grid">
            <label>{text(bi('ডাক্তারের নাম *', 'Doctor name *'))}<input required minLength={2} maxLength={150} value={form.name} onChange={(event) => setForm({...form,name:event.target.value})} /></label>
            <label>{text(bi('ডিগ্রি', 'Degree'))}<input maxLength={250} value={form.degree} onChange={(event) => setForm({...form,degree:event.target.value})} /></label>
            <label>{text(bi('বিশেষত্ব', 'Specialty'))}<input maxLength={250} value={form.specialty} onChange={(event) => setForm({...form,specialty:event.target.value})} /></label>
            <label>{text(bi('পদবি', 'Designation'))}<input maxLength={250} value={form.designation} onChange={(event) => setForm({...form,designation:event.target.value})} /></label>
            <label>{text(bi('অভিজ্ঞতা (বছর)', 'Experience (years)'))}<input type="number" min={0} max={80} value={form.experience} onChange={(event) => setForm({...form,experience:event.target.value})} /></label>
            <label>{text(bi('পরামর্শ ফি', 'Consultation fee'))}<input type="number" min={0} value={form.fee} onChange={(event) => setForm({...form,fee:event.target.value})} /></label>
          </div>
        </div>
        <div className="hospital-form-grid">
          <label>{text(bi('ভিজিটিং তথ্য', 'Visiting information'))}<textarea rows={3} maxLength={500} value={form.visiting} onChange={(event) => setForm({...form,visiting:event.target.value})} /></label>
          <label>{text(bi('রুম / চেম্বারের তথ্য', 'Room / chamber information'))}<textarea rows={3} maxLength={250} value={form.room} onChange={(event) => setForm({...form,room:event.target.value})} /></label>
          <label>{text(bi('অ্যাপয়েন্টমেন্ট নোট', 'Appointment note'))}<textarea rows={3} maxLength={500} value={form.note} onChange={(event) => setForm({...form,note:event.target.value})} /></label>
          <label>{text(bi('BMDC তথ্য', 'BMDC information'))} <small>{text(bi('হাসপাতাল প্রদত্ত; verification badge দেখানো হবে না।', 'Hospital-provided; no verification badge is shown.'))}</small><input maxLength={100} value={form.bmdc} onChange={(event) => setForm({...form,bmdc:event.target.value})} /></label>
        </div>
        <fieldset><legend>{text(bi('যোগাযোগের উৎস', 'Contact source'))}</legend><div className="hospital-contact-choice"><label><input type="radio" checked={form.contactMode==='reception'} onChange={() => setForm({...form,contactMode:'reception'})} /> {text(bi('হাসপাতাল রিসেপশনের যোগাযোগ ব্যবহার করুন', 'Use Hospital Reception Contact'))}</label><label><input type="radio" checked={form.contactMode==='individual'} onChange={() => setForm({...form,contactMode:'individual'})} /> {text(bi('ডাক্তারের ব্যক্তিগত যোগাযোগ ব্যবহার করুন', 'Use Individual Doctor Contact'))}</label></div></fieldset>
        {form.contactMode === 'individual' && <div className="hospital-form-grid"><label>{text(bi('ব্যক্তিগত ফোন', 'Individual phone'))}<input inputMode="tel" maxLength={50} value={form.phone} onChange={(event) => setForm({...form,phone:event.target.value})} /></label><label>{text(bi('ব্যক্তিগত WhatsApp', 'Individual WhatsApp'))}<input inputMode="tel" maxLength={50} value={form.whatsapp} onChange={(event) => setForm({...form,whatsapp:event.target.value})} /></label></div>}
        <div className="hospital-form-grid"><label><span><input type="checkbox" checked={form.active} onChange={(event) => setForm({...form,active:event.target.checked})} /> {text(bi('পাবলিক হাসপাতাল প্রোফাইলে দেখান', 'Visible on public Hospital profile'))}</span></label><label>{text(bi('সাজানোর ক্রম', 'Sort order'))}<input type="number" min={0} value={form.sortOrder} onChange={(event) => setForm({...form,sortOrder:Number(event.target.value)})} /></label></div>
        <button className="hospital-primary-button" disabled={saving}>{saving ? <LoaderCircle className="spin" /> : <Save />}{saving ? text(bi('সংরক্ষণ হচ্ছে…', 'Saving…')) : text(bi('ডাক্তার সংরক্ষণ করুন', 'Save Doctor'))}</button>
      </form>

      <section className="hospital-panel" style={{marginTop:18}}><div className="hospital-panel-title"><div><h2>{text(bi('হাসপাতালের ডাক্তার ডিরেক্টরি', 'Hospital Doctor Directory'))}</h2><p>{rows.filter((row) => !row.archived_at).length} {text(bi('টি বর্তমান ডাক্তার প্রোফাইল', 'current Doctor profiles'))}</p></div></div>
        {loading ? <div className="hospital-empty"><LoaderCircle className="spin" /> {text(bi('লোড হচ্ছে…', 'Loading…'))}</div> : <div className="hospital-doctor-list">{rows.map((row) => <article className="hospital-doctor-manage-card" key={row.id}>
          {getImageUrl(row.photo_path,'public-images','thumbnail') ? <img src={getImageUrl(row.photo_path,'public-images','thumbnail')!} alt={row.doctor_name} /> : <div className="hospital-doctor-photo-fallback"><Stethoscope /></div>}
          <div><span className={`hospital-status-pill ${row.archived_at?'archived':row.is_active?'':'hidden'}`}>{row.archived_at?text(bi('আর্কাইভ', 'Archived')):row.is_active?text(bi('পাবলিক', 'Public')):text(bi('লুকানো', 'Hidden'))}</span><h3>{row.doctor_name}</h3><p>{[row.degree,row.specialty].filter(Boolean).join(' • ') || text(bi('পেশাগত তথ্য অপেক্ষমাণ', 'Professional information pending'))}</p><small>{row.visiting_schedule || text(bi('ভিজিটিং সময় যোগ করা হয়নি', 'Visiting schedule not added'))}</small></div>
          <div className="hospital-doctor-card-actions">{row.archived_at ? <button type="button" title={text(bi('পুনরুদ্ধার', 'Restore'))} onClick={() => void archive(row,true)}><RotateCcw /></button> : <><button type="button" title={text(bi('সম্পাদনা', 'Edit'))} onClick={() => edit(row)}><Pencil /></button><button type="button" title={row.is_active?text(bi('লুকান', 'Hide')):text(bi('দেখান', 'Show'))} onClick={() => void visibility(row)}>{row.is_active?<EyeOff/>:<Eye/>}</button><button className="danger" type="button" title={text(bi('আর্কাইভ', 'Archive'))} onClick={() => void archive(row)}><Archive /></button></>}</div>
        </article>)}{!rows.length && <div className="hospital-empty">{text(bi('এখনও কোনো ডাক্তার যোগ করা হয়নি।', 'No Doctor added yet.'))}</div>}</div>}
      </section>
    </>}
  </>;
}
