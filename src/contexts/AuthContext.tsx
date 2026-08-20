import type { Session, User } from '@supabase/supabase-js';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { isSupabaseConfigured, requireSupabase, supabase } from '../lib/supabase';
import { getMyAccountContext } from '../services/account';
import { claimReferralCode } from '../services/premium';
import { unsubscribeCurrentBrowserPush } from '../services/notifications';
import type { AccountContext } from '../types';

interface AuthValue {
  session: Session | null;
  user: User | null;
  account: AccountContext | null;
  loading: boolean;
  accountError: string | null;
  refreshAccount: () => Promise<AccountContext | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

const messageFrom = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error && typeof (error as { message?: unknown }).message === 'string') {
    return (error as { message: string }).message;
  }
  return 'অ্যাকাউন্ট তথ্য লোড করা যায়নি।';
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [account, setAccount] = useState<AccountContext | null>(null);
  const [loadingSession, setLoadingSession] = useState(isSupabaseConfigured);
  const [loadingAccount, setLoadingAccount] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);

  const refreshAccount = useCallback(async () => {
    if (!session?.user || !isSupabaseConfigured) {
      setAccount(null);
      return null;
    }
    setLoadingAccount(true);
    setAccountError(null);
    try {
      const nextAccount = await getMyAccountContext();
      if (!nextAccount) {
        throw new Error('Authenticated session পাওয়া গেছে, কিন্তু account profile/context পাওয়া যায়নি।');
      }
      setAccount(nextAccount);
      return nextAccount;
    } catch (error) {
      setAccountError(messageFrom(error));
      setAccount(null);
      return null;
    } finally {
      setLoadingAccount(false);
    }
  }, [session?.user]);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) {
        setSession(data.session);
        setLoadingSession(false);
      }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoadingSession(false);
      if (!nextSession) setAccount(null);
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    void refreshAccount();
  }, [refreshAccount]);

  useEffect(() => {
    if (!session?.user || !account) return;
    const pendingCode = localStorage.getItem('docbd-referral-code');
    if (!pendingCode) return;
    localStorage.removeItem('docbd-referral-code');
    void claimReferralCode(pendingCode).catch(() => undefined);
  }, [session?.user, account?.user_id]);

  const value = useMemo<AuthValue>(() => ({
    session,
    user: session?.user ?? null,
    account,
    loading: loadingSession || loadingAccount,
    accountError,
    refreshAccount,
    signOut: async () => {
      await unsubscribeCurrentBrowserPush();
      await requireSupabase().auth.signOut();
      setAccount(null);
    },
  }), [session, account, loadingSession, loadingAccount, accountError, refreshAccount]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
