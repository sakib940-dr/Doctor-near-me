import { FormEvent, useEffect, useState } from 'react';
import { ArrowLeft, Building2, Clock3, LoaderCircle, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { deleteMyChamberSchedule, getMyDoctorProfile, saveMyChamberSchedule } from '../services/doctorDashboard';
import type { DoctorDashboardChamber, DoctorDashboardSchedule, MyDoctorProfile } from '../types';

const weekdays = ['রবিবার', 'সোমবার', 'মঙ্গলবার', 'বুধবার', 'বৃহস্পতিবার', 'শুক্রবার', 'শনিবার'];
const emptyForm = { scheduleId: null as string | null, providerId: '', dayOfWeek: 0, startTime: '09:00', endTime: '12:00', fee: '', isActive: true };
const messageFrom = (error: unknown) => error instanceof Error ? error.message : 'Schedule সংরক্ষণ করা যায়নি।';

export default function DoctorSchedulePage() {
  const { account } = useAuth();
  const [profile, setProfile] = useState<MyDoctorProfile | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    getMyDoctorProfile().then(setProfile).catch((loadError: unknown) => setError(messageFrom(loadError))).finally(() => setLoading(false));
  };
  useEffect(load, []);
  if (account && account.role !== 'doctor') return <Navigate to="/dashboard" replace />;

  const availableChambers = profile?.chambers.filter((chamber) => chamber.link_status === 'approved' && chamber.provider_status === 'approved' && chamber.verified) || [];

  function openForm(chamber: DoctorDashboardChamber, schedule?: DoctorDashboardSchedule) {
    setForm(schedule ? { scheduleId: schedule.id, providerId: chamber.id, dayOfWeek: schedule.day_of_week, startTime: schedule.start_time.slice(0, 5), endTime: schedule.end_time.slice(0, 5), fee: schedule.fee == null ? '' : String(schedule.fee), isActive: schedule.is_active } : { ...emptyForm, providerId: chamber.id });
    setNotice(null); setError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(null); setNotice(null);
    try {
      await saveMyChamberSchedule({ providerId: form.providerId, dayOfWeek: form.dayOfWeek, startTime: form.startTime, endTime: form.endTime, fee: form.fee ? Number(form.fee) : null, isActive: form.isActive, scheduleId: form.scheduleId });
      setForm(emptyForm); setNotice('চেম্বারের schedule সফলভাবে সংরক্ষণ হয়েছে।'); load();
    } catch (saveError) { setError(messageFrom(saveError)); } finally { setSaving(false); }
  }

  async function remove(id: string) {
    if (deleteId !== id) { setDeleteId(id); return; }
    setWorkingId(id); setError(null);
    try { await deleteMyChamberSchedule(id); setDeleteId(null); setNotice('Schedule মুছে ফেলা হয়েছে।'); load(); }
    catch (deleteError) { setError(messageFrom(deleteError)); }
    finally { setWorkingId(null); }
  }

  return <div className="app-shell doctor-dashboard-page"><main className="doctor-dashboard-main container"><Link className="back-link" to="/dashboard"><ArrowLeft /> Dashboard-এ ফিরুন</Link><div className="doctor-page-heading"><span><Clock3 /></span><div><small>Availability</small><h1>চেম্বার ও সময়সূচি</h1><p>অনুমোদিত চেম্বারের visiting day, সময় ও fee পরিচালনা করুন।</p></div></div>{error && <div className="error-box" role="alert">{error}</div>}{notice && <div className="auth-message success">{notice}</div>}{form.providerId && <form className="schedule-form-card" onSubmit={submit}><div className="schedule-form-title"><div><h2>{form.scheduleId ? 'Schedule সম্পাদনা' : 'নতুন schedule'}</h2><p>{availableChambers.find((chamber) => chamber.id === form.providerId)?.name_bn}</p></div><button type="button" aria-label="ফর্ম বন্ধ করুন" onClick={() => setForm(emptyForm)}><X /></button></div><div className="schedule-form-grid"><label className="auth-field"><span>দিন</span><div><select value={form.dayOfWeek} onChange={(event) => setForm((current) => ({ ...current, dayOfWeek: Number(event.target.value) }))}>{weekdays.map((day, index) => <option key={day} value={index}>{day}</option>)}</select></div></label><label className="auth-field"><span>শুরুর সময়</span><div><input required type="time" value={form.startTime} onChange={(event) => setForm((current) => ({ ...current, startTime: event.target.value }))} /></div></label><label className="auth-field"><span>শেষ সময়</span><div><input required type="time" value={form.endTime} onChange={(event) => setForm((current) => ({ ...current, endTime: event.target.value }))} /></div></label><label className="auth-field"><span>ভিজিট ফি (৳)</span><div><input type="number" min="0" step="1" value={form.fee} onChange={(event) => setForm((current) => ({ ...current, fee: event.target.value }))} /></div></label></div><label className="schedule-active"><input type="checkbox" checked={form.isActive} onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))} /> রোগীরা এই schedule-এ appointment নিতে পারবেন</label><button className="auth-submit" type="submit" disabled={saving}>{saving ? <LoaderCircle className="spin" /> : <><Save /> সংরক্ষণ করুন</>}</button></form>}{loading ? <div className="loading-box"><LoaderCircle className="spin" /> Schedule লোড হচ্ছে…</div> : !profile?.chambers.length ? <div className="empty-state"><span>🏥</span><h3>কোনো চেম্বার সংযুক্ত নেই</h3><p>Hospital/Chamber কর্তৃপক্ষ আপনাকে link করে অনুমোদন করলে এখানে schedule যোগ করতে পারবেন।</p></div> : <div className="doctor-chamber-grid">{profile.chambers.map((chamber) => { const canManage = chamber.link_status === 'approved' && chamber.provider_status === 'approved' && chamber.verified; return <article className="doctor-chamber-card" key={chamber.id}><header><span><Building2 /></span><div><h2>{chamber.name_bn}</h2><p>{chamber.address || 'ঠিকানা দেওয়া হয়নি'}</p></div><b className={canManage ? 'approved' : 'pending'}>{canManage ? 'অনুমোদিত' : 'অপেক্ষমাণ'}</b></header>{canManage && <button className="add-schedule-button" type="button" onClick={() => openForm(chamber)}><Plus /> Schedule যোগ করুন</button>}<div className="doctor-schedule-list">{chamber.schedules.length ? chamber.schedules.map((schedule) => <div className={!schedule.is_active ? 'inactive' : ''} key={schedule.id}><span><strong>{weekdays[schedule.day_of_week]}</strong><small>{schedule.start_time.slice(0, 5)} – {schedule.end_time.slice(0, 5)}</small></span><b>{schedule.fee == null ? 'Default fee' : `৳${schedule.fee}`}</b>{canManage && <div><button type="button" title="Edit" onClick={() => openForm(chamber, schedule)}><Pencil /></button><button className={deleteId === schedule.id ? 'confirm-delete' : ''} type="button" title="Delete" disabled={workingId === schedule.id} onClick={() => void remove(schedule.id)}>{workingId === schedule.id ? <LoaderCircle className="spin" /> : <Trash2 />}</button>{deleteId === schedule.id && <button type="button" onClick={() => setDeleteId(null)}><X /></button>}</div>}</div>) : <p className="no-schedule">এখনো কোনো schedule নেই।</p>}</div>{!canManage && <p className="chamber-warning">Link status: {chamber.link_status}; provider status: {chamber.provider_status}. Verification সম্পন্ন না হওয়া পর্যন্ত schedule বদলানো যাবে না।</p>}</article>; })}</div>}</main></div>;
}
