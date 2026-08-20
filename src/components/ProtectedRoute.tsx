import { ShieldCheck } from 'lucide-react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { isSupabaseConfigured } from '../lib/supabase';
import AccountStateFallback from './AccountStateFallback';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, account, loading, accountError, refreshAccount, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  if (!isSupabaseConfigured) {
    return <div className="route-state"><ShieldCheck /><h2>Supabase configuration প্রয়োজন</h2><p>Vercel environment variables যোগ করার পর এই protected page কাজ করবে।</p></div>;
  }
  if (loading) return <AccountStateFallback loading />;
  if (!user) return <Navigate to="/auth" replace state={{ from: `${location.pathname}${location.search}` }} />;

  // An authenticated Supabase session is not enough to render a role dashboard.
  // If the profile/account RPC failed or returned null, never fall through into a
  // dashboard shell that can redirect back to the same URL forever.
  if (!account) {
    return (
      <AccountStateFallback
        message={accountError}
        onRetry={refreshAccount}
        onSignOut={async () => {
          await signOut();
          navigate('/auth', { replace: true });
        }}
      />
    );
  }

  const professionalAccount = ['doctor', 'hospital'].includes(account.role);
  if (professionalAccount && !account.onboarding_completed && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }
  return children;
}
