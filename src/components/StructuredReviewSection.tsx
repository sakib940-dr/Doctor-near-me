import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Languages, LoaderCircle, MessageSquareText, Pencil, Star, X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  getDoctorReviewSummary,
  getMyDoctorReview,
  getMyProviderReview,
  getProviderReviewSummary,
  getPublicDoctorReviews,
  getPublicProviderReviews,
  getStructuredReviewQuestions,
  saveMyDoctorReview,
  saveMyProviderReview,
} from '../services/engagement';
import type {
  ReviewLanguage,
  StructuredReview,
  StructuredReviewQuestion,
  StructuredReviewQuestionSet,
  StructuredReviewSummary,
} from '../types';

interface Props {
  targetType: 'doctor' | 'provider';
  targetId: string;
  entityLabel?: string;
  language?: ReviewLanguage;
}

const fallbackQuestions: StructuredReviewQuestionSet = {
  version: 2,
  doctor: [
    { key: 'doctor_time', score_key: 'q1', bn: 'ডাক্তার আপনাকে পর্যাপ্ত সময় দিয়েছেন কি?', en: 'Did the doctor give you enough time?' },
    { key: 'explanation', score_key: 'q2', bn: 'ডাক্তার আপনার সমস্যা ও চিকিৎসা সহজভাবে বুঝিয়ে বলেছেন কি?', en: 'Did the doctor explain your problem and treatment clearly?' },
    { key: 'environment', score_key: 'q3', bn: 'চেম্বারের পরিবেশ কেমন ছিল?', en: 'How was the chamber environment?' },
    { key: 'staff', score_key: 'q4', bn: 'স্টাফদের ব্যবহার ও সহযোগিতা কেমন ছিল?', en: 'How was the staff behavior and support?' },
    { key: 'treatment_satisfaction', score_key: 'q5', bn: 'চিকিৎসা নিয়ে আপনি কতটা সন্তুষ্ট?', en: 'How satisfied are you with the treatment?' },
  ],
  provider: [
    { key: 'care_time', score_key: 'q1', bn: 'আপনাকে পর্যাপ্ত সময় ও মনোযোগ দেওয়া হয়েছে কি?', en: 'Did you receive enough time and attention?' },
    { key: 'explanation', score_key: 'q2', bn: 'আপনার সমস্যা ও সেবা/চিকিৎসা সহজভাবে বুঝিয়ে বলা হয়েছে কি?', en: 'Was your care or service explained clearly?' },
    { key: 'environment', score_key: 'q3', bn: 'হাসপাতাল/চেম্বারের পরিবেশ কেমন ছিল?', en: 'How was the hospital or chamber environment?' },
    { key: 'staff', score_key: 'q4', bn: 'স্টাফদের ব্যবহার ও সহযোগিতা কেমন ছিল?', en: 'How was the staff behavior and support?' },
    { key: 'service_satisfaction', score_key: 'q5', bn: 'সামগ্রিক সেবা নিয়ে আপনি কতটা সন্তুষ্ট?', en: 'How satisfied are you with the overall service?' },
  ],
};

const scoreIndex = (key: StructuredReviewQuestion['score_key']) => Number(key.slice(1)) - 1;
const averageKey = (key: StructuredReviewQuestion['score_key']) => `${key}_average` as keyof StructuredReviewSummary;
const reviewScore = (review: StructuredReview, key: StructuredReviewQuestion['score_key']) => Number(review[`${key}_score` as keyof StructuredReview] ?? 0);

