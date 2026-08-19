import { LoaderCircle, ShieldCheck } from 'lucide-react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { isSupabaseConfigured } from '../lib/supabase';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, account, loading } = useAuth();
  const location = useLocation();

  if (!isSupabaseConfigured) {
    return <div className="route-state"><ShieldCheck /><h2>Supabase configuration প্রয়োজন</h2><p>Vercel environment variables যোগ করার পর এই protected page কাজ করবে।</p></div>;
  }
  if (loading) return <div className="route-state"><LoaderCircle className="spin" /> সেশন যাচাই হচ্ছে…</div>;
  if (!user) return <Navigate to="/auth" replace state={{ from: `${location.pathname}${location.search}` }} />;
  const professionalAccount = account && ['doctor', 'hospital'].includes(account.role);
  if (professionalAccount && !account.onboarding_completed && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }
  return children;
}
