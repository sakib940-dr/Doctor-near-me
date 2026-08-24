import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Filter, LoaderCircle, RotateCcw, Search, SlidersHorizontal, X } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import DoctorResultCard from '../components/DoctorResultCard';
import HospitalDoctorSearchCard from '../features/hospital/components/HospitalDoctorSearchCard';
import { searchPublicHospitalDoctors } from '../features/hospital/services/hospitalDoctors';
import type { HospitalDoctorSearchRow } from '../features/hospital/types';
import PublicHeader from '../components/PublicHeader';
import VisitorBottomNav from '../components/VisitorBottomNav';
import { isSupabaseConfigured } from '../lib/supabase';
import { getDegreeMaster, getDistricts, getSpecialties, getUpazilas, searchDoctors } from '../services/discovery';
import { getPublicProfileStatsBatch } from '../services/engagement';
import type { DegreeMasterItem, District, DoctorSearchRow, PublicProfileStats, Specialty, Upazila } from '../types';
import { useVisitorLanguage } from '../contexts/VisitorLanguageContext';
import { makePageTitle } from '../lib/brand';

const PAGE_SIZE = 20;

const numberParam = (value: string | null) => value && Number.isFinite(Number(value)) ? Number(value) : null;
const listParam = (value: string | null) => value ? value.split(',').filter(Boolean) : [];
const messageFrom = (error: unknown) => error instanceof Error ? error.message : 'তথ্য লোড করা যায়নি।';

