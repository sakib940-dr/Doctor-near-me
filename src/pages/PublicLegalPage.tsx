import { useEffect, useState } from 'react';
import { ArrowLeft, FileText, LoaderCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import PublicHeader from '../components/PublicHeader';
import { getPublicContentPage } from '../services/providerReception';
import type { PublicContentPage } from '../types';

export default function PublicLegalPage({ slug: safeSlug }: { slug: 'terms' | 'privacy' }) {
  const [page, setPage] = useState<PublicContentPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setLoading(true); getPublicContentPage(safeSlug).then(setPage).catch((e) => setError(e instanceof Error ? e.message : 'Content লোড করা যায়নি।')).finally(() => setLoading(false)); }, [safeSlug]);
  return <div className="app-shell public-legal-page"><PublicHeader /><main className="container public-legal-main"><Link className="back-link" to="/auth"><ArrowLeft /> Login-এ ফিরুন</Link>{loading ? <div className="loading-box"><LoaderCircle className="spin" /> নীতিমালা লোড হচ্ছে…</div> : error ? <div className="error-box">{error}</div> : <article><header><FileText /><div><small>docbd.info</small><h1>{page?.title_bn || (safeSlug === 'terms' ? 'Terms & Conditions' : 'Privacy Policy')}</h1>{page?.updated_at && <p>সর্বশেষ আপডেট: {new Intl.DateTimeFormat('bn-BD', { dateStyle: 'long' }).format(new Date(page.updated_at))}</p>}</div></header><div className="public-legal-content">{page?.body_bn?.trim() || 'এই নীতিমালার বিস্তারিত content Admin CMS থেকে প্রকাশের অপেক্ষায় আছে।'}</div></article>}</main></div>;
}