function compactQuestionLabel(question: StructuredReviewQuestion, lang: ReviewLanguage) {
  const shortBn: Record<string, string> = {
    doctor_time: 'সময় দিয়েছেন', care_time: 'সময় ও মনোযোগ', explanation: 'বুঝিয়ে বলেছেন', environment: 'পরিবেশ', staff: 'স্টাফ', treatment_satisfaction: 'চিকিৎসায় সন্তুষ্টি', service_satisfaction: 'সেবায় সন্তুষ্টি',
  };
  const shortEn: Record<string, string> = {
    doctor_time: 'Time', care_time: 'Time & attention', explanation: 'Explanation', environment: 'Environment', staff: 'Staff', treatment_satisfaction: 'Treatment satisfaction', service_satisfaction: 'Service satisfaction',
  };
  return (lang === 'bn' ? shortBn : shortEn)[question.key] || question[lang];
}

function StarRow({ value, interactive = false, onChange, label }: { value: number; interactive?: boolean; onChange?: (value: number) => void; label: string }) {
  return <div className={`structured-stars ${interactive ? 'is-interactive' : ''}`} aria-label={`${label}: ${value || 0} / 5`}>
    {[1, 2, 3, 4, 5].map((star) => interactive ? (
      <button key={star} type="button" aria-label={`${label}: ${star} out of 5`} aria-pressed={value === star} onClick={() => onChange?.(star)}>
        <Star fill={star <= value ? 'currentColor' : 'none'} />
      </button>
    ) : <Star key={star} fill={star <= Math.round(value) ? 'currentColor' : 'none'} />)}
  </div>;
}

