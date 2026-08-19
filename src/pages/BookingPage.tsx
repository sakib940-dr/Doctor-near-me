import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CalendarDays, Clock3, LoaderCircle, MapPin, ShieldCheck, Stethoscope } from 'lucide-react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { createPatientAppointment } from '../services/appointments';
import { getDoctorPublicProfile } from '../services/discovery';
import type { DoctorPublicProfile } from '../types';

const today = () => { const date = new Date(); const offset = date.getTimezoneOffset(); return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10); };
const maxDate = () => { const date = new Date(); date.setDate(date.getDate() + 180); const offset = date.getTimezoneOffset(); return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10); };
const displayTime = (time: string) => time.slice(0, 5);

export default function BookingPage() {
  const { doctorId = '' } = useParams();
  const { account } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<DoctorPublicProfile | null>(null);
  const [providerId, setProviderId] = useState('');
  const [date, setDate] = useState('');
  const [scheduleKey, setScheduleKey] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { getDoctorPublicProfile(doctorId).then((result) => { setProfile(result); if (result?.chambers[0]) setProviderId(result.chambers[0].id); }).catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : 'ডাক্তার তথ্য লোড হয়নি।')).finally(() => setLoading(false)); }, [doctorId]);
  const chamber = profile?.chambers.find((item) => item.id === providerId);
  const day = date ? new Date(`${date}T12:00:00`).getDay() : null;
  const schedules = useMemo(() => chamber?.schedules.filter((schedule) => day === schedule.day_of_week) ?? [], [chamber, day]);
  const selectedSchedule = schedules.find((schedule) => `${schedule.start_time}-${schedule.end_time}` === scheduleKey);
  const canBookOnline = profile?.doctor.verification_status === 'approved' && profile.doctor.accepting_appointments;

  if (account && account.role !== 'patient') return <Navigate to="/dashboard" replace />;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedSchedule) { setError('তারিখ অনুযায়ী visiting time নির্বাচন করুন।'); return; }
    setSubmitting(true); setError(null);
    try {
      await createPatientAppointment({ doctorId, providerId, appointmentDate: date, startTime: selectedSchedule.start_time, endTime: selectedSchedule.end_time, patientNote: note });
      navigate('/appointments?created=1', { replace: true });
    } catch (submitError) { setError(submitError instanceof Error ? submitError.message : 'Appointment request পাঠানো যায়নি।'); } finally { setSubmitting(false); }
  }

  return <div className="app-shell booking-page"><main className="booking-main container"><Link className="back-link" to={`/doctors/${doctorId}`}><ArrowLeft /> ডাক্তার প্রোফাইলে ফিরুন</Link>{loading && <div className="loading-box"><LoaderCircle className="spin" /> তথ্য লোড হচ্ছে…</div>}{!loading && !profile && <div className="empty-state"><span><Stethoscope /></span><h3>ডাক্তার পাওয়া যায়নি</h3></div>}{profile && !canBookOnline && <div className="empty-state booking-unavailable"><span><ShieldCheck /></span><h3>Online appointment এখন available নয়</h3><p>{profile.doctor.verification_status === 'approved' ? 'এই ডাক্তার বর্তমানে online appointment গ্রহণ করছেন না।' : 'Doctor verification approved হওয়ার পর online appointment booking available হবে।'}</p></div>}{profile && canBookOnline && <div className="booking-layout"><section className="booking-summary"><span><Stethoscope /></span><h1>{profile.doctor.name}</h1><p>{profile.doctor.designation || profile.doctor.professional_title}</p><div className="directory-tags">{profile.specialties.map((specialty) => <span key={specialty.id}>{specialty.name_bn}</span>)}</div><div className="booking-safety"><ShieldCheck /><p>এটি appointment request। ডাক্তার বা চেম্বার confirm করলে status পরিবর্তন হবে।</p></div></section><form className="booking-form" onSubmit={submit}><h2>Appointment-এর সময় বেছে নিন</h2><label className="auth-field"><span>চেম্বার / হাসপাতাল</span><div><MapPin /><select required value={providerId} onChange={(event) => { setProviderId(event.target.value); setScheduleKey(''); }}>{profile.chambers.map((item) => <option key={item.id} value={item.id}>{item.name_bn}</option>)}</select></div></label>{chamber && <p className="selected-address">{chamber.address}</p>}<label className="auth-field"><span>তারিখ</span><div><CalendarDays /><input required type="date" min={today()} max={maxDate()} value={date} onChange={(event) => { setDate(event.target.value); setScheduleKey(''); }} /></div></label><fieldset className="schedule-picker"><legend>Visiting time</legend>{!date ? <p>আগে তারিখ নির্বাচন করুন।</p> : schedules.length ? schedules.map((schedule) => { const key = `${schedule.start_time}-${schedule.end_time}`; return <label className={scheduleKey === key ? 'selected' : ''} key={key}><input type="radio" name="schedule" checked={scheduleKey === key} onChange={() => setScheduleKey(key)} /><Clock3 /><span><strong>{displayTime(schedule.start_time)} – {displayTime(schedule.end_time)}</strong><small>{schedule.fee == null ? 'ফি জানতে যোগাযোগ করুন' : `৳${schedule.fee}`}</small></span></label>; }) : <p>এই দিনে visiting schedule নেই। অন্য তারিখ দিন।</p>}</fieldset><label className="booking-note"><span>সমস্যা বা নোট <small>({note.length}/500)</small></span><textarea maxLength={500} rows={4} value={note} onChange={(event) => setNote(event.target.value)} placeholder="সংক্ষেপে রোগীর সমস্যা লিখুন (ঐচ্ছিক)" /></label>{error && <div className="auth-message error" role="alert">{error}</div>}<button className="auth-submit" type="submit" disabled={submitting || !selectedSchedule}>{submitting ? <LoaderCircle className="spin" /> : 'Appointment request পাঠান'}</button></form></div>}</main></div>;
}
