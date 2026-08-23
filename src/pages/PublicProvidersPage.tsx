import { useEffect, useState } from 'react';
import { Building2, LoaderCircle, MapPin } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import PublicHeader from '../components/PublicHeader';
import ProviderCard from '../components/ProviderCard';
import VisitorBottomNav from '../components/VisitorBottomNav';
import { isSupabaseConfigured } from '../lib/supabase';
import { getDistricts, getPublicProviders, getUpazilas } from '../services/discovery';
import { getPublicProfileStatsBatch } from '../services/engagement';
import type { District, ProviderDirectoryRow, PublicProfileStats, Upazila } from '../types';
import { useVisitorLanguage } from '../contexts/VisitorLanguageContext';

const PAGE_SIZE = 20;

function toStatsMap(items: Awaited<ReturnType<typeof getPublicProfileStatsBatch>>) {
  const next: Record<string, PublicProfileStats> = {};
  items.forEach((item) => {
    if (item.target_type !== 'provider') return;
    next[item.target_id] = {
      follower_count: Number(item.follower_count ?? 0),
      review_count: Number(item.review_count ?? 0),
      average_rating: item.average_rating == null ? null : Number(item.average_rating),
      is_following: Boolean(item.is_following),
      ranking_tier: item.ranking_tier,
      is_premium: Boolean(item.is_premium),
    };
  });
  return next;
}

