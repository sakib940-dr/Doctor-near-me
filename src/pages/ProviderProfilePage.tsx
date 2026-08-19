import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { ArrowLeft, Building2, Camera, ImagePlus, LoaderCircle, MapPin, Save, ShieldAlert, Trash2 } from 'lucide-react';
import { Link, Navigate } from 'react-router-dom';
import ProviderWebsiteContentTabs from '../components/ProviderWebsiteContentTabs';
import { useAuth } from '../contexts/AuthContext';
import { getImageUrl } from '../lib/storage';
import { getDistricts, getUpazilas } from '../services/discovery';
import { getMyProviderDashboard, saveMyProviderProfile, uploadProviderMedia } from '../services/providerDashboard';
import type { District, ProviderDashboardItem, Upazila } from '../types';

const statusLabels = { pending: 'Verification অপেক্ষমাণ', approved: 'অনুমোদিত', rejected: 'প্রত্যাখ্যাত', suspended: 'স্থগিত' };
const messageFrom = (error: unknown) => error instanceof Error ? error.message : 'প্রতিষ্ঠানের profile সংরক্ষণ করা যায়নি।';

function emptyProvider(type: 'hospital' | 'chamber'): ProviderDashboardItem {
  return { id: '', provider_type: type, name_bn: '', name_en: '', short_description: '', logo_url: null, banner_url: null, phone: '', whatsapp: '', email: '', facebook_url: '', website_url: '', address: '', district_id: null, upazila_id: null, latitude: null, longitude: null, google_maps_url: '', opening_note: '', emergency_available: false, departments: [], services: [], gallery_paths: [], status: 'pending', verified: false, doctor_links: [] };
}

