import { FormEvent, useEffect, useState } from 'react';
import { Activity, Ban, CalendarDays, Copy, Crown, Edit3, ExternalLink, FileCheck2, LoaderCircle, MapPin, Plus, RefreshCw, Search, ShieldCheck, Trash2, UserCog, Users, X } from 'lucide-react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getDistricts, getSpecialties, getUpazilas } from '../services/discovery';
import { cancelPrivilegedAccountInvite, changeSuperAdminUserRole, createPrivilegedAccountInvite, deleteSuperAdminUser, getPrivilegedAccountInvites, getSuperAdminDoctorVerificationPolicy, getSuperAdminUserDetail, getSuperAdminUserDirectory, setSuperAdminDoctorVerificationPolicy, setSuperAdminUserStatus, updateSuperAdminUserProfile } from '../services/superAdmin';
import type { District, PrivilegedAccountInvite, SuperAdminDoctorVerificationPolicy, SuperAdminUserDetail, Specialty, SuperAdminUserRow, Upazila, UserRole } from '../types';

type Tab = 'users' | 'invites' | 'controls';
type Action = { kind: 'role'; value: Exclude<UserRole, 'super_admin'> } | { kind: 'status'; value: 'active' | 'suspended' | 'banned' } | { kind: 'delete'; value: 'delete' };
const roleLabels: Record<UserRole, string> = { patient: 'Patient', doctor: 'Doctor', chamber: 'Chamber', hospital: 'Hospital', ambulance: 'Ambulance', verification_officer: 'Verification Officer', admin: 'Admin', super_admin: 'Super Admin' };
const roleOptions: Array<Exclude<UserRole, 'super_admin'>> = ['patient', 'doctor', 'hospital', 'chamber', 'ambulance', 'verification_officer', 'admin'];
const messageFrom = (error: unknown) => error instanceof Error ? error.message : 'Super Admin কাজটি সম্পন্ন করা যায়নি।';
const SUPER_ADMIN_PAGE_SIZE = 30;
const dateLabel = (value: string | null | undefined) => value ? new Intl.DateTimeFormat('bn-BD', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';

interface EditProfile {
  fullName: string; phone: string; dateOfBirth: string; gender: string; bloodGroup: string;
  addressLine: string; districtId: number | null; upazilaId: number | null;
  emergencyContactName: string; emergencyContactPhone: string; reason: string;
}

export default function SuperAdminPage() {
  const { account } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab') as Tab | null;
  const [tab, setTab] = useState<Tab>(requestedTab && ['users', 'invites', 'controls'].includes(requestedTab) ? requestedTab : 'users');
  const [users, setUsers] = useState<SuperAdminUserRow[]>([]);
  const [usersHasMore, setUsersHasMore] = useState(false);
  const [usersLoadingMore, setUsersLoadingMore] = useState(false);
  const [invites, setInvites] = useState<PrivilegedAccountInvite[]>([]);
  const [invitesLoaded, setInvitesLoaded] = useState(false);
  const [policyLoaded, setPolicyLoaded] = useState(false);
  const [verificationPolicy, setVerificationPolicy] = useState<SuperAdminDoctorVerificationPolicy | null>(null);
  const [districts, setDistricts] = useState<District[]>([]);
  const [upazilas, setUpazilas] = useState<Upazila[]>([]);
  const [editUpazilas, setEditUpazilas] = useState<Upazila[]>([]);
  const [role, setRole] = useState<UserRole | 'all'>('all');
  const [status, setStatus] = useState('all');
  const [districtId, setDistrictId] = useState<number | null>(null);
  const [upazilaId, setUpazilaId] = useState<number | null>(null);
  const [medicalType, setMedicalType] = useState<'all' | 'MBBS' | 'BDS'>('all');
  const [specialtyId, setSpecialtyId] = useState<number | null>(null);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState<SuperAdminUserDetail | null>(null);
  const [detailTab, setDetailTab] = useState<'profile' | 'data' | 'activity'>('profile');
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState<EditProfile | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const [reason, setReason] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [invite, setInvite] = useState({ email: '', fullName: '', phone: '', role: 'verification_officer' as 'admin' | 'verification_officer', expiresDays: 7 });
  const [createdLink, setCreatedLink] = useState('');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [policyWorking, setPolicyWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function loadUsers(reset = true) {
    const offset = reset ? 0 : users.length;
    if (reset) setLoading(true); else setUsersLoadingMore(true);
    setError(null);
    try {
      const rows = await getSuperAdminUserDirectory({
        role: role === 'all' ? null : role, status: status === 'all' ? null : status,
        districtId, upazilaId, medicalType: medicalType === 'all' ? null : medicalType, specialtyId, search, limit: SUPER_ADMIN_PAGE_SIZE, offset,
      });
      setUsers((current) => {
        if (reset) return rows;
        const seen = new Set(current.map((user) => user.user_id));
        return [...current, ...rows.filter((user) => !seen.has(user.user_id))];
      });
      const total = Number(rows[0]?.total_count ?? offset + rows.length);
      setUsersHasMore(rows.length === SUPER_ADMIN_PAGE_SIZE && offset + rows.length < total);
    } catch (loadError) { setError(messageFrom(loadError)); }
    finally { if (reset) setLoading(false); else setUsersLoadingMore(false); }
  }

  async function loadInvites() {
    setLoading(true); setError(null);
    try { setInvites(await getPrivilegedAccountInvites()); setInvitesLoaded(true); }
    catch (loadError) { setError(messageFrom(loadError)); }
    finally { setLoading(false); }
  }

  async function loadPolicy() {
    setLoading(true); setError(null);
    try { setVerificationPolicy(await getSuperAdminDoctorVerificationPolicy()); setPolicyLoaded(true); }
    catch (loadError) { setError(messageFrom(loadError)); }
    finally { setLoading(false); }
  }

  async function refreshCurrentTab() {
    if (tab === 'users') { await loadUsers(true); return; }
    if (tab === 'invites') { await loadInvites(); return; }
    await loadPolicy();
  }
  useEffect(() => {
    if (account?.role !== 'super_admin') return;
    void loadUsers(true);
    void Promise.all([getDistricts(), getSpecialties()]).then(([districtRows, specialtyRows]) => { setDistricts(districtRows); setSpecialties(specialtyRows); }).catch(() => { setDistricts([]); setSpecialties([]); });
  }, [account?.user_id, account?.role]);
  useEffect(() => {
    if (account?.role !== 'super_admin') return;
    if (tab === 'invites' && !invitesLoaded) void loadInvites();
    if (tab === 'controls' && !policyLoaded) void loadPolicy();
  }, [tab, account?.role, invitesLoaded, policyLoaded]);
  useEffect(() => {
    const next = searchParams.get('tab') as Tab | null;
    if (next && ['users', 'invites', 'controls'].includes(next) && next !== tab) setTab(next);
    if (!next && tab !== 'users') setTab('users');
  }, [searchParams]);
  useEffect(() => { if (!districtId) { setUpazilas([]); setUpazilaId(null); return; } getUpazilas(districtId).then(setUpazilas).catch(() => setUpazilas([])); }, [districtId]);
  useEffect(() => { if (!edit?.districtId) { setEditUpazilas([]); return; } getUpazilas(edit.districtId).then(setEditUpazilas).catch(() => setEditUpazilas([])); }, [edit?.districtId]);
  if (account && account.role !== 'super_admin') return <Navigate to="/dashboard" replace />;

  async function submitSearch(event: FormEvent) { event.preventDefault(); await loadUsers(true); }
  function editFromDetail(item: SuperAdminUserDetail) {
    const p = item.profile;
    setEdit({ fullName: p.full_name || '', phone: p.phone || '', dateOfBirth: p.date_of_birth || '', gender: p.gender || '', bloodGroup: p.blood_group || '', addressLine: p.address_line || '', districtId: p.district_id, upazilaId: p.upazila_id, emergencyContactName: p.emergency_contact_name || '', emergencyContactPhone: p.emergency_contact_phone || '', reason: '' });
  }
  async function openUser(userId: string) {
    setDetailLoading(true); setError(null); setDetailTab('profile'); setEditing(false); setAction(null);
    try { const item = await getSuperAdminUserDetail(userId); setDetail(item); editFromDetail(item); }
    catch (detailError) { setError(messageFrom(detailError)); } finally { setDetailLoading(false); }
  }
  async function refreshDetail() { if (!detail) return; const item = await getSuperAdminUserDetail(detail.profile.id); setDetail(item); editFromDetail(item); }
  function beginAction(next: Action) { setAction(next); setReason(''); setConfirmation(''); setConfirmed(false); }
  function closeAction() { setAction(null); setReason(''); setConfirmation(''); setConfirmed(false); }

  async function saveProfile(event: FormEvent) {
    event.preventDefault(); if (!detail || !edit) return;
    setWorking(true); setError(null);
    try {
      await updateSuperAdminUserProfile({ userId: detail.profile.id, fullName: edit.fullName, phone: edit.phone, dateOfBirth: edit.dateOfBirth || null, gender: edit.gender || null, bloodGroup: edit.bloodGroup || null, addressLine: edit.addressLine, districtId: edit.districtId, upazilaId: edit.upazilaId, emergencyContactName: edit.emergencyContactName, emergencyContactPhone: edit.emergencyContactPhone, reason: edit.reason });
      setNotice('User profile আপডেট হয়েছে।'); setEditing(false); await refreshDetail(); await loadUsers(true);
    } catch (saveError) { setError(messageFrom(saveError)); } finally { setWorking(false); }
  }

  async function applyAction() {
    if (!detail || !action) return;
    if (reason.trim().length < (action.kind === 'delete' ? 5 : 3)) { setError('এই action-এর বিস্তারিত কারণ লিখুন।'); return; }
    if (action.kind === 'delete' && confirmation !== `DELETE ${String(detail.profile.email || detail.profile.id).toLowerCase()}`) { setError('Delete confirmation ঠিকভাবে লিখুন।'); return; }
    if (!confirmed) { setConfirmed(true); return; }
    setWorking(true); setError(null);
    try {
      if (action.kind === 'role') await changeSuperAdminUserRole(detail.profile.id, action.value, reason);
      else if (action.kind === 'status') await setSuperAdminUserStatus(detail.profile.id, action.value, reason);
      else await deleteSuperAdminUser(detail.profile.id, confirmation, reason);
      setNotice(action.kind === 'delete' ? 'Account permanently delete হয়েছে।' : 'Account control আপডেট হয়েছে।');
      closeAction(); if (action.kind === 'delete') setDetail(null); else await refreshDetail(); await loadUsers(true);
    } catch (actionError) { setError(messageFrom(actionError)); } finally { setWorking(false); }
  }

  async function createInvite(event: FormEvent) {
    event.preventDefault(); setWorking(true); setError(null); setCreatedLink('');
    try { const result = await createPrivilegedAccountInvite(invite); const link = `${window.location.origin}${result.registration_path}`; setCreatedLink(link); setNotice('Privileged invitation তৈরি হয়েছে। Linkটি নির্দিষ্ট email owner-কে দিন।'); setInvite({ email: '', fullName: '', phone: '', role: 'verification_officer', expiresDays: 7 }); setInvites(await getPrivilegedAccountInvites()); }
    catch (inviteError) { setError(messageFrom(inviteError)); } finally { setWorking(false); }
  }
  async function cancelInvite(id: string) { if (!window.confirm('এই invitation cancel করবেন?')) return; setWorking(true); try { await cancelPrivilegedAccountInvite(id); setInvites(await getPrivilegedAccountInvites()); setInvitesLoaded(true); setNotice('Invitation cancel হয়েছে।'); } catch (cancelError) { setError(messageFrom(cancelError)); } finally { setWorking(false); } }

  async function updateDoctorVerificationPolicy(next: {
    hideUnverifiedDoctors?: boolean;
    newRegistrationRequiresVerification?: boolean;
  }) {
    if (!verificationPolicy || policyWorking) return;
    const hideUnverifiedDoctors = next.hideUnverifiedDoctors ?? verificationPolicy.hide_unverified_doctors;
    const newRegistrationRequiresVerification = next.newRegistrationRequiresVerification ?? verificationPolicy.new_registration_requires_verification;

    if (next.hideUnverifiedDoctors === true && !window.confirm('সব active pending Doctor public listing থেকে temporary hide হবে। Login/dashboard বন্ধ হবে না। Continue?')) return;

    setPolicyWorking(true); setError(null); setNotice(null);
    try {
      const updated = await setSuperAdminDoctorVerificationPolicy({
        hideUnverifiedDoctors,
        newRegistrationRequiresVerification,
      });
      setVerificationPolicy(updated);
      setNotice('Doctor verification publication policy আপডেট হয়েছে।');
    } catch (policyError) {
      setError(messageFrom(policyError));
    } finally {
      setPolicyWorking(false);
    }
  }

  return <div className="app-shell super-page"><main className="super-main container"><header className="super-heading"><span><Crown /></span><div><small>Single-owner authority</small><h1>Super Admin Control Center</h1><p>একজন Super Admin—privileged roles, sensitive user data ও irreversible account actions।</p></div><button onClick={() => void refreshCurrentTab()}><RefreshCw /> Refresh</button></header><nav className="super-tabs">{([['users', Users, 'সব Users'], ['invites', Plus, 'Privileged invites'], ['controls', ShieldCheck, 'Existing controls']] as const).map(([value, Icon, label]) => <button key={value} className={tab === value ? 'active' : ''} onClick={() => { setTab(value); setSearchParams(value === 'users' ? {} : { tab: value }); }}><Icon /> {label}</button>)}</nav>{error && <div className="error-box">{error}</div>}{notice && <div className="auth-message success">{notice}</div>}{loading ? <div className="loading-box"><LoaderCircle className="spin" /> Super Admin data লোড হচ্ছে…</div> : <>

  {tab === 'users' && <section className="super-users"><form className="super-filters" onSubmit={submitSearch}><label><Search /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="নাম, email বা phone" /></label><select value={role} onChange={(e) => setRole(e.target.value as UserRole | 'all')}><option value="all">সব role</option>{Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="all">সব status</option><option value="active">Active</option><option value="suspended">Suspended</option><option value="banned">Banned</option></select><select value={districtId ?? ''} onChange={(e) => setDistrictId(e.target.value ? Number(e.target.value) : null)}><option value="">সব জেলা</option>{districts.map((item) => <option key={item.id} value={item.id}>{item.name_bn}</option>)}</select><select disabled={!districtId} value={upazilaId ?? ''} onChange={(e) => setUpazilaId(e.target.value ? Number(e.target.value) : null)}><option value="">সব উপজেলা</option>{upazilas.map((item) => <option key={item.id} value={item.id}>{item.name_bn}</option>)}</select><select value={medicalType} onChange={(e) => setMedicalType(e.target.value as 'all' | 'MBBS' | 'BDS')}><option value="all">All Medical Type</option><option value="MBBS">MBBS</option><option value="BDS">BDS</option></select><select value={specialtyId ?? ''} onChange={(e) => setSpecialtyId(e.target.value ? Number(e.target.value) : null)}><option value="">সব স্পেশালিটি</option>{specialties.map((item) => <option key={item.id} value={item.id}>{item.name_bn}</option>)}</select><button>Filter</button></form><header className="super-list-title"><div><h2>User directory</h2><p>কোনো row-তে click করলে full account popup খুলবে এবং access audit হবে।</p></div><b>{users[0]?.total_count ?? 0} users</b></header><div className="super-user-list">{users.map((user) => <button key={user.user_id} onClick={() => void openUser(user.user_id)}><span className={`super-avatar role-${user.role}`}>{(user.full_name || user.email || 'U').slice(0, 1).toUpperCase()}</span><div><strong>{user.full_name || 'নাম দেওয়া হয়নি'} {user.role === 'super_admin' && <Crown />}</strong><small>{user.email || 'Email নেই'} • {user.phone || 'Phone নেই'}</small><p><MapPin /> {[user.upazila_name, user.district_name].filter(Boolean).join(', ') || 'Location দেওয়া নেই'}</p></div><b>{roleLabels[user.role]}{user.medical_type ? ` · ${user.medical_type}` : ''}</b><span className={`super-status ${user.account_status}`}>{user.account_status}</span><time>Login: {dateLabel(user.last_sign_in_at)}</time></button>)}{!users.length && <p className="empty-inline">কোনো user পাওয়া যায়নি।</p>}</div>{usersHasMore && <div className="public-load-more-wrap"><button type="button" className="public-load-more-button" disabled={usersLoadingMore} onClick={() => void loadUsers(false)}>{usersLoadingMore ? <LoaderCircle className="spin" /> : null}{usersLoadingMore ? 'আরও লোড হচ্ছে…' : 'আরও users দেখুন'}</button></div>}</section>}

  {tab === 'invites' && <div className="super-invite-grid"><form className="super-card" onSubmit={createInvite}><header><Plus /><div><h2>Admin/Officer account invite</h2><p>Existing user হলে User popup থেকে promote করুন। নতুন user হলে invited email দিয়ে registration করতে হবে।</p></div></header><Field label="পূর্ণ নাম"><input required minLength={2} value={invite.fullName} onChange={(e) => setInvite({ ...invite, fullName: e.target.value })} /></Field><Field label="Email"><input required type="email" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} /></Field><Field label="Phone"><input value={invite.phone} onChange={(e) => setInvite({ ...invite, phone: e.target.value })} /></Field><div className="super-form-grid"><Field label="Privileged role"><select value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value as 'admin' | 'verification_officer' })}><option value="verification_officer">Verification Officer</option><option value="admin">Admin</option></select></Field><Field label="মেয়াদ (দিন)"><input type="number" min={1} max={30} value={invite.expiresDays} onChange={(e) => setInvite({ ...invite, expiresDays: Number(e.target.value) })} /></Field></div><button className="super-primary" disabled={working}>{working ? <LoaderCircle className="spin" /> : 'Invitation তৈরি করুন'}</button>{createdLink && <div className="super-created-link"><input readOnly value={createdLink} /><button type="button" onClick={() => void navigator.clipboard.writeText(createdLink)}><Copy /></button></div>}</form><section className="super-card"><header><UserCog /><div><h2>Invitation history</h2><p>Open invite cancel করা যাবে; claimed account User directory-তে পাওয়া যাবে।</p></div></header><div className="super-invite-list">{invites.map((item) => { const open = !item.claimed_at && !item.cancelled_at && new Date(item.expires_at) > new Date(); return <article key={item.invite_id}><div><strong>{item.full_name}</strong><small>{item.email} • {roleLabels[item.target_role]}</small><p>Expires: {dateLabel(item.expires_at)}</p></div><span className={item.claimed_at ? 'claimed' : open ? 'open' : 'closed'}>{item.claimed_at ? 'Claimed' : open ? 'Open' : 'Closed'}</span>{open && <button disabled={working} onClick={() => void cancelInvite(item.invite_id)}>Cancel</button>}</article>; })}{!invites.length && <p className="empty-inline">কোনো invitation নেই।</p>}</div></section></div>}

  {tab === 'controls' && <section className="super-controls">
    <article className="super-verification-policy-card">
      <ShieldCheck />
      <h2>Verification badge policy</h2>
      <p>Verification এখন শুধু BMDC/identity badge-এর জন্য। Active Doctor-এর profile, contact, chamber, map বা appointment publication এটি বন্ধ করে না।</p>
      {verificationPolicy ? <div className="super-policy-body">
        <div className="super-policy-stats">
          <span><b>{verificationPolicy.active_pending_doctors}</b>Active pending</span>
          <span><b>{verificationPolicy.currently_public_pending_doctors}</b>Pending public</span>
          <span><b>{verificationPolicy.approved_active_doctors}</b>Verified</span>
        </div>
        <label className="super-toggle-row">
          <div><strong>Verification দিয়ে public profile hide</strong><small>Retired: report moderation/account suspension ছাড়া profile hide হবে না।</small></div>
          <input type="checkbox" role="switch" checked={false} disabled onChange={(event) => void updateDoctorVerificationPolicy({ hideUnverifiedDoctors: event.target.checked })} />
        </label>
        <label className="super-toggle-row">
          <div><strong>New Doctor: verification before publish</strong><small>Retired: onboarding complete করলে public profile ব্যবহার করা যাবে; badge pending/unverified থাকবে।</small></div>
          <input type="checkbox" role="switch" checked={false} disabled onChange={(event) => void updateDoctorVerificationPolicy({ newRegistrationRequiresVerification: event.target.checked })} />
        </label>
        {verificationPolicy.new_registration_requires_verification && <p className="super-policy-cutoff">Migration 78 deploy করলে legacy publication rule স্বয়ংক্রিয়ভাবে বন্ধ হবে।</p>}
        <p className="super-policy-note">Admin report moderation এবং suspended/banned account এখনো public থেকে বন্ধ থাকবে। সাধারণ verification decision contact/appointment permission নয়।</p>
      </div> : <p className="empty-inline">Verification publication policy load হয়নি। Migration 32 apply আছে কিনা check করুন।</p>}
    </article>
    <article><Activity /><h2>Operational Admin</h2><p>Users, appointment override, full audit activity ও daily operations।</p><Link to="/admin">Admin dashboard <ExternalLink /></Link></article>
    <article><FileCheck2 /><h2>Verification</h2><p>Doctor, Provider ও Ambulance approve/reject oversight।</p><Link to="/verification/reviews">Verification queue <ExternalLink /></Link></article>
    <article><Edit3 /><h2>CMS & Reference</h2><p>Specialty, Topic, Sections, Banner, content এবং public settings।</p><Link to="/admin/cms">Admin CMS <ExternalLink /></Link></article>
  </section>}
  </>}

  {detailLoading && <div className="verification-overlay"><div className="loading-box"><LoaderCircle className="spin" /> Sensitive detail লোড হচ্ছে…</div></div>}{detail && <div className="verification-overlay" role="dialog" aria-modal="true"><section className="super-detail"><header><span className={`super-avatar role-${detail.profile.role}`}>{(detail.profile.full_name || detail.profile.email || 'U').slice(0, 1).toUpperCase()}</span><div><small>{roleLabels[detail.profile.role]}</small><h2>{detail.profile.full_name || 'নাম দেওয়া হয়নি'}</h2><p>{detail.profile.email} • {detail.profile.phone || 'Phone নেই'}</p></div><button onClick={() => setDetail(null)}><X /></button></header><nav>{(['profile', 'data', 'activity'] as const).map((value) => <button key={value} className={detailTab === value ? 'active' : ''} onClick={() => setDetailTab(value)}>{value === 'profile' ? 'Profile & location' : value === 'data' ? 'Role data' : 'Appointments & audit'}</button>)}</nav><div className="super-detail-body">

  {detailTab === 'profile' && !editing && <><section className="super-detail-grid"><Info label="Email (login identity)" value={String(detail.profile.email || '—')} /><Info label="Phone" value={String(detail.profile.phone || '—')} /><Info label="Status" value={detail.profile.account_status} /><Info label="Role" value={roleLabels[detail.profile.role]} /><Info label="Date of birth" value={String(detail.profile.date_of_birth || '—')} /><Info label="Gender / Blood" value={`${detail.profile.gender || '—'} / ${detail.profile.blood_group || '—'}`} /><Info label="Address" value={String(detail.profile.address_line || '—')} /><Info label="District / Upazila / Area" value={`${detail.district?.name_bn || '—'} / ${detail.upazila?.name_bn || '—'}`} /><Info label="Emergency contact" value={`${detail.profile.emergency_contact_name || '—'} • ${detail.profile.emergency_contact_phone || '—'}`} /><Info label="Last sign in" value={dateLabel(detail.auth.last_sign_in_at)} /></section><section className="super-location"><header><MapPin /><div><h3>Last recorded location</h3><p>Exact location sensitive; popup open access ইতিমধ্যে audit হয়েছে।</p></div></header>{detail.last_location ? <div><dl><div><dt>Coordinates</dt><dd>{detail.last_location.latitude}, {detail.last_location.longitude}</dd></div><div><dt>Accuracy/source</dt><dd>{detail.last_location.accuracy_meters ?? '—'}m • {detail.last_location.source}</dd></div><div><dt>Area</dt><dd>{detail.last_location.upazila_name || '—'}, {detail.last_location.district_name || '—'}</dd></div><div><dt>Updated</dt><dd>{dateLabel(detail.last_location.updated_at)}</dd></div></dl><a target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${detail.last_location.latitude},${detail.last_location.longitude}`}>Map খুলুন <ExternalLink /></a></div> : <p className="empty-inline">কোনো location record নেই।</p>}</section><div className="super-account-actions"><button onClick={() => setEditing(true)}><Edit3 /> Profile edit</button>{detail.profile.id !== account?.user_id && detail.profile.role !== 'super_admin' && <><select value="" onChange={(e) => e.target.value && beginAction({ kind: 'role', value: e.target.value as Exclude<UserRole, 'super_admin'> })}><option value="">Promote/Demote role…</option>{roleOptions.filter((item) => item !== detail.profile.role).map((item) => <option value={item} key={item}>{roleLabels[item]}</option>)}</select><select value="" onChange={(e) => e.target.value && beginAction({ kind: 'status', value: e.target.value as 'active' | 'suspended' | 'banned' })}><option value="">Account status…</option>{(['active', 'suspended', 'banned'] as const).filter((item) => item !== detail.profile.account_status).map((item) => <option key={item} value={item}>{item}</option>)}</select><button className="danger" onClick={() => beginAction({ kind: 'delete', value: 'delete' })}><Trash2 /> Delete account</button></>}</div></>}

  {detailTab === 'profile' && editing && edit && <form className="super-edit-form" onSubmit={saveProfile}><p className="super-readonly-note">Email/password Supabase Auth identity—এই form থেকে বদলানো হবে না।</p><div className="super-form-grid"><Field label="পূর্ণ নাম"><input required value={edit.fullName} onChange={(e) => setEdit({ ...edit, fullName: e.target.value })} /></Field><Field label="Phone"><input value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></Field><Field label="Date of birth"><input type="date" value={edit.dateOfBirth} onChange={(e) => setEdit({ ...edit, dateOfBirth: e.target.value })} /></Field><Field label="Gender"><select value={edit.gender} onChange={(e) => setEdit({ ...edit, gender: e.target.value })}><option value="">—</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option></select></Field><Field label="Blood group"><select value={edit.bloodGroup} onChange={(e) => setEdit({ ...edit, bloodGroup: e.target.value })}><option value="">—</option>{['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((item) => <option key={item}>{item}</option>)}</select></Field><Field label="District"><select value={edit.districtId ?? ''} onChange={(e) => setEdit({ ...edit, districtId: e.target.value ? Number(e.target.value) : null, upazilaId: null })}><option value="">—</option>{districts.map((item) => <option key={item.id} value={item.id}>{item.name_bn}</option>)}</select></Field><Field label="Upazila"><select disabled={!edit.districtId} value={edit.upazilaId ?? ''} onChange={(e) => setEdit({ ...edit, upazilaId: e.target.value ? Number(e.target.value) : null })}><option value="">—</option>{editUpazilas.map((item) => <option key={item.id} value={item.id}>{item.name_bn}</option>)}</select></Field><Field label="Emergency name"><input value={edit.emergencyContactName} onChange={(e) => setEdit({ ...edit, emergencyContactName: e.target.value })} /></Field><Field label="Emergency phone"><input value={edit.emergencyContactPhone} onChange={(e) => setEdit({ ...edit, emergencyContactPhone: e.target.value })} /></Field></div><Field label="Address"><textarea rows={3} value={edit.addressLine} onChange={(e) => setEdit({ ...edit, addressLine: e.target.value })} /></Field><Field label="Edit reason (audit-এর জন্য বাধ্যতামূলক)"><textarea required minLength={3} rows={2} value={edit.reason} onChange={(e) => setEdit({ ...edit, reason: e.target.value })} /></Field><footer><button type="button" onClick={() => setEditing(false)}>বাতিল</button><button className="super-primary" disabled={working}>{working ? <LoaderCircle className="spin" /> : 'Profile save'}</button></footer></form>}

  {detailTab === 'data' && <div className="super-role-data"><JsonSection title="Doctor profile" value={detail.doctor} /><JsonSection title={`Providers (${detail.providers.length})`} value={detail.providers} /><JsonSection title={`Ambulances (${detail.ambulances.length})`} value={detail.ambulances} /><JsonSection title="Blood donor" value={detail.blood_donor} /></div>}
  {detailTab === 'activity' && <div className="super-history"><section><h3>Appointment summary</h3><div className="super-counts"><span><b>{detail.appointment_counts.as_patient}</b>Patient</span><span><b>{detail.appointment_counts.as_doctor}</b>Doctor</span><span><b>{detail.appointment_counts.pending}</b>Pending</span></div><div className="super-history-list">{detail.recent_appointments.map((item, index) => <article key={String(item.id || index)}><CalendarDays /><div><strong>{String(item.status || 'appointment')}</strong><small>{String(item.appointment_date || '')} • {String(item.id || '')}</small></div></article>)}{!detail.recent_appointments.length && <p className="empty-inline">Appointment নেই।</p>}</div></section><section><h3>Target audit history</h3><div className="super-history-list">{detail.recent_audit.map((item, index) => <article key={String(item.id || index)}><Activity /><div><strong>{String(item.action || 'action').replaceAll('_', ' ')}</strong><small>{dateLabel(String(item.created_at || ''))}</small></div></article>)}{!detail.recent_audit.length && <p className="empty-inline">Audit record নেই।</p>}</div></section></div>}
  </div></section></div>}

  {detail && action && <div className="verification-overlay super-action-layer" role="dialog" aria-modal="true"><section className="super-action-dialog"><header><div><small>Irreversible/audited control</small><h2>{action.kind === 'role' ? `Role → ${roleLabels[action.value]}` : action.kind === 'status' ? `Status → ${action.value}` : 'Permanent account deletion'}</h2></div><button onClick={closeAction}><X /></button></header><p>{detail.profile.full_name} • {detail.profile.email}</p><Field label="কারণ"><textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>{action.kind === 'delete' && <Field label={`ঠিক লিখুন: DELETE ${String(detail.profile.email || detail.profile.id).toLowerCase()}`}><input value={confirmation} onChange={(e) => setConfirmation(e.target.value)} /></Field>}{confirmed && <div className="super-danger-warning"><Ban /> এই action audit হবে{action.kind === 'delete' ? ' এবং data আর ফেরত পাওয়া যাবে না।' : ' এবং সাথে সাথে কার্যকর হবে।'}</div>}<footer><button onClick={closeAction}>বাতিল</button><button className={action.kind === 'delete' ? 'delete' : 'super-primary'} disabled={working} onClick={() => void applyAction()}>{working ? <LoaderCircle className="spin" /> : confirmed ? 'হ্যাঁ, নিশ্চিতভাবে প্রয়োগ করুন' : 'পরবর্তী confirmation'}</button></footer></section></div>}
  </main></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="super-field"><span>{label}</span>{children}</label>; }
function Info({ label, value }: { label: string; value: string }) { return <div><dt>{label}</dt><dd>{value}</dd></div>; }
function JsonSection({ title, value }: { title: string; value: unknown }) {
  if (value == null || (Array.isArray(value) && !value.length)) {
    return <section><h3>{title}</h3><p className="empty-inline">Data নেই।</p></section>;
  }

  if (Array.isArray(value)) {
    return <section className="super-json-section"><h3>{title}</h3><div className="super-json-records">{value.map((record, index) => {
      const fields = record && typeof record === 'object' ? Object.entries(record as Record<string, unknown>) : [['value', record] as [string, unknown]];
      return <article className="super-json-record" key={index}><b>Record {index + 1}</b><dl>{fields.map(([key, item]) => <div key={key}><dt>{key.replaceAll('_', ' ')}</dt><dd>{item && typeof item === 'object' ? JSON.stringify(item) : String(item ?? '—')}</dd></div>)}</dl></article>;
    })}</div></section>;
  }

  const fields = typeof value === 'object' ? Object.entries(value as Record<string, unknown>) : [['value', value] as [string, unknown]];
  return <section className="super-json-section"><h3>{title}</h3><dl>{fields.map(([key, item]) => <div key={key}><dt>{key.replaceAll('_', ' ')}</dt><dd>{item && typeof item === 'object' ? JSON.stringify(item) : String(item ?? '—')}</dd></div>)}</dl></section>;
}
