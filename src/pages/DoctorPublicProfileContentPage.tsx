import { FormEvent, useCallback, useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CalendarClock,
  Eye,
  ImagePlus,
  LoaderCircle,
  Pencil,
  Plus,
  Save,
  Stethoscope,
  Trash2,
  X,
} from 'lucide-react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { doctorPublicPath } from '../lib/publicRoutes';
import { getImageUrl } from '../lib/storage';
import {
  createDoctorSliderImage,
  deleteDoctorSliderImage,
  doctorInvestigationCosts,
  doctorServices,
  doctorTreatmentCosts,
  getMyDoctorPublicContent,
  reorderDoctorSliderImages,
  replaceDoctorSliderImage,
  saveMyDoctorAbout,
  updateDoctorSliderImage,
  uploadDoctorSliderImage,
} from '../services/doctorPublicContent';
import { resolvePublicDoctorRoute } from '../services/discovery';
import type {
  DoctorInvestigationCostItem,
  DoctorPublicContent,
  DoctorServiceItem,
  DoctorSliderImage,
  DoctorTreatmentCostItem,
} from '../types';

const messageFrom = (error: unknown) => error instanceof Error ? error.message : 'কাজটি সম্পন্ন করা যায়নি।';

export interface DoctorPublicProfileContentPageProps {
  section?: 'all' | 'about' | 'services' | 'treatment' | 'investigation';
  embedded?: boolean;
  onSaved?: () => void | Promise<void>;
}

export default function DoctorPublicProfileContentPage({ section = 'all', embedded = false, onSaved }: DoctorPublicProfileContentPageProps = {}) {
  const { account, user } = useAuth();
  const [content, setContent] = useState<DoctorPublicContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [aboutBn, setAboutBn] = useState('');
  const [aboutEn, setAboutEn] = useState('');
  const [savingAbout, setSavingAbout] = useState(false);
  const [publicHref, setPublicHref] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getMyDoctorPublicContent();
      setContent(result);
      setAboutBn(result?.bio_bn || '');
      setAboutEn(result?.bio_en || '');
    } catch (loadError) {
      setError(messageFrom(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!user?.id) { setPublicHref(null); return; }
    let active = true;
    setPublicHref(doctorPublicPath(null, user.id));
    void resolvePublicDoctorRoute(user.id).then((route) => {
      if (active && route) setPublicHref(doctorPublicPath(route.slug, route.id));
    }).catch(() => undefined);
    return () => { active = false; };
  }, [user?.id]);

  if (account && account.role !== 'doctor') return <Navigate to="/dashboard" replace />;

  async function saveAbout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingAbout(true);
    setError(null);
    setNotice(null);
    try {
      await saveMyDoctorAbout(aboutBn, aboutEn);
      setNotice('About Doctor সংরক্ষণ হয়েছে।');
      await load();
      await onSaved?.();
    } catch (saveError) {
      setError(messageFrom(saveError));
    } finally {
      setSavingAbout(false);
    }
  }

  return (
    <div className="app-shell doctor-dashboard-page">
      <main className="doctor-dashboard-main container doctor-public-editor-page">
        {!embedded && <Link className="back-link" to="/dashboard"><ArrowLeft /> Dashboard-এ ফিরুন</Link>}
        <div className="doctor-page-heading">
          <span><Stethoscope /></span>
          <div><small>Public profile</small><h1>Doctor Details Content</h1><p>Slider, bilingual About, services এবং cost list পরিচালনা করুন।</p></div>
        </div>
        {!embedded && <div className="doctor-public-editor-actions">
          {publicHref && <Link to={publicHref}><Eye /> Public profile দেখুন</Link>}
          <Link to="/doctor/schedules"><CalendarClock /> Chamber schedule</Link>
        </div>}
        {error && <div className="error-box" role="alert">{error}</div>}
        {notice && <div className="auth-message success">{notice}</div>}
        {loading ? <div className="loading-box"><LoaderCircle className="spin" /> Content লোড হচ্ছে…</div> : !content ? <div className="empty-state"><h3>Content পাওয়া যায়নি</h3></div> : (
          <div className="doctor-public-editor-stack">
            {(section === 'all' || section === 'about') && <>
              <SliderManager rows={content.slider_images} reload={load} onSaved={onSaved} setError={setError} setNotice={setNotice} />
              <section className="doctor-content-editor-card">
                <header><div><small>বাংলা default</small><h2>About Doctor</h2></div></header>
                <form className="doctor-bilingual-form" onSubmit={saveAbout}>
                  <label><span>নিজের সম্পর্কে — বাংলা</span><textarea rows={5} maxLength={4000} value={aboutBn} onChange={(event) => setAboutBn(event.target.value)} placeholder="শিক্ষা, অভিজ্ঞতা, চিকিৎসা দর্শন ও রোগীসেবার তথ্য" /></label>
                  <label><span>About — English</span><textarea rows={5} maxLength={4000} value={aboutEn} onChange={(event) => setAboutEn(event.target.value)} placeholder="English version (optional)" /></label>
                  <button className="doctor-content-save" type="submit" disabled={savingAbout}>{savingAbout ? <LoaderCircle className="spin" /> : <Save />} About সংরক্ষণ</button>
                </form>
              </section>
            </>}
            {(section === 'all' || section === 'services') && <ServiceManager rows={content.services} reload={load} onSaved={onSaved} setError={setError} setNotice={setNotice} />}
            {(section === 'all' || section === 'treatment') && <TreatmentCostManager rows={content.treatment_costs} reload={load} onSaved={onSaved} setError={setError} setNotice={setNotice} />}
            {(section === 'all' || section === 'investigation') && <InvestigationCostManager rows={content.investigation_costs} reload={load} onSaved={onSaved} setError={setError} setNotice={setNotice} />}
          </div>
        )}
      </main>
    </div>
  );
}

