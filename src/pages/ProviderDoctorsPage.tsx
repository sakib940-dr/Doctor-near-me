import { FormEvent, useEffect, useState } from 'react';
import { ArrowLeft, Clock3, LoaderCircle, Pencil, Plus, Search, Stethoscope, Trash2, UserPlus, X } from 'lucide-react';
import { Link, Navigate } from 'react-router-dom';
import PublicHeader from '../components/PublicHeader';
import { useAuth } from '../contexts/AuthContext';
import { getImageUrl } from '../lib/storage';
import { deleteProviderDoctorSchedule, getMyProviderDashboard, inviteDoctorToMyProvider, removeDoctorFromMyProvider, saveProviderDoctorSchedule, searchApprovedDoctorsForProvider } from '../services/providerDashboard';
import type { DoctorDashboardSchedule, ProviderDashboardItem, ProviderDoctorLink, ProviderDoctorSearchRow } from '../types';

const weekdays = ['রবিবার', 'সোমবার', 'মঙ্গলবার', 'বুধবার', 'বৃহস্পতিবার', 'শুক্রবার', 'শনিবার'];
const statusLabels = { pending: 'Doctor-এর উত্তর অপেক্ষমাণ', approved: 'সংযুক্ত', rejected: 'প্রত্যাখ্যাত', removed: 'অপসারিত' };
const emptySchedule = { doctorId: '', scheduleId: null as string | null, dayOfWeek: 0, startTime: '09:00', endTime: '12:00', fee: '', isActive: true };
const messageFrom = (error: unknown) => error instanceof Error ? error.message : 'কাজটি সম্পন্ন করা যায়নি।';

