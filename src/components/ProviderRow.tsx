import { ChevronRight, LoaderCircle, LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import ProviderCard from './ProviderCard';
import type { ProviderPublicRow } from '../types';

export default function ProviderRow({
  id,
  icon: Icon,
  title,
  subtitle,
  providers,
  loading,
  viewAllTo,
  emptyText,
}: {
  id?: string;
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  providers: ProviderPublicRow[];
  loading?: boolean;
  viewAllTo: string;
  emptyText: string;
}) {
  return (
    <section className="container home-row" id={id}>
      <div className="home-row-head">
        <div className="home-row-heading"><span className="home-row-icon"><Icon size={18} /></span><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div></div>
        {providers.length > 0 && <Link className="home-row-viewall" to={viewAllTo}>সব দেখুন <ChevronRight size={15} /></Link>}
      </div>

      {loading ? (
        <div className="loading-box"><LoaderCircle className="spin" /> লোড হচ্ছে…</div>
      ) : providers.length === 0 ? (
        <div className="empty-state small"><p>{emptyText}</p></div>
      ) : (
        <div className="home-row-scroll">
          {providers.map((provider) => <div className="home-row-item provider-item" key={provider.id}><ProviderCard provider={provider} /></div>)}
        </div>
      )}
    </section>
  );
}
