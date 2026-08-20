import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Award,
  BadgeCheck,
  Building2,
  Check,
  Clock3,
  Crown,
  ExternalLink,
  Gauge,
  LoaderCircle,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  UserCheck,
  UserX,
  Users,
  X,
} from 'lucide-react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  decidePremiumMembership,
  getAdminPremiumPolicy,
  getAdminPremiumTargets,
  getAdminReferralQueue,
  getPremiumAchievementRules,
  saveAdminPremiumPolicy,
  savePremiumAchievementRule,
  setAdminReferralStatus,
  setPremiumAchievementAward,
} from '../services/premium';
import type {
  PremiumAchievementRule,
  PremiumAdminTarget,
  PremiumPolicy,
  PremiumReferralRow,
} from '../types';

const defaultPolicy: PremiumPolicy = {
  enabled: true,
  min_followers: 0,
  min_approved_referrals: 0,
  require_profile_completion: false,
  min_profile_completion_percent: 80,
  require_verification: false,
  min_achievement_count: 0,
  manual_approval_required: true,
  premium_duration_days: 0,
  referral_claim_window_days: 7,
  referral_requires_admin_approval: false,
};

const messageFrom = (error: unknown) => error instanceof Error ? error.message : 'Premium admin data লোড করা যায়নি।';
type PremiumTargetFilter = 'all' | 'pending' | 'active' | 'expiring' | 'eligible';
const targetFilters: readonly [PremiumTargetFilter,string][] = [['all','All'],['pending','Requests'],['active','Active'],['expiring','Expiring'],['eligible','Criteria Ready']];
const validTargetFilter = (value: string | null): value is PremiumTargetFilter => !!value && targetFilters.some(([key]) => key === value);
const daysUntil = (value: string | null) => value ? Math.ceil((new Date(value).getTime() - Date.now()) / 86400000) : null;
function premiumCriteriaProgress(target: PremiumAdminTarget, policy: PremiumPolicy) {
  const checks: boolean[] = [];
  if (policy.min_followers > 0) checks.push(target.follower_count >= policy.min_followers);
  if (policy.min_approved_referrals > 0) checks.push(target.approved_referral_count >= policy.min_approved_referrals);
  if (policy.require_profile_completion) checks.push(target.profile_completion_percent >= policy.min_profile_completion_percent);
  if (policy.require_verification) checks.push(target.verification_label === 'approved');
  if (policy.min_achievement_count > 0) checks.push(target.achievement_count >= policy.min_achievement_count);
  if (!checks.length) return { complete: target.requirements_complete ? 1 : 0, total: 0, percent: target.requirements_complete ? 100 : 0 };
  const complete = checks.filter(Boolean).length;
  return { complete, total: checks.length, percent: Math.round((complete / checks.length) * 100) };
}

function emptyRule(): Omit<PremiumAchievementRule, 'id' | 'created_by' | 'created_at' | 'updated_at'> & { id: number | null } {
  return { id: null, code: '', title_bn: '', title_en: '', description_bn: '', counts_toward_premium: true, is_active: true, sort_order: 0 };
}

