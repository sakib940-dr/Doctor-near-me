import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { FileText, GraduationCap, ImagePlus, Layers3, LoaderCircle, Plus, RefreshCw, Save, Search, Settings2, Tags, Trash2 } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getImageUrl } from '../lib/storage';
import { getDistricts } from '../services/discovery';
import { deleteAdminSpecialtyImage, getAdminCmsSnapshot, getAdminDegreeMaster, getAdminDirectoryRankingPolicy, getAdminPrescriptionFooter, saveAdminBanner, saveAdminContentPage, saveAdminDegreeMaster, saveAdminDirectoryRankingPolicy, saveAdminPrescriptionFooter, saveAdminPublicSetting, saveAdminSection, saveAdminSpecialty, saveAdminTopic, uploadAdminBanner, uploadAdminSpecialtyImage } from '../services/adminCms';
import type { AdminCmsBanner, AdminCmsContentPage, AdminCmsSection, AdminCmsSetting, AdminCmsSnapshot, AdminCmsSpecialty, AdminCmsTopic, DegreeMasterItem, District } from '../types';

type Tab = 'specialties' | 'degrees' | 'topics' | 'sections' | 'banners' | 'content' | 'prescription';
const messageFrom = (error: unknown) => error instanceof Error ? error.message : 'CMS কাজটি সম্পন্ন করা যায়নি।';
const blankSpecialty = (): AdminCmsSpecialty => ({ id: 0, name_bn: '', name_en: '', slug: '', icon_url: null, is_active: true, sort_order: 0 });
const blankDegree = (): DegreeMasterItem => ({ id: 0, name: '', short_code: '', qualification_level: 'basic', classification: 'general', discipline: 'medical', aliases: [], is_active: true, sort_order: 0 });
const blankTopic = (): AdminCmsTopic => ({ id: 0, name_bn: '', name_en: null, slug: '', icon: null, description_bn: null, search_keywords: [], specialty_ids: [], is_active: true, sort_order: 0 });
const blankSection = (): AdminCmsSection => ({ id: '', section_key: '', title_bn: '', title_en: null, description_bn: null, data_source: 'doctor', filter_config: {}, view_all_path: '/doctors', card_limit: 10, is_active: true, sort_order: 0 });
const blankBanner = (): AdminCmsBanner => ({ id: '', title_bn: '', title_en: null, subtitle_bn: null, subtitle_en: null, image_path: '', image_alt_bn: null, target_url: null, district_id: null, starts_at: null, ends_at: null, is_active: true, sort_order: 0 });
const asLocalDate = (value: string | null) => value ? new Date(value).toISOString().slice(0, 16) : '';
const asIsoDate = (value: string) => value ? new Date(value).toISOString() : null;

