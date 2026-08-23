import { FormEvent, useEffect, useState } from 'react';
import { ArrowLeft, Building2, Camera, CheckCircle2, LoaderCircle, Pencil, Plus, Save, Stethoscope, Trash2, X } from 'lucide-react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getImageUrl } from '../lib/storage';
import { cleanupProviderMedia, getMyProviderDashboard } from '../services/providerDashboard';
import { deactivateMyProviderManagedDoctorCard, getMyProviderManagedDoctorCards, saveMyProviderManagedDoctorCard, uploadProviderManagedDoctorPhoto } from '../services/providerReception';
import type { ProviderDashboardItem, ProviderManagedDoctorCard } from '../types';

type FormState = { id: string | null; doctorName: string; photoPath: string; degree: string; designation: string; specialty: string; bmdc: string; experience: string; fee: string; visitingSchedule: string; appointmentNote: string; isActive: boolean; sortOrder: number };
const emptyForm: FormState = { id: null, doctorName: '', photoPath: '', degree: '', designation: '', specialty: '', bmdc: '', experience: '', fee: '', visitingSchedule: '', appointmentNote: '', isActive: true, sortOrder: 0 };
const messageFrom = (error: unknown) => error instanceof Error ? error.message : error && typeof error === 'object' && 'message' in error ? String(error.message) : 'কাজটি সম্পন্ন করা যায়নি।';

