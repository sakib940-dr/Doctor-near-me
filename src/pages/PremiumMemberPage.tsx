import { useEffect, useMemo, useState } from 'react';
import {
  Award,
  Check,
  ClipboardCopy,
  Crown,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getMyProviderDashboard } from '../services/providerDashboard';
import {
  getMyPremiumProgress,
  getOrCreateMyReferralCode,
  requestMyPremiumMembership,
} from '../services/premium';
import type { PremiumCriterionProgress, PremiumProgress, ProviderDashboardItem } from '../types';

const messageFrom = (error: unknown) => error instanceof Error ? error.message : 'Premium তথ্য লোড করা যায়নি।';

function statusCopy(status: PremiumProgress['membership_status']) {
  if (status === 'active') return { label: 'Premium Active', detail: 'আপনার Premium সুবিধা বর্তমানে সক্রিয়।', className: 'active' };
  if (status === 'pending') return { label: 'Premium Pending', detail: 'আপনার আবেদন Admin review-এর অপেক্ষায় আছে।', className: 'pending' };
  if (status === 'expired') return { label: 'Premium Expired', detail: 'আগের Premium মেয়াদ শেষ হয়েছে। যোগ্যতা থাকলে আবার আবেদন করা যাবে।', className: 'expired' };
  return { label: 'Premium Progress', detail: 'Requirement পূরণ করে Premium-এর জন্য আবেদন করুন।', className: 'inactive' };
}

function criterionValue(item: PremiumCriterionProgress) {
  if (item.key === 'verification') return item.complete ? 'সম্পন্ন' : 'বাকি';
  return `${item.current}${item.unit || ''} / ${item.required}${item.unit || ''}`;
}

