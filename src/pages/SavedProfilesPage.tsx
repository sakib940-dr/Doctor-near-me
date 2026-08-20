import { Bookmark, Building2, Stethoscope } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import FollowSaveButton from '../components/FollowSaveButton';
import PublicHeader from '../components/PublicHeader';
import VisitorBottomNav from '../components/VisitorBottomNav';
import VerifiedBadge from '../components/VerifiedBadge';
import { useAuth } from '../contexts/AuthContext';
import { getImageUrl } from '../lib/storage';
import { getMySavedProfileCards } from '../services/engagement';
import type { SavedProfileCard } from '../types';

const messageFrom = (error: unknown) => error instanceof Error ? error.message : 'সংরক্ষিত তালিকা লোড করা যায়নি।';

export default function SavedProfilesPage() {
  const { account, loading: authLoading } = useAuth();
  const [rows, setRows] = useState<SavedProfileCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (account?.role !== 'patient') { setLoading(false); return; }
    let active = true;
    setLoading(true);
    setError(null);
    getMySavedProfileCards()
      .then((items) => { if (active) setRows(items); })
      .catch((loadError) => { if (active) setError(messageFrom(loadError)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [authLoading, account?.role]);

  const savedDoctors = useMemo(() => rows.filter((item) => item.target_type === 'doctor'), [rows]);
  const savedProviders = useMemo(() => rows.filter((item) => item.target_type === 'provider'), [rows]);

  if (!authLoading && account?.role !== 'patient') return <Navigate to="/dashboard" replace />;

  function removeSaved(item: SavedProfileCard) {
    setRows((current) => current.filter((row) => !(row.target_type === item.target_type && row.target_id === item.target_id)));
  }

  return (
    <div className="app-shell visitor-marketplace saved-profiles-page">
      <PublicHeader mobileBottomNav />
      <main className="container saved-profiles-main">
        <header className="saved-profiles-head"><span><Bookmark /> সংরক্ষিত</span><h1>আপনার Saved Doctor & Hospital</h1><p>এক জায়গা থেকে পছন্দের Doctor এবং Hospital দেখুন।</p></header>
        {error && <div className="error-box" role="alert">{error}</div>}
        {loading ? <div className="saved-loading-grid" aria-label="সংরক্ষিত প্রোফাইল লোড হচ্ছে">{Array.from({ length: 4 }, (_, index) => <div className="saved-skeleton" key={index} />)}</div> : rows.length ? <>
          <SavedSection title="Saved Doctors" count={savedDoctors.length} rows={savedDoctors} onRemove={removeSaved} />
          <SavedSection title="Saved Hospitals" count={savedProviders.length} rows={savedProviders} onRemove={removeSaved} />
        </> : <div className="saved-empty"><Bookmark /><h2>এখনো কিছু সংরক্ষণ করা হয়নি</h2><p>Doctor বা Hospital card-এর heart button চাপলে এখানে পাওয়া যাবে।</p><Link to="/">ডাক্তার খুঁজুন</Link></div>}
      </main>
      <VisitorBottomNav />
    </div>
  );
}

function SavedSection({ title, count, rows, onRemove }: { title: string; count: number; rows: SavedProfileCard[]; onRemove: (item: SavedProfileCard) => void }) {
  if (!rows.length) return null;
  return <section className="saved-profile-section">
    <div className="saved-section-head"><h2>{title}</h2><span>{count.toLocaleString('bn-BD')}</span></div>
    <div className="saved-profile-grid">
      {rows.map((item) => {
        const href = item.target_type === 'doctor' ? `/doctors/${item.target_id}` : `/providers/${item.target_id}`;
        const image = getImageUrl(item.image_url, item.target_type === 'doctor' ? 'avatars' : 'public-images');
        const Icon = item.target_type === 'doctor' ? Stethoscope : Building2;
        return <article className="saved-profile-card marketplace-card" key={`${item.target_type}-${item.target_id}`}>
          <Link to={href} className="saved-profile-link">
            <div className="saved-profile-image">{image ? <img src={image} alt={item.title} loading="lazy" decoding="async" /> : <Icon />}</div>
            <div><span>{item.target_type === 'doctor' ? 'Doctor' : item.provider_type === 'hospital' ? 'Hospital' : 'Chamber'}</span><h3>{item.title}</h3><p>{item.subtitle}</p>{item.verification_status === 'approved' && <VerifiedBadge label="Verified" />}</div>
          </Link>
          <FollowSaveButton
            targetType={item.target_type}
            targetId={item.target_id}
            initialFollowing
            autoLoadStats={false}
            variant="button"
            entityLabel={item.target_type === 'doctor' ? 'ডাক্তার' : 'হাসপাতাল'}
            className="saved-remove-button"
            onFollowingChange={(following) => { if (!following) onRemove(item); }}
          />
        </article>;
      })}
    </div>
  </section>;
}
