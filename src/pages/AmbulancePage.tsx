import { useEffect, useState } from 'react';
import { Ambulance as AmbulanceIcon, LoaderCircle, MapPin, Phone } from 'lucide-react';
import PublicHeader from '../components/PublicHeader';
import { isSupabaseConfigured } from '../lib/supabase';
import { getDistricts, getUpazilas, searchAmbulances } from '../services/discovery';
import type { AmbulanceSearchRow, District, Upazila } from '../types';

const messageFrom = (error: unknown) => error instanceof Error ? error.message : 'তথ্য লোড করা যায়নি।';

export default function AmbulancePage() {
  const [districtId, setDistrictId] = useState('');
  const [upazilaId, setUpazilaId] = useState('');
  const [districts, setDistricts] = useState<District[]>([]);
  const [upazilas, setUpazilas] = useState<Upazila[]>([]);
  const [rows, setRows] = useState<AmbulanceSearchRow[]>([]);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'অ্যাম্বুলেন্স | সিরাজগঞ্জ ডাক্তার';
    if (!isSupabaseConfigured) return;
    getDistricts().then(setDistricts).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!districtId || !isSupabaseConfigured) { setUpazilas([]); return; }
    getUpazilas(Number(districtId)).then(setUpazilas).catch(() => setUpazilas([]));
  }, [districtId]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    setLoading(true);
    setError(null);
    searchAmbulances({
      districtId: districtId ? Number(districtId) : null,
      upazilaId: upazilaId ? Number(upazilaId) : null,
    }).then((result) => { if (active) setRows(result); })
      .catch((loadError: unknown) => { if (active) setError(messageFrom(loadError)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [districtId, upazilaId]);

  return (
    <div className="app-shell directory-page">
      <PublicHeader />
      <main>
        <section className="directory-hero">
          <div className="container">
            <span>জরুরি সেবা</span>
            <h1>অ্যাম্বুলেন্স খুঁজুন</h1>
            <p>এলাকা অনুযায়ী উপলভ্য অ্যাম্বুলেন্স সার্ভিস দেখুন ও সরাসরি কল করুন</p>
          </div>
        </section>

        <section className="container">
          <div className="provider-filter-row">
            <select value={districtId} onChange={(event) => { setDistrictId(event.target.value); setUpazilaId(''); }}>
              <option value="">সকল জেলা</option>
              {districts.map((district) => <option key={district.id} value={district.id}>{district.name_bn}</option>)}
            </select>
            <select value={upazilaId} disabled={!districtId} onChange={(event) => setUpazilaId(event.target.value)}>
              <option value="">সকল উপজেলা</option>
              {upazilas.map((upazila) => <option key={upazila.id} value={upazila.id}>{upazila.name_bn}</option>)}
            </select>
          </div>

          {error && <div className="error-box" role="alert">{error}</div>}
          {loading ? (
            <div className="loading-box"><LoaderCircle className="spin" /> লোড হচ্ছে…</div>
          ) : rows.length ? (
            <div className="donor-list">
              {rows.map((ambulance) => (
                <article className="donor-card ambulance-list-card" key={ambulance.ambulance_id}>
                  <div className="donor-avatar"><AmbulanceIcon size={22} /></div>
                  <div className="donor-body">
                    <h3>{ambulance.operator_name}</h3>
                    <span className={ambulance.is_available ? 'donor-group available' : 'donor-group unavailable'}>{ambulance.is_available ? 'এখন উপলভ্য' : 'অনুপলভ্য'}</span>
                    <p><MapPin size={13} /> {[ambulance.upazila_name_bn, ambulance.district_name_bn].filter(Boolean).join(', ') || ambulance.service_area || 'এলাকার তথ্য নেই'}</p>
                  </div>
                  <a className="chamber-call" href={`tel:${ambulance.phone}`}><Phone size={16} /> {ambulance.phone}</a>
                </article>
              ))}
            </div>
          ) : isSupabaseConfigured && (
            <div className="empty-state"><span>🚑</span><h3>কোনো অ্যাম্বুলেন্স পাওয়া যায়নি</h3><p>অন্য এলাকা বেছে আবার চেষ্টা করুন।</p></div>
          )}
        </section>
      </main>
    </div>
  );
}