export default function ProviderProfilePage() {
  const { account, user, refreshAccount } = useAuth();
  const roleType = account?.role === 'chamber' ? 'chamber' : 'hospital';
  const [providers, setProviders] = useState<ProviderDashboardItem[]>([]);
  const [profile, setProfile] = useState<ProviderDashboardItem>(emptyProvider(roleType));
  const [districts, setDistricts] = useState<District[]>([]);
  const [upazilas, setUpazilas] = useState<Upazila[]>([]);
  const [departments, setDepartments] = useState('');
  const [services, setServices] = useState('');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [galleryFiles, setGalleryFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getMyProviderDashboard(), getDistricts()])
      .then(([rows, districtRows]) => {
        setProviders(rows); setDistricts(districtRows);
        if (rows[0]) selectProvider(rows[0]);
        else setProfile(emptyProvider(roleType));
      })
      .catch((loadError: unknown) => setError(messageFrom(loadError)))
      .finally(() => setLoading(false));
  }, [roleType]);

  useEffect(() => {
    if (!profile.district_id) { setUpazilas([]); return; }
    getUpazilas(profile.district_id).then(setUpazilas).catch(() => setError('উপজেলার তালিকা লোড করা যায়নি।'));
  }, [profile.district_id]);

  if (account && !['hospital', 'chamber'].includes(account.role)) return <Navigate to="/dashboard" replace />;

  function selectProvider(item: ProviderDashboardItem) {
    setProfile(item); setDepartments(item.departments.join(', ')); setServices(item.services.join(', '));
    setLogoFile(null); setBannerFile(null); setGalleryFiles([]); setError(null); setNotice(null);
  }

  function set<K extends keyof ProviderDashboardItem>(key: K, value: ProviderDashboardItem[K]) {
    setProfile((current) => ({ ...current, [key]: value }));
  }

  function addGallery(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    if (profile.gallery_paths.length + galleryFiles.length + files.length > 8) {
      setError('Gallery-তে সর্বোচ্চ ৮টি ছবি রাখা যাবে।'); return;
    }
    setGalleryFiles((current) => [...current, ...files]);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    setSaving(true); setError(null); setNotice(null);
    try {
      const logoPath = logoFile ? await uploadProviderMedia(logoFile, user.id, 'logo') : profile.logo_url;
      const bannerPath = bannerFile ? await uploadProviderMedia(bannerFile, user.id, 'banner') : profile.banner_url;
      const uploadedGallery = await Promise.all(galleryFiles.map((file) => uploadProviderMedia(file, user.id, 'gallery')));
      const result = await saveMyProviderProfile({
        providerId: profile.id || null,
        nameBn: profile.name_bn,
        nameEn: profile.name_en,
        shortDescription: profile.short_description,
        logoUrl: logoPath,
        bannerUrl: bannerPath,
        phone: profile.phone,
        whatsapp: profile.whatsapp,
        email: profile.email,
        facebookUrl: profile.facebook_url,
        websiteUrl: profile.website_url,
        address: profile.address,
        districtId: profile.district_id,
        upazilaId: profile.upazila_id,
        latitude: profile.latitude,
        longitude: profile.longitude,
        googleMapsUrl: profile.google_maps_url,
        openingNote: profile.opening_note,
        emergencyAvailable: profile.emergency_available,
        departments: departments.split(',').map((value) => value.trim()).filter(Boolean),
        services: services.split(',').map((value) => value.trim()).filter(Boolean),
        galleryPaths: [...profile.gallery_paths, ...uploadedGallery],
      });
      const rows = await getMyProviderDashboard();
      setProviders(rows);
      const saved = rows.find((item) => item.id === result.provider_id);
      if (saved) selectProvider(saved);
      await refreshAccount();
      setNotice(result.verification_reset ? 'Profile সংরক্ষিত হয়েছে। নাম/ঠিকানা বদলানোর কারণে পুনরায় verification প্রয়োজন।' : 'প্রতিষ্ঠানের profile সফলভাবে সংরক্ষণ হয়েছে।');
    } catch (saveError) { setError(messageFrom(saveError)); } finally { setSaving(false); }
  }

  return <div className="app-shell provider-dashboard-page"><main className="provider-dashboard-main container"><Link className="back-link" to="/dashboard"><ArrowLeft /> Dashboard-এ ফিরুন</Link><div className="provider-page-heading"><span><Building2 /></span><div><small>{profile.provider_type === 'hospital' ? 'Hospital' : 'Chamber'} self-service</small><h1>প্রতিষ্ঠানের প্রোফাইল</h1><p>Public profile, যোগাযোগ, বিভাগ, সেবা এবং gallery পরিচালনা করুন।</p></div></div>{providers.length > 1 && <label className="provider-selector">প্রতিষ্ঠান<select value={profile.id} onChange={(event) => { const found = providers.find((item) => item.id === event.target.value); if (found) selectProvider(found); }}>{providers.map((item) => <option key={item.id} value={item.id}>{item.name_bn}</option>)}</select></label>}{loading ? <div className="loading-box"><LoaderCircle className="spin" /> Profile লোড হচ্ছে…</div> : <form className="provider-profile-form" onSubmit={submit}><section className={`provider-verification ${profile.status}`}><div><ShieldAlert /><span><strong>{profile.id ? statusLabels[profile.status] : 'নতুন প্রতিষ্ঠান'}</strong><small>{profile.verified ? 'Public directory-তে verified' : 'Approve না হওয়া পর্যন্ত public হবে না'}</small></span></div><p>প্রতিষ্ঠানের নাম বা location বদলালে re-verification প্রয়োজন হবে।</p></section><section className="provider-media-card"><div className="provider-banner-preview">{getImageUrl(profile.banner_url, 'public-images') ? <img src={getImageUrl(profile.banner_url, 'public-images') || ''} alt="Banner" /> : <ImagePlus />}</div><div className="provider-logo-preview">{getImageUrl(profile.logo_url, 'public-images') ? <img src={getImageUrl(profile.logo_url, 'public-images') || ''} alt="Logo" /> : <Building2 />}</div><div className="provider-media-actions"><label><Camera /> Logo<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={(event) => setLogoFile(event.target.files?.[0] || null)} /></label><label><ImagePlus /> Banner<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={(event) => setBannerFile(event.target.files?.[0] || null)} /></label><small>{[logoFile?.name, bannerFile?.name].filter(Boolean).join(' • ') || 'JPG/PNG/WebP/AVIF; সর্বোচ্চ ৬ MB'}</small></div></section><section className="provider-form-section"><h2>মৌলিক তথ্য</h2><div className="patient-form-grid"><label className="auth-field"><span>বাংলা নাম</span><div><input required minLength={2} value={profile.name_bn} onChange={(event) => set('name_bn', event.target.value)} /></div></label><label className="auth-field"><span>ইংরেজি নাম</span><div><input value={profile.name_en || ''} onChange={(event) => set('name_en', event.target.value)} /></div></label><label className="auth-field"><span>ফোন</span><div><input inputMode="tel" value={profile.phone || ''} onChange={(event) => set('phone', event.target.value)} /></div></label><label className="auth-field"><span>WhatsApp</span><div><input inputMode="tel" value={profile.whatsapp || ''} onChange={(event) => set('whatsapp', event.target.value)} /></div></label><label className="auth-field"><span>ইমেইল</span><div><input type="email" value={profile.email || ''} onChange={(event) => set('email', event.target.value)} /></div></label><label className="auth-field"><span>Facebook URL</span><div><input type="url" value={profile.facebook_url || ''} onChange={(event) => set('facebook_url', event.target.value)} /></div></label><label className="auth-field"><span>Website URL</span><div><input type="url" value={profile.website_url || ''} onChange={(event) => set('website_url', event.target.value)} /></div></label><label className="auth-field"><span>Opening note</span><div><input value={profile.opening_note || ''} onChange={(event) => set('opening_note', event.target.value)} placeholder="২৪ ঘণ্টা / সকাল ৮টা–রাত ১০টা" /></div></label></div><label className="provider-text-field"><span>সংক্ষিপ্ত বিবরণ</span><textarea rows={5} maxLength={2000} value={profile.short_description || ''} onChange={(event) => set('short_description', event.target.value)} /></label></section><section className="provider-form-section"><h2>ঠিকানা ও ম্যাপ</h2><label className="provider-text-field"><span>বিস্তারিত ঠিকানা</span><textarea rows={3} value={profile.address || ''} onChange={(event) => set('address', event.target.value)} /></label><div className="patient-form-grid"><label className="auth-field"><span>জেলা</span><div><MapPin /><select value={profile.district_id ?? ''} onChange={(event) => { set('district_id', event.target.value ? Number(event.target.value) : null); set('upazila_id', null); }}><option value="">নির্বাচন করুন</option>{districts.map((district) => <option key={district.id} value={district.id}>{district.name_bn}</option>)}</select></div></label><label className="auth-field"><span>উপজেলা</span><div><MapPin /><select disabled={!profile.district_id} value={profile.upazila_id ?? ''} onChange={(event) => set('upazila_id', event.target.value ? Number(event.target.value) : null)}><option value="">নির্বাচন করুন</option>{upazilas.map((upazila) => <option key={upazila.id} value={upazila.id}>{upazila.name_bn}</option>)}</select></div></label><label className="auth-field"><span>Latitude</span><div><input type="number" step="any" value={profile.latitude ?? ''} onChange={(event) => set('latitude', event.target.value ? Number(event.target.value) : null)} /></div></label><label className="auth-field"><span>Longitude</span><div><input type="number" step="any" value={profile.longitude ?? ''} onChange={(event) => set('longitude', event.target.value ? Number(event.target.value) : null)} /></div></label></div><label className="auth-field"><span>Google Maps URL</span><div><input type="url" value={profile.google_maps_url || ''} onChange={(event) => set('google_maps_url', event.target.value)} /></div></label></section><section className="provider-form-section"><h2>বিভাগ ও সেবা</h2><label className="provider-text-field"><span>Departments <small>কমা দিয়ে লিখুন</small></span><textarea rows={3} value={departments} onChange={(event) => setDepartments(event.target.value)} placeholder="Cardiology, Orthopedics, Pediatrics" /></label><label className="provider-text-field"><span>Services <small>কমা দিয়ে লিখুন</small></span><textarea rows={3} value={services} onChange={(event) => setServices(event.target.value)} placeholder="ICU, OT, Pathology, Diagnostic" /></label><label className="provider-emergency"><input type="checkbox" checked={profile.emergency_available} onChange={(event) => set('emergency_available', event.target.checked)} /> জরুরি সেবা পাওয়া যায়</label></section><section className="provider-form-section"><h2>Gallery</h2><div className="provider-gallery">{profile.gallery_paths.map((path) => <div key={path}><img src={getImageUrl(path, 'public-images') || ''} alt="প্রতিষ্ঠান gallery" /><button type="button" aria-label="ছবি সরান" onClick={() => set('gallery_paths', profile.gallery_paths.filter((item) => item !== path))}><Trash2 /></button></div>)}{galleryFiles.map((file, index) => <div className="gallery-pending" key={`${file.name}-${index}`}><ImagePlus /><small>{file.name}</small><button type="button" onClick={() => setGalleryFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 /></button></div>)}</div><label className="gallery-upload"><ImagePlus /> Gallery ছবি যোগ করুন<input type="file" multiple accept="image/jpeg,image/png,image/webp,image/avif" onChange={addGallery} /></label><small className="gallery-help">সর্বোচ্চ ৮টি ছবি; save করলে upload হবে।</small></section>{error && <div className="auth-message error" role="alert">{error}</div>}{notice && <div className="auth-message success">{notice}</div>}<button className="auth-submit provider-save" type="submit" disabled={saving}>{saving ? <LoaderCircle className="spin" /> : <><Save /> Profile সংরক্ষণ করুন</>}</button></form>}{!loading && profile.id && <ProviderWebsiteContentTabs providerId={profile.id} />}</main></div>;
}