export default function StructuredReviewSection({ targetType, targetId, entityLabel, language }: Props) {
  const { user, account } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [lang, setLang] = useState<ReviewLanguage>(language ?? 'bn');
  const [questionSet, setQuestionSet] = useState<StructuredReviewQuestionSet>(fallbackQuestions);
  const [summary, setSummary] = useState<StructuredReviewSummary | null>(null);
  const [reviews, setReviews] = useState<StructuredReview[]>([]);
  const [myReview, setMyReview] = useState<StructuredReview | null>(null);
  const [scores, setScores] = useState<number[]>([0, 0, 0, 0, 0]);
  const [comment, setComment] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => { if (language) setLang(language); }, [language]);

  const questions = useMemo(() => {
    const configured = targetType === 'doctor' ? questionSet.doctor : questionSet.provider;
    return configured?.length === 5 ? configured : fallbackQuestions[targetType];
  }, [questionSet, targetType]);
  const label = entityLabel || (targetType === 'doctor' ? 'ডাক্তার' : 'হাসপাতাল/চেম্বার');

  async function loadPublic() {
    const [nextQuestions, nextSummary, nextReviews] = await Promise.all([
      getStructuredReviewQuestions().catch(() => null),
      targetType === 'doctor' ? getDoctorReviewSummary(targetId) : getProviderReviewSummary(targetId),
      targetType === 'doctor' ? getPublicDoctorReviews(targetId, 20, 0) : getPublicProviderReviews(targetId, 20, 0),
    ]);
    if (nextQuestions) setQuestionSet(nextQuestions);
    setSummary(nextSummary);
    setReviews(nextReviews);
  }

  async function loadMine() {
    if (!user || account?.role !== 'patient') {
      setMyReview(null);
      return;
    }
    const next = targetType === 'doctor' ? await getMyDoctorReview(targetId) : await getMyProviderReview(targetId);
    setMyReview(next);
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([loadPublic(), loadMine()])
      .catch((loadError: unknown) => { if (active) setError(loadError instanceof Error ? loadError.message : 'রিভিউ লোড করা যায়নি।'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
    // Auth role changes after session hydration; reload the private edit state then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetId, targetType, user?.id, account?.role]);

  useEffect(() => {
    if (myReview) {
      setScores([myReview.q1_score, myReview.q2_score, myReview.q3_score, myReview.q4_score, myReview.q5_score]);
      setComment(myReview.comment || '');
    } else if (!formOpen) {
      setScores([0, 0, 0, 0, 0]);
      setComment('');
    }
  }, [myReview, formOpen]);

  function openEditor() {
    setError(null); setNotice(null);
    if (!user) {
      navigate('/auth', { state: { from: `${location.pathname}${location.search}${location.hash}` } });
      return;
    }
    if (account?.role !== 'patient') return;
    setFormOpen(true);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!scores.every((score) => score >= 1 && score <= 5)) {
      setError(lang === 'bn' ? 'সব ৫টি প্রশ্নে ১–৫ রেটিং দিন।' : 'Please rate all five questions from 1 to 5.');
      return;
    }
    setSaving(true); setError(null); setNotice(null);
    try {
      const input = { q1Score: scores[0], q2Score: scores[1], q3Score: scores[2], q4Score: scores[3], q5Score: scores[4], comment: comment.trim() || null };
      if (targetType === 'doctor') await saveMyDoctorReview(targetId, input);
      else await saveMyProviderReview(targetId, input);
      await Promise.all([loadPublic(), loadMine()]);
      setFormOpen(false);
      setNotice(lang === 'bn' ? 'আপনার রিভিউ সংরক্ষণ হয়েছে।' : 'Your review has been saved.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : (lang === 'bn' ? 'রিভিউ সংরক্ষণ করা যায়নি।' : 'Could not save the review.'));
    } finally {
      setSaving(false);
    }
  }

  const count = Number(summary?.review_count ?? 0);
  const overall = summary?.overall_average == null ? null : Number(summary.overall_average);

  return <section className="structured-review-section" aria-label={lang === 'bn' ? 'রিভিউ ও রেটিং' : 'Reviews and ratings'}>
    <div className="structured-review-head">
      <div><span><MessageSquareText /> {lang === 'bn' ? 'রোগীর অভিজ্ঞতা' : 'Patient experience'}</span><h2>{lang === 'bn' ? 'রিভিউ ও রেটিং' : 'Reviews & ratings'}</h2></div>
      {!language && <button type="button" className="structured-review-language" onClick={() => setLang((current) => current === 'bn' ? 'en' : 'bn')}><Languages /> {lang === 'bn' ? 'EN' : 'বাংলা'}</button>}
    </div>

    {loading ? <div className="structured-review-loading"><LoaderCircle className="spin" /> {lang === 'bn' ? 'রিভিউ লোড হচ্ছে…' : 'Loading reviews…'}</div> : <>
      <div className="structured-review-summary">
        <div className="structured-overall">
          <strong>{overall == null ? '—' : overall.toFixed(1)}</strong>
          <StarRow value={overall ?? 0} label={lang === 'bn' ? 'সামগ্রিক রেটিং' : 'Overall rating'} />
          <span>{count.toLocaleString(lang === 'bn' ? 'bn-BD' : 'en-US')} {lang === 'bn' ? 'টি রিভিউ' : count === 1 ? 'review' : 'reviews'}</span>
        </div>
        <div className="structured-category-averages">
          {questions.map((question) => {
            const raw = summary?.[averageKey(question.score_key)];
            const average = raw == null ? null : Number(raw);
            return <div key={question.key}><span>{compactQuestionLabel(question, lang)}</span><strong>{average == null ? '—' : average.toFixed(1)} <Star fill={average != null ? 'currentColor' : 'none'} /></strong></div>;
          })}
        </div>
      </div>

      <div className="structured-review-action-row">
        {!user || account?.role === 'patient' ? <button type="button" className="structured-review-primary" onClick={openEditor}>
          {myReview ? <Pencil /> : <Star />}{myReview ? (lang === 'bn' ? 'আপনার রিভিউ সম্পাদনা করুন' : 'Edit your review') : (lang === 'bn' ? 'রিভিউ দিন' : 'Write a review')}
        </button> : <small>{lang === 'bn' ? 'রিভিউ দিতে Patient account প্রয়োজন।' : 'A Patient account is required to review.'}</small>}
        {myReview && !myReview.is_published ? <small>{lang === 'bn' ? 'আপনার রিভিউ moderation-এর কারণে public নাও হতে পারে।' : 'Your review may be hidden by moderation.'}</small> : null}
      </div>

      {formOpen && account?.role === 'patient' && <form className="structured-review-form" onSubmit={submit}>
        <div className="structured-review-form-head"><div><small>{myReview ? (lang === 'bn' ? 'আপনার বিদ্যমান রেটিং পরিবর্তন করুন' : 'Update your existing ratings') : (lang === 'bn' ? `${label}-এর সাথে আপনার অভিজ্ঞতা` : `Your experience with this ${targetType === 'doctor' ? 'doctor' : 'provider'}`)}</small><h3>{lang === 'bn' ? '৫টি প্রশ্নের উত্তর দিন' : 'Rate five questions'}</h3></div><button type="button" aria-label={lang === 'bn' ? 'বন্ধ করুন' : 'Close'} onClick={() => setFormOpen(false)}><X /></button></div>
        {questions.map((question) => {
          const index = scoreIndex(question.score_key);
          return <div className="structured-question" key={question.key}><p>{question[lang]}</p><StarRow interactive value={scores[index] ?? 0} label={question[lang]} onChange={(value) => setScores((current) => current.map((score, i) => i === index ? value : score))} /></div>;
        })}
        <label className="structured-review-comment"><span>{lang === 'bn' ? 'সংক্ষিপ্ত মন্তব্য (ঐচ্ছিক)' : 'Short comment (optional)'}</span><textarea rows={3} maxLength={1000} value={comment} onChange={(event) => setComment(event.target.value)} placeholder={lang === 'bn' ? 'আপনার অভিজ্ঞতা সংক্ষেপে লিখতে পারেন' : 'You may briefly describe your experience'} /></label>
        <button className="structured-review-save" type="submit" disabled={saving}>{saving ? <LoaderCircle className="spin" /> : <Star />} {myReview ? (lang === 'bn' ? 'রিভিউ আপডেট করুন' : 'Update review') : (lang === 'bn' ? 'রিভিউ জমা দিন' : 'Submit review')}</button>
      </form>}

      {error && <div className="auth-message error" role="alert">{error}</div>}
      {notice && <div className="auth-message success" role="status">{notice}</div>}

      <div className="structured-review-list">
        <div className="structured-review-list-head"><h3>{lang === 'bn' ? 'রোগীদের রিভিউ' : 'Patient reviews'}</h3><span>{count.toLocaleString(lang === 'bn' ? 'bn-BD' : 'en-US')}</span></div>
        {reviews.length ? reviews.map((review) => <article className="structured-review-card" key={review.review_id}>
          <div className="structured-review-card-head"><div><strong>{review.reviewer_name || (lang === 'bn' ? 'রোগী' : 'Patient')}</strong><small>{new Intl.DateTimeFormat(lang === 'bn' ? 'bn-BD' : 'en-GB', { dateStyle: 'medium' }).format(new Date(review.created_at))}{review.edited_at ? ` · ${lang === 'bn' ? 'সম্পাদিত' : 'edited'}` : ''}</small></div><div className="structured-review-score"><Star fill="currentColor" /><b>{Number(review.rating).toFixed(1)}</b></div></div>
          <div className="structured-review-mini-scores">{questions.map((question) => <span key={question.key}>{compactQuestionLabel(question, lang)} <b>{reviewScore(review, question.score_key)}</b></span>)}</div>
          {review.comment && <p>{review.comment}</p>}
          {review.reply && (review.reply[lang] || review.reply.bn || review.reply.en) ? <div className="structured-review-reply"><strong>{lang === 'bn' ? 'প্রতিষ্ঠানের উত্তর' : 'Provider reply'}</strong><p>{review.reply[lang] || review.reply.bn || review.reply.en}</p></div> : null}
        </article>) : <div className="structured-review-empty">{lang === 'bn' ? 'এখনও কোনো Patient review নেই।' : 'No patient reviews yet.'}</div>}
      </div>
    </>}
  </section>;
}
