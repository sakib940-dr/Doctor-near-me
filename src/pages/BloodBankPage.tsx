import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlarmClock,
  Award,
  Clock3,
  Droplet,
  Droplets,
  HandHeart,
  Heart,
  LoaderCircle,
  MapPin,
  Phone,
  RefreshCcw,
  Search,
  ShieldCheck,
  Sparkles,
  UserRound,
  Users,
  XCircle,
} from 'lucide-react';
import { getMyPatientProfile } from '../services/appointments';
import {
  cancelMyBloodRequest,
  createBloodRequest,
  getMyBloodDonorProfile,
  getMyBloodRequestResponses,
  getMyBloodRequests,
  saveMyBloodDonorProfile,
  searchBloodDonors,
  getRecentBloodRequests,
  sendBloodRequestToDonor,
} from '../services/bloodBank';
import { getDistricts, getUpazilas } from '../services/discovery';
import type { BloodDonorProfile, BloodDonorSearchRow, BloodRequestResponseRow, BloodRequestRow, District, PatientProfile, Upazila, PublicBloodRequestRow } from '../types';

const bloodGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const messageFrom = (error: unknown) => error instanceof Error ? error.message : 'অনুরোধটি সম্পন্ন করা যায়নি।';
type BloodTab = 'search' | 'request' | 'donor';

const DONATION_GAP_DAYS = 120;

const compatibleDonors: Record<string, string[]> = {
  'A+': ['A+', 'A-', 'O+', 'O-'],
  'A-': ['A-', 'O-'],
  'B+': ['B+', 'B-', 'O+', 'O-'],
  'B-': ['B-', 'O-'],
  'AB+': ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
  'AB-': ['A-', 'B-', 'AB-', 'O-'],
  'O+': ['O+', 'O-'],
  'O-': ['O-'],
};

const requestStatusMeta: Record<string, { label: string; tone: 'warn' | 'info' | 'good' | 'muted' }> = {
  open: { label: 'খোলা আছে', tone: 'warn' },
  partially_fulfilled: { label: 'আংশিক পূরণ', tone: 'info' },
  fulfilled: { label: 'সম্পন্ন হয়েছে', tone: 'good' },
  cancelled: { label: 'বাতিল করা হয়েছে', tone: 'muted' },
  expired: { label: 'মেয়াদ শেষ', tone: 'muted' },
};

function initialsOf(name?: string | null) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
}

function daysSince(dateStr?: string | null) {
  if (!dateStr) return null;
  const then = new Date(dateStr).getTime();
  if (Number.isNaN(then)) return null;
  return Math.max(0, Math.floor((Date.now() - then) / 86400000));
}

function donorEligibility(lastDonationDate?: string | null) {
  const days = daysSince(lastDonationDate);
  if (days === null) {
    return { ready: true, percent: 100, title: 'নতুন Donor — এখনই প্রস্তুত', sub: 'এখনো কোনো দানের রেকর্ড নেই' };
  }
  if (days >= DONATION_GAP_DAYS) {
    return { ready: true, percent: 100, title: 'এখনই দান করতে প্রস্তুত', sub: `শেষ দান ${days} দিন আগে` };
  }
  const remaining = DONATION_GAP_DAYS - days;
  return {
    ready: false,
    percent: Math.max(4, Math.round((days / DONATION_GAP_DAYS) * 100)),
    title: `আরও ${remaining} দিন অপেক্ষা করুন`,
    sub: `শেষ দান ${days} দিন আগে · নিরাপদ ব্যবধান ${DONATION_GAP_DAYS} দিন`,
  };
}

function requestUrgency(neededAt?: string | null): { level: 'critical' | 'urgent' | 'normal'; label: string } {
  if (!neededAt) return { level: 'normal', label: 'নির্দিষ্ট সময় নেই' };
  const diffHours = (new Date(neededAt).getTime() - Date.now()) / 3600000;
  if (diffHours <= 0) return { level: 'critical', label: 'সময় পার হয়ে গেছে' };
  if (diffHours <= 24) return { level: 'critical', label: 'আজই প্রয়োজন' };
  if (diffHours <= 72) return { level: 'urgent', label: `${Math.max(1, Math.ceil(diffHours / 24))} দিনের মধ্যে` };
  return { level: 'normal', label: new Date(neededAt).toLocaleDateString('bn-BD', { day: 'numeric', month: 'short' }) };
}

