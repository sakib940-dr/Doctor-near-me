import { useEffect, useState } from 'react';
import { Eye, ImagePlus, LoaderCircle, Pencil, Trash2, X } from 'lucide-react';
import { getImageUrl } from '../../../lib/storage';
import {
  deleteProviderSliderImage, providerSlider, removeOwnedProviderWebsiteImage,
  replaceProviderSliderImage, uploadProviderWebsiteImage, type ProviderSliderImage,
} from '../../../services/providerWebsiteContent';
import { HospitalPageHeader } from '../HospitalShell';
import { bi, useHospitalLanguage } from '../i18n';
import { useHospital } from '../useHospital';

const display = (path: string | null) => getImageUrl(path,'public-images') || path || '';
const message = (reason: unknown) => reason instanceof Error ? reason.message : 'Gallery action failed.';

export default function HospitalGalleryPage() {
  const { text } = useHospitalLanguage();
  const { provider } = useHospital();
  const [rows, setRows] = useState<ProviderSliderImage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ProviderSliderImage | null>(null);

  async function load() { if (provider) setRows(await providerSlider.getAll(provider.id)); }
  useEffect(() => { void load().catch((reason) => setError(message(reason))); }, [provider?.id]);

  async function add(file: File) {
    if (!provider || rows.length >= 4) return;
    setBusy(true); setError(null); let path: string | null = null;
    try {
      path = await uploadProviderWebsiteImage(provider.id,file,'slider');
      await providerSlider.create(provider.id,{ image:path,icon:null,caption:{bn:'',en:''},is_active:true,sort_order:rows.length });
      await load();
    } catch (reason) { if (path) await removeOwnedProviderWebsiteImage(path).catch(() => undefined); setError(message(reason)); }
    finally { setBusy(false); }
  }

  async function replace(row: ProviderSliderImage, file: File) {
    if (!provider) return;
    setBusy(true); setError(null);
    try { await replaceProviderSliderImage(provider.id,row,file); await load(); }
    catch (reason) { setError(message(reason)); }
    finally { setBusy(false); }
  }

  async function remove(row: ProviderSliderImage) {
    if (!provider || !window.confirm(text(bi('হাসপাতালের টপ গ্যালারি থেকে ছবিটি মুছবেন?', 'Delete this image from the Hospital top gallery?')))) return;
    setBusy(true); setError(null);
    try { await deleteProviderSliderImage(provider.id,row); if(preview?.id===row.id)setPreview(null); await load(); }
    catch (reason) { setError(message(reason)); }
    finally { setBusy(false); }
  }

  return <>
    <HospitalPageHeader eyebrow={bi('প্রিমিয়াম পাবলিক প্রোফাইল', 'Premium Public Profile')} title={bi('টপ গ্যালারি ম্যানেজমেন্ট', 'Top Gallery Management')} description={bi('হাসপাতালের সামনের অংশ, রিসেপশন, বিভাগ বা চিকিৎসাসেবার সর্বোচ্চ চারটি ছবি আপলোড করুন।', 'Upload up to four Hospital front-view, reception, department or treatment images.')} />
    {error && <div className="hospital-error">{error}</div>}
    <section className="hospital-panel"><div className="hospital-panel-title"><div><h2>{text(bi('গ্যালারির ছবি', 'Gallery images'))} ({rows.length}/4)</h2><p>{text(bi('প্রস্তাবিত 1600×900। সর্বোচ্চ ৫ MB; আপলোডের আগে অপ্টিমাইজ হবে।', 'Recommended 1600×900. Maximum 5 MB; optimized before upload.'))}</p></div>{busy && <LoaderCircle className="spin" />}</div>
      <div className="hospital-gallery-slots">
        {rows.map((row) => <article className="hospital-gallery-slot" key={row.id}><img src={display(row.image)} alt={row.caption.bn || row.caption.en || text(bi('হাসপাতাল গ্যালারি', 'Hospital gallery'))} /><div className="hospital-gallery-actions"><button type="button" title={text(bi('প্রিভিউ', 'Preview'))} onClick={() => setPreview(row)}><Eye /></button><label title={text(bi('বদলান', 'Replace'))}><Pencil /><input type="file" accept="image/jpeg,image/png,image/webp,image/avif" disabled={busy} onChange={(event) => { const file=event.target.files?.[0]; if(file)void replace(row,file); event.target.value=''; }} /></label><button type="button" title={text(bi('মুছুন', 'Delete'))} onClick={() => void remove(row)}><Trash2 /></button></div></article>)}
        {rows.length < 4 && <label className="hospital-gallery-slot hospital-gallery-slot-empty"><span><ImagePlus size={42} /><strong>{text(bi('গ্যালারির ছবি যোগ করুন', 'Add gallery image'))}</strong><small>{text(bi('সামনের অংশ, রিসেপশন, বিভাগ বা সেবা', 'Front view, reception, department or service'))}</small></span><input hidden type="file" accept="image/jpeg,image/png,image/webp,image/avif" disabled={busy} onChange={(event) => { const file=event.target.files?.[0]; if(file)void add(file); event.target.value=''; }} /></label>}
      </div>
      {rows.length >= 4 && <p className="hospital-notice">{text(bi('চারটি গ্যালারি স্লট পূর্ণ। নতুন ছবি দিতে পুরোনো ছবি বদলান বা মুছুন।', 'All four gallery slots are full. Replace or delete an image to add another.'))}</p>}
    </section>
    {preview && <div className="hospital-doctor-modal-backdrop" role="presentation" onClick={() => setPreview(null)}><div className="hospital-doctor-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}><header><button type="button" onClick={() => setPreview(null)}><X /></button><img style={{width:'100%',borderRadius:18}} src={display(preview.image)} alt="Hospital gallery preview" /></header></div></div>}
  </>;
}
