import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Filter, LoaderCircle, RotateCcw, Search, SlidersHorizontal, X } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import DoctorResultCard from '../components/DoctorResultCard';
import PublicHeader from '../components/PublicHeader';
import { isSupabaseConfigured } from '../lib/supabase';
import { getDistricts, getSpecialties, getUpazilas, searchDoctors } from '../services/discovery';
import type { District, DoctorSearchRow, Specialty, Upazila } from '../types';

const PAGE_SIZE = 20;
const degreeOptions = ['MBBS', 'BDS', 'FCPS', 'MD', 'MS'];
const designationOptions = ['Consultant', 'Junior Consultant', 'Assistant Professor', 'Associate Professor', 'Professor'];

const numberParam = (value: string | null) => value && Number.isFinite(Number(value)) ? Number(value) : null;
const listParam = (value: string | null) => value ? value.split(',').filter(Boolean) : [];
const messageFrom = (error: unknown) => error instanceof Error ? error.message : 'তথ্য লোড করা যায়নি।';

export default function DoctorDirectory() {
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') ?? '');
  const [districtId, setDistrictId] = useState(params.get('district') ?? '');
  const [upazilaId, setUpazilaId] = useState(params.get('upazila') ?? '');
  const [specialtyIds, setSpecialtyIds] = useState<string[]>(listParam(params.get('specialties')));
  const [degrees, setDegrees] = useState<string[]>(listParam(params.get('degrees')));
  const [designations, setDesignations] = useState<string[]>(listParam(params.get('designations')));
  const [minFee, setMinFee] = useState(params.get('minFee') ?? '');
  const [maxFee, setMaxFee] = useState(params.get('maxFee') ?? '');
  const [today, setToday] = useState(params.get('today') === '1');
  const [sort, setSort] = useState(params.get('sort') ?? 'name');
  const [districts, setDistricts] = useState<District[]>([]);
  const [upazilas, setUpazilas] = useState<Upazila[]>([]);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [rows, setRows] = useState<DoctorSearchRow[]>([]);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [error, setError] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const page = Math.max(1, numberParam(params.get('page')) ?? 1);
  const total = rows[0]?.total_count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  useEffect(() => {
    document.title = 'ডাক্তার খুঁজুন | সিরাজগঞ্জ ডাক্তার';
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    Promise.all([getDistricts(), getSpecialties()])
      .then(([districtRows, specialtyRows]) => {
        setDistricts(districtRows);
        setSpecialties(specialtyRows);
      })
      .catch((loadError: unknown) => setError(messageFrom(loadError)));
  }, []);

  useEffect(() => {
    if (!districtId || !isSupabaseConfigured) {
      setUpazilas([]);
      return;
    }
    getUpazilas(Number(districtId)).then(setUpazilas).catch((loadError: unknown) => setError(messageFrom(loadError)));
  }, [districtId]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    setLoading(true);
    setError(null);
    searchDoctors({
      query: params.get('q') ?? '',
      districtId: numberParam(params.get('district')),
      upazilaId: numberParam(params.get('upazila')),
      specialtyIds: listParam(params.get('specialties')).map(Number).filter(Number.isFinite),
      degrees: listParam(params.get('degrees')),
      designations: listParam(params.get('designations')),
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
  }, [params, page]);

  const activeFilterCount = useMemo(() => [districtId, upazilaId, minFee, maxFee, today ? '1' : '', ...specialtyIds, ...degrees, ...designations].filter(Boolean).length, [districtId, upazilaId, minFee, maxFee, today, specialtyIds, degrees, designations]);

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
    if (designations.length) next.set('designations', designations.join(','));
    if (minFee) next.set('minFee', minFee);
    if (maxFee) next.set('maxFee', maxFee);
    if (today) next.set('today', '1');
    if (sort !== 'name') next.set('sort', sort);
    setParams(next);
    setFiltersOpen(false);
  }

  function clearFilters() {
    setQuery(''); setDistrictId(''); setUpazilaId(''); setSpecialtyIds([]); setDegrees([]); setDesignations([]); setMinFee(''); setMaxFee(''); setToday(false); setSort('name'); setParams({});
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
            <span>ভেরিফায়েড ডাক্তার ডিরেক্টরি</span>
            <h1>আপনার প্রয়োজনের সঠিক ডাক্তার খুঁজুন</h1>
            <p>নাম, রোগ, বিশেষজ্ঞতা ও এলাকা অনুযায়ী অনুসন্ধান করুন</p>
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
            <label className="filter-group"><strong>উপজেলা</strong><select value={upazilaId} disabled={!districtId} onChange={(event) => setUpazilaId(event.target.value)}><option value="">সকল উপজেলা</option>{upazilas.map((upazila) => <option value={upazila.id} key={upazila.id}>{upazila.name_bn}</option>)}</select></label>
            <fieldset className="filter-group"><legend>স্পেশালিটি</legend><div className="filter-checks scrollable">{specialties.map((specialty) => <label key={specialty.id}><input type="checkbox" checked={specialtyIds.includes(String(specialty.id))} onChange={() => toggle(specialtyIds, String(specialty.id), setSpecialtyIds)} /><span>{specialty.name_bn}</span></label>)}</div></fieldset>
            <fieldset className="filter-group"><legend>ডিগ্রি</legend><div className="filter-checks">{degreeOptions.map((degree) => <label key={degree}><input type="checkbox" checked={degrees.includes(degree)} onChange={() => toggle(degrees, degree, setDegrees)} /><span>{degree}</span></label>)}</div></fieldset>
            <fieldset className="filter-group"><legend>পদবি</legend><div className="filter-checks">{designationOptions.map((designation) => <label key={designation}><input type="checkbox" checked={designations.includes(designation)} onChange={() => toggle(designations, designation, setDesignations)} /><span>{designation}</span></label>)}</div></fieldset>
            <div className="filter-group"><strong>ভিজিট ফি</strong><div className="fee-fields"><input aria-label="সর্বনিম্ন ফি" type="number" min="0" value={minFee} onChange={(event) => setMinFee(event.target.value)} placeholder="সর্বনিম্ন" /><input aria-label="সর্বোচ্চ ফি" type="number" min="0" value={maxFee} onChange={(event) => setMaxFee(event.target.value)} placeholder="সর্বোচ্চ" /></div></div>
            <label className="today-filter"><input type="checkbox" checked={today} onChange={(event) => setToday(event.target.checked)} /><span>আজ চেম্বার আছে</span></label>
            <button className="apply-filter" type="button" onClick={() => apply()}>ফিল্টার প্রয়োগ করুন</button>
          </aside>

          <div className="directory-results">
            <div className="directory-toolbar"><div><strong>{loading ? 'ডাক্তার খোঁজা হচ্ছে…' : `${total} জন ডাক্তার পাওয়া গেছে`}</strong><small>শুধু অনুমোদিত ও সক্রিয় প্রোফাইল</small></div><select aria-label="ফলাফল সাজান" value={sort} onChange={(event) => { setSort(event.target.value); const next = new URLSearchParams(params); if (event.target.value === 'name') next.delete('sort'); else next.set('sort', event.target.value); next.delete('page'); setParams(next); }}><option value="name">নাম অনুযায়ী</option><option value="newest">নতুন আগে</option><option value="fee_low">কম ফি আগে</option><option value="fee_high">বেশি ফি আগে</option></select></div>
            {!isSupabaseConfigured && <div className="directory-notice">লাইভ ফলাফলের জন্য Vercel-এ Supabase environment variables যোগ করুন। ফিল্টার UI preview করা যাচ্ছে।</div>}
            {error && <div className="error-box" role="alert">{error}</div>}
            {loading ? <div className="loading-box"><LoaderCircle className="spin" /> ফলাফল লোড হচ্ছে…</div> : rows.length ? <div className="directory-grid">{rows.map((doctor) => <DoctorResultCard doctor={doctor} key={doctor.doctor_id} />)}</div> : isSupabaseConfigured && <div className="empty-state"><span>🔎</span><h3>কোনো ডাক্তার পাওয়া যায়নি</h3><p>ফিল্টার কমিয়ে বা অন্য শব্দ দিয়ে চেষ্টা করুন।</p></div>}
            {!loading && totalPages > 1 && <nav className="pagination" aria-label="ফলাফলের পৃষ্ঠা"><button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft /></button><span>পৃষ্ঠা {page} / {totalPages}</span><button type="button" disabled={page >= totalPages} onClick={() => setPage(page + 1)}><ChevronRight /></button></nav>}
          </div>
        </section>
      </main>
    </div>
  );
}