interface EditorCommon {
  reload: () => Promise<void>;
  onSaved?: () => void | Promise<void>;
  setError: (value: string | null) => void;
  setNotice: (value: string | null) => void;
}

function SliderManager({ rows, reload, onSaved, setError, setNotice }: EditorCommon & { rows: DoctorSliderImage[] }) {
  const [edit, setEdit] = useState<DoctorSliderImage | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [captionBn, setCaptionBn] = useState('');
  const [captionEn, setCaptionEn] = useState('');
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);

  function startEdit(row: DoctorSliderImage) {
    setEdit(row);
    setFile(null);
    setPreview(null);
    setCaptionBn(row.caption?.bn || '');
    setCaptionEn(row.caption?.en || '');
    setActive(row.is_active);
  }

  function reset() {
    setEdit(null);
    setFile(null);
    setCaptionBn('');
    setCaptionEn('');
    setActive(true);
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] || null;
    if (!selected) return;
    if (!selected.type.startsWith('image/')) {
      setError('শুধু image file upload করা যাবে।');
      return;
    }
    if (preview) URL.revokeObjectURL(preview);
    setFile(selected);
    setPreview(URL.createObjectURL(selected));
    setError(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!edit && !file) { setError('নতুন slider-এর জন্য একটি ছবি নির্বাচন করুন।'); return; }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (edit) {
        if (file) await replaceDoctorSliderImage(edit, file);
        await updateDoctorSliderImage(edit.id, { caption: { bn: captionBn.trim(), en: captionEn.trim() }, is_active: active });
      } else if (file) {
        if (rows.length >= 4) throw new Error('সর্বোচ্চ ৪টি slider image রাখা যাবে।');
        const path = await uploadDoctorSliderImage(file);
        try {
          await createDoctorSliderImage({ image: path, caption: { bn: captionBn.trim(), en: captionEn.trim() }, active, sortOrder: rows.length });
        } catch (createError) {
          throw createError;
        }
      }
      reset();
      setNotice(edit ? 'Slider image আপডেট হয়েছে।' : 'Slider image যোগ হয়েছে।');
      await reload(); await onSaved?.();
    } catch (saveError) {
      setError(messageFrom(saveError));
    } finally {
      setBusy(false);
    }
  }

  async function move(index: number, direction: number) {
    const next = [...rows];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setError(null);
    try { await reorderDoctorSliderImages(next); await reload(); await onSaved?.(); } catch (moveError) { setError(messageFrom(moveError)); }
  }

  async function remove(row: DoctorSliderImage) {
    setError(null);
    try { await deleteDoctorSliderImage(row); setNotice('Slider image মুছে ফেলা হয়েছে।'); if (edit?.id === row.id) reset(); await reload(); await onSaved?.(); } catch (deleteError) { setError(messageFrom(deleteError)); }
  }

  return (
    <section className="doctor-content-editor-card">
      <header><div><small>{rows.length}/4 images</small><h2>Profile Image Slider</h2></div><ImagePlus /></header>
      <p className="doctor-editor-help">প্রস্তাবিত সাইজ: 1600×900 px • সর্বোচ্চ 10 MB source image গ্রহণ করা হবে এবং upload-এর আগে WebP-তে অপটিমাইজ হবে। Arrow দিয়ে order নির্ধারণ করুন; mobile-এ public slider swipe করা যাবে।</p>
      <form className="doctor-content-compact-form" onSubmit={submit}>
        <label className="doctor-content-file"><ImagePlus /> {edit ? 'Replace image' : 'Image নির্বাচন'}<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" data-skip-global-guard="true" onChange={handleFileChange} /><small className="image-upload-hint">প্রস্তাবিত সাইজ: 1600×900 px • সর্বোচ্চ 10 MB • আপলোডের পর ছবি স্বয়ংক্রিয়ভাবে অপটিমাইজ হবে</small></label>
        {preview && <div className="doctor-slider-preview"><img src={preview} alt="Selected slider preview" width="320" /></div>}
        <input value={captionBn} onChange={(event) => setCaptionBn(event.target.value)} placeholder="বাংলা caption (optional)" />
        <input value={captionEn} onChange={(event) => setCaptionEn(event.target.value)} placeholder="English caption (optional)" />
        <label className="doctor-content-check"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /> Public-এ দেখান</label>
        <button type="submit" disabled={busy || (!edit && rows.length >= 4)}>{busy ? <LoaderCircle className="spin" /> : <Save />} {edit ? 'Update' : 'Add image'}</button>
        {edit && <button type="button" className="doctor-content-cancel" onClick={reset}><X /> Cancel</button>}
      </form>
      <div className="doctor-slider-admin-list">
        {rows.map((row, index) => <article key={row.id}>
          <img src={getImageUrl(row.image, 'public-images', 'thumbnail') || ''} alt={row.caption?.bn || 'Doctor slider'} loading="lazy" decoding="async" width="640" height="360" />
          <div><strong>{row.caption?.bn || row.caption?.en || `Slide ${index + 1}`}</strong><small>{row.is_active ? 'Public' : 'Hidden'}</small></div>
          <div className="doctor-content-row-actions"><button type="button" onClick={() => void move(index, -1)} disabled={index === 0} aria-label="উপরে"><ArrowUp /></button><button type="button" onClick={() => void move(index, 1)} disabled={index === rows.length - 1} aria-label="নিচে"><ArrowDown /></button><button type="button" onClick={() => startEdit(row)} aria-label="সম্পাদনা"><Pencil /></button><button type="button" onClick={() => void remove(row)} aria-label="মুছুন"><Trash2 /></button></div>
        </article>)}
        {!rows.length && <p className="doctor-editor-empty">কোনো slider image নেই। Public page profile photo fallback ব্যবহার করবে।</p>}
      </div>
    </section>
  );
}

