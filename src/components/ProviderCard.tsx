import { ArrowRight, BadgeCheck, Building2, Hospital, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getImageUrl } from '../lib/storage';
import type { ProviderDirectoryRow } from '../types';

export default function ProviderCard({ provider }: { provider: ProviderDirectoryRow }) {
  const logo = getImageUrl(provider.logo_url, 'provider-media');
  const TypeIcon = provider.provider_type === 'hospital' ? Hospital : Building2;
  return (
    <article className="visitor-provider-card">
      <div className="provider-logo">
        {logo ? <img src={logo} alt={provider.name_bn} /> : <TypeIcon />}
      </div>
      <div className="provider-card-copy">
        <span className="provider-type-label">{provider.provider_type === 'hospital' ? 'হাসপাতাল' : 'চেম্বার'}</span>
        <h3>{provider.name_bn}</h3>
        {provider.verified && <span className="verified-mini"><BadgeCheck /> যাচাইকৃত</span>}
        <p><MapPin /> {provider.address || 'ঠিকানা যোগ করা হয়নি'}</p>
      </div>
      <Link className="provider-card-arrow" to={`/providers/${provider.id}`} aria-label={`${provider.name_bn} দেখুন`}><ArrowRight /></Link>
    </article>
  );
}
