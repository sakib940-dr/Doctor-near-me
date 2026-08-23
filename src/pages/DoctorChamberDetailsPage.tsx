import { FormEvent, useEffect, useState } from 'react';
import {
  ArrowLeft,
  Building2,
  Clock3,
  Crosshair,
  LoaderCircle,
  MapPin,
  Pencil,
  Plus,
  Save,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { captureCurrentCoordinates, validateCoordinates } from '../lib/geolocation';
import { getDistricts, getUpazilas, resolveLocationContext } from '../services/discovery';
import {
  deleteMyChamberSchedule,
  getMyDoctorProfile,
  saveMyChamberSchedule,
  saveMyDoctorChamber,
} from '../services/doctorDashboard';
import type {
  District,
  DoctorDashboardChamber,
  DoctorDashboardSchedule,
  MyDoctorProfile,
  Upazila,
} from '../types';

const weekdays = ['রবিবার', 'সোমবার', 'মঙ্গলবার', 'বুধবার', 'বৃহস্পতিবার', 'শুক্রবার', 'শনিবার'];
const providerStatus: Record<string, string> = {
  pending: 'Verification অপেক্ষমাণ',
  approved: 'Verified',
  rejected: 'প্রত্যাখ্যাত',
  suspended: 'স্থগিত',
};
const linkStatus: Record<string, string> = {
  pending: 'Link অপেক্ষমাণ',
  approved: 'সংযুক্ত',
  rejected: 'Link প্রত্যাখ্যাত',
  removed: 'Link সরানো হয়েছে',
};
const messageFrom = (error: unknown) => error instanceof Error ? error.message : 'চেম্বারের তথ্য সংরক্ষণ করা যায়নি।';

interface ChamberDraft {
  providerId: string | null;
  nameBn: string;
  address: string;
  districtId: number | null;
  upazilaId: number | null;
  phone: string;
  whatsapp: string;
  latitude: number | null;
  longitude: number | null;
}

interface ScheduleDraft {
  scheduleId: string | null;
  providerId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  fee: string;
  isActive: boolean;
}

const emptyChamber: ChamberDraft = {
  providerId: null,
  nameBn: '',
  address: '',
  districtId: null,
  upazilaId: null,
  phone: '',
  whatsapp: '',
  latitude: null,
  longitude: null,
};

const emptySchedule: ScheduleDraft = {
  scheduleId: null,
  providerId: '',
  dayOfWeek: 0,
  startTime: '09:00',
  endTime: '12:00',
  fee: '',
  isActive: true,
};

function toDraft(chamber: DoctorDashboardChamber): ChamberDraft {
  return {
    providerId: chamber.id,
    nameBn: chamber.name_bn,
    address: chamber.address || '',
    districtId: chamber.district_id ?? null,
    upazilaId: chamber.upazila_id ?? null,
    phone: chamber.phone || '',
    whatsapp: chamber.whatsapp || '',
    latitude: chamber.latitude ?? null,
    longitude: chamber.longitude ?? null,
  };
}

function formatTime(value: string) {
  return value ? value.slice(0, 5) : '';
}

export default function DoctorChamberDetailsPage({ onSaved }: { onSaved?: () => void | Promise<void> } = {}) {
  const { account } = useAuth();
  const [profile, setProfile] = useState<MyDoctorProfile | null>(null);
  const [districts, setDistricts] = useState<District[]>([]);
  const [upazilas, setUpazilas] = useState<Upazila[]>([]);
  const [draft, setDraft] = useState<ChamberDraft | null>(null);
  const [scheduleDraft, setScheduleDraft] = useState<ScheduleDraft>(emptySchedule);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [workingScheduleId, setWorkingScheduleId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = async (selectProviderId?: string) => {
    const [doctorProfile, districtRows] = await Promise.all([getMyDoctorProfile(), getDistricts()]);
    setProfile(doctorProfile);
    setDistricts(districtRows);
    if (selectProviderId && doctorProfile) {
      const saved = doctorProfile.chambers.find((chamber) => chamber.id === selectProviderId);
      if (saved?.owned_by_doctor) setDraft(toDraft(saved));
    }
  };

  useEffect(() => {
    setLoading(true);
    load().catch((loadError) => setError(messageFrom(loadError))).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!draft?.districtId) {
      setUpazilas([]);
      return;
    }
    getUpazilas(draft.districtId)
      .then(setUpazilas)
      .catch(() => setError('উপজেলা / এলাকার তালিকা লোড করা যায়নি।'));
  }, [draft?.districtId]);

  const ownedChambers = profile?.chambers.filter((chamber) => chamber.owned_by_doctor) || [];

  if (account && account.role !== 'doctor') return <Navigate to="/dashboard" replace />;

  function startNewChamber() {
    setDraft({ ...emptyChamber });
    setScheduleDraft(emptySchedule);
    setError(null);
    setNotice(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function editChamber(chamber: DoctorDashboardChamber) {
    if (!chamber.owned_by_doctor) return;
    setDraft(toDraft(chamber));
    setScheduleDraft(emptySchedule);
    setError(null);
    setNotice(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function setDraftValue<K extends keyof ChamberDraft>(key: K, value: ChamberDraft[K]) {
    setDraft((current) => current ? { ...current, [key]: value } : current);
  }

  async function captureLocation() {
    if (!draft) return;
    setCapturing(true);
    setError(null);
    setNotice(null);
    try {
      const coordinates = await captureCurrentCoordinates();
      setDraft((current) => current ? {
        ...current,
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
      } : current);

      try {
        const resolved = await resolveLocationContext(coordinates.latitude, coordinates.longitude);
        setDraft((current) => current ? {
          ...current,
          districtId: resolved.district_id,
          upazilaId: resolved.upazila_id,
        } : current);
        setNotice(`Current Location নেওয়া হয়েছে${coordinates.accuracy ? ` (প্রায় ${Math.round(coordinates.accuracy)} মিটার accuracy)` : ''}। জেলা/উপজেলা/এলাকা ও coordinate যাচাই করে Save করুন।`);
      } catch {
        setNotice(`GPS coordinate নেওয়া হয়েছে${coordinates.accuracy ? ` (প্রায় ${Math.round(coordinates.accuracy)} মিটার accuracy)` : ''}। জেলা/উপজেলা/এলাকা manually যাচাই করে Save করুন।`);
      }
    } catch (captureError) {
      setError(messageFrom(captureError));
    } finally {
      setCapturing(false);
    }
  }

  async function submitChamber(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    const coordinateError = validateCoordinates(draft.latitude, draft.longitude);
    if (coordinateError) {
      setError(coordinateError);
      return;
    }
    if (!draft.districtId) {
      setError('চেম্বারের জেলা নির্বাচন করুন।');
      return;
    }
    if (draft.latitude == null || draft.longitude == null) {
      setError('Public profile-এ map দেখানোর জন্য GPS চালু করে Latitude ও Longitude যোগ করুন।');
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const result = await saveMyDoctorChamber({
        providerId: draft.providerId,
        nameBn: draft.nameBn,
        address: draft.address,
        districtId: draft.districtId,
        upazilaId: draft.upazilaId,
        phone: draft.phone.trim() || null,
        whatsapp: draft.whatsapp.trim() || null,
        latitude: draft.latitude,
        longitude: draft.longitude,
      });
      await load(result.provider_id);
      setNotice(result.verification_reset
        ? 'চেম্বারের তথ্য সংরক্ষণ হয়েছে। নতুন/পরিবর্তিত নাম বা location-এর জন্য provider verification pending থাকবে; approval-এর পর Near Me/Public Profile-এ প্রকাশ হবে।'
        : 'চেম্বারের তথ্য সফলভাবে সংরক্ষণ হয়েছে।');
      await onSaved?.();
    } catch (saveError) {
      setError(messageFrom(saveError));
    } finally {
      setSaving(false);
    }
  }

  function openSchedule(chamber: DoctorDashboardChamber, schedule?: DoctorDashboardSchedule) {
    const canSchedule = chamber.link_status === 'approved'
      && (Boolean(chamber.owned_by_doctor) || (chamber.provider_status === 'approved' && chamber.verified));
    if (!canSchedule) {
      setError('এই provider-এর schedule এখন edit করা যাবে না। Provider/link approval প্রয়োজন।');
      return;
    }
    setScheduleDraft(schedule ? {
      scheduleId: schedule.id,
      providerId: chamber.id,
      dayOfWeek: schedule.day_of_week,
      startTime: formatTime(schedule.start_time),
      endTime: formatTime(schedule.end_time),
      fee: schedule.fee == null ? '' : String(schedule.fee),
      isActive: schedule.is_active,
    } : { ...emptySchedule, providerId: chamber.id });
    setError(null);
    setNotice(null);
  }

  async function submitSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!scheduleDraft.providerId) return;
    setSavingSchedule(true);
    setError(null);
    setNotice(null);
    try {
      await saveMyChamberSchedule({
        providerId: scheduleDraft.providerId,
        dayOfWeek: scheduleDraft.dayOfWeek,
        startTime: scheduleDraft.startTime,
        endTime: scheduleDraft.endTime,
        fee: scheduleDraft.fee ? Number(scheduleDraft.fee) : null,
        isActive: scheduleDraft.isActive,
        scheduleId: scheduleDraft.scheduleId,
      });
      await load(draft?.providerId || undefined);
      setScheduleDraft(emptySchedule);
      setNotice('Visiting day/time সফলভাবে সংরক্ষণ হয়েছে।');
    } catch (scheduleError) {
      setError(messageFrom(scheduleError));
    } finally {
      setSavingSchedule(false);
    }
  }

  async function removeSchedule(scheduleId: string) {
    if (workingScheduleId !== scheduleId) {
      setWorkingScheduleId(scheduleId);
      setNotice('Schedule মুছতে আবার Delete চাপুন।');
      return;
    }
    setError(null);
    try {
      await deleteMyChamberSchedule(scheduleId);
      await load(draft?.providerId || undefined);
      setWorkingScheduleId(null);
      setNotice('Schedule মুছে ফেলা হয়েছে।');
    } catch (deleteError) {
      setError(messageFrom(deleteError));
      setWorkingScheduleId(null);
    }
  }

  const selectedScheduleProvider = profile?.chambers.find((chamber) => chamber.id === scheduleDraft.providerId);

  return (
    <div className="app-shell doctor-dashboard-page doctor-chamber-details-page">
      <main className="doctor-dashboard-main container">
        <Link className="back-link" to="/dashboard"><ArrowLeft /> Dashboard-এ ফিরুন</Link>

        <div className="doctor-page-heading chamber-details-heading">
          <span><Building2 /></span>
          <div>
            <small>Doctor self-service</small>
            <h1>Chamber Details</h1>
            <p>নিজের chamber location, যোগাযোগ এবং visiting schedule পরিচালনা করুন। Linked hospital/chamber-এর shared profile provider account-এর ownership-এ থাকবে।</p>
          </div>
        </div>

        <section className="chamber-location-guide" aria-labelledby="chamber-location-guide-title">
          <div className="chamber-location-guide-icon"><Crosshair /></div>
          <div>
            <h2 id="chamber-location-guide-title">সঠিক Chamber Location সেট করার নিয়ম</h2>
            <ol>
              <li>সম্ভব হলে chamber location-এ physically উপস্থিত থেকে location নিন।</li>
              <li>Device/Browser Location permission enable করুন।</li>
              <li><b>Current Location</b> button চাপুন; Latitude/Longitude automatically populate হবে।</li>
              <li>Detected জেলা/উপজেলা/এলাকা এবং coordinate যাচাই করুন।</li>
              <li>সব তথ্য ঠিক থাকলে Save করুন।</li>
              <li>ভুল location হলে আবার Current Location নিন অথবা Latitude/Longitude manually update করুন।</li>
            </ol>
          </div>
        </section>

        {error && <div className="error-box" role="alert">{error}</div>}
        {notice && <div className="auth-message success">{notice}</div>}

        {draft && (
          <form className="doctor-chamber-editor" onSubmit={submitChamber}>
            <div className="chamber-editor-title">
              <div>
                <small>{draft.providerId ? 'Doctor-owned chamber' : 'New doctor-owned chamber'}</small>
                <h2>{draft.providerId ? 'চেম্বারের তথ্য সম্পাদনা' : 'নতুন চেম্বার যোগ করুন'}</h2>
              </div>
              <button type="button" aria-label="Editor বন্ধ করুন" onClick={() => setDraft(null)}><X /></button>
            </div>

            <div className="chamber-editor-grid">
              <label className="auth-field chamber-field-wide">
                <span>Chamber Name</span>
                <div><Building2 /><input required minLength={2} value={draft.nameBn} onChange={(event) => setDraftValue('nameBn', event.target.value)} placeholder="যেমন: City Care Chamber" /></div>
              </label>
              <label className="auth-field">
                <span>Contact Number</span>
                <div><input inputMode="tel" value={draft.phone} onChange={(event) => setDraftValue('phone', event.target.value)} placeholder="01XXXXXXXXX" /></div>
              </label>
              <label className="auth-field">
                <span>WhatsApp Number</span>
                <div><input inputMode="tel" value={draft.whatsapp} onChange={(event) => setDraftValue('whatsapp', event.target.value)} placeholder="01XXXXXXXXX" /></div>
              </label>
              <label className="auth-field chamber-field-wide">
                <span>Address</span>
                <div><MapPin /><input required minLength={3} value={draft.address} onChange={(event) => setDraftValue('address', event.target.value)} placeholder="Road, area, building/floor" /></div>
              </label>
              <label className="auth-field">
                <span>District</span>
                <div><MapPin /><select required value={draft.districtId ?? ''} onChange={(event) => {
                  setDraftValue('districtId', event.target.value ? Number(event.target.value) : null);
                  setDraftValue('upazilaId', null);
                }}><option value="">নির্বাচন করুন</option>{districts.map((district) => <option key={district.id} value={district.id}>{district.name_bn}</option>)}</select></div>
              </label>
              <label className="auth-field">
                <span>Upazila / Area</span>
                <div><MapPin /><select disabled={!draft.districtId} value={draft.upazilaId ?? ''} onChange={(event) => setDraftValue('upazilaId', event.target.value ? Number(event.target.value) : null)}><option value="">নির্বাচন করুন</option>{upazilas.map((upazila) => <option key={upazila.id} value={upazila.id}>{upazila.name_bn}</option>)}</select></div>
              </label>
              <label className="auth-field">
                <span>Latitude</span>
                <div><input required type="number" step="any" min={-90} max={90} value={draft.latitude ?? ''} onChange={(event) => setDraftValue('latitude', event.target.value === '' ? null : Number(event.target.value))} placeholder="23.8103" /></div>
              </label>
              <label className="auth-field">
                <span>Longitude</span>
                <div><input required type="number" step="any" min={-180} max={180} value={draft.longitude ?? ''} onChange={(event) => setDraftValue('longitude', event.target.value === '' ? null : Number(event.target.value))} placeholder="90.4125" /></div>
              </label>
            </div>

            <div className="chamber-location-actions">
              <button className="current-location-button" type="button" disabled={capturing} onClick={() => void captureLocation()}>
                {capturing ? <LoaderCircle className="spin" /> : <Crosshair />} {capturing ? 'Location নেওয়া হচ্ছে…' : 'Current Location'}
              </button>
              <small>GPS unavailable/denied হলে Latitude/Longitude manually লিখতে পারবেন। Range: Latitude -90…90, Longitude -180…180.</small>
            </div>

            <button className="auth-submit chamber-save-button" type="submit" disabled={saving}>
              {saving ? <LoaderCircle className="spin" /> : <><Save /> Chamber Details Save</>}
            </button>
          </form>
        )}

        {scheduleDraft.providerId && (
          <form className="chamber-schedule-editor" onSubmit={submitSchedule}>
            <div className="chamber-editor-title">
              <div><small>Visiting Schedule</small><h2>{selectedScheduleProvider?.name_bn}</h2></div>
              <button type="button" aria-label="Schedule editor বন্ধ করুন" onClick={() => setScheduleDraft(emptySchedule)}><X /></button>
            </div>
            <div className="schedule-form-grid">
              <label className="auth-field"><span>Visiting Day</span><div><select value={scheduleDraft.dayOfWeek} onChange={(event) => setScheduleDraft((current) => ({ ...current, dayOfWeek: Number(event.target.value) }))}>{weekdays.map((day, index) => <option key={day} value={index}>{day}</option>)}</select></div></label>
              <label className="auth-field"><span>Start Time</span><div><input required type="time" value={scheduleDraft.startTime} onChange={(event) => setScheduleDraft((current) => ({ ...current, startTime: event.target.value }))} /></div></label>
              <label className="auth-field"><span>End Time</span><div><input required type="time" value={scheduleDraft.endTime} onChange={(event) => setScheduleDraft((current) => ({ ...current, endTime: event.target.value }))} /></div></label>
              <label className="auth-field"><span>Visit Fee (৳)</span><div><input type="number" min="0" step="1" value={scheduleDraft.fee} onChange={(event) => setScheduleDraft((current) => ({ ...current, fee: event.target.value }))} /></div></label>
            </div>
            <label className="schedule-active"><input type="checkbox" checked={scheduleDraft.isActive} onChange={(event) => setScheduleDraft((current) => ({ ...current, isActive: event.target.checked }))} /> এই visiting time active রাখুন</label>
            <button className="auth-submit" type="submit" disabled={savingSchedule}>{savingSchedule ? <LoaderCircle className="spin" /> : <><Save /> Visiting Time Save</>}</button>
          </form>
        )}

        <div className="chamber-section-title">
          <div><small>Multiple chamber supported</small><h2>আমার Chamber</h2><p>নিজে তৈরি করা chamber-এর information এবং coordinates আপনি edit করতে পারবেন।</p></div>
          <button type="button" onClick={startNewChamber}><Plus /> নতুন Chamber</button>
        </div>

        {loading ? <div className="loading-box"><LoaderCircle className="spin" /> Chamber Details লোড হচ্ছে…</div> : (
          <div className="doctor-owned-chamber-grid">
            {ownedChambers.map((chamber) => <ChamberCard key={chamber.id} chamber={chamber} onEdit={() => editChamber(chamber)} onSchedule={(schedule) => openSchedule(chamber, schedule)} onDeleteSchedule={(id) => void removeSchedule(id)} workingScheduleId={workingScheduleId} />)}
            {!ownedChambers.length && <div className="chamber-empty-card"><Building2 /><h3>নিজস্ব chamber যোগ করা হয়নি</h3><p>“নতুন Chamber” থেকে ঠিকানা, district/upazila ও GPS coordinate save করুন।</p><button type="button" onClick={startNewChamber}><Plus /> Chamber যোগ করুন</button></div>}
          </div>
        )}

        <section className="chamber-data-flow-note">
          <ShieldAlert />
          <div><strong>Near Me ও Prescription-ready data flow</strong><p>Coordinates `providers.latitude/longitude`-এ save হয়। Existing Near Me একই approved chamber coordinates এবং existing distance RPC ব্যবহার করে। Chamber name/address/phone/schedules একই canonical provider/schedule records-এ থাকায় ভবিষ্যতে Prescription PDF এই data reuse করতে পারবে; Prescription core এখানে পরিবর্তন করা হয়নি।</p></div>
        </section>
      </main>
    </div>
  );
}

function ChamberCard({
  chamber,
  readonly = false,
  onEdit,
  onSchedule,
  onDeleteSchedule,
  workingScheduleId,
}: {
  chamber: DoctorDashboardChamber;
  readonly?: boolean;
  onEdit?: () => void;
  onSchedule: (schedule?: DoctorDashboardSchedule) => void;
  onDeleteSchedule: (scheduleId: string) => void;
  workingScheduleId: string | null;
}) {
  const canSchedule = chamber.link_status === 'approved'
    && (Boolean(chamber.owned_by_doctor) || (chamber.provider_status === 'approved' && chamber.verified));
  return (
    <article className={`doctor-chamber-card${readonly ? ' readonly' : ''}`}>
      <div className="doctor-chamber-card-head">
        <div className="doctor-chamber-card-icon"><Building2 /></div>
        <div><small>{chamber.provider_type === 'hospital' ? 'Hospital' : 'Chamber'}</small><h3>{chamber.name_bn}</h3></div>
        <span className={`chamber-status ${chamber.provider_status}`}>{providerStatus[chamber.provider_status] || chamber.provider_status}</span>
      </div>
      <div className="doctor-chamber-meta">
        {chamber.address && <p><MapPin /> <span>{chamber.address}</span></p>}
        {chamber.phone && <p><span className="meta-label">Phone</span><span>{chamber.phone}</span></p>}
        {chamber.whatsapp && <p><span className="meta-label">WhatsApp</span><span>{chamber.whatsapp}</span></p>}
        {chamber.latitude != null && chamber.longitude != null && <p><Crosshair /><span>{chamber.latitude.toFixed(6)}, {chamber.longitude.toFixed(6)}</span></p>}
        <p><span className="meta-label">Link</span><span>{linkStatus[chamber.link_status] || chamber.link_status}</span></p>
      </div>
      <div className="doctor-chamber-card-actions">
        {!readonly && onEdit && <button type="button" onClick={onEdit}><Pencil /> তথ্য সম্পাদনা</button>}
        <button type="button" disabled={!canSchedule} onClick={() => onSchedule()}><Plus /> Visiting Time</button>
      </div>
      {!canSchedule && <small className="chamber-schedule-lock">Schedule edit করতে provider/link approval প্রয়োজন।</small>}
      <div className="chamber-schedule-list">
        {chamber.schedules.map((schedule) => <div className="chamber-schedule-row" key={schedule.id}>
          <Clock3 />
          <div><strong>{weekdays[schedule.day_of_week]}</strong><span>{formatTime(schedule.start_time)} – {formatTime(schedule.end_time)}{schedule.fee != null ? ` • ৳${schedule.fee}` : ''}</span></div>
          <span className={schedule.is_active ? 'active' : 'inactive'}>{schedule.is_active ? 'Active' : 'Off'}</span>
          <button type="button" disabled={!canSchedule} aria-label="Schedule edit" onClick={() => onSchedule(schedule)}><Pencil /></button>
          <button type="button" disabled={!canSchedule} className={workingScheduleId === schedule.id ? 'confirm-delete' : ''} aria-label="Schedule delete" onClick={() => onDeleteSchedule(schedule.id)}><Trash2 /></button>
        </div>)}
        {!chamber.schedules.length && <p className="chamber-no-schedule">Visiting day/time এখনো যোগ করা হয়নি।</p>}
      </div>
    </article>
  );
}
