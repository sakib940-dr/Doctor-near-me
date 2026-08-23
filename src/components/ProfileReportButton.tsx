import { FormEvent, useEffect, useState } from 'react';
import { CheckCircle2, Flag, LoaderCircle, X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getMyProfileReport, submitProfileReport } from '../services/profileReports';
import type { ProfileReportReason, ProfileReportTargetType } from '../types';

const reasons: Array<{ value: ProfileReportReason; label: string }> = [
  { value: 'fake_doctor', label: 'Fake Doctor' },
  { value: 'fake_bmdc_information', label: 'Fake BMDC information' },
  { value: 'wrong_degree', label: 'Wrong Degree' },
  { value: 'fake_hospital_chamber', label: 'Fake Hospital/Chamber' },
  { value: 'wrong_phone_number', label: 'Wrong Phone Number' },
  { value: 'inappropriate_content', label: 'Inappropriate Content' },
  { value: 'other', label: 'Other' },
];

const messageFrom = (error: unknown) => {
  const message = error instanceof Error ? error.message : error && typeof error === 'object' && 'message' in error ? String(error.message) : String(error || '');
  if (message.includes('ALREADY_REPORTED')) return 'আপনি এই profile-টি আগে report করেছেন।';
  if (message.includes('CANNOT_REPORT_OWN_PROFILE')) return 'নিজের profile report করা যাবে না।';
  if (message.includes('OTHER_DETAILS_REQUIRED')) return 'Other নির্বাচনের কারণটি লিখুন।';
  return 'Report পাঠানো যায়নি। একটু পরে আবার চেষ্টা করুন।';
};

export default function ProfileReportButton({ targetType, targetId, entityLabel }: {
  targetType: ProfileReportTargetType;
  targetId: string;
  entityLabel: string;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ProfileReportReason | ''>('');
  const [otherDetails, setOtherDetails] = useState('');
  const [existing, setExisting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !targetId) { setExisting(false); return; }
    let active = true;
    void getMyProfileReport(targetType, targetId)
      .then((row) => { if (active) setExisting(Boolean(row)); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [targetId, targetType, user?.id]);

  function begin() {
    if (!user) {
      navigate('/auth', { state: { from: `${location.pathname}${location.search}` } });
      return;
    }
    setError(null);
    setOpen(true);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!reason) { setError('Report-এর কারণ নির্বাচন করুন।'); return; }
    if (reason === 'other' && otherDetails.trim().length < 3) { setError('Other-এর বিস্তারিত কারণ লিখুন।'); return; }
    setSubmitting(true); setError(null);
    try {
      await submitProfileReport({ targetType, targetId, reason, otherDetails });
      setExisting(true);
      setOpen(false);
      setReason('');
      setOtherDetails('');
    } catch (submitError) { setError(messageFrom(submitError)); }
    finally { setSubmitting(false); }
  }

  return <>
    <button type="button" className={`profile-report-button${existing ? ' reported' : ''}`} onClick={begin} disabled={existing} title={existing ? 'আপনি ইতিমধ্যে report করেছেন' : undefined}>
      {existing ? <CheckCircle2 /> : <Flag />}<span>{existing ? 'Reported' : 'Report'}</span>
    </button>
    {open && <div className="profile-report-overlay" role="presentation" onClick={() => !submitting && setOpen(false)}>
      <form className="profile-report-dialog" role="dialog" aria-modal="true" aria-label={`${entityLabel} report করুন`} onClick={(event) => event.stopPropagation()} onSubmit={submit}>
        <header><span><Flag /></span><div><small>Safety report</small><h2>{entityLabel} report করুন</h2><p>সঠিক কারণ নির্বাচন করুন। একই account থেকে এই profile-এ একবারই report করা যাবে।</p></div><button type="button" aria-label="বন্ধ করুন" onClick={() => setOpen(false)} disabled={submitting}><X /></button></header>
        <fieldset><legend>Report reason</legend>{reasons.map((item) => <label key={item.value} className={reason === item.value ? 'selected' : ''}><input type="radio" name="profile-report-reason" value={item.value} checked={reason === item.value} onChange={() => { setReason(item.value); setError(null); }} /><span>{item.label}</span></label>)}</fieldset>
        {reason === 'other' && <label className="profile-report-other"><span>অন্যান্য কারণ লিখুন</span><textarea required minLength={3} maxLength={1000} rows={4} value={otherDetails} onChange={(event) => setOtherDetails(event.target.value)} placeholder="কী সমস্যা পেয়েছেন সংক্ষেপে লিখুন…" /><small>{otherDetails.length}/1000</small></label>}
        {error && <p className="profile-report-error" role="alert">{error}</p>}
        <footer><button type="button" onClick={() => setOpen(false)} disabled={submitting}>বাতিল</button><button className="submit" type="submit" disabled={submitting || !reason}>{submitting ? <LoaderCircle className="spin" /> : <Flag />}{submitting ? 'পাঠানো হচ্ছে…' : 'Report পাঠান'}</button></footer>
      </form>
    </div>}
  </>;
}
