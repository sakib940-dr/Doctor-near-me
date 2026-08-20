import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Filter, LoaderCircle, RotateCcw, Search, SlidersHorizontal, X } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import DoctorResultCard from '../components/DoctorResultCard';
import PublicHeader from '../components/PublicHeader';
import VisitorBottomNav from '../components/VisitorBottomNav';
import { isSupabaseConfigured } from '../lib/supabase';
import { getDegreeMaster, getDistricts, getSpecialties, getUpazilas, searchDoctors } from '../services/discovery';
import { getPublicProfileStatsBatch } from '../services/engagement';
import type { DegreeMasterItem, District, DoctorSearchRow, PublicProfileStats, Specialty, Upazila } from '../types';
import { makePageTitle } from '../lib/brand';

const PAGE_SIZE = 20;

const numberParam = (value: string | null) => value && Number.isFinite(Number(value)) ? Number(value) : null;
const listParam = (value: string | null) => value ? value.split(',').filter(Boolean) : [];
const messageFrom = (error: unknown) => error instanceof Error ? error.message : 'তথ্য লোড করা যায়নি।';

export default function DoctorDirectory({ embedded = false }: { embedded?: boolean }) {
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') ?? '');
  const [districtId, setDistrictId] = useState(params.get('district') ?? '');
  const [upazilaId, setUpazilaId] = useState(params.get('upazila') ?? '');
  const [specialtyIds, setSpecialtyIds] = useState<string[]>(listParam(params.get('specialties')));
  const [degrees, setDegrees] = useState<string[]>(listParam(params.get('degrees')));
  const [minFee, setMinFee] = useState(params.get('minFee') ?? '');
  const [maxFee, setMaxFee] = useState(params.get('maxFee') ?? '');
  const [today, setToday] = useState(params.get('today') === '1');
  const [sort, setSort] = useState(params.get('sort') ?? 'name');
  const [districts, setDistricts] = useState<District[]>([]);
  const [upazilas, setUpazilas] = useState<Upazila[]>([]);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [degreeOptions, setDegreeOptions] = useState<DegreeMasterItem[]>([]);
  const [rows, setRows] = useState<DoctorSearchRow[]>([]);
  const [stats, setStats] = useState<Record<string, PublicProfileStats>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(params.get('advanced') === '1');

  const page = Math.max(1, numberParam(params.get('page')) ?? 1);
  const total = rows[0]?.total_count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasSearchCriteria = Boolean(
    (params.get('q') ?? '').trim()
      || params.get('district')
      || params.get('upazila')
      || params.get('specialties')
      || params.get('degrees')
      || params.get('classification')
      || params.get('minFee')
      || params.get('maxFee')
      || params.get('today') === '1'
  );

  useEffect(() => {
    document.title = makePageTitle('ডাক্তার খুঁজুন');
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    Promise.all([getDistricts(), getSpecialties(), getDegreeMaster()])
      .then(([districtRows, specialtyRows, degreeRows]) => {
        setDistricts(districtRows);
        setSpecialties(specialtyRows);
        setDegreeOptions(degreeRows);
      })
      .catch((loadError: unknown) => setError(messageFrom(loadError)));
  }, []);

  useEffect(() => {
    setQuery(params.get('q') ?? '');
    setDistrictId(params.get('district') ?? '');
    setUpazilaId(params.get('upazila') ?? '');
    setSpecialtyIds(listParam(params.get('specialties')));
    const explicitDegrees = listParam(params.get('degrees'));
    const classification = params.get('classification');
    if (explicitDegrees.length) setDegrees(explicitDegrees);
    else if (classification && degreeOptions.length) {
      setDegrees(degreeOptions.filter((item) => {
        if (classification === 'general') return item.classification === 'general' && item.discipline !== 'dental';
        if (classification === 'general_dental') return item.classification === 'general' && item.discipline === 'dental';
        if (classification === 'specialist') return item.classification === 'specialist';
        return false;
      }).map((item) => item.short_code));
    } else setDegrees([]);
    setMinFee(params.get('minFee') ?? '');
    setMaxFee(params.get('maxFee') ?? '');
    setToday(params.get('today') === '1');
    setSort(params.get('sort') ?? 'name');
    if (params.get('advanced') === '1') setFiltersOpen(true);
  }, [params, degreeOptions]);

  useEffect(() => {
    if (!districtId || !isSupabaseConfigured) {
      setUpazilas([]);
      return;
    }
    getUpazilas(Number(districtId)).then(setUpazilas).catch((loadError: unknown) => setError(messageFrom(loadError)));
  }, [districtId]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    if (!hasSearchCriteria) {
      setRows([]);
      setStats({});
      setLoading(false);
      setError(null);
      return;
    }
    const classification = params.get('classification');
    if (classification && !degreeOptions.length) return;
    const explicitDegrees = listParam(params.get('degrees'));
    const effectiveDegrees = explicitDegrees.length ? explicitDegrees : degreeOptions.filter((item) => {
      if (classification === 'general') return item.classification === 'general' && item.discipline !== 'dental';
      if (classification === 'general_dental') return item.classification === 'general' && item.discipline === 'dental';
      if (classification === 'specialist') return item.classification === 'specialist';
      return false;
    }).map((item) => item.short_code);
    let active = true;
    setLoading(true);
    setError(null);
    searchDoctors({
      query: params.get('q') ?? '',
      districtId: numberParam(params.get('district')),
      upazilaId: numberParam(params.get('upazila')),
      specialtyIds: listParam(params.get('specialties')).map(Number).filter(Number.isFinite),
      degrees: effectiveDegrees,
      minFee: numberParam(params.get('minFee')),
      maxFee: numberParam(params.get('maxFee')),
      availableToday: params.get('today') === '1',
      sort: (params.get('sort') as 'name' | 'newest' | 'fee_low' | 'fee_high') ?? 'name',
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }).then((result) => { if (active) setRows(result); })
      .catch((searchError: unknown) => { if (active) setError(messageFrom(searchError)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [params, page, degreeOptions, hasSearchCriteria]);

  useEffect(() => {
    if (!isSupabaseConfigured || !rows.length) { setStats({}); return; }
    let active = true;
    getPublicProfileStatsBatch({ doctorIds: rows.map((doctor) => doctor.doctor_id) })
      .then((items) => {
        if (!active) return;
        const next: Record<string, PublicProfileStats> = {};
        items.forEach((item) => {
          if (item.target_type !== 'doctor') return;
          next[item.target_id] = { follower_count: Number(item.follower_count ?? 0), review_count: Number(item.review_count ?? 0), average_rating: item.average_rating == null ? null : Number(item.average_rating), is_following: Boolean(item.is_following), ranking_tier: item.ranking_tier, is_premium: Boolean(item.is_premium) };
        });
        setStats(next);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [rows]);

  const activeFilterCount = useMemo(() => [districtId, upazilaId, minFee, maxFee, today ? '1' : '', ...specialtyIds, ...degrees].filter(Boolean).length, [districtId, upazilaId, minFee, maxFee, today, specialtyIds, degrees]);

  function toggle(list: string[], value: string, setter: (value: string[]) => void) {
    setter(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
  }

  function apply(event?: FormEvent) {
    event?.preventDefault();
    const next = new URLSearchParams();
    if (query.trim()) next.set('q', query.trim());
    if (districtId) next.set('district', districtId);
    if (upazilaId) next.set('upazila', upazilaId);
    if (specialtyIds.length) next.set('specialties', specialtyIds.join(','));
    if (degrees.length) next.set('degrees', degrees.join(','));
    if (minFee) next.set('minFee', minFee);
    if (maxFee) next.set('maxFee', maxFee);
    if (today) next.set('today', '1');
    if (sort !== 'name') next.set('sort', sort);
    setParams(next);
    setFiltersOpen(false);
  }

  function clearFilters() {
    setQuery(''); setDistrictId(''); setUpazilaId(''); setSpecialtyIds([]); setDegrees([]); setMinFee(''); setMaxFee(''); setToday(false); setSort('name'); setParams({});
  }

  function setPage(nextPage: number) {
    const next = new URLSearchParams(params);
    if (nextPage <= 1) next.delete('page'); else next.set('page', String(nextPage));
    setParams(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <div className="app-shell directory-page">
      {!embedded && <PublicHeader mobileBottomNav />}
      <main>
        <section className="directory-hero">
          <div className="container">
            <span>ভেরিফায়েড ডাক্তার ডিরেক্টরি</span>
            <h1>আপনার প্রয়োজনের সঠিক ডাক্তার খুঁজুন</h1>
            <p>সারা বাংলাদেশের ডাক্তার নাম, ডিগ্রি, স্পেশালিটি, জেলা ও উপজেলা / এলাকা অনুযায়ী অনুসন্ধান করুন</p>
            <form className="directory-search" onSubmit={apply}>
              <Search size={21} />
              <input aria-label="ডাক্তার খুঁজুন" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ডাক্তারের নাম, রোগ বা স্পেশালিটি" />
              <button type="submit">খুঁজুন</button>
            </form>
          </div>
        </section>

        <section className="container directory-layout">
          <button className="mobile-filter-button" type="button" onClick={() => setFiltersOpen(true)}><Filter size={18} /> ফিল্টার {activeFilterCount > 0 && <b>{activeFilterCount}</b>}</button>
          <aside className={filtersOpen ? 'filter-sidebar open' : 'filter-sidebar'}>
            <div className="filter-title"><span><SlidersHorizontal size={19} /> ফিল্টার</span><div><button type="button" onClick={clearFilters}><RotateCcw size={15} /> রিসেট</button><button className="filter-close" type="button" aria-label="ফিল্টার বন্ধ করুন" onClick={() => setFiltersOpen(false)}><X size={17} /></button></div></div>
            <label className="filter-group"><strong>জেলা</strong><select value={districtId} onChange={(event) => { setDistrictId(event.target.value); setUpazilaId(''); }}><option value="">সকল জেলা</option>{districts.map((district) => <option value={district.id} key={district.id}>{district.name_bn}</option>)}</select></label>
            <label className="filter-group"><strong>উপজেলা / এলাকা</strong><select value={upazilaId} disabled={!districtId} onChange={(event) => setUpazilaId(event.target.value)}><option value="">সকল উপজেলা / এলাকা</option>{upazilas.map((upazila) => <option value={upazila.id} key={upazila.id}>{upazila.name_bn}</option>)}</select></label>
            <fieldset className="filter-group"><legend>স্পেশালিটি</legend><div className="filter-checks scrollable">{specialties.map((specialty) => <label key={specialty.id}><input type="checkbox" checked={specialtyIds.includes(String(specialty.id))} onChange={() => toggle(specialtyIds, String(specialty.id), setSpecialtyIds)} /><span>{specialty.name_bn}</span></label>)}</div></fieldset>
            <fieldset className="filter-group"><legend>ডিগ্রি</legend><div className="filter-checks scrollable">{degreeOptions.map((degree) => <label key={degree.id}><input type="checkbox" checked={degrees.includes(degree.short_code)} onChange={() => toggle(degrees, degree.short_code, setDegrees)} /><span>{degree.short_code}</span></label>)}</div></fieldset>
            <div className="filter-group"><strong>ভিজিট ফি</strong><div className="fee-fields"><input aria-label="সর্বনিম্ন ফি" type="number" min="0" value={minFee} onChange={(event) => setMinFee(event.target.value)} placeholder="সর্বনিম্ন" /><input aria-label="সর্বোচ্চ ফি" type="number" min="0" value={maxFee} onChange={(event) => setMaxFee(event.target.value)} placeholder="সর্বোচ্চ" /></div></div>
            <label className="today-filter"><input type="checkbox" checked={today} onChange={(event) => setToday(event.target.checked)} /><span>আজ চেম্বার আছে</span></label>
            <button className="apply-filter" type="button" onClick={() => apply()}>ফিল্টার প্রয়োগ করুন</button>
          </aside>

          <div className="directory-results">
            <div className="directory-toolbar"><div><strong>{loading ? 'ডাক্তার খোঁজা হচ্ছে…' : `${total} জন ডাক্তার পাওয়া গেছে`}</strong><small>সক্রিয় ও প্রকাশযোগ্য প্রোফাইল</small></div><select aria-label="ফলাফল সাজান" value={sort} onChange={(event) => { setSort(event.target.value); const next = new URLSearchParams(params); if (event.target.value === 'name') next.delete('sort'); else next.set('sort', event.target.value); next.delete('page'); setParams(next); }}><option value="name">নাম অনুযায়ী</option><option value="newest">নতুন আগে</option><option value="fee_low">কম ফি আগে</option><option value="fee_high">বেশি ফি আগে</option></select></div>
            {!isSupabaseConfigured && <div className="directory-notice">লাইভ ফলাফলের জন্য Vercel-এ Supabase environment variables যোগ করুন। ফিল্টার UI preview করা যাচ্ছে।</div>}
            {error && <div className="error-box" role="alert">{error}</div>}
            {!hasSearchCriteria ? <div className="directory-search-prompt"><Search /><h3>অনুসন্ধান শুরু করুন</h3><p>ডাক্তারের নাম লিখুন অথবা Degree, Specialty, জেলা/উপজেলা/এলাকা থেকে অন্তত একটি ফিল্টার নির্বাচন করুন। কোনো search না করা পর্যন্ত profile data load হবে না।</p></div> : loading ? <div className="loading-box"><LoaderCircle className="spin" /> ফলাফল লোড হচ্ছে…</div> : rows.length ? <div className="directory-grid">{rows.map((doctor) => <DoctorResultCard doctor={doctor} stats={stats[doctor.doctor_id]} onStatsChange={(doctorId, next) => setStats((current) => ({ ...current, [doctorId]: next }))} key={doctor.doctor_id} />)}</div> : isSupabaseConfigured && <div className="empty-state"><span>🔎</span><h3>কোনো ডাক্তার পাওয়া যায়নি</h3><p>ফিল্টার কমিয়ে বা অন্য শব্দ দিয়ে চেষ্টা করুন।</p></div>}
            {!loading && hasSearchCriteria && totalPages > 1 && <nav className="pagination" aria-label="ফলাফলের পৃষ্ঠা"><button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft /></button><span>পৃষ্ঠা {page} / {totalPages} · প্রতি পৃষ্ঠায় {PAGE_SIZE} জন</span><button type="button" disabled={page >= totalPages} onClick={() => setPage(page + 1)}><ChevronRight /></button></nav>}
          </div>
        </section>
      </main>
      {!embedded && <VisitorBottomNav />}
    </div>
  );
}
