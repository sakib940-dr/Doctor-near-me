import { FormEvent, useState } from 'react';
import { CalendarDays, CheckCircle2, Clock3, LoaderCircle, MessageCircle, Phone, X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { buildWhatsAppAppointmentUrl } from '../lib/whatsapp';
import { createProviderReceptionAppointment } from '../services/providerReception';
import { recordProviderInteraction } from '../services/engagement';
import type { DoctorSearchRow, ProviderDirectoryRow, ProviderManagedDoctorCard } from '../types';
import DoctorResultCard from './DoctorResultCard';

const cleanPhone = (value: string) => value.replace(/[^0-9+]/g, '');
const today = () => { const date = new Date(); const offset = date.getTimezoneOffset(); return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10); };
const maxDate = () => { const date = new Date(); date.setDate(date.getDate() + 180); const offset = date.getTimezoneOffset(); return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10); };
const messageFrom = (error: unknown) => {
  const message = error instanceof Error ? error.message : error && typeof error === 'object' && 'message' in error ? String(error.message) : '';
  if (message.includes('DUPLICATE_RECEPTION_APPOINTMENT')) return 'এই Doctor ও তারিখের জন্য আপনার একটি active request ইতিমধ্যে আছে।';
  if (message.includes('COMPLETE_PATIENT_PROFILE_REQUIRED')) return 'Appointment নেওয়ার আগে Patient profile সম্পূর্ণ করুন।';
  return message || 'Reception appointment পাঠানো যায়নি।';
};

export default function ProviderManagedDoctorCard({ card, provider }: { card: ProviderManagedDoctorCard; provider: ProviderDirectoryRow }) {
  const { user, account } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const phone = provider.phone ? cleanPhone(provider.phone) : null;
  const whatsappSource = provider.whatsapp || provider.phone || null;
  const whatsappUrl = whatsappSource ? buildWhatsAppAppointmentUrl(whatsappSource, `${card.doctor_name}, ${provider.name_bn}`) : null;
  const doctor: DoctorSearchRow = {
    doctor_id: card.id, doctor_name: card.doctor_name, avatar_url: card.photo_path,
    degree: card.degree, designation: card.designation, professional_title: card.designation,
    specialty_text: card.specialty, public_address: provider.address, bmdc_registration_no: card.bmdc_registration_no,
    medical_college: null, present_job: provider.name_bn, consultation_fee: card.consultation_fee,
    experience_years: card.experience_years, district_id: provider.district_id, district_name_bn: null,
    upazila_id: provider.upazila_id, upazila_name_bn: null, specialties: [], available_today: true,
    total_count: 1, nearest_provider_name: provider.name_bn, nearest_provider_address: provider.address,
    verification_status: 'approved',
  };

  function track(type: 'call_click' | 'whatsapp_click' | 'appointment_click') {
    void recordProviderInteraction(provider.id, type, 'provider_managed_doctor_card').catch(() => undefined);
  }

  function beginBooking() {
    track('appointment_click');
    if (!user) { navigate('/auth', { state: { from: `${location.pathname}${location.search}` } }); return; }
    if (account?.role !== 'patient') { setError('Reception appointment শুধুমাত্র Patient account থেকে নেওয়া যাবে।'); setOpen(true); return; }
    setError(null); setSuccess(false); setOpen(true);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!date) return;
    setSubmitting(true); setError(null);
    try {
      await createProviderReceptionAppointment({ doctorCardId: card.id, appointmentDate: date, preferredTime: time, patientNote: note });
      setSuccess(true); setDate(''); setTime(''); setNote('');
    } catch (submitError) { setError(messageFrom(submitError)); }
    finally { setSubmitting(false); }
  }

  return <article className="provider-doctor-card-shell-v2 provider-managed-doctor-card">
    <DoctorResultCard doctor={doctor} profileHref={null} hideSave avatarBucket="public-images" cardBadge="Reception" />
    {card.visiting_schedule && <div className="provider-doctor-schedule-v2"><Clock3 />{card.visiting_schedule}</div>}
    {card.appointment_note && <p className="provider-managed-card-note">{card.appointment_note}</p>}
    <div className="provider-doctor-common-contact-v2 provider-managed-contact-actions">
      {phone ? <a href={`tel:${phone}`} onClick={() => track('call_click')}><Phone />কল করুন</a> : <button type="button" disabled><Phone />কল করুন</button>}
      {whatsappUrl ? <a href={whatsappUrl} target="_blank" rel="noreferrer" onClick={() => track('whatsapp_click')}><MessageCircle />WhatsApp</a> : <button type="button" disabled><MessageCircle />WhatsApp</button>}
      <button type="button" onClick={beginBooking}><CalendarDays />Appointment/Serial</button>
    </div>
    {open && <div className="reception-booking-overlay" role="presentation" onClick={() => !submitting && setOpen(false)}><form className="reception-booking-dialog" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()} onSubmit={submit}><header><div><small>{provider.name_bn} Reception</small><h2>{card.doctor_name}</h2><p>Request সরাসরি Hospital Reception-এর কাছে যাবে।</p></div><button type="button" onClick={() => setOpen(false)}><X /></button></header>{success ? <div className="reception-booking-success"><CheckCircle2 /><h3>Request পাঠানো হয়েছে</h3><p>Reception confirm করলে notification ও serial নম্বর পাবেন।</p><button type="button" onClick={() => setOpen(false)}>ঠিক আছে</button></div> : <>{error && <div className="auth-message error">{error}</div>}{account?.role === 'patient' && <><label>Appointment date<input required type="date" min={today()} max={maxDate()} value={date} onChange={(event) => setDate(event.target.value)} /></label><label>পছন্দের সময় <small>ঐচ্ছিক</small><input type="time" value={time} onChange={(event) => setTime(event.target.value)} /></label><label>রোগীর নোট <small>ঐচ্ছিক</small><textarea rows={3} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} placeholder="সমস্যা বা বিশেষ প্রয়োজন সংক্ষেপে লিখুন" /></label><footer><button type="button" onClick={() => setOpen(false)}>বাতিল</button><button className="primary" disabled={submitting}>{submitting ? <LoaderCircle className="spin" /> : <CalendarDays />}{submitting ? 'পাঠানো হচ্ছে…' : 'Request পাঠান'}</button></footer></>}</>}</form></div>}
  </article>;
}