export default function ProviderDoctorsPage() {
  const { account } = useAuth();
  const [providers, setProviders] = useState<ProviderDashboardItem[]>([]);
  const [providerId, setProviderId] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProviderDoctorSearchRow[]>([]);
  const [schedule, setSchedule] = useState(emptySchedule);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [working, setWorking] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    getMyProviderDashboard().then((rows) => { setProviders(rows); setProviderId((current) => current || rows[0]?.id || ''); }).catch((loadError: unknown) => setError(messageFrom(loadError))).finally(() => setLoading(false));
  };
  useEffect(load, []);
  if (account && !['hospital', 'chamber'].includes(account.role)) return <Navigate to="/dashboard" replace />;

  const provider = providers.find((item) => item.id === providerId) || null;

  async function searchDoctors(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSearching(true); setError(null);
    try { setResults(await searchApprovedDoctorsForProvider(query)); }
    catch (searchError) { setError(messageFrom(searchError)); }
    finally { setSearching(false); }
  }

  async function invite(doctorId: string) {
    if (!providerId) return;
    setWorking(doctorId); setError(null); setNotice(null);
    try { await inviteDoctorToMyProvider(providerId, doctorId); setNotice('Doctor-কে invitation পাঠানো হয়েছে। Accept না করা পর্যন্ত schedule যোগ করা যাবে না।'); load(); }
    catch (inviteError) { setError(messageFrom(inviteError)); }
    finally { setWorking(null); }
  }

  async function remove(link: ProviderDoctorLink) {
    if (!providerId) return;
    if (confirmRemove !== link.doctor_id) { setConfirmRemove(link.doctor_id); return; }
    setWorking(link.doctor_id); setError(null);
    try { await removeDoctorFromMyProvider(providerId, link.doctor_id); setConfirmRemove(null); setNotice('Doctor link অপসারণ হয়েছে এবং schedule inactive হয়েছে।'); load(); }
    catch (removeError) { setError(messageFrom(removeError)); }
    finally { setWorking(null); }
  }

  function editSchedule(doctorId: string, item?: DoctorDashboardSchedule) {
    setSchedule(item ? { doctorId, scheduleId: item.id, dayOfWeek: item.day_of_week, startTime: item.start_time.slice(0, 5), endTime: item.end_time.slice(0, 5), fee: item.fee == null ? '' : String(item.fee), isActive: item.is_active } : { ...emptySchedule, doctorId });
    setError(null); setNotice(null); window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function saveSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!providerId || !schedule.doctorId) return;
    setWorking('schedule'); setError(null);
    try {
      await saveProviderDoctorSchedule({ providerId, doctorId: schedule.doctorId, dayOfWeek: schedule.dayOfWeek, startTime: schedule.startTime, endTime: schedule.endTime, fee: schedule.fee ? Number(schedule.fee) : null, isActive: schedule.isActive, scheduleId: schedule.scheduleId });
      setSchedule(emptySchedule); setNotice('Doctor-এর chamber schedule সংরক্ষণ হয়েছে।'); load();
    } catch (saveError) { setError(messageFrom(saveError)); } finally { setWorking(null); }
  }

  async function deleteSchedule(scheduleId: string) {
    if (!providerId) return;
    setWorking(scheduleId); setError(null);
    try { await deleteProviderDoctorSchedule(providerId, scheduleId); setNotice('Schedule মুছে ফেলা হয়েছে।'); load(); }
    catch (deleteError) { setError(messageFrom(deleteError)); }
    finally { setWorking(null); }
  }

  const existingLink = (doctorId: string) => provider?.doctor_links.find((link) => link.doctor_id === doctorId && link.link_status !== 'removed');

  return <div className="app-shell provider-dashboard-page"><PublicHeader /><main className="provider-dashboard-main container"><Link className="back-link" to="/dashboard"><ArrowLeft /> Dashboard-এ ফিরুন</Link><div className="provider-page-heading"><span><Stethoscope /></span><div><small>Consent-based linking</small><h1>ডাক্তার ব্যবস্থাপনা</h1><p>Verified Doctor-কে invite করুন; Doctor accept করলে শুধু chamber schedule পরিচালনা করুন।</p></div></div>{providers.length > 1 && <label className="provider-selector">প্রতিষ্ঠান<select value={providerId} onChange={(event) => { setProviderId(event.target.value); setSchedule(emptySchedule); setResults([]); }}><option value="">নির্বাচন করুন</option>{providers.map((item) => <option key={item.id} value={item.id}>{item.name_bn}</option>)}</select></label>}{error && <div className="error-box" role="alert">{error}</div>}{notice && <div className="auth-message success">{notice}</div>}{!loading && !providers.length && <div className="empty-state"><span>🏥</span><h3>আগে প্রতিষ্ঠানের profile তৈরি করুন</h3><p>Profile ছাড়া Doctor invitation পাঠানো যাবে না।</p><Link className="inline-primary" to="/provider/profile">Profile তৈরি করুন</Link></div>}{provider && <>{schedule.doctorId && <form className="schedule-form-card" onSubmit={saveSchedule}><div className="schedule-form-title"><div><h2>{schedule.scheduleId ? 'Schedule সম্পাদনা' : 'Schedule যোগ করুন'}</h2><p>{provider.doctor_links.find((link) => link.doctor_id === schedule.doctorId)?.doctor_name}</p></div><button type="button" onClick={() => setSchedule(emptySchedule)}><X /></button></div><div className="schedule-form-grid"><label className="auth-field"><span>দিন</span><div><select value={schedule.dayOfWeek} onChange={(event) => setSchedule((current) => ({ ...current, dayOfWeek: Number(event.target.value) }))}>{weekdays.map((day, index) => <option key={day} value={index}>{day}</option>)}</select></div></label><label className="auth-field"><span>শুরুর সময়</span><div><input required type="time" value={schedule.startTime} onChange={(event) => setSchedule((current) => ({ ...current, startTime: event.target.value }))} /></div></label><label className="auth-field"><span>শেষ সময়</span><div><input required type="time" value={schedule.endTime} onChange={(event) => setSchedule((current) => ({ ...current, endTime: event.target.value }))} /></div></label><label className="auth-field"><span>ভিজিট ফি</span><div><input type="number" min="0" value={schedule.fee} onChange={(event) => setSchedule((current) => ({ ...current, fee: event.target.value }))} /></div></label></div><label className="schedule-active"><input type="checkbox" checked={schedule.isActive} onChange={(event) => setSchedule((current) => ({ ...current, isActive: event.target.checked }))} /> Schedule active</label><button className="auth-submit" disabled={working === 'schedule'}>{working === 'schedule' ? <LoaderCircle className="spin" /> : <>সংরক্ষণ করুন</>}</button></form>}<section className="provider-doctor-search"><h2>Verified Doctor খুঁজুন</h2><form onSubmit={searchDoctors}><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="নাম, degree বা designation" /><button disabled={searching}>{searching ? <LoaderCircle className="spin" /> : 'খুঁজুন'}</button></form>{results.length > 0 && <div className="doctor-search-results">{results.map((doctor) => { const linked = existingLink(doctor.doctor_id); const avatar = getImageUrl(doctor.avatar_url, 'avatars'); return <article key={doctor.doctor_id}><span>{avatar ? <img src={avatar} alt={doctor.doctor_name} /> : <Stethoscope />}</span><div><strong>{doctor.doctor_name}</strong><small>{doctor.degree || doctor.designation || doctor.professional_title || 'Verified Doctor'}</small><p>{doctor.specialty_names_bn.join(' • ')}</p></div><button type="button" disabled={Boolean(linked) || working === doctor.doctor_id} onClick={() => void invite(doctor.doctor_id)}><UserPlus /> {linked ? statusLabels[linked.link_status] : 'Invite'}</button></article>; })}</div>}</section><section className="provider-linked-doctors"><div className="section-title"><div><h2>Doctor links</h2><p>Personal profile fields পরিবর্তনের access নেই।</p></div><b>{provider.doctor_links.filter((link) => link.link_status === 'approved').length} connected</b></div>{provider.doctor_links.filter((link) => link.link_status !== 'removed').length ? provider.doctor_links.filter((link) => link.link_status !== 'removed').map((link) => { const avatar = getImageUrl(link.avatar_url, 'avatars'); return <article key={link.doctor_id}><header><span>{avatar ? <img src={avatar} alt={link.doctor_name} /> : <Stethoscope />}</span><div><h3>{link.doctor_name}</h3><p>{link.degree || link.designation || link.professional_title || 'Verified Doctor'}</p></div><b className={`link-${link.link_status}`}>{statusLabels[link.link_status]}</b></header>{link.link_status === 'approved' && <><button className="add-schedule-button" type="button" onClick={() => editSchedule(link.doctor_id)}><Plus /> Schedule যোগ করুন</button><div className="provider-doctor-schedules">{link.schedules.length ? link.schedules.map((item) => <div key={item.id} className={!item.is_active ? 'inactive' : ''}><span><strong>{weekdays[item.day_of_week]}</strong><small><Clock3 /> {item.start_time.slice(0, 5)}–{item.end_time.slice(0, 5)}</small></span><b>{item.fee == null ? 'Default fee' : `৳${item.fee}`}</b><div><button type="button" onClick={() => editSchedule(link.doctor_id, item)}><Pencil /></button><button type="button" disabled={working === item.id} onClick={() => void deleteSchedule(item.id)}>{working === item.id ? <LoaderCircle className="spin" /> : <Trash2 />}</button></div></div>) : <p>কোনো schedule নেই।</p>}</div></>}<footer>{confirmRemove === link.doctor_id && <span>Link ও schedule inactive করতে নিশ্চিত?</span>}<button className={confirmRemove === link.doctor_id ? 'confirming' : ''} type="button" disabled={working === link.doctor_id} onClick={() => void remove(link)}><Trash2 /> {confirmRemove === link.doctor_id ? 'হ্যাঁ, অপসারণ' : 'Link অপসারণ'}</button>{confirmRemove === link.doctor_id && <button type="button" onClick={() => setConfirmRemove(null)}>না</button>}</footer></article>; }) : <div className="empty-inline">কোনো Doctor invitation নেই।</div>}</section></>}{loading && <div className="loading-box"><LoaderCircle className="spin" /> Doctor links লোড হচ্ছে…</div>}</main></div>;
}
