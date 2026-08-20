import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, LoaderCircle, Search, Stethoscope } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import PublicHeader from '../components/PublicHeader';
import VisitorBottomNav from '../components/VisitorBottomNav';
import { getImageUrl } from '../lib/storage';
import { isSupabaseConfigured } from '../lib/supabase';
import { getHomepageConfiguration, getSpecialties } from '../services/discovery';
import type { DiscoveryTopic, Specialty } from '../types';

function CategoryMedia({ path }: { path: string | null }) {
  const url = getImageUrl(path, 'public-images');
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  return <span className="all-category-media" aria-hidden="true">{url && !failed ? <img src={url} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} /> : <Stethoscope />}</span>;
}

export default function CategoriesPage() {
  const [searchParams] = useSearchParams();
  const [topics, setTopics] = useState<DiscoveryTopic[]>([]);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) { setLoading(false); return; }
    Promise.all([getHomepageConfiguration(null), getSpecialties()])
      .then(([home, specialtyRows]) => { setTopics(home.topics ?? []); setSpecialties(specialtyRows); })
      .catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : 'ক্যাটাগরি লোড করা যায়নি।'))
      .finally(() => setLoading(false));
  }, []);

  const specialtyById = useMemo(() => new Map(specialties.map((item) => [item.id, item])), [specialties]);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredTopics = useMemo(() => topics.filter((topic) => `${topic.name_bn} ${topic.name_en || ''}`.toLowerCase().includes(normalizedQuery)), [topics, normalizedQuery]);
  const filteredSpecialties = useMemo(() => specialties.filter((item) => `${item.name_bn} ${item.name_en}`.toLowerCase().includes(normalizedQuery)), [specialties, normalizedQuery]);

  function topicImage(topic: DiscoveryTopic) {
    for (const id of topic.specialty_ids) {
      const image = specialtyById.get(id)?.icon_url;
      if (image) return image;
    }
    return null;
  }

  function withLocationContext(params: URLSearchParams) {
    const districtId = searchParams.get('district');
    const upazilaId = searchParams.get('upazila');
    if (districtId) params.set('district', districtId);
    if (upazilaId) params.set('upazila', upazilaId);
    return params;
  }

  function topicHref(topic: DiscoveryTopic) {
    const params = new URLSearchParams();
    if (topic.specialty_ids.length) params.set('specialties', topic.specialty_ids.join(','));
    else params.set('q', topic.name_bn);
    withLocationContext(params);
    return `/doctors?${params}`;
  }

  return (
    <div className="app-shell all-categories-page">
      <PublicHeader mobileBottomNav />
      <main className="container all-categories-main">
        <header className="all-categories-heading">
          <Link to="/"><ArrowLeft /> হোম</Link>
          <div><span>সব ক্যাটাগরি</span><h1>ডাক্তার ক্যাটাগরি ও স্পেশালিটি</h1><p>ক্যাটাগরি বেছে নিয়ে সারা বাংলাদেশের ডাক্তার দেখুন।</p></div>
          <label><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ক্যাটাগরি খুঁজুন" /></label>
        </header>

        {error && <div className="error-box" role="alert">{error}</div>}
        {loading ? <div className="loading-box"><LoaderCircle className="spin" /> ক্যাটাগরি লোড হচ্ছে…</div> : <>
          {filteredTopics.length ? <section className="all-category-section"><header><div><small>Marketplace categories</small><h2>জনপ্রিয় ক্যাটাগরি</h2></div></header><div className="all-category-grid">{filteredTopics.map((topic) => <Link to={topicHref(topic)} key={topic.id}><CategoryMedia path={topicImage(topic)} /><span><strong>{topic.name_bn}</strong>{topic.name_en ? <small>{topic.name_en}</small> : null}</span><ArrowRight /></Link>)}</div></section> : null}
          <section className="all-category-section"><header><div><small>Complete directory</small><h2>সব স্পেশালিটি</h2></div><b>{filteredSpecialties.length.toLocaleString('bn-BD')}</b></header>{filteredSpecialties.length ? <div className="all-category-grid">{filteredSpecialties.map((specialty) => <Link to={`/doctors?${withLocationContext(new URLSearchParams({ specialties: String(specialty.id) }))}`} key={specialty.id}><CategoryMedia path={specialty.icon_url} /><span><strong>{specialty.name_bn}</strong><small>{specialty.name_en}</small></span><ArrowRight /></Link>)}</div> : <div className="empty-state compact"><Search /><h3>কোনো ক্যাটাগরি পাওয়া যায়নি</h3></div>}</section>
        </>}
      </main>
      <VisitorBottomNav />
    </div>
  );
}
