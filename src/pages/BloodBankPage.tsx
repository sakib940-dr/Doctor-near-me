import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Droplets, LoaderCircle, MapPin, Phone, RefreshCcw, Search, ShieldCheck, UserRound, XCircle } from 'lucide-react';
import { getMyPatientProfile } from '../services/appointments';
import {
  cancelMyBloodRequest,
  createBloodRequest,
  getMyBloodDonorProfile,
  getMyBloodRequestResponses,
  getMyBloodRequests,
  saveMyBloodDonorProfile,
  searchBloodDonors,
} from '../services/bloodBank';
import { getDistricts, getUpazilas } from '../services/discovery';
import type { BloodDonorProfile, BloodDonorSearchRow, BloodRequestResponseRow, BloodRequestRow, District, PatientProfile, Upazila } from '../types';

const bloodGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const messageFrom = (error: unknown) => error instanceof Error ? error.message : 'অনুরোধটি সম্পন্ন করা যায়নি।';
type BloodTab = 'search' | 'request' | 'donor';

export default function BloodBankPage() {
  const [tab, setTab] = useState<BloodTab>('search');
  const [districts, setDistricts] = useState<District[]>([]);
  const [searchUpazilas, setSearchUpazilas] = useState<Upazila[]>([]);
  const [requestUpazilas, setRequestUpazilas] = useState<Upazila[]>([]);
  const [donorUpazilas, setDonorUpazilas] = useState<Upazila[]>([]);
  const [profile, setProfile] = useState<PatientProfile | null>(null);
  const [donorProfile, setDonorProfile] = useState<BloodDonorProfile | null>(null);
  const [requests, setRequests] = useState<BloodRequestRow[]>([]);
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

  useEffect(() => {
    let active = true;
    Promise.all([getDistricts(), getMyPatientProfile(), getMyBloodDonorProfile(), getMyBloodRequests()])
      .then(([districtRows, patient, donor, requestRows]) => {
        if (!active) return;
        setDistricts(districtRows);
        setProfile(patient);
        setDonorProfile(donor);
        setRequests(requestRows);
        const defaultDistrict = patient?.district_id ? String(patient.district_id) : '';
        const defaultUpazila = patient?.upazila_id ? String(patient.upazila_id) : '';
        setSearchDistrict(defaultDistrict);
        setRequestDistrict(defaultDistrict);
        setRequestUpazila(defaultUpazila);
        setDonorDistrict(donor?.district_id ? String(donor.district_id) : defaultDistrict);
        setDonorUpazila(donor?.upazila_id ? String(donor.upazila_id) : defaultUpazila);
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

  async function findDonors(event: FormEvent) { event.preventDefault(); await loadDonors(true); }

  async function submitBloodRequest(event: FormEvent) {
    event.preventDefault();
    setError(null); setNotice(null); setWorking(true);
    try {
      await createBloodRequest({
        patientName: profile?.full_name || 'Patient', bloodGroup: requestGroup, unitsNeeded: Number(unitsNeeded), hospitalName, hospitalAddress,
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
      <header className="blood-bank-heading"><span><Droplets /> Patient Blood Bank</span><h1>রক্ত খুঁজুন ও জরুরি অনুরোধ পরিচালনা করুন</h1><p>docbd.info-এর existing voluntary donor ও blood-request system ব্যবহার করে।</p></header>

      <nav className="blood-bank-tabs" aria-label="Blood Bank sections">
        <button type="button" className={tab === 'search' ? 'active' : ''} onClick={() => setTab('search')}><Search /> রক্তদাতা খুঁজুন</button>
        <button type="button" className={tab === 'request' ? 'active' : ''} onClick={() => setTab('request')}><Droplets /> রক্তের অনুরোধ</button>
        <button type="button" className={tab === 'donor' ? 'active' : ''} onClick={() => setTab('donor')}><UserRound /> Donor Profile</button>
      </nav>

      {error && <div className="error-box" role="alert">{error}</div>}
      {notice && <div className="success-box" role="status">{notice}</div>}

      {tab === 'search' && <section className="blood-bank-panel">
        <form className="blood-search-form" onSubmit={findDonors}>
          <label><span>রক্তের গ্রুপ</span><select required value={searchGroup} onChange={(event) => setSearchGroup(event.target.value)}><option value="">নির্বাচন করুন</option>{bloodGroups.map((group) => <option key={group}>{group}</option>)}</select></label>
          <label><span>জেলা</span><select value={searchDistrict} onChange={(event) => { setSearchDistrict(event.target.value); setSearchUpazila(''); }}><option value="">সারা বাংলাদেশ</option>{districts.map((district) => <option key={district.id} value={district.id}>{district.name_bn}</option>)}</select></label>
          <label><span>উপজেলা</span><select value={searchUpazila} disabled={!searchDistrict} onChange={(event) => setSearchUpazila(event.target.value)}><option value="">সকল উপজেলা</option>{searchUpazilas.map((upazila) => <option key={upazila.id} value={upazila.id}>{upazila.name_bn}</option>)}</select></label>
          <button disabled={working}>{working ? <LoaderCircle className="spin" /> : <Search />} খুঁজুন</button>
        </form>
        <div className="blood-donor-results">
          {searched && !donors.length ? <p className="empty-inline">Matching available donor পাওয়া যায়নি।</p> : donors.map((donor) => <article key={donor.donor_id}>
            <span className="blood-group-chip">{donor.blood_group}</span>
            <div><strong>{donor.donor_name}</strong><small><MapPin /> {donor.district_id ? districtNames.get(donor.district_id) || 'জেলা' : 'সারা বাংলাদেশ'}{donor.last_donation_date ? ` · শেষ দান ${donor.last_donation_date}` : ''}</small></div>
            {donor.phone ? <a href={`tel:${donor.phone}`}><Phone /> কল করুন</a> : <span className="blood-private-phone"><ShieldCheck /> Phone private</span>}
          </article>)}
          {donorsHasMore && <div className="public-load-more-wrap"><button type="button" className="public-load-more-button" disabled={donorsLoadingMore} onClick={() => void loadDonors(false)}>{donorsLoadingMore ? <LoaderCircle className="spin" /> : null}{donorsLoadingMore ? 'আরও লোড হচ্ছে…' : 'আরও donor দেখুন'}</button></div>}
        </div>
      </section>}

      {tab === 'request' && <section className="blood-bank-panel blood-request-layout">
        <form className="blood-request-form" onSubmit={submitBloodRequest}>
          <div className="blood-form-grid">
            <label><span>রক্তের গ্রুপ</span><select required value={requestGroup} onChange={(event) => setRequestGroup(event.target.value)}><option value="">নির্বাচন করুন</option>{bloodGroups.map((group) => <option key={group}>{group}</option>)}</select></label>
            <label><span>ইউনিট</span><input required type="number" min="1" max="20" value={unitsNeeded} onChange={(event) => setUnitsNeeded(event.target.value)} /></label>
            <label><span>জেলা</span><select value={requestDistrict} onChange={(event) => { setRequestDistrict(event.target.value); setRequestUpazila(''); }}><option value="">নির্বাচন করুন</option>{districts.map((district) => <option key={district.id} value={district.id}>{district.name_bn}</option>)}</select></label>
            <label><span>উপজেলা</span><select value={requestUpazila} disabled={!requestDistrict} onChange={(event) => setRequestUpazila(event.target.value)}><option value="">সকল উপজেলা</option>{requestUpazilas.map((upazila) => <option key={upazila.id} value={upazila.id}>{upazila.name_bn}</option>)}</select></label>
            <label><span>হাসপাতাল</span><input value={hospitalName} onChange={(event) => setHospitalName(event.target.value)} placeholder="হাসপাতালের নাম" /></label>
            <label><span>প্রয়োজনের সময়</span><input type="datetime-local" value={neededAt} onChange={(event) => setNeededAt(event.target.value)} /></label>
            <label className="wide"><span>হাসপাতালের ঠিকানা</span><input value={hospitalAddress} onChange={(event) => setHospitalAddress(event.target.value)} placeholder="ঠিকানা" /></label>
            <label className="wide"><span>যোগাযোগের ফোন</span><input required inputMode="tel" value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} /></label>
            <label className="wide"><span>অতিরিক্ত তথ্য</span><textarea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="রোগীর অবস্থা বা প্রয়োজনীয় তথ্য" /></label>
          </div>
          <button className="blood-primary-button" disabled={working}>{working ? <LoaderCircle className="spin" /> : <Droplets />} অনুরোধ পাঠান</button>
        </form>

        <div className="my-blood-requests">
          <header><div><small>My requests</small><h2>আমার রক্তের অনুরোধ</h2></div><button type="button" aria-label="Refresh" onClick={() => getMyBloodRequests().then(setRequests).catch(() => undefined)}><RefreshCcw /></button></header>
          {requests.length ? requests.map((request) => <article key={request.request_id}>
            <div className="blood-request-main"><span className="blood-group-chip">{request.blood_group}</span><div><strong>{request.patient_name} · {request.units_needed} unit</strong><small>{request.hospital_name || 'হাসপাতাল উল্লেখ নেই'} · {request.status}</small></div></div>
            <div className="blood-request-actions"><button type="button" onClick={() => void loadResponses(request.request_id)}>Responses ({request.response_count})</button>{['open','partially_fulfilled'].includes(request.status) ? <button className="danger" type="button" onClick={() => void cancelRequest(request.request_id)}><XCircle /> বাতিল</button> : null}</div>
            {responses[request.request_id] && <div className="blood-response-list">{responses[request.request_id].length ? responses[request.request_id].map((response) => <div key={response.response_id}><strong>{response.donor_name}</strong><span>{response.status}</span>{response.phone ? <a href={`tel:${response.phone}`}><Phone /> {response.phone}</a> : <small>Phone private</small>}</div>) : <small>এখনও কোনো donor response নেই।</small>}</div>}
          </article>) : <p className="empty-inline">এখনও কোনো blood request নেই।</p>}
        </div>
      </section>}

      {tab === 'donor' && <section className="blood-bank-panel">
        <form className="blood-donor-form" onSubmit={saveDonor}>
          <header><div><small>Voluntary donor</small><h2>আমার Donor Profile</h2></div>{donorProfile?.is_volunteer ? <span className="donor-active-badge">Active</span> : null}</header>
          <div className="blood-form-grid">
            <label><span>রক্তের গ্রুপ</span><select required value={donorGroup} onChange={(event) => setDonorGroup(event.target.value)}><option value="">নির্বাচন করুন</option>{bloodGroups.map((group) => <option key={group}>{group}</option>)}</select></label>
            <label><span>শেষ রক্তদানের তারিখ</span><input type="date" value={lastDonation} onChange={(event) => setLastDonation(event.target.value)} /></label>
            <label><span>জেলা</span><select value={donorDistrict} onChange={(event) => { setDonorDistrict(event.target.value); setDonorUpazila(''); }}><option value="">নির্বাচন করুন</option>{districts.map((district) => <option key={district.id} value={district.id}>{district.name_bn}</option>)}</select></label>
            <label><span>উপজেলা</span><select value={donorUpazila} disabled={!donorDistrict} onChange={(event) => setDonorUpazila(event.target.value)}><option value="">সকল উপজেলা</option>{donorUpazilas.map((upazila) => <option key={upazila.id} value={upazila.id}>{upazila.name_bn}</option>)}</select></label>
          </div>
          <label className="blood-toggle"><input type="checkbox" checked={isVolunteer} onChange={(event) => setIsVolunteer(event.target.checked)} /><span><strong>আমি voluntary blood donor হতে চাই</strong><small>Matching emergency request এলে notification পেতে পারি।</small></span></label>
          <label className="blood-toggle"><input type="checkbox" checked={available} disabled={!isVolunteer} onChange={(event) => setAvailable(event.target.checked)} /><span><strong>এখন request নিতে available</strong></span></label>
          <label className="blood-toggle"><input type="checkbox" checked={phonePublic} disabled={!isVolunteer} onChange={(event) => setPhonePublic(event.target.checked)} /><span><strong>Donor search-এ phone দেখানোর অনুমতি</strong><small>Profile-level public phone consent-ও চালু থাকতে হবে।</small></span></label>
          <button className="blood-primary-button" disabled={working}>{working ? <LoaderCircle className="spin" /> : <ShieldCheck />} Save Donor Preference</button>
        </form>
      </section>}
    </div>
  );
}