export default function DoctorDirectory({ embedded = false }: { embedded?: boolean }) {
  const { language } = useVisitorLanguage();
  const tr = (bn: string, en: string) => language === 'bn' ? bn : en;
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') ?? '');
  const [districtId, setDistrictId] = useState(params.get('district') ?? '');
  const [upazilaId, setUpazilaId] = useState(params.get('upazila') ?? '');
  const [specialtyIds, setSpecialtyIds] = useState<string[]>(listParam(params.get('specialties')));
  const [degrees, setDegrees] = useState<string[]>(listParam(params.get('degrees')));
  const [medicalTypes, setMedicalTypes] = useState<string[]>(listParam(params.get('medicalTypes')));
  const [minFee, setMinFee] = useState(params.get('minFee') ?? '');
  const [maxFee, setMaxFee] = useState(params.get('maxFee') ?? '');
  const [today, setToday] = useState(params.get('today') === '1');
  const [sort, setSort] = useState(params.get('sort') ?? 'name');
  const [districts, setDistricts] = useState<District[]>([]);
  const [upazilas, setUpazilas] = useState<Upazila[]>([]);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [degreeOptions, setDegreeOptions] = useState<DegreeMasterItem[]>([]);
  const [rows, setRows] = useState<DoctorSearchRow[]>([]);
  const [hospitalRows, setHospitalRows] = useState<HospitalDoctorSearchRow[]>([]);
  const [stats, setStats] = useState<Record<string, PublicProfileStats>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(params.get('advanced') === '1');

  const page = Math.max(1, numberParam(params.get('page')) ?? 1);
  const total = rows[0]?.total_count ?? 0;
  const hospitalTotal = Number(hospitalRows[0]?.total_count ?? 0);
  const combinedTotal = total + hospitalTotal;
  const totalPages = Math.max(1, Math.ceil(Math.max(total,hospitalTotal) / PAGE_SIZE));
  const hasSearchCriteria = Boolean(
    (params.get('q') ?? '').trim()
      || params.get('district')
      || params.get('upazila')
      || params.get('specialties')
      || params.get('degrees')
      || params.get('medicalTypes')
      || params.get('classification')
      || params.get('minFee')
      || params.get('maxFee')
      || params.get('today') === '1'
  );

  useEffect(() => {
    document.title = makePageTitle(tr('ডাক্তার খুঁজুন', 'Find Doctors'));
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
    setMedicalTypes(listParam(params.get('medicalTypes')));
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
      setHospitalRows([]);
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
    const searchInput = {
      query: params.get('q') ?? '',
      districtId: numberParam(params.get('district')),
      upazilaId: numberParam(params.get('upazila')),
      specialtyIds: listParam(params.get('specialties')).map(Number).filter(Number.isFinite),
      degrees: effectiveDegrees,
      medicalTypes: listParam(params.get('medicalTypes')).filter((value): value is 'MBBS' | 'BDS' => value === 'MBBS' || value === 'BDS'),
      minFee: numberParam(params.get('minFee')),
      maxFee: numberParam(params.get('maxFee')),
      availableToday: params.get('today') === '1',
      sort: (params.get('sort') as 'name' | 'newest' | 'fee_low' | 'fee_high') ?? 'name',
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    };
    Promise.all([searchDoctors(searchInput),searchPublicHospitalDoctors(searchInput).catch(()=>[] as HospitalDoctorSearchRow[])])
      .then(([result,hospitalResult]) => { if (active) { setRows(result); setHospitalRows(hospitalResult); } })
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

  const activeFilterCount = useMemo(() => [districtId, upazilaId, minFee, maxFee, today ? '1' : '', ...specialtyIds, ...degrees, ...medicalTypes].filter(Boolean).length, [districtId, upazilaId, minFee, maxFee, today, specialtyIds, degrees, medicalTypes]);

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
    if (medicalTypes.length) next.set('medicalTypes', medicalTypes.join(','));
    if (minFee) next.set('minFee', minFee);
    if (maxFee) next.set('maxFee', maxFee);
    if (today) next.set('today', '1');
    if (sort !== 'name') next.set('sort', sort);
    setParams(next);
    setFiltersOpen(false);
  }

  function clearFilters() {
    setQuery(''); setDistrictId(''); setUpazilaId(''); setSpecialtyIds([]); setDegrees([]); setMedicalTypes([]); setMinFee(''); setMaxFee(''); setToday(false); setSort('name'); setParams({});
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
            <span>{tr('ডাক্তার ডিরেক্টরি', 'Doctor Directory')}</span>
            <h1>{tr('আপনার প্রয়োজনের সঠিক ডাক্তার খুঁজুন', 'Find the Right Doctor for You')}</h1>
            <p>{tr('সারা বাংলাদেশের ডাক্তার নাম, ডিগ্রি, বিশেষজ্ঞতা, জেলা ও উপজেলা / এলাকা অনুযায়ী অনুসন্ধান করুন', 'Search doctors across Bangladesh by name, degree, specialty, district, and area')}</p>
            <form className="directory-search" onSubmit={apply}>
              <Search size={21} />
              <input aria-label={tr('ডাক্তার খুঁজুন', 'Find doctors')} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tr('ডাক্তারের নাম, রোগ বা বিশেষজ্ঞতা', 'Doctor name, condition, or specialty')} />
              <button type="submit">{tr('খুঁজুন', 'Search')}</button>
            </form>
          </div>
        </section>

        <section className="container directory-layout">
          <button className="mobile-filter-button" type="button" onClick={() => setFiltersOpen(true)}><Filter size={18} /> {tr('ফিল্টার', 'Filters')} {activeFilterCount > 0 && <b>{activeFilterCount}</b>}</button>
          <aside className={filtersOpen ? 'filter-sidebar open' : 'filter-sidebar'}>
            <div className="filter-title"><span><SlidersHorizontal size={19} /> {tr('ফিল্টার', 'Filters')}</span><div><button type="button" onClick={clearFilters}><RotateCcw size={15} /> {tr('রিসেট', 'Reset')}</button><button className="filter-close" type="button" aria-label={tr('ফিল্টার বন্ধ করুন', 'Close filters')} onClick={() => setFiltersOpen(false)}><X size={17} /></button></div></div>
            <label className="filter-group"><strong>{tr('জেলা', 'District')}</strong><select value={districtId} onChange={(event) => { setDistrictId(event.target.value); setUpazilaId(''); }}><option value="">{tr('সকল জেলা', 'All districts')}</option>{districts.map((district) => <option value={district.id} key={district.id}>{language === 'bn' ? district.name_bn : district.name_en || district.name_bn}</option>)}</select></label>
            <label className="filter-group"><strong>{tr('উপজেলা / এলাকা', 'Upazila / Area')}</strong><select value={upazilaId} disabled={!districtId} onChange={(event) => setUpazilaId(event.target.value)}><option value="">{tr('সকল উপজেলা / এলাকা', 'All upazilas / areas')}</option>{upazilas.map((upazila) => <option value={upazila.id} key={upazila.id}>{language === 'bn' ? upazila.name_bn : upazila.name_en || upazila.name_bn}</option>)}</select></label>
            <fieldset className="filter-group"><legend>{tr('মেডিকেল ধরন', 'Medical Type')}</legend><div className="filter-checks"><label><input type="checkbox" checked={medicalTypes.includes('MBBS')} onChange={() => toggle(medicalTypes, 'MBBS', setMedicalTypes)} /><span>MBBS</span></label><label><input type="checkbox" checked={medicalTypes.includes('BDS')} onChange={() => toggle(medicalTypes, 'BDS', setMedicalTypes)} /><span>BDS</span></label></div></fieldset>
            <fieldset className="filter-group"><legend>{tr('বিশেষজ্ঞতা', 'Specialty')}</legend><div className="filter-checks scrollable">{specialties.map((specialty) => <label key={specialty.id}><input type="checkbox" checked={specialtyIds.includes(String(specialty.id))} onChange={() => toggle(specialtyIds, String(specialty.id), setSpecialtyIds)} /><span>{language === 'bn' ? specialty.name_bn : specialty.name_en || specialty.name_bn}</span></label>)}</div></fieldset>
            <fieldset className="filter-group"><legend>{tr('ডিগ্রি', 'Degree')}</legend><div className="filter-checks scrollable">{degreeOptions.map((degree) => <label key={degree.id}><input type="checkbox" checked={degrees.includes(degree.short_code)} onChange={() => toggle(degrees, degree.short_code, setDegrees)} /><span>{degree.short_code}</span></label>)}</div></fieldset>
            <div className="filter-group"><strong>{tr('ভিজিট ফি', 'Consultation Fee')}</strong><div className="fee-fields"><input aria-label={tr('সর্বনিম্ন ফি', 'Minimum fee')} type="number" min="0" value={minFee} onChange={(event) => setMinFee(event.target.value)} placeholder={tr('সর্বনিম্ন', 'Minimum')} /><input aria-label={tr('সর্বোচ্চ ফি', 'Maximum fee')} type="number" min="0" value={maxFee} onChange={(event) => setMaxFee(event.target.value)} placeholder={tr('সর্বোচ্চ', 'Maximum')} /></div></div>
            <label className="today-filter"><input type="checkbox" checked={today} onChange={(event) => setToday(event.target.checked)} /><span>{tr('আজ চেম্বার আছে', 'Available today')}</span></label>
            <button className="apply-filter" type="button" onClick={() => apply()}>{tr('ফিল্টার প্রয়োগ করুন', 'Apply Filters')}</button>
          </aside>

          <div className="directory-results">
            <div className="directory-toolbar"><div><strong>{loading ? tr('ডাক্তার খোঁজা হচ্ছে…', 'Searching doctors…') : tr(`${combinedTotal.toLocaleString('bn-BD')} জন ডাক্তার পাওয়া গেছে`, `${combinedTotal.toLocaleString('en-US')} doctors found`)}</strong><small>{tr('Doctor ও Hospital-managed public profile', 'Doctor and Hospital-managed public profiles')}</small></div><select aria-label={tr('ফলাফল সাজান', 'Sort results')} value={sort} onChange={(event) => { setSort(event.target.value); const next = new URLSearchParams(params); if (event.target.value === 'name') next.delete('sort'); else next.set('sort', event.target.value); next.delete('page'); setParams(next); }}><option value="name">{tr('নাম অনুযায়ী', 'By name')}</option><option value="newest">{tr('নতুন আগে', 'Newest first')}</option><option value="fee_low">{tr('কম ফি আগে', 'Lowest fee')}</option><option value="fee_high">{tr('বেশি ফি আগে', 'Highest fee')}</option></select></div>
            {!isSupabaseConfigured && <div className="directory-notice">{tr('লাইভ ফলাফলের জন্য Vercel-এ Supabase environment variables যোগ করুন। ফিল্টার ইউআই প্রিভিউ করা যাচ্ছে।', 'Add Supabase environment variables in Vercel for live results. Filter UI preview is available.')}</div>}
            {error && <div className="error-box" role="alert">{error}</div>}
            {!hasSearchCriteria ? <div className="directory-search-prompt"><Search /><h3>{tr('অনুসন্ধান শুরু করুন', 'Start Searching')}</h3><p>{tr('ডাক্তারের নাম লিখুন অথবা ডিগ্রি, বিশেষজ্ঞতা, জেলা/উপজেলা/এলাকা থেকে অন্তত একটি ফিল্টার নির্বাচন করুন। অনুসন্ধান না করা পর্যন্ত প্রোফাইল ডেটা লোড হবে না।', 'Enter a doctor name or select at least one degree, specialty, district, or area filter. Profile data is loaded only after a search.')}</p></div> : loading ? <div className="loading-box"><LoaderCircle className="spin" /> {tr('ফলাফল লোড হচ্ছে…', 'Loading results…')}</div> : rows.length||hospitalRows.length ? <><div className="directory-grid">{hospitalRows.map((doctor)=><HospitalDoctorSearchCard doctor={doctor} key={`hospital-${doctor.id}`}/>)}{rows.map((doctor) => <DoctorResultCard doctor={doctor} stats={stats[doctor.doctor_id]} onStatsChange={(doctorId, next) => setStats((current) => ({ ...current, [doctorId]: next }))} key={doctor.doctor_id} />)}</div></> : isSupabaseConfigured && <div className="empty-state"><span>🔎</span><h3>{tr('কোনো ডাক্তার পাওয়া যায়নি', 'No doctors found')}</h3><p>{tr('ফিল্টার কমিয়ে বা অন্য শব্দ দিয়ে চেষ্টা করুন।', 'Try fewer filters or a different search term.')}</p></div>}
            {!loading && hasSearchCriteria && totalPages > 1 && <nav className="pagination" aria-label={tr('ফলাফলের পৃষ্ঠা', 'Result pages')}><button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft /></button><span>{tr(`পৃষ্ঠা ${page} / ${totalPages} · প্রতি পৃষ্ঠায় ${PAGE_SIZE} জন`, `Page ${page} / ${totalPages} · ${PAGE_SIZE} per page`)}</span><button type="button" disabled={page >= totalPages} onClick={() => setPage(page + 1)}><ChevronRight /></button></nav>}
          </div>
        </section>
      </main>
      {!embedded && <VisitorBottomNav />}
    </div>
  );
}