export default function PremiumAdminPage() {
  const { account } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [policy, setPolicy] = useState<PremiumPolicy>(defaultPolicy);
  const [targets, setTargets] = useState<PremiumAdminTarget[]>([]);
  const [rules, setRules] = useState<PremiumAchievementRule[]>([]);
  const [referrals, setReferrals] = useState<PremiumReferralRow[]>([]);
  const [query, setQuery] = useState('');
  const [referralStatus, setReferralStatus] = useState<PremiumReferralRow['status']>('pending');
  const [targetFilter, setTargetFilter] = useState<PremiumTargetFilter>(() => validTargetFilter(searchParams.get('filter')) ? searchParams.get('filter') as PremiumTargetFilter : 'all');
  const [decisionConfirm, setDecisionConfirm] = useState<{ target: PremiumAdminTarget; action: 'approve' | 'revoke' } | null>(null);
  const [rule, setRule] = useState(emptyRule());
  const [awardRuleByTarget, setAwardRuleByTarget] = useState<Record<string, number | ''>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyKey, setBusyKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const allowed = account && ['admin', 'super_admin'].includes(account.role);

  async function load(nextQuery = query, nextReferralStatus = referralStatus) {
    if (!allowed) return;
    setLoading(true);
    setError(null);
    try {
      const [nextPolicy, nextTargets, nextRules, nextReferrals] = await Promise.all([
        getAdminPremiumPolicy(),
        getAdminPremiumTargets(nextQuery, 150),
        getPremiumAchievementRules(),
        getAdminReferralQueue(nextReferralStatus, 100),
      ]);
      setPolicy({ ...defaultPolicy, ...nextPolicy });
      setTargets(nextTargets);
      setRules(nextRules);
      setReferrals(nextReferrals);
    } catch (loadError) {
      setError(messageFrom(loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (allowed) void load('', 'pending'); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [account?.role]);
  useEffect(() => {
    const requested = searchParams.get('filter');
    if (validTargetFilter(requested) && requested !== targetFilter) setTargetFilter(requested);
  }, [searchParams, targetFilter]);

  const activeRules = useMemo(() => rules.filter((item) => item.is_active && item.counts_toward_premium), [rules]);
  const filteredTargets = useMemo(() => {
    const now = Date.now();
    const expiringCutoff = now + 30 * 86400000;
    const rows = targets.filter((target) => {
      if (targetFilter === 'pending') return target.membership_status === 'pending';
      if (targetFilter === 'active') return target.is_premium && target.membership_status === 'active';
      if (targetFilter === 'expiring') {
        const expiry = target.expires_at ? new Date(target.expires_at).getTime() : 0;
        return target.is_premium && expiry > now && expiry <= expiringCutoff;
      }
      if (targetFilter === 'eligible') return target.requirements_complete && !target.is_premium;
      return true;
    });
    return [...rows].sort((a,b) => {
      const score = (target: PremiumAdminTarget) => target.membership_status === 'pending' ? 0 : (target.expires_at && daysUntil(target.expires_at)! <= 30 && daysUntil(target.expires_at)! >= 0 ? 1 : target.is_premium ? 2 : target.requirements_complete ? 3 : 4);
      return score(a) - score(b) || a.name.localeCompare(b.name);
    });
  }, [targets,targetFilter]);
  const premiumCounts = useMemo(() => ({
    requests: targets.filter((item) => item.membership_status === 'pending').length,
    active: targets.filter((item) => item.is_premium && item.membership_status === 'active').length,
    expiring: targets.filter((item) => { const days=daysUntil(item.expires_at); return item.is_premium && days != null && days >= 0 && days <= 30; }).length,
    eligible: targets.filter((item) => item.requirements_complete && !item.is_premium).length,
  }), [targets]);

  if (account && !allowed) return <Navigate to="/dashboard" replace />;

  async function savePolicy(event: FormEvent) {
    event.preventDefault();
    setSaving(true); setError(null); setNotice(null);
    try {
      const next = await saveAdminPremiumPolicy(policy);
      setPolicy(next);
      setNotice('Premium criteria সংরক্ষণ হয়েছে।');
    } catch (saveError) { setError(messageFrom(saveError)); }
    finally { setSaving(false); }
  }

  async function searchTargets(event: FormEvent) {
    event.preventDefault();
    await load(query, referralStatus);
  }

  function changeTargetFilter(next: PremiumTargetFilter) {
    setTargetFilter(next);
    setSearchParams(next === 'all' ? {} : { filter: next });
  }

  async function decide(target: PremiumAdminTarget, action: 'approve' | 'revoke' | 'expire' | 'pending') {
    const key = `${target.target_type}:${target.target_id}:${action}`;
    setBusyKey(key); setError(null); setNotice(null);
    try {
      await decidePremiumMembership(target.target_type, target.target_id, action);
      setNotice(action === 'approve' ? 'Premium active করা হয়েছে।' : 'Premium status update হয়েছে।');
      await load(query, referralStatus);
    } catch (actionError) { setError(messageFrom(actionError)); }
    finally { setBusyKey(''); setDecisionConfirm(null); }
  }

  async function saveRule(event: FormEvent) {
    event.preventDefault();
    setSaving(true); setError(null); setNotice(null);
    try {
      await savePremiumAchievementRule({
        id: rule.id,
        code: rule.code,
        titleBn: rule.title_bn,
        titleEn: rule.title_en,
        descriptionBn: rule.description_bn,
        countsTowardPremium: rule.counts_toward_premium,
        active: rule.is_active,
        sortOrder: rule.sort_order,
      });
      setRule(emptyRule());
      setNotice('Achievement rule সংরক্ষণ হয়েছে।');
      const nextRules = await getPremiumAchievementRules();
      setRules(nextRules);
    } catch (saveError) { setError(messageFrom(saveError)); }
    finally { setSaving(false); }
  }

  async function award(target: PremiumAdminTarget) {
    const selected = awardRuleByTarget[`${target.target_type}:${target.target_id}`];
    if (!selected) return;
    const key = `award:${target.target_type}:${target.target_id}`;
    setBusyKey(key); setError(null); setNotice(null);
    try {
      await setPremiumAchievementAward({ ruleId: Number(selected), targetType: target.target_type, targetId: target.target_id, award: true });
      setNotice('Achievement যোগ হয়েছে।');
      await load(query, referralStatus);
    } catch (awardError) { setError(messageFrom(awardError)); }
    finally { setBusyKey(''); }
  }

  async function referralDecision(row: PremiumReferralRow, status: 'approved' | 'rejected' | 'invalid') {
    const key = `ref:${row.id}:${status}`;
    setBusyKey(key); setError(null); setNotice(null);
    try {
      await setAdminReferralStatus(row.id, status);
      setNotice(`Referral ${status} করা হয়েছে।`);
      const rows = await getAdminReferralQueue(referralStatus, 100);
      setReferrals(rows);
    } catch (decisionError) { setError(messageFrom(decisionError)); }
    finally { setBusyKey(''); }
  }

  return <div className="app-shell premium-admin-page"><main className="premium-admin-main container">
    <header className="premium-admin-heading"><span><Crown /></span><div><small>Admin control</small><h1>Premium Membership</h1><p>Criteria, referrals, achievement rules এবং Premium status এক জায়গা থেকে manage করুন।</p></div><button type="button" onClick={() => void load()} disabled={loading}><RefreshCw className={loading ? 'spin' : ''} /> Refresh</button></header>

    {error && <div className="auth-message error" role="alert">{error}</div>}
    {notice && <div className="auth-message success">{notice}</div>}

    <form className="premium-admin-policy" onSubmit={savePolicy}>
      <header><ShieldCheck /><div><small>Eligibility policy</small><h2>Premium criteria</h2></div></header>
      <div className="premium-policy-grid">
        <label><span>Minimum followers</span><input type="number" min={0} max={1000000} value={policy.min_followers} onChange={(e) => setPolicy({ ...policy, min_followers: Number(e.target.value) })} /></label>
        <label><span>Minimum approved referrals</span><input type="number" min={0} max={100000} value={policy.min_approved_referrals} onChange={(e) => setPolicy({ ...policy, min_approved_referrals: Number(e.target.value) })} /></label>
        <label><span>Minimum achievement count</span><input type="number" min={0} max={1000} value={policy.min_achievement_count} onChange={(e) => setPolicy({ ...policy, min_achievement_count: Number(e.target.value) })} /></label>
        <label><span>Profile completion %</span><input type="number" min={0} max={100} value={policy.min_profile_completion_percent} onChange={(e) => setPolicy({ ...policy, min_profile_completion_percent: Number(e.target.value) })} /></label>
        <label><span>Premium duration days <small>0 = no automatic expiry</small></span><input type="number" min={0} max={3650} value={policy.premium_duration_days} onChange={(e) => setPolicy({ ...policy, premium_duration_days: Number(e.target.value) })} /></label>
        <label><span>Referral claim window days <small>0 = no time window</small></span><input type="number" min={0} max={365} value={policy.referral_claim_window_days} onChange={(e) => setPolicy({ ...policy, referral_claim_window_days: Number(e.target.value) })} /></label>
      </div>
      <div className="premium-policy-toggles">
        <Toggle label="Premium application চালু" checked={policy.enabled} onChange={(value) => setPolicy({ ...policy, enabled: value })} />
        <Toggle label="Profile completion required" checked={policy.require_profile_completion} onChange={(value) => setPolicy({ ...policy, require_profile_completion: value })} />
        <Toggle label="Verification required" checked={policy.require_verification} onChange={(value) => setPolicy({ ...policy, require_verification: value })} />
        <Toggle label="Manual Admin approval required" checked={policy.manual_approval_required} onChange={(value) => setPolicy({ ...policy, manual_approval_required: value })} />
        <Toggle label="Referral Admin approval required" checked={policy.referral_requires_admin_approval} onChange={(value) => setPolicy({ ...policy, referral_requires_admin_approval: value })} />
      </div>
      <button className="cms-save" disabled={saving}>{saving ? <LoaderCircle className="spin" /> : <><Save /> Criteria সংরক্ষণ করুন</>}</button>
    </form>

    <section className="premium-admin-targets premium-management-center">
      <header><div><small>Doctor / Hospital management</small><h2>Premium accounts</h2><p>Request, criteria progress, expiry এবং membership action দ্রুত manage করুন।</p></div><form onSubmit={searchTargets}><Search /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="নাম দিয়ে খুঁজুন" /><button>Search</button></form></header>

      <div className="premium-management-snapshot" aria-label="Premium management summary">
        <button type="button" className={targetFilter === 'pending' ? 'active' : ''} onClick={() => changeTargetFilter('pending')}><Crown /><span><strong>{premiumCounts.requests}</strong><small>Premium Requests</small></span></button>
        <button type="button" className={targetFilter === 'active' ? 'active' : ''} onClick={() => changeTargetFilter('active')}><BadgeCheck /><span><strong>{premiumCounts.active}</strong><small>Active Premium</small></span></button>
        <button type="button" className={targetFilter === 'expiring' ? 'active' : ''} onClick={() => changeTargetFilter('expiring')}><Clock3 /><span><strong>{premiumCounts.expiring}</strong><small>Expiring ≤ 30d</small></span></button>
        <button type="button" className={targetFilter === 'eligible' ? 'active' : ''} onClick={() => changeTargetFilter('eligible')}><Gauge /><span><strong>{premiumCounts.eligible}</strong><small>Criteria Ready</small></span></button>
      </div>

      <div className="premium-target-filters" aria-label="Premium account filters">
        {targetFilters.map(([value,label]) => <button type="button" key={value} className={targetFilter === value ? 'active' : ''} onClick={() => changeTargetFilter(value)}>{label}</button>)}
      </div>

      {loading ? <div className="premium-loading"><LoaderCircle className="spin" /> Loading…</div> : <div className="premium-target-list">
        {filteredTargets.map((target) => {
          const rowKey = `${target.target_type}:${target.target_id}`;
          const criteria = premiumCriteriaProgress(target, policy);
          const expiryDays = daysUntil(target.expires_at);
          const expirySoon = expiryDays != null && expiryDays >= 0 && expiryDays <= 30;
          const statusLabel = target.is_premium ? 'Premium Active' : target.membership_status === 'pending' ? 'Premium Request' : target.membership_status;
          const profilePath = target.target_type === 'doctor' ? `/doctors/${target.target_id}` : `/providers/${target.target_id}`;
          return <article key={rowKey} className={`premium-target-row ${target.membership_status} ${expirySoon ? 'expiring' : ''}`}>
            <div className="premium-target-main"><span className="premium-target-icon">{target.target_type === 'doctor' ? <Users /> : <Building2 />}</span><div><small>Provider</small><strong>{target.name}</strong><em>{target.target_type === 'doctor' ? 'Doctor' : 'Hospital / Chamber'} • {target.verification_label}</em></div></div>

            <div className="premium-target-state"><small>Current status</small><b className={`premium-state-badge ${target.membership_status}`}>{statusLabel}</b><span>{target.requirements_complete ? <><Check /> Criteria complete</> : <><AlertTriangle /> Criteria incomplete</>}</span></div>

            <div className="premium-target-metrics"><span>Followers <b>{target.follower_count}{policy.min_followers > 0 ? ` / ${policy.min_followers}` : ''}</b></span><span>Referrals <b>{target.approved_referral_count}{policy.min_approved_referrals > 0 ? ` / ${policy.min_approved_referrals}` : ''}</b></span><span>Profile <b>{target.profile_completion_percent}%</b></span><span>Achievements <b>{target.achievement_count}{policy.min_achievement_count > 0 ? ` / ${policy.min_achievement_count}` : ''}</b></span></div>

            <div className="premium-target-progress"><div className="premium-criteria-head"><span>Premium criteria</span><b>{criteria.percent}%</b></div><div className="premium-progress-track" aria-label={`Premium criteria ${criteria.percent}%`}><i style={{ width: `${criteria.percent}%` }} /></div><small>{criteria.total ? `${criteria.complete} of ${criteria.total} enabled criteria complete` : target.requirements_complete ? 'Current policy criteria complete' : 'No threshold configured'}</small><div className="premium-achievement-progress"><Award /><span>Badge / Achievement</span><b>{target.achievement_count}{policy.min_achievement_count > 0 ? ` / ${policy.min_achievement_count}` : ' earned'}</b></div></div>

            <div className="premium-target-expiry"><Clock3 /><div><small>Expiry</small><strong>{target.expires_at ? new Date(target.expires_at).toLocaleDateString('en-GB') : 'No expiry'}</strong>{expiryDays != null && <em className={expirySoon ? 'soon' : ''}>{expiryDays < 0 ? 'Expired' : `${expiryDays} day${expiryDays === 1 ? '' : 's'} left`}</em>}</div></div>

            <div className="premium-target-actions">
              {!target.is_premium && <button type="button" className="approve" disabled={!!busyKey} onClick={() => setDecisionConfirm({ target, action: 'approve' })}>{busyKey === `${rowKey}:approve` ? <LoaderCircle className="spin" /> : <UserCheck />} Approve</button>}
              {(target.is_premium || target.membership_status === 'pending') && <button type="button" className="revoke" disabled={!!busyKey} onClick={() => setDecisionConfirm({ target, action: 'revoke' })}><UserX /> Revoke</button>}
              <Link className="premium-view-link" to={profilePath}><ExternalLink /> View</Link>
              {activeRules.length > 0 && <div className="premium-award-inline"><select value={awardRuleByTarget[rowKey] ?? ''} onChange={(e) => setAwardRuleByTarget({ ...awardRuleByTarget, [rowKey]: e.target.value ? Number(e.target.value) : '' })}><option value="">Achievement…</option>{activeRules.map((item) => <option key={item.id} value={item.id}>{item.title_bn}</option>)}</select><button type="button" disabled={!awardRuleByTarget[rowKey] || !!busyKey} onClick={() => void award(target)}><Award /> Add</button></div>}
            </div>
          </article>;
        })}
        {!filteredTargets.length && <div className="premium-target-empty"><Crown /><div><strong>এই filter-এ Premium account নেই</strong><small>অন্য filter নির্বাচন করুন অথবা search পরিবর্তন করুন।</small></div></div>}
      </div>}
    </section>

    <div className="premium-admin-lower-grid">
      <section className="premium-admin-rules">
        <header><Award /><div><small>Optional eligibility source</small><h2>Achievement rules</h2></div></header>
        <div className="premium-rule-list">{rules.map((item) => <button type="button" key={item.id} onClick={() => setRule({ ...item })}><span><strong>{item.title_bn}</strong><small>{item.code}</small></span><b>{item.is_active ? 'Active' : 'Off'}</b></button>)}</div>
        <form onSubmit={saveRule} className="premium-rule-editor">
          <div><label><span>Code</span><input required pattern="[a-z0-9_]+" value={rule.code} onChange={(e) => setRule({ ...rule, code: e.target.value.toLowerCase() })} /></label><label><span>বাংলা title</span><input required value={rule.title_bn} onChange={(e) => setRule({ ...rule, title_bn: e.target.value })} /></label></div>
          <label><span>English title</span><input value={rule.title_en || ''} onChange={(e) => setRule({ ...rule, title_en: e.target.value || null })} /></label>
          <label><span>Description</span><textarea rows={2} value={rule.description_bn || ''} onChange={(e) => setRule({ ...rule, description_bn: e.target.value || null })} /></label>
          <div className="premium-policy-toggles compact"><Toggle label="Active" checked={rule.is_active} onChange={(value) => setRule({ ...rule, is_active: value })} /><Toggle label="Counts toward Premium" checked={rule.counts_toward_premium} onChange={(value) => setRule({ ...rule, counts_toward_premium: value })} /></div>
          <button className="cms-save" disabled={saving}>{saving ? <LoaderCircle className="spin" /> : <><Save /> Achievement rule save</>}</button>
        </form>
      </section>

      <section className="premium-admin-referrals">
        <header><Users /><div><small>Validated referrals only</small><h2>Referral review</h2></div><select value={referralStatus} onChange={(e) => { const value = e.target.value as PremiumReferralRow['status']; setReferralStatus(value); void load(query, value); }}><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="invalid">Invalid</option></select></header>
        <div className="premium-referral-admin-list">{referrals.map((row) => <article key={row.id}><div><strong>{row.referrer_name}</strong><small>referred → {row.referred_name || 'Unknown'} • {row.referral_code}</small><small>{new Date(row.created_at).toLocaleString()}</small></div>{row.status === 'pending' && <span><button type="button" disabled={!!busyKey} onClick={() => void referralDecision(row, 'approved')}><Check /> Approve</button><button type="button" disabled={!!busyKey} onClick={() => void referralDecision(row, 'rejected')}><UserX /> Reject</button></span>}</article>)}</div>
      </section>
    </div>

    {decisionConfirm && <div className="verification-overlay" role="dialog" aria-modal="true" aria-label="Premium membership confirmation"><section className="admin-action-dialog premium-decision-dialog"><header><div><small>Admin-only Premium action</small><h2>{decisionConfirm.action === 'approve' ? 'Approve Premium membership?' : 'Revoke Premium membership?'}</h2></div><button type="button" aria-label="Close" onClick={() => setDecisionConfirm(null)}><X /></button></header><p><strong>{decisionConfirm.target.name}</strong> • {decisionConfirm.target.target_type === 'doctor' ? 'Doctor' : 'Hospital / Chamber'}<br />Current status: {decisionConfirm.target.is_premium ? 'Premium Active' : decisionConfirm.target.membership_status}</p><div className={`premium-decision-warning ${decisionConfirm.action}`}><AlertTriangle /><span>{decisionConfirm.action === 'approve' ? 'Approve করলে existing Premium policy অনুযায়ী membership active হবে এবং audit log তৈরি হবে।' : 'Revoke করলে Premium ranking/status immediately বন্ধ হবে। এই action audit log-এ থাকবে।'}</span></div><footer><button type="button" onClick={() => setDecisionConfirm(null)}>বাতিল</button><button type="button" className={decisionConfirm.action === 'revoke' ? 'premium-danger' : 'primary'} disabled={!!busyKey} onClick={() => void decide(decisionConfirm.target, decisionConfirm.action)}>{busyKey ? <LoaderCircle className="spin" /> : decisionConfirm.action === 'approve' ? <><UserCheck /> Confirm Approve</> : <><UserX /> Confirm Revoke</>}</button></footer></section></div>}
  </main></div>;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="premium-toggle"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span aria-hidden="true" /><b>{label}</b></label>;
}
