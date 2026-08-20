import { LoaderCircle, LogOut, RefreshCw, TriangleAlert } from 'lucide-react';

interface AccountStateFallbackProps {
  loading?: boolean;
  message?: string | null;
  onRetry?: () => unknown | Promise<unknown>;
  onSignOut?: () => unknown | Promise<unknown>;
}

export default function AccountStateFallback({ loading = false, message, onRetry, onSignOut }: AccountStateFallbackProps) {
  if (loading) {
    return (
      <div className="route-state" role="status" aria-live="polite">
        <LoaderCircle className="spin" />
        <h2>অ্যাকাউন্ট তথ্য যাচাই হচ্ছে…</h2>
        <p>Session এবং profile context লোড হচ্ছে।</p>
      </div>
    );
  }

  return (
    <div className="route-state route-state-error" role="alert">
      <TriangleAlert />
      <h2>অ্যাকাউন্ট dashboard লোড করা যায়নি</h2>
      <p>{message || 'Authenticated session পাওয়া গেছে, কিন্তু account profile/context পাওয়া যায়নি। আবার চেষ্টা করুন।'}</p>
      <div className="route-state-actions">
        {onRetry && <button type="button" onClick={() => void onRetry()}><RefreshCw /> আবার চেষ্টা করুন</button>}
        {onSignOut && <button type="button" onClick={() => void onSignOut()}><LogOut /> লগআউট</button>}
      </div>
    </div>
  );
}