export default function PremiumMemberPage() {
  const { account } = useAuth();
  const [providers, setProviders] = useState<ProviderDashboardItem[]>([]);
  const [providerId, setProviderId] = useState<string | null>(null);
  const [progress, setProgress] = useState<PremiumProgress | null>(null);
  const [referralCode, setReferralCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const allowed = account && ['doctor', 'hospital', 'chamber'].includes(account.role);
  const isProvider = account?.role === 'hospital' || account?.role === 'chamber';

  async function load(selectedProviderId: string | null = providerId) {
    if (!account || !allowed) return;
    setLoading(true);
    setError(null);
    try {
      let resolvedProvider = selectedProviderId;
      if (isProvider && providers.length === 0) {
        const rows = await getMyProviderDashboard();
        setProviders(rows);
        resolvedProvider = selectedProviderId || rows[0]?.id || null;
        setProviderId(resolvedProvider);
      }
      const [nextProgress, code] = await Promise.all([
        getMyPremiumProgress(isProvider ? resolvedProvider : null),
        getOrCreateMyReferralCode(),
      ]);
      setProgress(nextProgress);
      setReferralCode(code);
    } catch (loadError) {
      setError(messageFrom(loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!allowed) return;
    void load(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.role]);

  const enabledCriteria = useMemo(() => progress?.criteria.filter((item) => item.enabled) ?? [], [progress]);
  const progressPercent = useMemo(() => {
    if (!progress) return 0;
    if (!enabledCriteria.length) return progress.requirements_complete ? 100 : 0;
    return Math.round((enabledCriteria.filter((item) => item.complete).length / enabledCriteria.length) * 100);
  }, [enabledCriteria, progress]);

  if (account && !allowed) return <Navigate to="/dashboard" replace />;

  async function switchProvider(id: string) {
    setProviderId(id);
    setNotice(null);
    await load(id);
  }

  async function requestPremium() {
    if (!progress || requesting) return;
    setRequesting(true);
    setError(null);
    setNotice(null);
    try {
      const next = await requestMyPremiumMembership(isProvider ? providerId : null);
      setProgress(next);
      setNotice(next.membership_status === 'active'
        ? 'Premium Membership সক্রিয় হয়েছে।'
        : 'Premium আবেদন জমা হয়েছে। Admin review সম্পন্ন হলে status update হবে।');
    } catch (requestError) {
      setError(messageFrom(requestError));
    } finally {
      setRequesting(false);
    }
  }

  const referralLink = referralCode ? `${window.location.origin}/auth?ref=${encodeURIComponent(referralCode)}` : '';
  async function copyReferral() {
    if (!referralLink) return;
    try {
      await navigator.clipboard.writeText(referralLink);
      setNotice('Referral link কপি হয়েছে।');
    } catch {
      setError('Referral link কপি করা যায়নি।');
    }
  }

  const status = statusCopy(progress?.membership_status || 'inactive');

  return <div className="app-shell premium-member-page">
    <main className="premium-member-main container">
      <section className={`premium-member-hero ${status.className}`}>
        <div className="premium-member-hero-icon"><Crown /></div>
        <div>
          <small>docbd.info Membership</small>
          <h1>Premium Member হন</h1>
          <p>Premium status কেবল server-side eligibility এবং Admin-configured policy অনুযায়ী সক্রিয় হয়।</p>
        </div>
        <span className={`premium-status-pill ${status.className}`}>{status.label}</span>
      </section>

      {isProvider && providers.length > 1 && <label className="premium-provider-select">
        <span>প্রতিষ্ঠান নির্বাচন</span>
        <select value={providerId || ''} onChange={(event) => void switchProvider(event.target.value)}>
          {providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name_bn}</option>)}
        </select>
      </label>}

      {loading ? <div className="premium-loading"><LoaderCircle className="spin" /> Premium progress লোড হচ্ছে…</div> : progress && <>
        <section className="premium-status-card">
          <div className="premium-status-head">
            <div><strong>{status.label}</strong><span>{status.detail}</span></div>
            <button type="button" onClick={() => void load(providerId)} aria-label="Refresh Premium progress"><RefreshCw /></button>
          </div>
          <div className="premium-progress-meta"><span>Requirement progress</span><b>{progressPercent}%</b></div>
          <div className="premium-progress-track"><span style={{ width: `${progressPercent}%` }} /></div>
          {progress.expires_at && <small>মেয়াদ: {new Date(progress.expires_at).toLocaleDateString('bn-BD')}</small>}
        </section>

        <section className="premium-info-grid">
          <article><Sparkles /><div><h2>Premium কী?</h2><p>Public discovery-তে Premium badge এবং central ranking policy-তে সর্বোচ্চ priority পাওয়া যায়।</p></div></article>
          <article><Crown /><div><h2>সুবিধা</h2><p>Homepage, Search, Category, Specialty, District এবং Hospital discovery-তে Premium tier প্রথমে বিবেচিত হয়।</p></div></article>
          <article><ShieldCheck /><div><h2>কীভাবে হবেন?</h2><p>Admin-configured criteria পূরণ করুন। Manual approval চালু থাকলে criteria পূরণের পর আবেদন review হবে।</p></div></article>
        </section>

        <section className="premium-requirements-card">
          <header><div><small>Current progress</small><h2>Requirement checklist</h2></div><span>{enabledCriteria.filter((item) => item.complete).length}/{enabledCriteria.length || 0}</span></header>
          <div className="premium-requirement-list">
            {progress.criteria.map((item) => <div key={item.key} className={`premium-requirement ${item.complete ? 'complete' : 'pending'} ${!item.enabled ? 'disabled' : ''}`}>
              <span className="premium-check-icon">{item.complete ? <Check /> : <X />}</span>
              <div><strong>{item.label_bn}</strong><small>{item.enabled ? criterionValue(item) : 'এই criterion বর্তমানে Admin policy-তে required নয়'}</small></div>
              {item.enabled && <b>{item.complete ? 'সম্পন্ন' : 'বাকি'}</b>}
            </div>)}
          </div>
          {progress.manual_approval_required && <div className="premium-manual-note"><ShieldCheck /><span><strong>Manual Admin approval প্রয়োজন</strong><small>সব requirement complete হলেও Admin approval-এর পর Premium active হবে।</small></span></div>}
        </section>

        <section className="premium-referral-card">
          <header><Users /><div><small>Referral</small><h2>আপনার secure referral link</h2></div></header>
          <p>একটি নতুন account একবারই valid referral হিসেবে count হতে পারে। Self-referral count হয় না।</p>
          <div className="premium-referral-code"><code>{referralCode || '—'}</code><button type="button" onClick={() => void copyReferral()} disabled={!referralCode}><ClipboardCopy /> কপি</button></div>
          <small>Approved referrals: <b>{progress.approved_referrals}</b></small>
        </section>

        {progress.achievements.length > 0 && <section className="premium-achievement-card">
          <header><Award /><div><small>Eligible achievements</small><h2>আপনার অর্জন</h2></div></header>
          <div>{progress.achievements.map((item) => <span key={item.rule_id}><Award /> {item.title_bn}</span>)}</div>
        </section>}

        {!progress.policy_enabled && <div className="auth-message error">Admin বর্তমানে নতুন Premium আবেদন বন্ধ রেখেছেন।</div>}
        {error && <div className="auth-message error" role="alert">{error}</div>}
        {notice && <div className="auth-message success">{notice}</div>}

        <button
          type="button"
          className="premium-apply-button"
          disabled={!progress.policy_enabled || !progress.requirements_complete || progress.membership_status === 'active' || progress.membership_status === 'pending' || requesting}
          onClick={() => void requestPremium()}
        >
          {requesting ? <LoaderCircle className="spin" /> : <Crown />}
          {progress.membership_status === 'active' ? 'Premium Active' : progress.membership_status === 'pending' ? 'আবেদন Pending' : progress.requirements_complete ? 'Premium-এর জন্য আবেদন করুন' : 'Requirement সম্পূর্ণ করুন'}
        </button>
      </>}

      {!loading && !progress && error && <div className="auth-message error" role="alert">{error}</div>}
    </main>
  </div>;
}