function ServiceManager({ rows, reload, onSaved, setError, setNotice }: EditorCommon & { rows: DoctorServiceItem[] }) {
  const [edit, setEdit] = useState<DoctorServiceItem | null>(null);
  const [busy, setBusy] = useState(false);
  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] || null;
    if (!selected) return;
    if (!selected.type.startsWith('image/')) {
      setError('শুধু image file upload করা যাবে।');
      return;
    }
    if (preview) URL.revokeObjectURL(preview);
    setFile(selected);
    setPreview(URL.createObjectURL(selected));
    setError(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input = {
      name: { bn: String(form.get('bn') || '').trim(), en: String(form.get('en') || '').trim() },
      description: { bn: String(form.get('dbn') || '').trim(), en: String(form.get('den') || '').trim() },
      is_active: form.get('active') === 'on',
      sort_order: edit?.sort_order ?? rows.length,
    };
    setBusy(true); setError(null);
    try { if (edit) await doctorServices.update(edit.id, input); else await doctorServices.create(input); setEdit(null); event.currentTarget.reset(); setNotice('সেবার তালিকা সংরক্ষণ হয়েছে।'); await reload(); await onSaved?.(); } catch (saveError) { setError(messageFrom(saveError)); } finally { setBusy(false); }
  }
  async function move(index: number, direction: number) { const next = [...rows]; const target = index + direction; if (target < 0 || target >= next.length) return; [next[index], next[target]] = [next[target], next[index]]; try { await doctorServices.reorder(next); await reload(); await onSaved?.(); } catch (error) { setError(messageFrom(error)); } }
  return <section className="doctor-content-editor-card"><header><div><small>Bilingual list</small><h2>সেবাসমূহ</h2></div><Plus /></header><form className="doctor-content-grid-form" onSubmit={submit}><input name="bn" key={`bn-${edit?.id ?? 'new'}`} defaultValue={edit?.name.bn || ''} required placeholder="সেবার নাম বাংলা" /><input name="en" key={`en-${edit?.id ?? 'new'}`} defaultValue={edit?.name.en || ''} placeholder="Service name English" /><textarea name="dbn" key={`dbn-${edit?.id ?? 'new'}`} defaultValue={edit?.description?.bn || ''} placeholder="বাংলা description (optional)" /><textarea name="den" key={`den-${edit?.id ?? 'new'}`} defaultValue={edit?.description?.en || ''} placeholder="English description (optional)" /><label className="doctor-content-check"><input name="active" type="checkbox" defaultChecked={edit?.is_active ?? true} /> Public-এ দেখান</label><button disabled={busy}>{busy ? <LoaderCircle className="spin" /> : <Save />} Save</button>{edit && <button type="button" className="doctor-content-cancel" onClick={() => setEdit(null)}><X /> Cancel</button>}</form><ContentRows rows={rows} title={(row) => row.name.bn || row.name.en || 'Service'} subtitle={(row) => row.description?.bn || row.description?.en || ''} move={move} edit={setEdit} remove={async (row) => { try { await doctorServices.remove(row.id); await reload(); await onSaved?.(); } catch (error) { setError(messageFrom(error)); } }} /></section>;
}