export default function AdminCmsPage() {
  const { account } = useAuth();
  const [tab, setTab] = useState<Tab>('specialties');
  const [data, setData] = useState<AdminCmsSnapshot | null>(null);
  const [districts, setDistricts] = useState<District[]>([]);
  const [degrees, setDegrees] = useState<DegreeMasterItem[]>([]);
  const [degree, setDegree] = useState(blankDegree());
  const [degreeAliases, setDegreeAliases] = useState('');
  const [newEntityDays, setNewEntityDays] = useState(30);
  const [nearMeDistanceBandKm, setNearMeDistanceBandKm] = useState(5);
  const [specialty, setSpecialty] = useState(blankSpecialty());
  const [topic, setTopic] = useState(blankTopic());
  const [section, setSection] = useState(blankSection());
  const [banner, setBanner] = useState(blankBanner());
  const [page, setPage] = useState<AdminCmsContentPage | null>(null);
  const [setting, setSetting] = useState<AdminCmsSetting | null>(null);
  const [keywords, setKeywords] = useState('');
  const [filterJson, setFilterJson] = useState('{}');
  const [settingJson, setSettingJson] = useState('{}');
  const [prescriptionFooter, setPrescriptionFooter] = useState('');
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [specialtyFile, setSpecialtyFile] = useState<File | null>(null);
  const [specialtyPreview, setSpecialtyPreview] = useState<string | null>(null);
  const [removeSpecialtyImage, setRemoveSpecialtyImage] = useState(false);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    setLoading(true); setError(null);
    try {
      const [snapshot, districtRows, footerText, degreeRows, rankingPolicy] = await Promise.all([getAdminCmsSnapshot(), getDistricts(), getAdminPrescriptionFooter().catch(() => ''), getAdminDegreeMaster(), getAdminDirectoryRankingPolicy()]);
      setData(snapshot); setDistricts(districtRows); setPrescriptionFooter(footerText); setDegrees(degreeRows); setNewEntityDays(rankingPolicy.new_entity_days); setNearMeDistanceBandKm(rankingPolicy.near_me_distance_band_km);
      setPage((current) => current ? snapshot.pages.find((item) => item.slug === current.slug) || snapshot.pages[0] || null : snapshot.pages[0] || null);
      setSetting((current) => current ? snapshot.settings.find((item) => item.setting_key === current.setting_key) || snapshot.settings[0] || null : snapshot.settings[0] || null);
    } catch (loadError) { setError(messageFrom(loadError)); } finally { setLoading(false); }
  }
  useEffect(() => { if (account && ['admin', 'super_admin'].includes(account.role)) void load(); }, [account]);
  useEffect(() => { if (page) return; if (data?.pages[0]) setPage(data.pages[0]); }, [data, page]);
  useEffect(() => { if (setting) setSettingJson(JSON.stringify(setting.setting_value, null, 2)); }, [setting]);
  useEffect(() => () => { if (specialtyPreview?.startsWith('blob:')) URL.revokeObjectURL(specialtyPreview); }, [specialtyPreview]);
  if (account && !['admin', 'super_admin'].includes(account.role)) return <Navigate to="/dashboard" replace />;

  async function runSave(work: () => Promise<unknown>, success: string) {
    setSaving(true); setError(null); setNotice(null);
    try { await work(); setNotice(success); await load(); }
    catch (saveError) { setError(messageFrom(saveError)); } finally { setSaving(false); }
  }

  function selectSpecialty(item: AdminCmsSpecialty) {
    if (specialtyPreview?.startsWith('blob:')) URL.revokeObjectURL(specialtyPreview);
    setSpecialty({ ...item });
    setSpecialtyFile(null);
    setSpecialtyPreview(null);
    setRemoveSpecialtyImage(false);
  }
  function chooseSpecialtyImage(file: File | null) {
    if (specialtyPreview?.startsWith('blob:')) URL.revokeObjectURL(specialtyPreview);
    setSpecialtyFile(file);
    setSpecialtyPreview(file ? URL.createObjectURL(file) : null);
    if (file) setRemoveSpecialtyImage(false);
  }
  function markSpecialtyImageForRemoval() {
    if (specialtyPreview?.startsWith('blob:')) URL.revokeObjectURL(specialtyPreview);
    setSpecialtyFile(null);
    setSpecialtyPreview(null);
    setRemoveSpecialtyImage(true);
  }
  function editDegree(item: DegreeMasterItem) { setDegree({ ...item }); setDegreeAliases(item.aliases.join(', ')); }
  function editTopic(item: AdminCmsTopic) { setTopic({ ...item, icon: null }); setKeywords(item.search_keywords.join(', ')); }
  function editSection(item: AdminCmsSection) { setSection({ ...item }); setFilterJson(JSON.stringify(item.filter_config, null, 2)); }
  function selectPage(item: AdminCmsContentPage) { setPage({ ...item }); }
  function selectSetting(item: AdminCmsSetting) { setSetting({ ...item }); setSettingJson(JSON.stringify(item.setting_value, null, 2)); }
  const shownSpecialties = data?.specialties.filter((item) => `${item.name_bn} ${item.name_en} ${item.slug}`.toLowerCase().includes(search.toLowerCase())) || [];
  const shownTopics = data?.topics.filter((item) => `${item.name_bn} ${item.name_en || ''} ${item.slug}`.toLowerCase().includes(search.toLowerCase())) || [];

  async function submitSpecialty(event: FormEvent) {
    event.preventDefault();
    setSaving(true); setError(null); setNotice(null);
    const previousPath = specialty.icon_url;
    let uploadedPath: string | null = null;
    try {
      if (specialtyFile) uploadedPath = await uploadAdminSpecialtyImage(specialtyFile);
      const nextPath = uploadedPath ?? (removeSpecialtyImage ? null : previousPath);
      const savedId = await saveAdminSpecialty({ ...specialty, id: specialty.id || null, icon_url: nextPath });
      if (previousPath && previousPath !== nextPath) {
        try { await deleteAdminSpecialtyImage(previousPath); } catch { /* DB reference is already safely updated; stale managed object can be cleaned later. */ }
      }
      if (specialtyPreview?.startsWith('blob:')) URL.revokeObjectURL(specialtyPreview);
      setSpecialty({ ...specialty, id: savedId, icon_url: nextPath });
      setSpecialtyFile(null); setSpecialtyPreview(null); setRemoveSpecialtyImage(false);
      setNotice('Specialty ও category image সংরক্ষণ হয়েছে।');
      await load();
    } catch (saveError) {
      if (uploadedPath) { try { await deleteAdminSpecialtyImage(uploadedPath); } catch { /* best-effort cleanup */ } }
      setError(messageFrom(saveError));
    } finally { setSaving(false); }
  }
  async function submitDegree(event: FormEvent) { event.preventDefault(); await runSave(async () => { const savedId = await saveAdminDegreeMaster({ ...degree, aliases: degreeAliases.split(',').map((item) => item.trim()).filter(Boolean) }); setDegree((current) => ({ ...current, id: savedId })); }, 'Degree classification সংরক্ষণ হয়েছে।'); }
  async function submitRankingPolicy() { await runSave(() => saveAdminDirectoryRankingPolicy({ newEntityDays, nearMeDistanceBandKm }), 'Global ranking policy সংরক্ষণ হয়েছে।'); }
  async function submitTopic(event: FormEvent) { event.preventDefault(); await runSave(() => saveAdminTopic({ ...topic, id: topic.id || null, search_keywords: keywords.split(',').map((item) => item.trim()).filter(Boolean) }), 'Discovery topic সংরক্ষণ হয়েছে।'); }
  async function submitSection(event: FormEvent) { event.preventDefault(); let parsed: Record<string, unknown>; try { parsed = JSON.parse(filterJson) as Record<string, unknown>; } catch { setError('Filter config valid JSON হতে হবে।'); return; } await runSave(() => saveAdminSection({ ...section, id: section.id || null, filter_config: parsed }), 'Homepage section সংরক্ষণ হয়েছে।'); }
  async function submitBanner(event: FormEvent) { event.preventDefault(); await runSave(async () => { const imagePath = bannerFile ? await uploadAdminBanner(bannerFile) : banner.image_path; if (!imagePath) throw new Error('Banner image নির্বাচন করুন।'); await saveAdminBanner({ ...banner, id: banner.id || null, image_path: imagePath }); setBannerFile(null); }, 'Banner সংরক্ষণ হয়েছে।'); }
  async function submitPage(event: FormEvent) { event.preventDefault(); if (!page) return; await runSave(() => saveAdminContentPage(page), 'Content page সংরক্ষণ হয়েছে।'); }
  async function submitSetting(event: FormEvent) { event.preventDefault(); if (!setting) return; let parsed: Record<string, unknown>; try { parsed = JSON.parse(settingJson) as Record<string, unknown>; } catch { setError('Setting value valid JSON হতে হবে।'); return; } await runSave(() => saveAdminPublicSetting(setting.setting_key, parsed, setting.is_public), 'Site setting সংরক্ষণ হয়েছে।'); }
  async function submitPrescriptionFooter(event: FormEvent) { event.preventDefault(); await runSave(() => saveAdminPrescriptionFooter(prescriptionFooter), 'Prescription Footer সংরক্ষণ হয়েছে। নতুন PDF-এ এই footer ব্যবহার হবে।'); }

  return <div className="app-shell cms-page"><main className="cms-main container"><header className="cms-heading"><span><Layers3 /></span><div><small>Audited content operations</small><h1>Reference ও Homepage CMS</h1><p>Public discovery content, ordering, visibility ও bilingual pages পরিচালনা করুন।</p></div><button onClick={() => void load()}><RefreshCw /> Refresh</button></header><nav className="cms-tabs">{([['specialties', Tags, 'Specialty'], ['degrees', GraduationCap, 'Degrees'], ['topics', Search, 'Discovery topics'], ['sections', Layers3, 'Sections'], ['banners', ImagePlus, 'Banners'], ['content', FileText, 'Content & settings'], ['prescription', FileText, 'Prescription Footer']] as const).map(([value, Icon, label]) => <button key={value} className={tab === value ? 'active' : ''} onClick={() => setTab(value)}><Icon /> {label}</button>)}</nav>{error && <div className="error-box">{error}</div>}{notice && <div className="auth-message success">{notice}</div>}{loading ? <div className="loading-box"><LoaderCircle className="spin" /> CMS data লোড হচ্ছে…</div> : data && <>

  {tab === 'specialties' && <div className="cms-workspace"><section className="cms-list"><header><div><h2>Specialties</h2><small>{data.specialties.length} records</small></div><button onClick={() => selectSpecialty(blankSpecialty())}><Plus /> নতুন</button></header><label className="cms-search"><Search /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Specialty খুঁজুন" /></label><div>{shownSpecialties.map((item) => <button key={item.id} className={specialty.id === item.id ? 'selected' : ''} onClick={() => selectSpecialty(item)}><span className="cms-specialty-list-copy">{item.icon_url ? <img src={getImageUrl(item.icon_url, 'public-images', 'thumbnail') || ''} alt="" /> : <span className="cms-specialty-fallback"><Tags /></span>}<span><strong>{item.name_bn}</strong><small>{item.name_en} • {item.slug}</small></span></span><b className={item.is_active ? 'on' : 'off'}>{item.is_active ? 'Active' : 'Hidden'}</b></button>)}</div></section><form className="cms-editor" onSubmit={submitSpecialty}><EditorTitle icon={<Tags />} title={specialty.id ? 'Specialty edit' : 'নতুন Specialty'} /><section className="cms-specialty-media-editor"><div className="cms-specialty-preview">{!removeSpecialtyImage && (specialtyPreview || specialty.icon_url) ? <img src={specialtyPreview || getImageUrl(specialty.icon_url) || ''} alt={`${specialty.name_bn || 'Specialty'} preview`} /> : <Tags />}</div><div className="cms-specialty-media-actions"><label className="cms-file"><ImagePlus /> {specialtyFile?.name || (specialty.icon_url && !removeSpecialtyImage ? 'Image replace করুন' : 'Image upload করুন')}<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={(e: ChangeEvent<HTMLInputElement>) => chooseSpecialtyImage(e.target.files?.[0] || null)} /></label>{(specialty.icon_url || specialtyFile) && !removeSpecialtyImage && <button className="cms-media-remove" type="button" onClick={markSpecialtyImageForRemoval}><Trash2 /> Image remove</button>}<small>প্রস্তাবিত সাইজ: 600×600 px • ছবি স্বয়ংক্রিয়ভাবে অপটিমাইজ হবে। Image না থাকলে public page neutral medical fallback দেখাবে।</small></div></section><Field label="বাংলা নাম"><input required minLength={2} value={specialty.name_bn} onChange={(e) => setSpecialty({ ...specialty, name_bn: e.target.value })} /></Field><Field label="English name"><input required minLength={2} value={specialty.name_en} onChange={(e) => setSpecialty({ ...specialty, name_en: e.target.value })} /></Field><div className="cms-grid"><Field label="Slug"><input required pattern="[a-z0-9]+(-[a-z0-9]+)*" value={specialty.slug} onChange={(e) => setSpecialty({ ...specialty, slug: e.target.value.toLowerCase() })} /></Field><Field label="Sort order"><input type="number" min={0} value={specialty.sort_order} onChange={(e) => setSpecialty({ ...specialty, sort_order: Number(e.target.value) })} /></Field></div><Toggle checked={specialty.is_active} onChange={(value) => setSpecialty({ ...specialty, is_active: value })} label="Public search-এ active" /><SaveButton saving={saving} /></form></div>}


  {tab === 'degrees' && <div className="cms-workspace">
    <section className="cms-list">
      <header><div><h2>Degree Master</h2><small>{degrees.length} records</small></div><button type="button" onClick={() => { setDegree(blankDegree()); setDegreeAliases(''); }}><Plus /> নতুন</button></header>
      <div>{degrees.map((item) => <button type="button" key={item.id} className={degree.id === item.id ? 'selected' : ''} onClick={() => editDegree(item)}>
        <span><strong>{item.short_code}</strong><small>{item.name} • {item.qualification_level} • {item.classification}</small></span>
        <b className={item.is_active === false ? 'off' : 'on'}>{item.is_active === false ? 'Hidden' : 'Active'}</b>
      </button>)}</div>
    </section>
    <form className="cms-editor" onSubmit={submitDegree}>
      <EditorTitle icon={<GraduationCap />} title={degree.id ? 'Degree classification edit' : 'নতুন Degree'} />
      <p className="cms-help">Doctor-এর existing degree text এই master + aliases দিয়ে parse হবে। Specialist/General classification designation-এর উপর নির্ভর করবে না।</p>
      <div className="cms-grid">
        <Field label="Short code"><input required value={degree.short_code} onChange={(e) => setDegree({ ...degree, short_code: e.target.value })} placeholder="FCPS" /></Field>
        <Field label="Degree name"><input required value={degree.name} onChange={(e) => setDegree({ ...degree, name: e.target.value })} /></Field>
      </div>
      <div className="cms-grid">
        <Field label="Level"><select value={degree.qualification_level} onChange={(e) => setDegree({ ...degree, qualification_level: e.target.value as DegreeMasterItem['qualification_level'] })}><option value="basic">Basic</option><option value="postgraduate">Postgraduate</option></select></Field>
        <Field label="Classification"><select value={degree.classification} onChange={(e) => setDegree({ ...degree, classification: e.target.value as DegreeMasterItem['classification'] })}><option value="general">General</option><option value="specialist">Specialist</option></select></Field>
      </div>
      <div className="cms-grid">
        <Field label="Discipline"><select value={degree.discipline} onChange={(e) => setDegree({ ...degree, discipline: e.target.value as DegreeMasterItem['discipline'] })}><option value="medical">Medical</option><option value="dental">Dental</option><option value="public_health">Public Health</option><option value="other">Other</option></select></Field>
        <Field label="Sort order"><input type="number" min={0} value={degree.sort_order} onChange={(e) => setDegree({ ...degree, sort_order: Number(e.target.value) })} /></Field>
      </div>
      <Field label="Aliases (কমা দিয়ে)"><textarea rows={3} value={degreeAliases} onChange={(e) => setDegreeAliases(e.target.value)} placeholder="F.C.P.S., Fellowship..." /></Field>
      <Toggle checked={degree.is_active !== false} onChange={(value) => setDegree({ ...degree, is_active: value })} label="Search/classification-এ active" />
      <SaveButton saving={saving} />
      <section className="cms-ranking-policy">
        <h3>Global ranking policy</h3>
        <p className="cms-help">Premium → Verified → New Join → Unverified সব discovery surface-এ centralভাবে apply হবে। Near Me-তে distance band relevance preserve করে।</p>
        <div className="cms-grid">
          <Field label="New Join duration (days)"><input type="number" min={1} max={365} value={newEntityDays} onChange={(e) => setNewEntityDays(Number(e.target.value))} /></Field>
          <Field label="Near Me distance band (km)"><input type="number" min={1} max={50} step={1} value={nearMeDistanceBandKm} onChange={(e) => setNearMeDistanceBandKm(Number(e.target.value))} /></Field>
        </div>
        <button className="cms-save secondary" type="button" disabled={saving} onClick={() => void submitRankingPolicy()}><Save /> Ranking policy save</button>
      </section>
    </form>
  </div>}

  {tab === 'topics' && <div className="cms-workspace"><section className="cms-list"><header><div><h2>Discovery topics</h2><small>{data.topics.length} records</small></div><button onClick={() => { setTopic(blankTopic()); setKeywords(''); }}><Plus /> নতুন</button></header><label className="cms-search"><Search /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Topic খুঁজুন" /></label><div>{shownTopics.map((item) => <button key={item.id} className={topic.id === item.id ? 'selected' : ''} onClick={() => editTopic(item)}><span><strong>{item.name_bn}</strong><small>{item.slug} • {item.specialty_ids.length} specialties</small></span><b className={item.is_active ? 'on' : 'off'}>{item.is_active ? 'Active' : 'Hidden'}</b></button>)}</div></section><form className="cms-editor" onSubmit={submitTopic}><EditorTitle icon={<Search />} title={topic.id ? 'Discovery topic edit' : 'নতুন Discovery topic'} /><div className="cms-topic-image-note"><Tags /><span><strong>Category image mapped Specialty থেকে আসে</strong><small>নিচের Mapped specialties থেকে প্রথম available specialty image public landing page-এ ব্যবহৃত হবে।</small></span></div><div className="cms-grid"><Field label="বাংলা নাম"><input required value={topic.name_bn} onChange={(e) => setTopic({ ...topic, name_bn: e.target.value })} /></Field><Field label="English name"><input value={topic.name_en || ''} onChange={(e) => setTopic({ ...topic, name_en: e.target.value || null })} /></Field></div><Field label="Slug"><input required value={topic.slug} onChange={(e) => setTopic({ ...topic, slug: e.target.value.toLowerCase() })} /></Field><Field label="বাংলা বিবরণ"><textarea rows={3} value={topic.description_bn || ''} onChange={(e) => setTopic({ ...topic, description_bn: e.target.value || null })} /></Field><Field label="Search keywords (কমা দিয়ে)"><textarea rows={2} value={keywords} onChange={(e) => setKeywords(e.target.value)} /></Field><Field label="Mapped specialties"><select multiple className="cms-multi" value={topic.specialty_ids.map(String)} onChange={(e: ChangeEvent<HTMLSelectElement>) => setTopic({ ...topic, specialty_ids: Array.from(e.target.selectedOptions).map((option) => Number(option.value)) })}>{data.specialties.map((item) => <option key={item.id} value={item.id}>{item.name_bn} — {item.name_en}</option>)}</select></Field><div className="cms-grid"><Field label="Sort order"><input type="number" min={0} value={topic.sort_order} onChange={(e) => setTopic({ ...topic, sort_order: Number(e.target.value) })} /></Field><Toggle checked={topic.is_active} onChange={(value) => setTopic({ ...topic, is_active: value })} label="Homepage-এ active" /></div><SaveButton saving={saving} /></form></div>}

  {tab === 'sections' && <div className="cms-workspace"><section className="cms-list"><header><div><h2>Homepage sections</h2><small>Order কম হলে আগে</small></div><button onClick={() => { setSection(blankSection()); setFilterJson('{}'); }}><Plus /> নতুন</button></header><div>{data.sections.map((item) => <button key={item.id} className={section.id === item.id ? 'selected' : ''} onClick={() => editSection(item)}><span><strong>{item.title_bn}</strong><small>{item.section_key} • {item.data_source} • order {item.sort_order}</small></span><b className={item.is_active ? 'on' : 'off'}>{item.is_active ? 'Shown' : 'Hidden'}</b></button>)}</div></section><form className="cms-editor" onSubmit={submitSection}><EditorTitle icon={<Layers3 />} title={section.id ? 'Homepage section edit' : 'নতুন Homepage section'} /><div className="cms-grid"><Field label="Section key"><input required value={section.section_key} onChange={(e) => setSection({ ...section, section_key: e.target.value.toLowerCase() })} /></Field><Field label="Data source"><select value={section.data_source} onChange={(e) => setSection({ ...section, data_source: e.target.value as AdminCmsSection['data_source'] })}>{['doctor', 'provider', 'ambulance', 'topic', 'custom'].map((item) => <option key={item}>{item}</option>)}</select></Field></div><div className="cms-grid"><Field label="বাংলা title"><input required value={section.title_bn} onChange={(e) => setSection({ ...section, title_bn: e.target.value })} /></Field><Field label="English title"><input value={section.title_en || ''} onChange={(e) => setSection({ ...section, title_en: e.target.value || null })} /></Field></div><Field label="বাংলা description"><textarea rows={2} value={section.description_bn || ''} onChange={(e) => setSection({ ...section, description_bn: e.target.value || null })} /></Field><Field label="Filter config (JSON object)"><textarea className="code-field" rows={6} value={filterJson} onChange={(e) => setFilterJson(e.target.value)} /></Field><div className="cms-grid"><Field label="View-all path"><input value={section.view_all_path || ''} onChange={(e) => setSection({ ...section, view_all_path: e.target.value || null })} /></Field><Field label="Card limit"><input type="number" min={1} max={30} value={section.card_limit} onChange={(e) => setSection({ ...section, card_limit: Number(e.target.value) })} /></Field></div><div className="cms-grid"><Field label="Sort order"><input type="number" min={0} value={section.sort_order} onChange={(e) => setSection({ ...section, sort_order: Number(e.target.value) })} /></Field><Toggle checked={section.is_active} onChange={(value) => setSection({ ...section, is_active: value })} label="Homepage-এ visible" /></div><SaveButton saving={saving} /></form></div>}

  {tab === 'banners' && <div className="cms-workspace"><section className="cms-list"><header><div><h2>Homepage banners</h2><small>{data.banners.length} records</small></div><button onClick={() => { setBanner(blankBanner()); setBannerFile(null); }}><Plus /> নতুন</button></header><div>{data.banners.map((item) => <button key={item.id} className={banner.id === item.id ? 'selected' : ''} onClick={() => { setBanner({ ...item }); setBannerFile(null); }}><span><strong>{item.title_bn}</strong><small>{item.district_id ? `District ${item.district_id}` : 'Platform-wide'} • order {item.sort_order}</small></span><b className={item.is_active ? 'on' : 'off'}>{item.is_active ? 'Active' : 'Hidden'}</b></button>)}</div></section><form className="cms-editor" onSubmit={submitBanner}><EditorTitle icon={<ImagePlus />} title={banner.id ? 'Banner edit' : 'নতুন Banner'} />{(bannerFile || banner.image_path) && <div className="cms-banner-preview"><img src={bannerFile ? URL.createObjectURL(bannerFile) : getImageUrl(banner.image_path) || ''} alt="Banner preview" /></div>}<label className="cms-file"><ImagePlus /> {bannerFile?.name || (banner.image_path ? 'নতুন image দিয়ে replace' : 'Banner image নির্বাচন')}<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={(e: ChangeEvent<HTMLInputElement>) => setBannerFile(e.target.files?.[0] || null)} /></label><small className="image-upload-hint">প্রস্তাবিত সাইজ: 1600×900 px • ছবি স্বয়ংক্রিয়ভাবে অপটিমাইজ হবে</small><div className="cms-grid"><Field label="বাংলা title"><input required value={banner.title_bn} onChange={(e) => setBanner({ ...banner, title_bn: e.target.value })} /></Field><Field label="English title"><input value={banner.title_en || ''} onChange={(e) => setBanner({ ...banner, title_en: e.target.value || null })} /></Field></div><div className="cms-grid"><Field label="বাংলা subtitle"><input value={banner.subtitle_bn || ''} onChange={(e) => setBanner({ ...banner, subtitle_bn: e.target.value || null })} /></Field><Field label="Image alt (বাংলা)"><input value={banner.image_alt_bn || ''} onChange={(e) => setBanner({ ...banner, image_alt_bn: e.target.value || null })} /></Field></div><div className="cms-grid"><Field label="Target URL/path"><input value={banner.target_url || ''} onChange={(e) => setBanner({ ...banner, target_url: e.target.value || null })} /></Field><Field label="District"><select value={banner.district_id ?? ''} onChange={(e) => setBanner({ ...banner, district_id: e.target.value ? Number(e.target.value) : null })}><option value="">Platform-wide</option>{districts.map((item) => <option key={item.id} value={item.id}>{item.name_bn}</option>)}</select></Field></div><div className="cms-grid"><Field label="Starts at"><input type="datetime-local" value={asLocalDate(banner.starts_at)} onChange={(e) => setBanner({ ...banner, starts_at: asIsoDate(e.target.value) })} /></Field><Field label="Ends at"><input type="datetime-local" value={asLocalDate(banner.ends_at)} onChange={(e) => setBanner({ ...banner, ends_at: asIsoDate(e.target.value) })} /></Field></div><div className="cms-grid"><Field label="Sort order"><input type="number" min={0} value={banner.sort_order} onChange={(e) => setBanner({ ...banner, sort_order: Number(e.target.value) })} /></Field><Toggle checked={banner.is_active} onChange={(value) => setBanner({ ...banner, is_active: value })} label="Publicly active" /></div><SaveButton saving={saving} /></form></div>}

  {tab === 'prescription' && <section className="cms-editor cms-prescription-footer-editor"><EditorTitle icon={<FileText />} title="Prescription Footer" /><p className="cms-help">এই text সব Doctor-এর নতুন Prescription PDF-এর footer-এ automatically ব্যবহার হবে। Doctor এটি edit করতে পারবে না। বাংলা, English অথবা mixed text ব্যবহার করা যাবে।</p><form onSubmit={submitPrescriptionFooter}><Field label="Prescription Footer"><textarea rows={7} maxLength={500} value={prescriptionFooter} onChange={(e) => setPrescriptionFooter(e.target.value)} placeholder="Generated from docbd.info • Please follow the doctor’s instructions." /></Field><div className="cms-footer-meta"><span>{prescriptionFooter.length}/500 characters</span><span>PDF-এ long text automatically wrap হবে।</span></div><SaveButton saving={saving} /></form></section>}
  {tab === 'content' && <div className="cms-content-grid"><section className="cms-editor cms-content-editor"><EditorTitle icon={<FileText />} title="Bilingual content pages" /><div className="cms-choice-row">{data.pages.map((item) => <button type="button" key={item.slug} className={page?.slug === item.slug ? 'active' : ''} onClick={() => selectPage(item)}>{item.slug}<b>{item.is_published ? 'Live' : 'Draft'}</b></button>)}</div>{page && <form onSubmit={submitPage}><div className="cms-grid"><Field label="বাংলা title"><input required value={page.title_bn} onChange={(e) => setPage({ ...page, title_bn: e.target.value })} /></Field><Field label="English title"><input value={page.title_en || ''} onChange={(e) => setPage({ ...page, title_en: e.target.value || null })} /></Field></div><Field label="বাংলা content"><textarea rows={10} value={page.body_bn} onChange={(e) => setPage({ ...page, body_bn: e.target.value })} /></Field><Field label="English content"><textarea rows={7} value={page.body_en || ''} onChange={(e) => setPage({ ...page, body_en: e.target.value || null })} /></Field><div className="cms-grid"><Field label="SEO title"><input value={page.seo_title || ''} onChange={(e) => setPage({ ...page, seo_title: e.target.value || null })} /></Field><Field label="Meta description"><input value={page.meta_description || ''} onChange={(e) => setPage({ ...page, meta_description: e.target.value || null })} /></Field></div><Toggle checked={page.is_published} onChange={(value) => setPage({ ...page, is_published: value })} label="Publicly published" /><SaveButton saving={saving} /></form>}</section><section className="cms-editor cms-setting-editor"><EditorTitle icon={<Settings2 />} title="Public site settings" /><div className="cms-choice-row settings">{data.settings.map((item) => <button type="button" key={item.setting_key} className={setting?.setting_key === item.setting_key ? 'active' : ''} onClick={() => selectSetting(item)}>{item.setting_key}</button>)}</div>{setting && <form onSubmit={submitSetting}><p className="cms-help">{setting.description}</p><Field label="JSON object"><textarea className="code-field" rows={13} value={settingJson} onChange={(e) => setSettingJson(e.target.value)} /></Field><Toggle checked={setting.is_public} onChange={(value) => setSetting({ ...setting, is_public: value })} label="Homepage API-তে public" /><SaveButton saving={saving} /></form>}</section></div>}
  </>}</main></div>;
}

function EditorTitle({ icon, title }: { icon: React.ReactNode; title: string }) { return <header className="cms-editor-title"><span>{icon}</span><div><h2>{title}</h2><small>Save করলে audit log তৈরি হবে</small></div></header>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="cms-field"><span>{label}</span>{children}</label>; }
function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) { return <label className="cms-toggle"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span></span>{label}</label>; }
function SaveButton({ saving }: { saving: boolean }) { return <button className="cms-save" disabled={saving}>{saving ? <LoaderCircle className="spin" /> : <><Save /> সংরক্ষণ করুন</>}</button>; }
