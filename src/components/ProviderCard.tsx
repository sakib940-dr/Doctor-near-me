import { BadgeCheck, Building2, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getImageUrl } from '../lib/storage';
import type { ProviderPublicRow } from '../types';

export default function ProviderCard({ provider }: { provider: ProviderPublicRow }) {
  const logo = getImageUrl(provider.logo_url);
  return (
    <Link to={`/hospitals/${provider.id}`} className="provider-card">
      <div className="provider-card-logo">
        {logo ? <img src={logo} alt={provider.name_bn} /> : <Building2 size={26} />}
      </div>
      <div className="provider-card-body">
        <h3>{provider.name_bn}</h3>
        <span className="provider-card-type">{provider.provider_type === 'hospital' ? 'হাসপাতাল' : 'চেম্বার'}</span>
        {provider.verified && <span className="provider-card-verified"><BadgeCheck size={13} /> যাচাইকৃত</span>}
        {provider.address && <p><MapPin size={13} /> {provider.address}</p>}
      </div>
    </Link>
  );
}