function TreatmentCostManager({ rows, reload, onSaved, setError, setNotice }: EditorCommon & { rows: DoctorTreatmentCostItem[] }) {
  const [edit, setEdit] = useState<DoctorTreatmentCostItem | null>(null);
  const [busy, setBusy] = useState(false);
  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] || null;
    if (!selected) return;
    if (!selected.type.startsWith('image/')) {
      setError('শুধু image file upload করা যাবে।');
      return;
    }
    if (preview) URL.revokeObjectURL(preview);
    setFile(selected);
    setPreview(URL.createObjectURL(selected));
    setError(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const min = Number(form.get('min')); const maxRaw = String(form.get('max') || '').trim(); const max = maxRaw ? Number(maxRaw) : null;
    if (!Number.isFinite(min) || min < 0 || (max != null && (!Number.isFinite(max) || max < min))) { setError('Treatment cost সঠিকভাবে দিন; maximum cost starting cost-এর সমান বা বেশি হবে।'); return; }
    const input = { name: { bn: String(form.get('bn') || '').trim(), en: String(form.get('en') || '').trim() }, cost: { min, max, note_bn: String(form.get('noteBn') || '').trim(), note_en: String(form.get('noteEn') || '').trim() }, sort_order: edit?.sort_order ?? rows.length };
    setBusy(true); setError(null); try { if (edit) await doctorTreatmentCosts.update(edit.id, input); else await doctorTreatmentCosts.create(input); setEdit(null); event.currentTarget.reset(); setNotice('Treatment cost সংরক্ষণ হয়েছে।'); await reload(); await onSaved?.(); } catch (error) { setError(messageFrom(error)); } finally { setBusy(false); }
  }
  async function move(index: number, direction: number) { const next = [...rows]; const target = index + direction; if (target < 0 || target >= next.length) return; [next[index], next[target]] = [next[target], next[index]]; try { await doctorTreatmentCosts.reorder(next); await reload(); await onSaved?.(); } catch (error) { setError(messageFrom(error)); } }
  return <section className="doctor-content-editor-card"><header><div><small>Starting + maximum</small><h2>চিকিৎসার খরচ</h2></div><Plus /></header><form className="doctor-content-grid-form" onSubmit={submit}><input name="bn" key={`tbn-${edit?.id ?? 'new'}`} defaultValue={edit?.name.bn || ''} required placeholder="Treatment name বাংলা" /><input name="en" key={`ten-${edit?.id ?? 'new'}`} defaultValue={edit?.name.en || ''} placeholder="Treatment name English" /><input name="min" type="number" min="0" step="1" key={`tmin-${edit?.id ?? 'new'}`} defaultValue={edit?.cost.min ?? ''} required placeholder="Starting cost" /><input name="max" type="number" min="0" step="1" key={`tmax-${edit?.id ?? 'new'}`} defaultValue={edit?.cost.max ?? ''} placeholder="Maximum cost optional" /><input name="noteBn" key={`tnb-${edit?.id ?? 'new'}`} defaultValue={edit?.cost.note_bn || ''} placeholder="নোট বাংলা (optional)" /><input name="noteEn" key={`tne-${edit?.id ?? 'new'}`} defaultValue={edit?.cost.note_en || ''} placeholder="Note English (optional)" /><button disabled={busy}>{busy ? <LoaderCircle className="spin" /> : <Save />} Save</button>{edit && <button type="button" className="doctor-content-cancel" onClick={() => setEdit(null)}><X /> Cancel</button>}</form><ContentRows rows={rows} title={(row) => row.name.bn || row.name.en || 'Treatment'} subtitle={(row) => `৳${row.cost.min ?? 0}${row.cost.max != null ? ` – ৳${row.cost.max}` : '+'}`} move={move} edit={setEdit} remove={async (row) => { try { await doctorTreatmentCosts.remove(row.id); await reload(); await onSaved?.(); } catch (error) { setError(messageFrom(error)); } }} /></section>;
}

