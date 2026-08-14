import { useEffect, useState } from 'react';
import { Building2, LoaderCircle, MapPin } from 'lucide-react';
import PublicHeader from '../components/PublicHeader';
import ProviderCard from '../components/ProviderCard';
import VisitorBottomNav from '../components/VisitorBottomNav';
import { isSupabaseConfigured } from '../lib/supabase';
import { getDistricts, getPublicProviders, getUpazilas } from '../services/discovery';
import type { District, ProviderDirectoryRow, Upazila } from '../types';

export default function PublicProvidersPage() {
  const [rows, setRows] = useState<ProviderDirectoryRow[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [upazilas, setUpazilas] = useState<Upazila[]>([]);
  const [districtId, setDistrictId] = useState('');
  const [upazilaId, setUpazilaId] = useState('');
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    getDistricts().then(setDistricts).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || !districtId) { setUpazilas([]); setUpazilaId(''); return; }
    getUpazilas(Number(districtId)).then(setUpazilas).catch(() => setUpazilas([]));
  }, [districtId]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    setLoading(true);
    getPublicProviders({
      districtId: districtId ? Number(districtId) : null,
      upazilaId: upazilaId ? Number(upazilaId) : null,
      limit: 100,
    }).then(setRows).catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : 'তথ্য লোড করা যায়নি।')).finally(() => setLoading(false));
  }, [districtId, upazilaId]);

  return (
    <div className="app-shell public-provider-page">
      <PublicHeader />
      <main className="container public-provider-main">
        <section className="provider-list-hero">
          <span><Building2 /> চিকিৎসা প্রতিষ্ঠান</span>
          <h1>হাসপাতাল ও চেম্বার</h1>
          <p>অনুমোদিত হাসপাতাল/চেম্বার বেছে নিয়ে সংশ্লিষ্ট ডাক্তার ও লোকেশন দেখুন।</p>
          <div className="provider-filter-row">
            <label><MapPin /><select value={districtId} onChange={(event) => { setDistrictId(event.target.value); setUpazilaId(''); }}><option value="">সকল জেলা</option>{districts.map((district) => <option key={district.id} value={district.id}>{district.name_bn}</option>)}</select></label>
            <select value={upazilaId} onChange={(event) => setUpazilaId(event.target.value)} disabled={!districtId}><option value="">সকল উপজেলা</option>{upazilas.map((upazila) => <option key={upazila.id} value={upazila.id}>{upazila.name_bn}</option>)}</select>
          </div>
        </section>
        {error && <div className="error-box">{error}</div>}
        {loading ? <div className="loading-box"><LoaderCircle className="spin" /> প্রতিষ্ঠান লোড হচ্ছে…</div> : rows.length ? <div className="provider-list-vertical">{rows.map((provider) => <ProviderCard provider={provider} key={provider.id} />)}</div> : <div className="visitor-empty">কোনো অনুমোদিত হাসপাতাল/চেম্বার পাওয়া যায়নি।</div>}
      </main>
      <VisitorBottomNav />
    </div>
  );
}
