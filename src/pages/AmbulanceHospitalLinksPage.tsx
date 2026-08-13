import { FormEvent, useEffect, useState } from 'react';
import { Ambulance, ArrowLeft, Building2, Link2, LoaderCircle, MapPin, Search } from 'lucide-react';
import { Link, Navigate } from 'react-router-dom';
import PublicHeader from '../components/PublicHeader';
import { useAuth } from '../contexts/AuthContext';
import { getMyAmbulanceServices, requestAmbulanceHospitalLink, searchApprovedHospitalsForAmbulance } from '../services/ambulanceDashboard';
import type { ApprovedHospitalRow, MyAmbulanceService } from '../types';

const statusLabels = { pending: 'Hospital-এর উত্তর অপেক্ষমাণ', approved: 'সংযুক্ত', rejected: 'প্রত্যাখ্যাত', removed: 'অপসারিত' };
const messageFrom = (error: unknown) => error instanceof Error ? error.message : 'কাজটি সম্পন্ন করা যায়নি।';

export default function AmbulanceHospitalLinksPage() {
  const { account } = useAuth();
  const [service, setService] = useState<MyAmbulanceService | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ApprovedHospitalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = () => { setLoading(true); getMyAmbulanceServices().then((rows) => setService(rows[0] || null)).catch((loadError: unknown) => setError(messageFrom(loadError))).finally(() => setLoading(false)); };
  useEffect(load, []);
  if (account && account.role !== 'ambulance') return <Navigate to="/dashboard" replace />;

  async function searchHospitals(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSearching(true); setError(null);
    try { setResults(await searchApprovedHospitalsForAmbulance(query, service?.district_id)); }
    catch (searchError) { setError(messageFrom(searchError)); }
    finally { setSearching(false); }
  }

  async function request(hospitalId: string) {
    if (!service) return;
    setWorking(hospitalId); setError(null); setNotice(null);
    try { await requestAmbulanceHospitalLink(service.ambulance_id, hospitalId); await load(); setNotice('Hospital link request পাঠানো হয়েছে। Hospital accept না করা পর্যন্ত public profile-এ link দেখাবে না।'); }
    catch (requestError) { setError(messageFrom(requestError)); }
    finally { setWorking(null); }
  }

  const linked = (hospitalId: string) => service?.hospital_links.find((item) => item.hospital_id === hospitalId && item.status !== 'removed');

  return <div className="app-shell ambulance-dashboard-page"><PublicHeader /><main className="ambulance-dashboard-main container"><Link className="back-link" to="/dashboard"><ArrowLeft /> Dashboard-এ ফিরুন</Link><div className="ambulance-page-heading"><span><Link2 /></span><div><small>Optional affiliation</small><h1>Hospital সংযোগ</h1><p>Approved Hospital-এ request পাঠান; দুই পক্ষের সম্মতি ছাড়া public link হবে না।</p></div></div>{error && <div className="error-box">{error}</div>}{notice && <div className="auth-message success">{notice}</div>}{loading ? <div className="loading-box"><LoaderCircle className="spin" /> Link status লোড হচ্ছে…</div> : !service ? <div className="empty-state"><span>🚑</span><h3>আগে Ambulance listing তৈরি করুন</h3><Link className="inline-primary" to="/ambulance/services">Listing তৈরি করুন</Link></div> : <><section className="ambulance-link-summary"><span><Ambulance /></span><div><h2>{service.operator_name}</h2><p>{service.vehicle_registration_no} • {service.address}</p></div><b>{service.hospital_links.filter((item) => item.status === 'approved').length} linked</b></section><section className="ambulance-hospital-search"><h2>Approved Hospital খুঁজুন</h2><form onSubmit={searchHospitals}><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Hospital নাম বা ঠিকানা" /><button disabled={searching}>{searching ? <LoaderCircle className="spin" /> : 'খুঁজুন'}</button></form>{results.length > 0 && <div>{results.map((hospital) => { const link = linked(hospital.hospital_id); return <article key={hospital.hospital_id}><span><Building2 /></span><div><strong>{hospital.hospital_name}</strong><small><MapPin /> {hospital.address || 'ঠিকানা নেই'}</small></div><button disabled={Boolean(link) || working === hospital.hospital_id} onClick={() => void request(hospital.hospital_id)}><Link2 /> {link ? statusLabels[link.status] : 'Request'}</button></article>; })}</div>}</section><section className="ambulance-current-links"><h2>Request status</h2>{service.hospital_links.length ? service.hospital_links.map((item) => <article key={item.hospital_id}><span><Building2 /></span><div><strong>{item.hospital_name_bn}</strong>{item.review_note && <small>Note: {item.review_note}</small>}</div><b className={`link-${item.status}`}>{statusLabels[item.status]}</b>{['rejected', 'removed'].includes(item.status) && <button disabled={working === item.hospital_id} onClick={() => void request(item.hospital_id)}>আবার request</button>}</article>) : <p className="empty-inline">এখনো কোনো Hospital link request নেই।</p>}</section></>}</main></div>;
}