function InvestigationCostManager({ rows, reload, onSaved, setError, setNotice }: EditorCommon & { rows: DoctorInvestigationCostItem[] }) {
  const [edit, setEdit] = useState<DoctorInvestigationCostItem | null>(null);
  const [busy, setBusy] = useState(false);
  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] || null;
    if (!selected) return;
    if (!selected.type.startsWith('image/')) {
      setError('শুধু image file upload করা যাবে।');
      return;
    }
    if (preview) URL.revokeObjectURL(preview);
    setFile(selected);
    setPreview(URL.createObjectURL(selected));
    setError(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); const amount = Number(form.get('amount'));
    if (!Number.isFinite(amount) || amount < 0) { setError('Investigation cost সঠিকভাবে দিন।'); return; }
    const bn = String(form.get('bn') || '').trim(); const en = String(form.get('en') || '').trim(); if (!bn && !en) { setError('Investigation name দিন।'); return; } const input = { name: { bn, en }, cost: { amount: Number(amount), note_bn: String(form.get('noteBn') || '').trim(), note_en: String(form.get('noteEn') || '').trim() }, sort_order: edit?.sort_order ?? rows.length };
    setBusy(true); setError(null); try { if (edit) await doctorInvestigationCosts.update(edit.id, input); else await doctorInvestigationCosts.create(input); setEdit(null); event.currentTarget.reset(); setNotice('Investigation cost সংরক্ষণ হয়েছে।'); await reload(); await onSaved?.(); } catch (error) { setError(messageFrom(error)); } finally { setBusy(false); }
  }
  async function move(index: number, direction: number) { const next = [...rows]; const target = index + direction; if (target < 0 || target >= next.length) return; [next[index], next[target]] = [next[target], next[index]]; try { await doctorInvestigationCosts.reorder(next); await reload(); await onSaved?.(); } catch (error) { setError(messageFrom(error)); } }
  return <section className="doctor-content-editor-card"><header><div><small>Structured price list</small><h2>পরীক্ষা / Investigation খরচ</h2></div><Plus /></header><form className="doctor-content-grid-form" onSubmit={submit}><input name="bn" key={`ibn-${edit?.id ?? 'new'}`} defaultValue={edit?.name.bn || ''} required placeholder="Investigation name বাংলা" /><input name="en" key={`ien-${edit?.id ?? 'new'}`} defaultValue={edit?.name.en || ''} placeholder="Investigation name English" /><input name="amount" type="number" min="0" step="1" key={`iamount-${edit?.id ?? 'new'}`} defaultValue={edit?.cost.amount ?? ''} required placeholder="Cost" /><input name="noteBn" key={`inb-${edit?.id ?? 'new'}`} defaultValue={edit?.cost.note_bn || ''} placeholder="নোট বাংলা (optional)" /><input name="noteEn" key={`ine-${edit?.id ?? 'new'}`} defaultValue={edit?.cost.note_en || ''} placeholder="Note English (optional)" /><button disabled={busy}>{busy ? <LoaderCircle className="spin" /> : <Save />} Save</button>{edit && <button type="button" className="doctor-content-cancel" onClick={() => setEdit(null)}><X /> Cancel</button>}</form><ContentRows rows={rows} title={(row) => row.name.bn || row.name.en || 'Investigation'} subtitle={(row) => `৳${row.cost.amount ?? 0}`} move={move} edit={setEdit} remove={async (row) => { try { await doctorInvestigationCosts.remove(row.id); await reload(); await onSaved?.(); } catch (error) { setError(messageFrom(error)); } }} /></section>;
}

function ContentRows<T extends { id: number }>(props: {
  rows: T[];
  title: (row: T) => string;
  subtitle: (row: T) => string;
  move: (index: number, direction: number) => Promise<void>;
  edit: (row: T) => void;
  remove: (row: T) => Promise<void>;
}) {
  return <div className="doctor-content-admin-list">{props.rows.map((row, index) => <article key={row.id}><div><strong>{props.title(row)}</strong><small>{props.subtitle(row)}</small></div><div className="doctor-content-row-actions"><button type="button" disabled={index === 0} onClick={() => void props.move(index, -1)}><ArrowUp /></button><button type="button" disabled={index === props.rows.length - 1} onClick={() => void props.move(index, 1)}><ArrowDown /></button><button type="button" onClick={() => props.edit(row)}><Pencil /></button><button type="button" onClick={() => void props.remove(row)}><Trash2 /></button></div></article>)}{!props.rows.length && <p className="doctor-editor-empty">এখনো কোনো item যোগ করা হয়নি।</p>}</div>;
}
