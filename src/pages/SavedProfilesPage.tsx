import { Bookmark, Building2, Heart, LoaderCircle, Stethoscope } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import PublicHeader from '../components/PublicHeader';
import VisitorBottomNav from '../components/VisitorBottomNav';
import VerifiedBadge from '../components/VerifiedBadge';
import { useAuth } from '../contexts/AuthContext';
import { getImageUrl } from '../lib/storage';
import { getMySavedProfileCards, setDoctorFollow, setProviderFollow } from '../services/engagement';
import type { SavedProfileCard } from '../types';

const messageFrom = (error: unknown) => error instanceof Error ? error.message : 'সংরক্ষিত তালিকা লোড করা যায়নি।';

export default function SavedProfilesPage() {
  const { account, loading: authLoading } = useAuth();
  const [rows, setRows] = useState<SavedProfileCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || account?.role !== 'patient') return;
    getMySavedProfileCards()
      .then(setRows)
      .catch((loadError) => setError(messageFrom(loadError)))
      .finally(() => setLoading(false));
  }, [authLoading, account?.role]);

  if (!authLoading && account?.role !== 'patient') return <Navigate to="/dashboard" replace />;

  async function removeSaved(item: SavedProfileCard) {
    if (busyId) return;
    setBusyId(item.target_id);
    setError(null);
    try {
      if (item.target_type === 'doctor') await setDoctorFollow(item.target_id, false);
      else await setProviderFollow(item.target_id, false);
      setRows((current) => current.filter((row) => !(row.target_type === item.target_type && row.target_id === item.target_id)));
    } catch (saveError) {
      setError(messageFrom(saveError));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="app-shell visitor-marketplace saved-profiles-page">
      <PublicHeader mobileBottomNav />
      <main className="container saved-profiles-main">
        <header className="saved-profiles-head"><span><Bookmark /> সংরক্ষিত</span><h1>আপনার Saved Doctor & Hospital</h1><p>যে ডাক্তার বা প্রতিষ্ঠান পরে দেখতে চান, সেগুলো এখানে থাকবে।</p></header>
        {error && <div className="error-box" role="alert">{error}</div>}
        {loading ? <div className="loading-box"><LoaderCircle className="spin" /> সংরক্ষিত প্রোফাইল লোড হচ্ছে…</div> : rows.length ? (
          <div className="saved-profile-grid">
            {rows.map((item) => {
              const href = item.target_type === 'doctor' ? `/doctors/${item.target_id}` : `/providers/${item.target_id}`;
              const image = getImageUrl(item.image_url, item.target_type === 'doctor' ? 'avatars' : 'public-images');
              const Icon = item.target_type === 'doctor' ? Stethoscope : Building2;
              return <article className="saved-profile-card marketplace-card" key={`${item.target_type}-${item.target_id}`}>
                <Link to={href} className="saved-profile-link">
                  <div className="saved-profile-image">{image ? <img src={image} alt={item.title} loading="lazy" decoding="async" /> : <Icon />}</div>
                  <div><span>{item.target_type === 'doctor' ? 'Doctor' : item.provider_type === 'hospital' ? 'Hospital' : 'Chamber'}</span><h2>{item.title}</h2><p>{item.subtitle}</p>{item.verification_status === 'approved' && <VerifiedBadge label="Verified" />}</div>
                </Link>
                <button type="button" className="saved-remove-button" disabled={busyId === item.target_id} onClick={() => void removeSaved(item)}><Heart fill="currentColor" /> সংরক্ষিত</button>
              </article>;
            })}
          </div>
        ) : <div className="saved-empty"><Bookmark /><h2>এখনো কিছু সংরক্ষণ করা হয়নি</h2><p>Doctor বা Hospital card-এর heart button চাপলে এখানে পাওয়া যাবে।</p><Link to="/">ডাক্তার খুঁজুন</Link></div>}
      </main>
      <VisitorBottomNav />
    </div>
  );
}
