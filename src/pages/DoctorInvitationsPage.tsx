import { useEffect, useState } from 'react';
import { ArrowLeft, Building2, Check, LoaderCircle, MapPin, X } from 'lucide-react';
import { Link, Navigate } from 'react-router-dom';
import PublicHeader from '../components/PublicHeader';
import { useAuth } from '../contexts/AuthContext';
import { getMyDoctorProviderInvitations, respondToProviderInvitation } from '../services/providerDashboard';
import type { DoctorProviderInvitation } from '../types';

const labels = { pending: 'উত্তর অপেক্ষমাণ', approved: 'সংযুক্ত', rejected: 'প্রত্যাখ্যাত', removed: 'অপসারিত' };

export default function DoctorInvitationsPage() {
  const { account } = useAuth();
  const [rows, setRows] = useState<DoctorProviderInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () => { setLoading(true); getMyDoctorProviderInvitations().then(setRows).catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : 'Invitation লোড করা যায়নি।')).finally(() => setLoading(false)); };
  useEffect(load, []);
  if (account && account.role !== 'doctor') return <Navigate to="/dashboard" replace />;

  async function respond(providerId: string, accept: boolean) {
    setWorking(providerId); setError(null);
    try { await respondToProviderInvitation(providerId, accept); load(); }
    catch (responseError) { setError(responseError instanceof Error ? responseError.message : 'উত্তর দেওয়া যায়নি।'); }
    finally { setWorking(null); }
  }

  return <div className="app-shell doctor-dashboard-page"><PublicHeader /><main className="doctor-dashboard-main container"><Link className="back-link" to="/dashboard"><ArrowLeft /> Dashboard-এ ফিরুন</Link><div className="doctor-page-heading"><span><Building2 /></span><div><small>Doctor consent</small><h1>প্রতিষ্ঠানের invitation</h1><p>Hospital/Chamber link review করুন। Accept না করলে তারা schedule পরিচালনা করতে পারবে না।</p></div></div>{error && <div className="error-box">{error}</div>}{loading ? <div className="loading-box"><LoaderCircle className="spin" /> Invitation লোড হচ্ছে…</div> : rows.length ? <div className="doctor-invitation-list">{rows.map((row) => <article key={row.provider_id}><span><Building2 /></span><div><h2>{row.provider_name}</h2><p>{row.provider_type === 'hospital' ? 'হাসপাতাল' : 'চেম্বার'} {row.address && <>• <MapPin /> {row.address}</>}</p><small>পাঠানো: {new Intl.DateTimeFormat('bn-BD', { dateStyle: 'medium' }).format(new Date(row.invited_at))}</small></div><b className={`link-${row.link_status}`}>{labels[row.link_status]}</b>{row.link_status === 'pending' && <div><button className="positive" disabled={working === row.provider_id} onClick={() => void respond(row.provider_id, true)}><Check /> Accept</button><button className="danger" disabled={working === row.provider_id} onClick={() => void respond(row.provider_id, false)}><X /> Reject</button></div>}</article>)}</div> : <div className="empty-state"><span>🏥</span><h3>কোনো invitation নেই</h3><p>প্রতিষ্ঠান invitation পাঠালে এখানে দেখবেন।</p></div>}</main></div>;
}