function relativeTime(dateStr: string) {
  const diffMin = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (diffMin < 1) return 'এইমাত্র';
  if (diffMin < 60) return `${diffMin} মিনিট আগে`;
  const hours = Math.floor(diffMin / 60);
  if (hours < 24) return `${hours} ঘণ্টা আগে`;
  return `${Math.floor(hours / 24)} দিন আগে`;
}

export default function BloodBankPage() {
  const [tab, setTab] = useState<BloodTab>('search');
  const [districts, setDistricts] = useState<District[]>([]);
  const [searchUpazilas, setSearchUpazilas] = useState<Upazila[]>([]);
  const [requestUpazilas, setRequestUpazilas] = useState<Upazila[]>([]);
  const [donorUpazilas, setDonorUpazilas] = useState<Upazila[]>([]);
  const [profile, setProfile] = useState<PatientProfile | null>(null);
  const [donorProfile, setDonorProfile] = useState<BloodDonorProfile | null>(null);
  const [requests, setRequests] = useState<BloodRequestRow[]>([]);
  const [recentRequests, setRecentRequests] = useState<PublicBloodRequestRow[]>([]);
  const [responses, setResponses] = useState<Record<string, BloodRequestResponseRow[]>>({});
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [searchGroup, setSearchGroup] = useState('');
  const [searchDistrict, setSearchDistrict] = useState('');
  const [searchUpazila, setSearchUpazila] = useState('');
  const [donors, setDonors] = useState<BloodDonorSearchRow[]>([]);
  const [donorsHasMore, setDonorsHasMore] = useState(false);
  const [donorsLoadingMore, setDonorsLoadingMore] = useState(false);
  const [searched, setSearched] = useState(false);

  const [requestPatientName, setRequestPatientName] = useState('');
  const [requestGroup, setRequestGroup] = useState('');
  const [unitsNeeded, setUnitsNeeded] = useState('1');
  const [hospitalName, setHospitalName] = useState('');
  const [hospitalAddress, setHospitalAddress] = useState('');
  const [requestDistrict, setRequestDistrict] = useState('');
  const [requestUpazila, setRequestUpazila] = useState('');
  const [neededAt, setNeededAt] = useState('');
  const [reason, setReason] = useState('');
  const [contactPhone, setContactPhone] = useState('');

  const [donorGroup, setDonorGroup] = useState('');
  const [isVolunteer, setIsVolunteer] = useState(false);
  const [phonePublic, setPhonePublic] = useState(false);
  const [available, setAvailable] = useState(true);
  const [lastDonation, setLastDonation] = useState('');
  const [donorDistrict, setDonorDistrict] = useState('');
  const [donorUpazila, setDonorUpazila] = useState('');
  const [requestModalDonor, setRequestModalDonor] = useState<BloodDonorSearchRow | null>(null);
  const [directPatientName, setDirectPatientName] = useState('');
  const [directHospital, setDirectHospital] = useState('');
  const [directNeededAt, setDirectNeededAt] = useState('');
  const [directMessage, setDirectMessage] = useState('');

  useEffect(() => {
    let active = true;
    Promise.all([getDistricts(), getMyPatientProfile(), getMyBloodDonorProfile(), getMyBloodRequests(), getRecentBloodRequests()])
      .then(([districtRows, patient, donor, requestRows, recentRows]) => {
        if (!active) return;
        setDistricts(districtRows);
        setProfile(patient);
        setDonorProfile(donor);
        setRequests(requestRows);
        setRecentRequests(recentRows);
        const defaultDistrict = patient?.district_id ? String(patient.district_id) : '';
        const defaultUpazila = patient?.upazila_id ? String(patient.upazila_id) : '';
        setSearchDistrict(defaultDistrict);
        setRequestDistrict(defaultDistrict);
        setRequestUpazila(defaultUpazila);
        setDonorDistrict(donor?.district_id ? String(donor.district_id) : defaultDistrict);
        setDonorUpazila(donor?.upazila_id ? String(donor.upazila_id) : defaultUpazila);
        setRequestPatientName(patient?.full_name || '');
        setRequestGroup(patient?.blood_group || '');
        setDonorGroup(donor?.blood_group || patient?.blood_group || '');
        setContactPhone(patient?.phone || '');
        setIsVolunteer(Boolean(donor?.is_volunteer));
        setPhonePublic(Boolean(donor?.phone_public));
        setAvailable(donor?.available_for_requests ?? true);
        setLastDonation(donor?.last_donation_date || '');
      })
      .catch((loadError: unknown) => { if (active) setError(messageFrom(loadError)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!searchDistrict) { setSearchUpazilas([]); setSearchUpazila(''); return; }
    getUpazilas(Number(searchDistrict)).then(setSearchUpazilas).catch(() => setSearchUpazilas([]));
  }, [searchDistrict]);
  useEffect(() => {
    if (!requestDistrict) { setRequestUpazilas([]); setRequestUpazila(''); return; }
    getUpazilas(Number(requestDistrict)).then(setRequestUpazilas).catch(() => setRequestUpazilas([]));
  }, [requestDistrict]);
  useEffect(() => {
    if (!donorDistrict) { setDonorUpazilas([]); setDonorUpazila(''); return; }
    getUpazilas(Number(donorDistrict)).then(setDonorUpazilas).catch(() => setDonorUpazilas([]));
  }, [donorDistrict]);

  const districtNames = useMemo(() => new Map(districts.map((item) => [item.id, item.name_bn])), [districts]);

  const myOpenRequestsCount = useMemo(
    () => requests.filter((request) => request.status === 'open' || request.status === 'partially_fulfilled').length,
    [requests],
  );
  const eligibility = useMemo(() => donorEligibility(donorProfile?.last_donation_date ?? lastDonation), [donorProfile, lastDonation]);
  const compatibleGroupsForSearch = searchGroup ? compatibleDonors[searchGroup] || [] : [];

  async function loadDonors(reset = true) {
    const offset = reset ? 0 : donors.length;
    if (reset) setWorking(true); else setDonorsLoadingMore(true);
    setError(null); setNotice(null); setSearched(true);
    try {
      const rows = await searchBloodDonors({
        bloodGroup: searchGroup,
        districtId: searchDistrict ? Number(searchDistrict) : null,
        upazilaId: searchUpazila ? Number(searchUpazila) : null,
        limit: 20, offset,
      });
      setDonors((current) => {
        if (reset) return rows;
        const seen = new Set(current.map((item) => item.donor_id));
        return [...current, ...rows.filter((row) => !seen.has(row.donor_id))];
      });
      setDonorsHasMore(rows.length === 20);
    } catch (searchError) { setError(messageFrom(searchError)); }
    finally { if (reset) setWorking(false); else setDonorsLoadingMore(false); }
  }

  async function requestDonor(donor: BloodDonorSearchRow) {
    setRequestModalDonor(donor);
    setDirectPatientName(profile?.full_name || '');
    setDirectMessage('');
  }

  async function submitDirectDonorRequest(event: FormEvent) {
    event.preventDefault();
    if (!requestModalDonor) return;
    setWorking(true);
    try {
      await sendBloodRequestToDonor({
        donorId: requestModalDonor.donor_id,
        patientName: directPatientName.trim(),
        hospitalAddress: directHospital.trim(),
        neededAt: directNeededAt ? new Date(directNeededAt).toISOString() : null,
        contactPhone,
        message: directMessage.trim(),
      });
      setNotice('Donor-এর কাছে blood request পাঠানো হয়েছে।');
      setRequestModalDonor(null);
    } catch (requestError) {
      setError(messageFrom(requestError));
    } finally {
      setWorking(false);
    }
  }

  async function findDonors(event: FormEvent) { event.preventDefault(); await loadDonors(true); }

  async function submitBloodRequest(event: FormEvent) {
    event.preventDefault();
    setError(null); setNotice(null); setWorking(true);
    try {
      await createBloodRequest({
        patientName: requestPatientName.trim() || profile?.full_name || 'Patient', bloodGroup: requestGroup, unitsNeeded: Number(unitsNeeded), hospitalName, hospitalAddress,
        districtId: requestDistrict ? Number(requestDistrict) : null, upazilaId: requestUpazila ? Number(requestUpazila) : null,
        neededAt: neededAt ? new Date(neededAt).toISOString() : null, reason, contactPhone,
      });
      setRequests(await getMyBloodRequests());
      setNotice('রক্তের অনুরোধ তৈরি হয়েছে এবং matching voluntary donor-দের notification পাঠানো হয়েছে।');
      setReason('');
    } catch (requestError) { setError(messageFrom(requestError)); }
    finally { setWorking(false); }
  }

  async function saveDonor(event: FormEvent) {
    event.preventDefault();
    setError(null); setNotice(null); setWorking(true);
    try {
      await saveMyBloodDonorProfile({ bloodGroup: donorGroup, isVolunteer, phonePublic, lastDonationDate: lastDonation || null, availableForRequests: available, districtId: donorDistrict ? Number(donorDistrict) : null, upazilaId: donorUpazila ? Number(donorUpazila) : null });
      setDonorProfile(await getMyBloodDonorProfile());
      setNotice('Blood donor preference save হয়েছে।');
    } catch (saveError) { setError(messageFrom(saveError)); }
    finally { setWorking(false); }
  }

  async function loadResponses(requestId: string) {
    setWorking(true); setError(null);
    try {
      const nextResponses = await getMyBloodRequestResponses(requestId);
      setResponses((current) => ({ ...current, [requestId]: nextResponses }));
    }
    catch (responseError) { setError(messageFrom(responseError)); }
    finally { setWorking(false); }
  }

  async function cancelRequest(requestId: string) {
    if (!window.confirm('এই রক্তের অনুরোধটি বাতিল করবেন?')) return;
    setWorking(true); setError(null);
    try { await cancelMyBloodRequest(requestId); setRequests(await getMyBloodRequests()); }
    catch (cancelError) { setError(messageFrom(cancelError)); }
    finally { setWorking(false); }
  }

  if (loading) return <div className="loading-box"><LoaderCircle className="spin" /> Blood Bank লোড হচ্ছে…</div>;

  return (
    <div className="blood-bank-page">
      <header className="bb-hero">
        <div className="bb-hero-top">
          <span className="bb-hero-badge"><Droplet /> Patient Blood Bank</span>
          <h1>রক্ত খুঁজুন, নিরাপদে অনুরোধ পাঠান</h1>
          <p>আপনার এলাকার voluntary donor-দের সাথে সরাসরি যুক্ত হোন — verified, privacy-safe এবং দ্রুত।</p>
        </div>
        <div className="bb-hero-stats">
          <div className="bb-stat">
            <Activity />
            <div><strong>{recentRequests.length}</strong><small>Active অনুরোধ (সারা দেশে)</small></div>
          </div>
          <div className="bb-stat">
            <Heart />
            <div><strong>{myOpenRequestsCount}</strong><small>আপনার চলমান অনুরোধ</small></div>
          </div>
          <div className="bb-stat">
            <ShieldCheck />
            <div><strong>{donorProfile?.is_volunteer ? 'Active' : 'নিবন্ধিত নয়'}</strong><small>আপনার Donor status</small></div>
          </div>
        </div>
      </header>

      <section className="bb-quick-actions">
        <article className="bb-quick-card bb-quick-request">
          <div className="bb-quick-icon"><AlarmClock /></div>
          <div className="bb-quick-copy">
            <strong>জরুরি রক্ত প্রয়োজন?</strong>
            <span>অনুরোধ তৈরি করলে matching এলাকার active donor-দের সাথে সাথে notification যাবে।</span>
          </div>
          <button type="button" onClick={() => setTab('request')}>অনুরোধ তৈরি করুন</button>
        </article>
        <article className="bb-quick-card bb-quick-donor">
          <div className="bb-quick-icon"><HandHeart /></div>
          <div className="bb-quick-copy">
            <strong>রক্ত দিতে চান?</strong>
            <span>Donor profile active করুন, matching request এলে notification পাবেন — এক ফোঁটায় একটি জীবন।</span>
          </div>
          <button type="button" onClick={() => setTab('donor')}>Donor হোন</button>
        </article>
      </section>

      <section className="bb-panel bb-recent">
        <header className="bb-panel-head"><h2><Sparkles /> সাম্প্রতিক Blood Request</h2><small>সারা বাংলাদেশ থেকে</small></header>
        {recentRequests.length ? (
          <div className="bb-recent-list">
            {recentRequests.map((item) => {
              const urgency = requestUrgency(item.needed_at);
              return (
                <article key={item.request_id} className="bb-recent-card">
                  <span className="bb-group-chip">{item.blood_group}</span>
                  <div className="bb-recent-copy">
                    <strong>{item.patient_name}</strong>
                    <small><MapPin /> {item.district_id ? districtNames.get(item.district_id) || 'জেলা' : 'এলাকা উল্লেখ নেই'} · {relativeTime(item.created_at)}</small>
                  </div>
                  <span className={`bb-urgency bb-urgency-${urgency.level}`}>{urgency.level === 'critical' ? <AlarmClock /> : <Clock3 />} {urgency.label}</span>
                </article>
              );
            })}
          </div>
        ) : <p className="empty-state">এই মুহূর্তে কোনো active blood request নেই।</p>}
      </section>

      <nav className="bb-tabs" aria-label="Blood Bank sections">
        <button type="button" className={tab === 'search' ? 'active' : ''} onClick={() => setTab('search')}><Search /> রক্তদাতা খুঁজুন</button>
        <button type="button" className={tab === 'request' ? 'active' : ''} onClick={() => setTab('request')}><Droplets /> রক্তের অনুরোধ</button>
        <button type="button" className={tab === 'donor' ? 'active' : ''} onClick={() => setTab('donor')}><UserRound /> Donor Profile</button>
      </nav>

      {error && <div className="error-box" role="alert">{error}</div>}
      {notice && <div className="success-box" role="status">{notice}</div>}

      {tab === 'search' && <section className="bb-panel">
        <form className="bb-search-form" onSubmit={findDonors}>
          <label><span>রক্তের গ্রুপ</span><select required value={searchGroup} onChange={(event) => setSearchGroup(event.target.value)}><option value="">নির্বাচন করুন</option>{bloodGroups.map((group) => <option key={group}>{group}</option>)}</select></label>
          <label><span>জেলা</span><select value={searchDistrict} onChange={(event) => { setSearchDistrict(event.target.value); setSearchUpazila(''); }}><option value="">সারা বাংলাদেশ</option>{districts.map((district) => <option key={district.id} value={district.id}>{district.name_bn}</option>)}</select></label>
          <label><span>উপজেলা / এলাকা</span><select value={searchUpazila} disabled={!searchDistrict} onChange={(event) => setSearchUpazila(event.target.value)}><option value="">সকল উপজেলা / এলাকা</option>{searchUpazilas.map((upazila) => <option key={upazila.id} value={upazila.id}>{upazila.name_bn}</option>)}</select></label>
          <button disabled={working}>{working ? <LoaderCircle className="spin" /> : <Search />} খুঁজুন</button>
        </form>
        {compatibleGroupsForSearch.length > 0 && (
          <p className="bb-hint"><ShieldCheck /> <strong>{searchGroup}</strong>-এর রোগী এই গ্রুপগুলো থেকেও রক্ত নিতে পারেন: {compatibleGroupsForSearch.filter((g) => g !== searchGroup).join(', ') || 'শুধু নিজ গ্রুপ থেকে'}</p>
        )}
        <div className="bb-donor-results">
          {searched && !donors.length ? <p className="empty-state">Matching available donor পাওয়া যায়নি — জেলা পরিবর্তন করে আবার চেষ্টা করুন।</p> : donors.map((donor) => <article key={donor.donor_id} className="bb-donor-card">
            <span className="bb-avatar">{initialsOf(donor.donor_name)}<em className={donor.available_for_requests === false ? 'bb-dot-off' : 'bb-dot-on'} /></span>
            <div className="bb-donor-copy">
              <strong>{donor.donor_name}</strong>
              <small><MapPin /> {donor.district_id ? districtNames.get(donor.district_id) || 'জেলা' : 'সারা বাংলাদেশ'}</small>
              <small className="bb-donor-meta">{donor.last_donation_date ? `শেষ দান ${donor.last_donation_date}` : 'দানের রেকর্ড নেই'} · {donor.available_for_requests === false ? 'বর্তমানে unavailable' : 'Available'}</small>
            </div>
            <span className="bb-group-chip bb-group-chip-sm">{donor.blood_group}</span>
            <div className="bb-donor-actions">
              {donor.phone ? <a href={`tel:${donor.phone}`}><Phone /> কল করুন</a> : <span className="bb-private-phone"><ShieldCheck /> Phone private</span>}
              <button type="button" disabled={donor.available_for_requests === false} onClick={() => void requestDonor(donor)}>{donor.available_for_requests === false ? 'Unavailable' : 'Request পাঠান'}</button>
            </div>
          </article>)}
          {donorsHasMore && <div className="public-load-more-wrap"><button type="button" className="public-load-more-button" disabled={donorsLoadingMore} onClick={() => void loadDonors(false)}>{donorsLoadingMore ? <LoaderCircle className="spin" /> : null}{donorsLoadingMore ? 'আরও লোড হচ্ছে…' : 'আরও donor দেখুন'}</button></div>}
        </div>
      </section>}

      {tab === 'request' && <section className="bb-request-layout">
        <form className="bb-panel bb-request-form" onSubmit={submitBloodRequest}>
          <header className="bb-panel-head"><h2><Droplets /> রক্তের অনুরোধ তৈরি করুন</h2></header>
          <p className="bb-form-section-label">রোগীর তথ্য</p>
          <div className="bb-form-grid">
            <label><span>রোগীর নাম</span><input required value={requestPatientName} onChange={(event) => setRequestPatientName(event.target.value)} /></label>
            <label><span>রক্তের গ্রুপ</span><select required value={requestGroup} onChange={(event) => setRequestGroup(event.target.value)}><option value="">নির্বাচন করুন</option>{bloodGroups.map((group) => <option key={group}>{group}</option>)}</select></label>
            <label><span>ইউনিট</span><input required type="number" min="1" max="20" value={unitsNeeded} onChange={(event) => setUnitsNeeded(event.target.value)} /></label>
            <label><span>প্রয়োজনের সময়</span><input type="datetime-local" value={neededAt} onChange={(event) => setNeededAt(event.target.value)} /></label>
          </div>
          <p className="bb-form-section-label">হাসপাতাল ও এলাকা</p>
          <div className="bb-form-grid">
            <label><span>জেলা</span><select value={requestDistrict} onChange={(event) => { setRequestDistrict(event.target.value); setRequestUpazila(''); }}><option value="">নির্বাচন করুন</option>{districts.map((district) => <option key={district.id} value={district.id}>{district.name_bn}</option>)}</select></label>
            <label><span>উপজেলা / এলাকা</span><select value={requestUpazila} disabled={!requestDistrict} onChange={(event) => setRequestUpazila(event.target.value)}><option value="">সকল উপজেলা / এলাকা</option>{requestUpazilas.map((upazila) => <option key={upazila.id} value={upazila.id}>{upazila.name_bn}</option>)}</select></label>
            <label><span>হাসপাতাল</span><input value={hospitalName} onChange={(event) => setHospitalName(event.target.value)} placeholder="হাসপাতালের নাম" /></label>
            <label className="wide"><span>হাসপাতালের ঠিকানা</span><input value={hospitalAddress} onChange={(event) => setHospitalAddress(event.target.value)} placeholder="ঠিকানা" /></label>
          </div>
          <p className="bb-form-section-label">যোগাযোগ</p>
          <div className="bb-form-grid">
            <label className="wide"><span>যোগাযোগের ফোন</span><input required inputMode="tel" value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} /></label>
            <label className="wide"><span>অতিরিক্ত তথ্য</span><textarea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="রোগীর অবস্থা বা প্রয়োজনীয় তথ্য" /></label>
          </div>
          <button className="bb-primary-button" disabled={working}>{working ? <LoaderCircle className="spin" /> : <Droplets />} অনুরোধ পাঠান</button>
        </form>

        <div className="bb-panel bb-my-requests">
          <header className="bb-panel-head"><div><small>My requests</small><h2>আমার রক্তের অনুরোধ</h2></div><button type="button" className="bb-icon-button" aria-label="Refresh" onClick={() => getMyBloodRequests().then(setRequests).catch(() => undefined)}><RefreshCcw /></button></header>
          {requests.length ? requests.map((request) => {
            const status = requestStatusMeta[request.status] || { label: request.status, tone: 'muted' as const };
            const urgency = requestUrgency(request.needed_at);
            return (
              <article key={request.request_id} className="bb-request-card">
                <div className="bb-request-top">
                  <span className="bb-group-chip">{request.blood_group}</span>
                  <div className="bb-request-copy">
                    <strong>{request.patient_name} · {request.units_needed} unit</strong>
                    <small>{request.hospital_name || 'হাসপাতাল উল্লেখ নেই'} · {urgency.label}</small>
                  </div>
                  <span className={`bb-status-pill bb-status-${status.tone}`}>{status.label}</span>
                </div>
                <div className="bb-request-actions">
                  <button type="button" onClick={() => void loadResponses(request.request_id)}><Users /> Response ({request.response_count})</button>
                  {['open', 'partially_fulfilled'].includes(request.status) ? <button className="danger" type="button" onClick={() => void cancelRequest(request.request_id)}><XCircle /> বাতিল</button> : null}
                </div>
                {responses[request.request_id] && <div className="bb-response-list">{responses[request.request_id].length ? responses[request.request_id].map((response) => <div key={response.response_id} className="bb-response-row">
                  <span className="bb-avatar bb-avatar-sm">{initialsOf(response.donor_name)}</span>
                  <div className="bb-response-copy"><strong>{response.donor_name}</strong><small>{response.status}</small></div>
                  {response.phone ? <a href={`tel:${response.phone}`}><Phone /> {response.phone}</a> : <small className="bb-private-phone"><ShieldCheck /> Private</small>}
                </div>) : <p className="empty-state bb-empty-compact">এখনও কোনো donor response নেই।</p>}</div>}
              </article>
            );
          }) : <p className="empty-state">এখনও কোনো blood request নেই।</p>}
        </div>
      </section>}

      {tab === 'donor' && <section className="bb-donor-layout">
        <div className="bb-panel bb-eligibility-card">
          <div className={`bb-eligibility-ring ${eligibility.ready ? 'is-ready' : 'is-waiting'}`} style={{ '--bb-percent': `${eligibility.percent}%` } as React.CSSProperties}>
            <div className="bb-eligibility-inner">{eligibility.ready ? <ShieldCheck /> : <Clock3 />}</div>
          </div>
          <div className="bb-eligibility-copy">
            <strong>{eligibility.title}</strong>
            <small>{eligibility.sub}</small>
          </div>
          {donorProfile?.is_volunteer && <span className="bb-active-badge"><Award /> Active Donor</span>}
        </div>

        <form className="bb-panel bb-donor-form" onSubmit={saveDonor}>
          <header className="bb-panel-head"><div><small>Voluntary donor</small><h2>আমার Donor Profile</h2></div></header>
          <div className="bb-form-grid">
            <label><span>রক্তের গ্রুপ</span><select required value={donorGroup} onChange={(event) => setDonorGroup(event.target.value)}><option value="">নির্বাচন করুন</option>{bloodGroups.map((group) => <option key={group}>{group}</option>)}</select></label>
            <label><span>শেষ রক্তদানের তারিখ</span><input type="date" value={lastDonation} onChange={(event) => setLastDonation(event.target.value)} /></label>
            <label><span>জেলা</span><select value={donorDistrict} onChange={(event) => { setDonorDistrict(event.target.value); setDonorUpazila(''); }}><option value="">নির্বাচন করুন</option>{districts.map((district) => <option key={district.id} value={district.id}>{district.name_bn}</option>)}</select></label>
            <label><span>উপজেলা / এলাকা</span><select value={donorUpazila} disabled={!donorDistrict} onChange={(event) => setDonorUpazila(event.target.value)}><option value="">সকল উপজেলা / এলাকা</option>{donorUpazilas.map((upazila) => <option key={upazila.id} value={upazila.id}>{upazila.name_bn}</option>)}</select></label>
          </div>
          <label className="bb-switch-row"><span className="bb-switch"><input type="checkbox" checked={isVolunteer} onChange={(event) => setIsVolunteer(event.target.checked)} /><em /></span><span className="bb-switch-copy"><strong>আমি voluntary blood donor হতে চাই</strong><small>Matching emergency request এলে notification পেতে পারি।</small></span></label>
          <label className="bb-switch-row"><span className="bb-switch"><input type="checkbox" checked={available} disabled={!isVolunteer} onChange={(event) => setAvailable(event.target.checked)} /><em /></span><span className="bb-switch-copy"><strong>এখন request নিতে available</strong></span></label>
          <label className="bb-switch-row"><span className="bb-switch"><input type="checkbox" checked={phonePublic} disabled={!isVolunteer} onChange={(event) => setPhonePublic(event.target.checked)} /><em /></span><span className="bb-switch-copy"><strong>Donor search-এ phone দেখানোর অনুমতি</strong><small>Profile-level public phone consent-ও চালু থাকতে হবে।</small></span></label>
          <button className="bb-primary-button" disabled={working}>{working ? <LoaderCircle className="spin" /> : <ShieldCheck />} Save Donor Preference</button>
        </form>
      </section>}

      {requestModalDonor && <div className="bb-modal-overlay" onClick={() => setRequestModalDonor(null)}>
        <form className="bb-modal" onSubmit={submitDirectDonorRequest} onClick={(event) => event.stopPropagation()}>
          <button type="button" className="bb-modal-close" onClick={() => setRequestModalDonor(null)} aria-label="Close">×</button>
          <div className="bb-modal-head">
            <span className="bb-avatar">{initialsOf(requestModalDonor.donor_name)}</span>
            <div><h2>Blood Request পাঠান</h2><p>{requestModalDonor.donor_name} · <strong>{requestModalDonor.blood_group}</strong></p></div>
          </div>
          <label><span>Patient name</span><input required value={directPatientName} onChange={(e)=>setDirectPatientName(e.target.value)} /></label>
          <label><span>Hospital / Location</span><input value={directHospital} onChange={(e)=>setDirectHospital(e.target.value)} /></label>
          <label><span>Required date</span><input type="datetime-local" value={directNeededAt} onChange={(e)=>setDirectNeededAt(e.target.value)} /></label>
          <label><span>Message</span><textarea rows={3} value={directMessage} onChange={(e)=>setDirectMessage(e.target.value)} /></label>
          <button className="bb-primary-button" disabled={working}>{working ? <LoaderCircle className="spin" /> : <Droplets />} Send Request</button>
        </form>
      </div>}
    </div>
  );
}
