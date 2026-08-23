import { useEffect, useState } from 'react';
import { ArrowLeft, Building2, LoaderCircle } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import ProviderManagedDoctorCard from '../components/ProviderManagedDoctorCard';
import PublicHeader from '../components/PublicHeader';
import VisitorBottomNav from '../components/VisitorBottomNav';
import { providerPublicPath } from '../lib/publicRoutes';
import { getPublicProvider } from '../services/discovery';
import { getPublicProviderManagedDoctorCards } from '../services/providerReception';
import type { ProviderDirectoryRow, ProviderManagedDoctorCard as ProviderManagedDoctorCardRow } from '../types';

export default function ProviderDoctorsPublicPage() {
  const { providerId = '' } = useParams();
  const [provider, setProvider] = useState<ProviderDirectoryRow | null>(null);
  const [cards, setCards] = useState<ProviderManagedDoctorCardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true); setError(null); setProvider(null); setCards([]);
    Promise.all([getPublicProvider(providerId), getPublicProviderManagedDoctorCards(providerId)])
      .then(([providerRow, cardRows]) => { if (alive) { setProvider(providerRow); setCards(cardRows); } })
      .catch((loadError: unknown) => { if (alive) setError(loadError instanceof Error ? loadError.message : 'Doctor cards লোড করা যায়নি।'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [providerId]);

  return <div className="app-shell provider-doctors-public-page"><PublicHeader mobileBottomNav /><main className="container provider-doctors-public-main">
    <Link className="back-link" to={provider ? providerPublicPath(provider.provider_type, provider.slug, provider.id) : `/providers/${providerId}`}><ArrowLeft /> Hospital profile</Link>
    {loading ? <div className="loading-box"><LoaderCircle className="spin" /> Doctor cards লোড হচ্ছে…</div>
      : error && !provider ? <div className="error-box">{error}</div>
        : !provider ? <div className="visitor-empty">Hospital পাওয়া যায়নি।</div>
          : <><div className="provider-doctors-public-heading"><Building2 /><div><small>{provider.provider_type === 'hospital' ? 'Hospital' : 'Chamber'}</small><h1>{provider.name_bn}</h1><p>Hospital Reception পরিচালিত independent Doctor cards</p></div></div>
            {error && <div className="error-box">{error}</div>}
            <div className="provider-doctors-all-grid">{cards.map((card) => <ProviderManagedDoctorCard key={card.id} card={card} provider={provider} />)}</div>
            {!cards.length && <div className="visitor-empty">Reception এখনো কোনো Doctor card প্রকাশ করেনি।</div>}</>}
  </main><VisitorBottomNav /></div>;
}