export default function PublicProvidersPage() {
  const { language } = useVisitorLanguage();
  const tr = (bn: string, en: string) => language === 'bn' ? bn : en;
  const [searchParams, setSearchParams] = useSearchParams();
  const [rows, setRows] = useState<ProviderDirectoryRow[]>([]);
  const [stats, setStats] = useState<Record<string, PublicProfileStats>>({});
  const [districts, setDistricts] = useState<District[]>([]);
  const [upazilas, setUpazilas] = useState<Upazila[]>([]);
  const [districtId, setDistrictId] = useState(searchParams.get('district') ?? '');
  const [upazilaId, setUpazilaId] = useState(searchParams.get('upazila') ?? '');
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewerLocation, setViewerLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    getDistricts().then(setDistricts).catch(() => undefined);
  }, []);

  useEffect(() => {
    const nextDistrictId = searchParams.get('district') ?? '';
    const nextUpazilaId = searchParams.get('upazila') ?? '';
    setDistrictId((current) => current === nextDistrictId ? current : nextDistrictId);
    setUpazilaId((current) => current === nextUpazilaId ? current : nextUpazilaId);
  }, [searchParams]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('docbd-current-location') || 'null') as { latitude?: number; longitude?: number } | null;
      if (saved && Number.isFinite(saved.latitude) && Number.isFinite(saved.longitude)) {
        setViewerLocation({ latitude: Number(saved.latitude), longitude: Number(saved.longitude) });
      }
    } catch { /* optional local preference */ }
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || !districtId) { setUpazilas([]); setUpazilaId(''); return; }
    getUpazilas(Number(districtId)).then(setUpazilas).catch(() => setUpazilas([]));
  }, [districtId]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    setLoading(true);
    setError(null);
    setRows([]);
    setStats({});
    getPublicProviders({
      districtId: districtId ? Number(districtId) : null,
      upazilaId: upazilaId ? Number(upazilaId) : null,
      limit: PAGE_SIZE,
      offset: 0,
    }).then(async (page) => {
      const pageStats = page.length ? await getPublicProfileStatsBatch({ providerIds: page.map((provider) => provider.id) }) : [];
      if (!active) return;
      setRows(page);
      setStats(toStatsMap(pageStats));
      const total = Number(page[0]?.total_count ?? page.length);
      setHasMore(page.length === PAGE_SIZE && page.length < total);
    }).catch((loadError: unknown) => {
      if (active) setError(loadError instanceof Error ? loadError.message : 'তথ্য লোড করা যায়নি।');
    }).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [districtId, upazilaId]);

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const page = await getPublicProviders({
        districtId: districtId ? Number(districtId) : null,
        upazilaId: upazilaId ? Number(upazilaId) : null,
        limit: PAGE_SIZE,
        offset: rows.length,
      });
      const pageStats = page.length ? await getPublicProfileStatsBatch({ providerIds: page.map((provider) => provider.id) }) : [];
      const total = Number(page[0]?.total_count ?? (rows.length + page.length));
      setRows((current) => [...current, ...page.filter((item) => !current.some((existing) => existing.id === item.id))]);
      setStats((current) => ({ ...current, ...toStatsMap(pageStats) }));
      setHasMore(page.length === PAGE_SIZE && rows.length + page.length < total);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'আরও প্রতিষ্ঠান লোড করা যায়নি।');
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="app-shell public-provider-page">
      <PublicHeader mobileBottomNav />
      <main className="container public-provider-main">
        <section className="provider-list-hero">
          <span><Building2 /> {tr('চিকিৎসা প্রতিষ্ঠান', 'Healthcare Providers')}</span>
          <h1>{tr('হাসপাতাল', 'Hospitals')}</h1>
          <p>{tr('ভেরিফায়েড হাসপাতাল বেছে নিয়ে সংশ্লিষ্ট ডাক্তার, যোগাযোগ ও অবস্থান দেখুন।', 'Choose a verified hospital to view its doctors, contact details, and location.')}</p>
          <div className="provider-filter-row">
            <label><MapPin /><select value={districtId} onChange={(event) => {
              const nextDistrict = event.target.value;
              setDistrictId(nextDistrict); setUpazilaId('');
              const next = new URLSearchParams(searchParams);
              if (nextDistrict) next.set('district', nextDistrict); else next.delete('district');
              next.delete('upazila'); setSearchParams(next, { replace: true });
            }}><option value="">{tr('সকল জেলা', 'All districts')}</option>{districts.map((district) => <option key={district.id} value={district.id}>{language === 'bn' ? district.name_bn : district.name_en || district.name_bn}</option>)}</select></label>
            <label><span className="sr-only">{tr('উপজেলা / এলাকা', 'Upazila / Area')}</span><select aria-label={tr('উপজেলা / এলাকা', 'Upazila / Area')} value={upazilaId} onChange={(event) => {
              const nextUpazila = event.target.value;
              setUpazilaId(nextUpazila);
              const next = new URLSearchParams(searchParams);
              if (nextUpazila) next.set('upazila', nextUpazila); else next.delete('upazila');
              setSearchParams(next, { replace: true });
            }} disabled={!districtId}><option value="">{tr('সকল উপজেলা / এলাকা', 'All upazilas / areas')}</option>{upazilas.map((upazila) => <option key={upazila.id} value={upazila.id}>{language === 'bn' ? upazila.name_bn : upazila.name_en || upazila.name_bn}</option>)}</select></label>
          </div>
        </section>
        {error && <div className="error-box">{error}</div>}
        {loading ? <div className="loading-box"><LoaderCircle className="spin" /> {tr('প্রতিষ্ঠান লোড হচ্ছে…', 'Loading providers…')}</div> : rows.length ? <>
          <div className="provider-list-vertical">{rows.map((provider) => <ProviderCard provider={provider} stats={stats[provider.id]} onStatsChange={(providerId, next) => setStats((current) => ({ ...current, [providerId]: next }))} viewerLocation={viewerLocation} key={provider.id} />)}</div>
          {hasMore && <div className="public-load-more-wrap"><button className="public-load-more-button" type="button" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? <><LoaderCircle className="spin" /> {tr('লোড হচ্ছে…', 'Loading…')}</> : tr('আরও দেখুন', 'View more')}</button></div>}
        </> : <div className="visitor-empty">{tr('কোনো ভেরিফায়েড হাসপাতাল পাওয়া যায়নি।', 'No verified hospital was found.')}</div>}
      </main>
      <VisitorBottomNav />
    </div>
  );
}
