import { useEffect, useState } from 'react';
import { ArrowLeft, Building2, LoaderCircle } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import HospitalDoctorCard from '../features/hospital/components/HospitalDoctorCard';
import PublicHeader from '../components/PublicHeader';
import VisitorBottomNav from '../components/VisitorBottomNav';
import { providerPublicPath } from '../lib/publicRoutes';
import { getPublicProvider } from '../services/discovery';
import { getPublicHospitalDoctors } from '../features/hospital/services/hospitalDoctors';
import type { HospitalDoctorCard as HospitalDoctorCardRow } from '../features/hospital/types';
import type { ProviderDirectoryRow } from '../types';

export default function ProviderDoctorsPublicPage() {
  const { providerId = '' } = useParams();
  const [provider, setProvider] = useState<ProviderDirectoryRow | null>(null);
  const [cards, setCards] = useState<HospitalDoctorCardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true); setError(null); setProvider(null); setCards([]);
    Promise.all([getPublicProvider(providerId), getPublicHospitalDoctors(providerId)])
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
            <div className="hospital-public-doctor-list">{cards.map((doctor) => <HospitalDoctorCard key={doctor.id} doctor={doctor} hospital={provider} />)}</div>
            {!cards.length && <div className="visitor-empty">Reception এখনো কোনো Doctor card প্রকাশ করেনি।</div>}</>}
  </main><VisitorBottomNav /></div>;
}
