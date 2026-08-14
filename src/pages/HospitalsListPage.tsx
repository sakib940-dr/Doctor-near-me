import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, LoaderCircle, Search } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import PublicHeader from '../components/PublicHeader';
import ProviderCard from '../components/ProviderCard';
import { isSupabaseConfigured } from '../lib/supabase';
import { getDistricts, getUpazilas, searchProviders } from '../services/discovery';
import type { District, ProviderPublicRow, Upazila } from '../types';

const PAGE_SIZE = 20;
const messageFrom = (error: unknown) => error instanceof Error ? error.message : 'তথ্য লোড করা যায়নি।';

export default function HospitalsListPage() {
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') ?? '');
  const [districtId, setDistrictId] = useState(params.get('district') ?? '');
  const [upazilaId, setUpazilaId] = useState(params.get('upazila') ?? '');
  const [providerType, setProviderType] = useState(params.get('type') ?? '');
  const [districts, setDistricts] = useState<District[]>([]);
  const [upazilas, setUpazilas] = useState<Upazila[]>([]);
  const [rows, setRows] = useState<ProviderPublicRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [error, setError] = useState<string | null>(null);

  const page = Math.max(1, Number(params.get('page') || '1') || 1);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  useEffect(() => {
    document.title = 'হাসপাতাল ও চেম্বার | সিরাজগঞ্জ ডাক্তার';
    if (!isSupabaseConfigured) return;
    getDistricts().then(setDistricts).catch((loadError: unknown) => setError(messageFrom(loadError)));
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
    searchProviders({
      query: params.get('q') ?? '',
      districtId: params.get('district') ? Number(params.get('district')) : null,
      upazilaId: params.get('upazila') ? Number(params.get('upazila')) : null,
      providerType: (params.get('type') as 'hospital' | 'chamber' | null) || null,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }).then(({ rows: result, total: count }) => { if (active) { setRows(result); setTotal(count); } })
      .catch((loadError: unknown) => { if (active) setError(messageFrom(loadError)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [params, page]);

  function apply() {
    const next = new URLSearchParams();
    if (query.trim()) next.set('q', query.trim());
    if (districtId) next.set('district', districtId);
    if (upazilaId) next.set('upazila', upazilaId);
    if (providerType) next.set('type', providerType);
    setParams(next);
  }

  function setPage(nextPage: number) {
    const next = new URLSearchParams(params);
    if (nextPage <= 1) next.delete('page'); else next.set('page', String(nextPage));
    setParams(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <div className="app-shell directory-page">
      <PublicHeader />
      <main>
        <section className="directory-hero">
          <div className="container">
            <span>যাচাইকৃত প্রতিষ্ঠান</span>
            <h1>হাসপাতাল ও চেম্বার খুঁজুন</h1>
            <p>নাম, ঠিকানা বা এলাকা অনুযায়ী অনুসন্ধান করুন</p>
            <form className="directory-search" onSubmit={(event) => { event.preventDefault(); apply(); }}>
              <Search size={21} />
              <input aria-label="হাসপাতাল/চেম্বার খুঁজুন" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="নাম বা ঠিকানা লিখুন" />
              <button type="submit">খুঁজুন</button>
            </form>
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
            <select value={providerType} onChange={(event) => setProviderType(event.target.value)}>
              <option value="">হাসপাতাল ও চেম্বার</option>
              <option value="hospital">শুধু হাসপাতাল</option>
              <option value="chamber">শুধু চেম্বার</option>
            </select>
            <button type="button" className="apply-filter" onClick={apply}>প্রয়োগ করুন</button>
          </div>

          {!isSupabaseConfigured && <div className="directory-notice">লাইভ ফলাফলের জন্য Supabase environment variables প্রয়োজন।</div>}
          {error && <div className="error-box" role="alert">{error}</div>}
          {loading ? (
            <div className="loading-box"><LoaderCircle className="spin" /> লোড হচ্ছে…</div>
          ) : rows.length ? (
            <div className="provider-vertical-list">
              {rows.map((provider) => <ProviderCard provider={provider} key={provider.id} />)}
            </div>
          ) : isSupabaseConfigured && (
            <div className="empty-state"><span>🏥</span><h3>কোনো প্রতিষ্ঠান পাওয়া যায়নি</h3><p>অন্য এলাকা বা ভিন্ন শব্দ দিয়ে আবার চেষ্টা করুন।</p></div>
          )}

          {!loading && totalPages > 1 && (
            <nav className="pagination" aria-label="ফলাফলের পৃষ্ঠা">
              <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft /></button>
              <span>পৃষ্ঠা {page} / {totalPages}</span>
              <button type="button" disabled={page >= totalPages} onClick={() => setPage(page + 1)}><ChevronRight /></button>
            </nav>
          )}
        </section>
      </main>
    </div>
  );
}