export default function ProviderDoctorsPage() {
  const { account } = useAuth();
  const [providers, setProviders] = useState<ProviderDashboardItem[]>([]);
  const [providerId, setProviderId] = useState('');
  const [cards, setCards] = useState<ProviderManagedDoctorCard[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => { setLoading(true); getMyProviderDashboard().then((rows) => { setProviders(rows); setProviderId(rows[0]?.id || ''); }).catch((e) => setError(messageFrom(e))).finally(() => setLoading(false)); }, []);
  useEffect(() => { if (!providerId) { setCards([]); return; } setLoading(true); getMyProviderManagedDoctorCards(providerId).then(setCards).catch((e) => setError(messageFrom(e))).finally(() => setLoading(false)); }, [providerId]);
  if (account && !['hospital', 'chamber'].includes(account.role)) return <Navigate to="/dashboard" replace />;
  const provider = providers.find((item) => item.id === providerId) || null;

  function edit(card: ProviderManagedDoctorCard) {
    setForm({ id: card.id, doctorName: card.doctor_name, photoPath: card.photo_path || '', degree: card.degree || '', designation: card.designation || '', specialty: card.specialty || '', bmdc: card.bmdc_registration_no || '', experience: card.experience_years == null ? '' : String(card.experience_years), fee: card.consultation_fee == null ? '' : String(card.consultation_fee), visitingSchedule: card.visiting_schedule || '', appointmentNote: card.appointment_note || '', isActive: card.is_active ?? true, sortOrder: card.sort_order });
    setPhotoFile(null); setError(null); setNotice(null); window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  async function loadCards() { if (providerId) setCards(await getMyProviderManagedDoctorCards(providerId)); }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!providerId || !account) return;
    setSaving(true); setError(null); setNotice(null); let uploaded: string | null = null; const previousPhoto = form.photoPath || null;
    try {
      if (photoFile) uploaded = await uploadProviderManagedDoctorPhoto(photoFile, account.user_id);
      await saveMyProviderManagedDoctorCard({ id: form.id, provider_id: providerId, doctor_name: form.doctorName, photo_path: uploaded || previousPhoto, degree: form.degree.trim() || null, designation: form.designation.trim() || null, specialty: form.specialty.trim() || null, bmdc_registration_no: form.bmdc.trim() || null, experience_years: form.experience ? Number(form.experience) : null, consultation_fee: form.fee ? Number(form.fee) : null, visiting_schedule: form.visitingSchedule.trim() || null, appointment_note: form.appointmentNote.trim() || null, is_active: form.isActive, sort_order: form.sortOrder });
      if (uploaded && previousPhoto && uploaded !== previousPhoto) await cleanupProviderMedia(previousPhoto).catch(() => undefined);
      setForm(emptyForm); setPhotoFile(null); setNotice(form.id ? 'Doctor card update হয়েছে।' : 'Reception Doctor card তৈরি হয়েছে।'); await loadCards();
    } catch (saveError) { if (uploaded) await cleanupProviderMedia(uploaded).catch(() => undefined); setError(messageFrom(saveError)); }
    finally { setSaving(false); }
  }
  async function deactivate(card: ProviderManagedDoctorCard) {
    if (confirmRemove !== card.id) { setConfirmRemove(card.id); return; }
    setSaving(true); setError(null);
    try { await deactivateMyProviderManagedDoctorCard(providerId, card.id); setConfirmRemove(null); setNotice('Doctor card public listing থেকে সরানো হয়েছে। Appointment history অক্ষত আছে।'); await loadCards(); }
    catch (removeError) { setError(messageFrom(removeError)); } finally { setSaving(false); }
  }

  return <div className="app-shell provider-dashboard-page provider-managed-doctors-page"><main className="provider-dashboard-main container">
    <Link className="back-link" to="/dashboard"><ArrowLeft /> Dashboard-এ ফিরুন</Link><div className="provider-page-heading"><span><Stethoscope /></span><div><small>Independent reception directory</small><h1>Hospital Doctor Cards</h1><p>Doctor account বা invitation ছাড়াই Reception-এর জন্য Doctor card ও serial contact পরিচালনা করুন।</p></div></div>
    {providers.length > 1 && <label className="provider-card-selector"><Building2 /><select value={providerId} onChange={(event) => { setProviderId(event.target.value); setForm(emptyForm); }}>{providers.map((item) => <option key={item.id} value={item.id}>{item.name_bn}</option>)}</select></label>}
    {error && <div className="error-box" role="alert">{error}</div>}{notice && <div className="auth-message success"><CheckCircle2 /> {notice}</div>}
    {!loading && !provider && <div className="empty-state"><Building2 /><h3>প্রথমে Hospital profile তৈরি করুন</h3><Link className="inline-primary" to="/provider/profile">Profile তৈরি করুন</Link></div>}
    {provider && <><form className="provider-doctor-card-form" onSubmit={submit}><header><div><small>Reception-managed profile</small><h2>{form.id ? 'Doctor card edit করুন' : 'নতুন Doctor card'}</h2><p>Personal phone/WhatsApp নেওয়া হয় না—public card সবসময় {provider.name_bn} Reception ব্যবহার করবে।</p></div>{form.id && <button type="button" onClick={() => { setForm(emptyForm); setPhotoFile(null); }}><X /></button>}</header><div className="provider-doctor-card-form-grid"><label className="provider-doctor-photo-field"><span>Doctor photo <small>ঐচ্ছিক</small></span><div>{(photoFile || form.photoPath) ? <img src={photoFile ? URL.createObjectURL(photoFile) : getImageUrl(form.photoPath, 'public-images', 'thumbnail') || form.photoPath} alt="Preview" /> : <Stethoscope />}<b><Camera /> ছবি নির্বাচন<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={(event) => setPhotoFile(event.target.files?.[0] || null)} /></b></div></label><div className="provider-doctor-card-fields"><label>Doctor name<input required minLength={2} maxLength={150} value={form.doctorName} onChange={(event) => setForm({ ...form, doctorName: event.target.value })} /></label><label>Degree<input maxLength={250} value={form.degree} onChange={(event) => setForm({ ...form, degree: event.target.value })} placeholder="MBBS, FCPS…" /></label><label>Specialty<input maxLength={250} value={form.specialty} onChange={(event) => setForm({ ...form, specialty: event.target.value })} placeholder="Medicine, Cardiology…" /></label><label>Designation<input maxLength={250} value={form.designation} onChange={(event) => setForm({ ...form, designation: event.target.value })} /></label><label>BMDC number<input maxLength={100} value={form.bmdc} onChange={(event) => setForm({ ...form, bmdc: event.target.value })} /></label><label>Experience (years)<input type="number" min={0} max={80} value={form.experience} onChange={(event) => setForm({ ...form, experience: event.target.value })} /></label><label>Consultation fee (৳)<input type="number" min={0} value={form.fee} onChange={(event) => setForm({ ...form, fee: event.target.value })} /></label><label>Sort order<input type="number" min={0} value={form.sortOrder} onChange={(event) => setForm({ ...form, sortOrder: Number(event.target.value) })} /></label></div></div><label>Visiting schedule<textarea rows={2} maxLength={500} value={form.visitingSchedule} onChange={(event) => setForm({ ...form, visitingSchedule: event.target.value })} placeholder="যেমন: শনি–বৃহস্পতি, বিকাল ৪টা–রাত ৮টা" /></label><label>Appointment note<textarea rows={2} maxLength={500} value={form.appointmentNote} onChange={(event) => setForm({ ...form, appointmentNote: event.target.value })} placeholder="Reception/serial সংক্রান্ত সংক্ষিপ্ত নির্দেশনা" /></label><label className="schedule-active"><input type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} /> Public card active</label><button className="auth-submit" disabled={saving}>{saving ? <LoaderCircle className="spin" /> : form.id ? <><Save /> Update card</> : <><Plus /> Create card</>}</button></form>
      <section className="provider-managed-card-list"><div className="section-title"><div><h2>Reception Doctor Cards</h2><p>Active card visitor Hospital page-এ existing Doctor card design-এ দেখাবে।</p></div><b>{cards.filter((card) => card.is_active).length} active</b></div>{loading ? <div className="loading-box"><LoaderCircle className="spin" /> Cards লোড হচ্ছে…</div> : cards.length ? <div>{cards.map((card) => <article key={card.id} className={!card.is_active ? 'inactive' : ''}><div className="provider-managed-card-avatar">{card.photo_path ? <img src={getImageUrl(card.photo_path, 'public-images', 'thumbnail') || card.photo_path} alt="" /> : <Stethoscope />}</div><div><h3>{card.doctor_name}</h3><p>{[card.degree, card.specialty, card.designation].filter(Boolean).join(' • ') || 'Doctor information'}</p><small>{card.visiting_schedule || 'Visiting schedule দেওয়া হয়নি'} • {card.is_active ? 'Public' : 'Hidden'}</small></div><button type="button" onClick={() => edit(card)}><Pencil /> Edit</button><button type="button" className={confirmRemove === card.id ? 'danger confirming' : 'danger'} disabled={saving} onClick={() => void deactivate(card)}><Trash2 /> {confirmRemove === card.id ? 'Confirm remove' : 'Remove'}</button>{confirmRemove === card.id && <button type="button" onClick={() => setConfirmRemove(null)}><X /></button>}</article>)}</div> : <div className="empty-inline">এখনো কোনো Reception Doctor card নেই।</div>}</section></>}
  </main></div>;
}
