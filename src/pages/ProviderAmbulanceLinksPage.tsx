import { useEffect, useState } from 'react';
import { Ambulance, ArrowLeft, Check, LoaderCircle, Phone, X } from 'lucide-react';
import { Link, Navigate } from 'react-router-dom';
import PublicHeader from '../components/PublicHeader';
import { useAuth } from '../contexts/AuthContext';
import { getHospitalAmbulanceLinkRequests, respondToAmbulanceHospitalLink } from '../services/ambulanceDashboard';
import { getMyProviderDashboard } from '../services/providerDashboard';
import type { HospitalAmbulanceLinkRequest, ProviderDashboardItem } from '../types';

const vehicleLabels = { ac: 'AC', non_ac: 'Non-AC', icu: 'ICU', freezer: 'Freezer', basic: 'Basic', other: 'Other' };

export default function ProviderAmbulanceLinksPage() {
  const { account } = useAuth();
  const [hospitals, setHospitals] = useState<ProviderDashboardItem[]>([]);
  const [hospitalId, setHospitalId] = useState('');
  const [rows, setRows] = useState<HospitalAmbulanceLinkRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ id: string; status: 'rejected' | 'removed' } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { getMyProviderDashboard().then((items) => { const hospitalRows = items.filter((item) => item.provider_type === 'hospital'); setHospitals(hospitalRows); setHospitalId(hospitalRows[0]?.id || ''); }).catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : 'Hospital load করা যায়নি।')); }, []);
  useEffect(() => { if (!hospitalId) { setRows([]); setLoading(false); return; } setLoading(true); getHospitalAmbulanceLinkRequests(hospitalId, null).then(setRows).catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : 'Request load করা যায়নি।')).finally(() => setLoading(false)); }, [hospitalId]);
  if (account && account.role !== 'hospital') return <Navigate to="/dashboard" replace />;

  async function respond(row: HospitalAmbulanceLinkRequest, status: 'approved' | 'rejected' | 'removed') {
    if ((status === 'rejected' || status === 'removed') && (confirm?.id !== row.ambulance_id || confirm.status !== status)) { setConfirm({ id: row.ambulance_id, status }); return; }
    setWorking(row.ambulance_id); setError(null);
    try { await respondToAmbulanceHospitalLink({ ambulanceId: row.ambulance_id, hospitalId, status }); setConfirm(null); setRows(await getHospitalAmbulanceLinkRequests(hospitalId, null)); }
    catch (responseError) { setError(responseError instanceof Error ? responseError.message : 'উত্তর দেওয়া যায়নি।'); }
    finally { setWorking(null); }
  }

  return <div className="app-shell provider-dashboard-page"><PublicHeader /><main className="provider-dashboard-main container"><Link className="back-link" to="/dashboard"><ArrowLeft /> Dashboard-এ ফিরুন</Link><div className="provider-page-heading"><span><Ambulance /></span><div><small>Hospital affiliation</small><h1>Ambulance link requests</h1><p>Request review করুন। Approved link-ই কেবল public directory-তে দেখাবে।</p></div></div>{hospitals.length > 1 && <label className="provider-selector">Hospital<select value={hospitalId} onChange={(event) => setHospitalId(event.target.value)}>{hospitals.map((item) => <option key={item.id} value={item.id}>{item.name_bn}</option>)}</select></label>}{error && <div className="error-box">{error}</div>}{loading ? <div className="loading-box"><LoaderCircle className="spin" /> Request লোড হচ্ছে…</div> : !hospitals.length ? <div className="empty-state"><span>🏥</span><h3>Hospital profile পাওয়া যায়নি</h3></div> : rows.length ? <div className="provider-ambulance-requests">{rows.map((row) => <article key={row.ambulance_id}><span><Ambulance /></span><div><h2>{row.operator_name}</h2><p>{vehicleLabels[row.vehicle_type]} • {row.vehicle_registration_no}</p><a href={`tel:${row.phone}`}><Phone /> {row.phone}</a></div><b className={`link-${row.link_status}`}>{row.link_status}</b><div>{row.link_status === 'pending' && <><button className="positive" disabled={working === row.ambulance_id} onClick={() => void respond(row, 'approved')}><Check /> Approve</button><button className={confirm?.id === row.ambulance_id ? 'danger confirming' : 'danger'} disabled={working === row.ambulance_id} onClick={() => void respond(row, 'rejected')}><X /> {confirm?.id === row.ambulance_id ? 'নিশ্চিত করুন' : 'Reject'}</button></>}{row.link_status === 'approved' && <button className={confirm?.id === row.ambulance_id ? 'danger confirming' : 'danger'} disabled={working === row.ambulance_id} onClick={() => void respond(row, 'removed')}><X /> {confirm?.id === row.ambulance_id ? 'নিশ্চিত করুন' : 'Link সরান'}</button>}{confirm?.id === row.ambulance_id && <button onClick={() => setConfirm(null)}>ফিরে যান</button>}</div></article>)}</div> : <div className="empty-state"><span>🚑</span><h3>কোনো link request নেই</h3></div>}</main></div>;
}
