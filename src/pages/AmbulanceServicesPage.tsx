import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { Ambulance, ArrowLeft, CheckCircle2, Clock3, FileCheck2, FilePlus2, LoaderCircle, LocateFixed, MapPin, Save, ShieldAlert, Trash2 } from 'lucide-react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { deleteAmbulanceDocument, getAmbulanceDocumentUrl, getMyAmbulanceDocuments, getMyAmbulanceServices, saveMyAmbulanceService, setMyAmbulanceAvailability, uploadAmbulanceDocument } from '../services/ambulanceDashboard';
import { getDistricts, getUpazilas } from '../services/discovery';
import type { AmbulanceDocument, AmbulanceDocumentType, AmbulanceVehicleType, District, MyAmbulanceService, Upazila } from '../types';

interface FormState { operatorName: string; driverName: string; phone: string; secondaryPhone: string; vehicleRegistrationNo: string; vehicleType: AmbulanceVehicleType; capabilities: string[]; serviceArea: string; address: string; districtId: number | null; upazilaId: number | null; latitude: number | null; longitude: number | null; priceNote: string; operates24Hours: boolean }
const emptyForm: FormState = { operatorName: '', driverName: '', phone: '', secondaryPhone: '', vehicleRegistrationNo: '', vehicleType: 'basic', capabilities: [], serviceArea: '', address: '', districtId: null, upazilaId: null, latitude: null, longitude: null, priceNote: '', operates24Hours: false };
const capabilityOptions = ['Oxygen', 'Stretcher', 'Wheelchair', 'ICU support', 'Cardiac monitor', 'Ventilator', 'Freezer', 'Female attendant'];
const vehicleLabels: Record<AmbulanceVehicleType, string> = { ac: 'AC Ambulance', non_ac: 'Non-AC Ambulance', icu: 'ICU Ambulance', freezer: 'Freezer Van', basic: 'Basic Ambulance', other: 'Other' };
const statusLabels = { pending: 'Verification অপেক্ষমাণ', approved: 'অনুমোদিত', rejected: 'প্রত্যাখ্যাত', suspended: 'স্থগিত' };
const documentLabels: Record<AmbulanceDocumentType, string> = { vehicle_registration: 'গাড়ির registration', driver_license: 'Driver license', national_id: 'জাতীয় পরিচয়পত্র', organization_document: 'প্রতিষ্ঠানের document', vehicle_photo: 'গাড়ির ছবি', other: 'অন্যান্য' };
const messageFrom = (error: unknown) => error instanceof Error ? error.message : 'কাজটি সম্পন্ন করা যায়নি।';

export default function AmbulanceServicesPage() {
  const { account, refreshAccount } = useAuth();
  const [service, setService] = useState<MyAmbulanceService | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [districts, setDistricts] = useState<District[]>([]);
  const [upazilas, setUpazilas] = useState<Upazila[]>([]);
  const [documents, setDocuments] = useState<AmbulanceDocument[]>([]);
  const [documentType, setDocumentType] = useState<AmbulanceDocumentType>('vehicle_registration');
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const fillForm = (item: MyAmbulanceService) => setForm({ operatorName: item.operator_name, driverName: item.driver_name || '', phone: item.phone, secondaryPhone: item.secondary_phone || '', vehicleRegistrationNo: item.vehicle_registration_no, vehicleType: item.vehicle_type, capabilities: item.capabilities || [], serviceArea: item.service_area || '', address: item.address, districtId: item.district_id, upazilaId: item.upazila_id, latitude: item.latitude, longitude: item.longitude, priceNote: item.price_note || '', operates24Hours: item.operates_24_hours });

  const load = async () => {
    setLoading(true);
    try {
      const [services, districtRows] = await Promise.all([getMyAmbulanceServices(), getDistricts()]);
      const first = services[0] || null; setService(first); setDistricts(districtRows);
      if (first) { fillForm(first); setDocuments(await getMyAmbulanceDocuments(first.ambulance_id)); }
      else { setForm(emptyForm); setDocuments([]); }
    } catch (loadError) { setError(messageFrom(loadError)); } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  useEffect(() => { if (!form.districtId) { setUpazilas([]); return; } getUpazilas(form.districtId).then(setUpazilas).catch(() => setError('উপজেলার তালিকা লোড করা যায়নি।')); }, [form.districtId]);
  if (account && account.role !== 'ambulance') return <Navigate to="/dashboard" replace />;

  function set<K extends keyof FormState>(key: K, value: FormState[K]) { setForm((current) => ({ ...current, [key]: value })); }
  function toggleCapability(value: string) { set('capabilities', form.capabilities.includes(value) ? form.capabilities.filter((item) => item !== value) : [...form.capabilities, value]); }

  function captureLocation(onSuccess?: (position: GeolocationPosition) => void) {
    if (!navigator.geolocation) { setError('এই browser-এ location support নেই।'); return; }
    setWorking('location'); setError(null);
    navigator.geolocation.getCurrentPosition((position) => {
      set('latitude', position.coords.latitude); set('longitude', position.coords.longitude);
      setNotice('GPS location নেওয়া হয়েছে।'); setWorking(null); onSuccess?.(position);
    }, () => { setError('Location permission পাওয়া যায়নি।'); setWorking(null); }, { enableHighAccuracy: true, timeout: 12000 });
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setWorking('save'); setError(null); setNotice(null);
    try {
      const result = await saveMyAmbulanceService({ ambulanceId: service?.ambulance_id || null, operatorName: form.operatorName, phone: form.phone, vehicleRegistrationNo: form.vehicleRegistrationNo, vehicleType: form.vehicleType, address: form.address, driverName: form.driverName || null, secondaryPhone: form.secondaryPhone || null, capabilities: form.capabilities, serviceArea: form.serviceArea || null, districtId: form.districtId, upazilaId: form.upazilaId, latitude: form.latitude, longitude: form.longitude, priceNote: form.priceNote || null, operates24Hours: form.operates24Hours });
      await refreshAccount(); await load();
      setNotice(result.verification_reset ? 'তথ্য সংরক্ষিত হয়েছে। নিরাপত্তার জন্য verification আবার pending এবং availability বন্ধ হয়েছে।' : 'Ambulance listing তৈরি হয়েছে। Document দিয়ে verification সম্পন্ন করুন।');
    } catch (saveError) { setError(messageFrom(saveError)); } finally { setWorking(null); }
  }

  async function availability(next: boolean, withGps = false) {
    if (!service) return;
    const execute = async (latitude: number | null, longitude: number | null, accuracy: number | null) => {
      setWorking('availability'); setError(null);
      try { await setMyAmbulanceAvailability({ ambulanceId: service.ambulance_id, available: next, latitude, longitude, accuracy }); await load(); setNotice(next ? 'Ambulance এখন public search-এ available দেখাবে।' : 'Availability বন্ধ হয়েছে।'); }
      catch (availabilityError) { setError(messageFrom(availabilityError)); } finally { setWorking(null); }
    };
    if (withGps) captureLocation((position) => { void execute(position.coords.latitude, position.coords.longitude, position.coords.accuracy); });
    else await execute(null, null, null);
  }

  async function uploadDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!service || !documentFile) return;
    setWorking('document'); setError(null);
    try { await uploadAmbulanceDocument({ ambulanceId: service.ambulance_id, documentType, file: documentFile }); setDocumentFile(null); await load(); setNotice('Private verification document upload হয়েছে।'); }
    catch (uploadError) { setError(messageFrom(uploadError)); } finally { setWorking(null); }
  }

  async function openDocument(item: AmbulanceDocument) {
    setWorking(item.document_id); setError(null);
    try { window.open(await getAmbulanceDocumentUrl(item.storage_path), '_blank', 'noopener,noreferrer'); }
    catch (openError) { setError(messageFrom(openError)); } finally { setWorking(null); }
  }

  async function removeDocument(item: AmbulanceDocument) {
    if (!window.confirm('Document স্থায়ীভাবে মুছে ফেলতে চান?')) return;
    setWorking(item.document_id); setError(null);
    try { await deleteAmbulanceDocument(item.document_id); await load(); setNotice('Document মুছে ফেলা হয়েছে।'); }
    catch (deleteError) { setError(messageFrom(deleteError)); } finally { setWorking(null); }
  }

  const canEditDocuments = !service || ['pending', 'rejected'].includes(service.status);

  return <div className="app-shell ambulance-dashboard-page"><main className="ambulance-dashboard-main container"><Link className="back-link" to="/dashboard"><ArrowLeft /> Dashboard-এ ফিরুন</Link><div className="ambulance-page-heading"><span><Ambulance /></span><div><small>Emergency service owner</small><h1>Ambulance service</h1><p>গাড়ি, যোগাযোগ, verification documents এবং live availability পরিচালনা করুন।</p></div></div>{error && <div className="error-box" role="alert">{error}</div>}{notice && <div className="auth-message success">{notice}</div>}{loading ? <div className="loading-box"><LoaderCircle className="spin" /> Service লোড হচ্ছে…</div> : <>{service && <section className={`ambulance-status-card ${service.status}`}><div>{service.status === 'approved' ? <CheckCircle2 /> : <ShieldAlert />}<span><strong>{statusLabels[service.status]}</strong><small>{service.verified ? `Verified ${service.verified_at ? new Intl.DateTimeFormat('bn-BD', { dateStyle: 'medium' }).format(new Date(service.verified_at)) : ''}` : 'Approve না হওয়া পর্যন্ত public listing-এ আসবে না'}</small></span></div>{service.admin_note && <p><b>Review note:</b> {service.admin_note}</p>}</section>}{service?.status === 'approved' && <section className="ambulance-availability-card"><div><span className={service.is_available ? 'online' : 'offline'}><Ambulance /></span><div><h2>{service.is_available ? 'এখন Available' : 'এখন Offline'}</h2><p>{service.last_seen_at ? `শেষ update: ${new Intl.DateTimeFormat('bn-BD', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(service.last_seen_at))}` : 'এখনো availability update হয়নি'}</p></div></div><div><button disabled={working === 'availability'} onClick={() => void availability(!service.is_available)}>{service.is_available ? 'Offline করুন' : 'Available করুন'}</button><button className="gps" disabled={working === 'location' || working === 'availability'} onClick={() => void availability(true, true)}><LocateFixed /> GPS সহ Available</button></div></section>}<form className="ambulance-profile-form" onSubmit={save}><section><h2>Operator ও গাড়ির তথ্য</h2>{service && <p className="edit-warning">যেকোনো profile edit verification আবার pending করবে এবং availability বন্ধ হবে।</p>}<div className="patient-form-grid"><label className="auth-field"><span>Operator/Service নাম</span><div><input required minLength={2} value={form.operatorName} onChange={(event) => set('operatorName', event.target.value)} /></div></label><label className="auth-field"><span>Driver নাম</span><div><input value={form.driverName} onChange={(event) => set('driverName', event.target.value)} /></div></label><label className="auth-field"><span>প্রধান ফোন</span><div><input required inputMode="tel" value={form.phone} onChange={(event) => set('phone', event.target.value)} /></div></label><label className="auth-field"><span>বিকল্প ফোন</span><div><input inputMode="tel" value={form.secondaryPhone} onChange={(event) => set('secondaryPhone', event.target.value)} /></div></label><label className="auth-field"><span>গাড়ির registration</span><div><input required value={form.vehicleRegistrationNo} onChange={(event) => set('vehicleRegistrationNo', event.target.value)} /></div></label><label className="auth-field"><span>গাড়ির ধরন</span><div><select value={form.vehicleType} onChange={(event) => set('vehicleType', event.target.value as AmbulanceVehicleType)}>{Object.entries(vehicleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div></label></div><fieldset className="ambulance-capabilities"><legend>সুবিধাসমূহ</legend>{capabilityOptions.map((option) => <label className={form.capabilities.includes(option) ? 'selected' : ''} key={option}><input type="checkbox" checked={form.capabilities.includes(option)} onChange={() => toggleCapability(option)} />{option}</label>)}</fieldset><label className="ambulance-24h"><input type="checkbox" checked={form.operates24Hours} onChange={(event) => set('operates24Hours', event.target.checked)} /><Clock3 /> ২৪ ঘণ্টা সেবা</label></section><section><h2>Service area ও location</h2><label className="ambulance-text-field"><span>বিস্তারিত ঠিকানা</span><textarea required minLength={3} rows={3} value={form.address} onChange={(event) => set('address', event.target.value)} /></label><div className="patient-form-grid"><label className="auth-field"><span>জেলা</span><div><MapPin /><select value={form.districtId ?? ''} onChange={(event) => { set('districtId', event.target.value ? Number(event.target.value) : null); set('upazilaId', null); }}><option value="">নির্বাচন করুন</option>{districts.map((district) => <option key={district.id} value={district.id}>{district.name_bn}</option>)}</select></div></label><label className="auth-field"><span>উপজেলা</span><div><MapPin /><select disabled={!form.districtId} value={form.upazilaId ?? ''} onChange={(event) => set('upazilaId', event.target.value ? Number(event.target.value) : null)}><option value="">নির্বাচন করুন</option>{upazilas.map((upazila) => <option key={upazila.id} value={upazila.id}>{upazila.name_bn}</option>)}</select></div></label><label className="auth-field"><span>Service area</span><div><input value={form.serviceArea} onChange={(event) => set('serviceArea', event.target.value)} /></div></label><label className="auth-field"><span>ভাড়া সম্পর্কে</span><div><input value={form.priceNote} onChange={(event) => set('priceNote', event.target.value)} placeholder="আলোচনা সাপেক্ষে" /></div></label><label className="auth-field"><span>Latitude</span><div><input type="number" step="any" value={form.latitude ?? ''} onChange={(event) => set('latitude', event.target.value ? Number(event.target.value) : null)} /></div></label><label className="auth-field"><span>Longitude</span><div><input type="number" step="any" value={form.longitude ?? ''} onChange={(event) => set('longitude', event.target.value ? Number(event.target.value) : null)} /></div></label></div><button className="location-capture" type="button" disabled={working === 'location'} onClick={() => captureLocation()}><LocateFixed /> {working === 'location' ? 'Location নেওয়া হচ্ছে…' : 'বর্তমান GPS location নিন'}</button></section><button className="auth-submit ambulance-save" disabled={working === 'save'}>{working === 'save' ? <LoaderCircle className="spin" /> : <><Save /> {service ? 'তথ্য update করুন' : 'Listing তৈরি করুন'}</>}</button></form>{service && <section className="ambulance-documents"><div className="section-title"><div><h2>Verification documents</h2><p>Private bucket-এ নিরাপদে রাখা হয়; শুধু owner ও verification staff দেখতে পারবেন।</p></div><b>{documents.length} files</b></div>{canEditDocuments && <form onSubmit={uploadDocument}><select value={documentType} onChange={(event) => setDocumentType(event.target.value as AmbulanceDocumentType)}>{Object.entries(documentLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><label><FilePlus2 /> {documentFile?.name || 'ফাইল নির্বাচন'}<input type="file" required accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event: ChangeEvent<HTMLInputElement>) => setDocumentFile(event.target.files?.[0] || null)} /></label><button disabled={!documentFile || working === 'document'}>{working === 'document' ? <LoaderCircle className="spin" /> : 'Upload'}</button></form>} {!canEditDocuments && <p className="documents-locked">Approved অবস্থায় documents locked। তথ্য update করলে re-verification-এর সময় পরিবর্তন করতে পারবেন।</p>}<div className="document-list">{documents.map((item) => <article key={item.document_id}><FileCheck2 /><div><strong>{documentLabels[item.document_type]}</strong><small>{new Intl.DateTimeFormat('bn-BD', { dateStyle: 'medium' }).format(new Date(item.created_at))}</small></div><button disabled={working === item.document_id} onClick={() => void openDocument(item)}>দেখুন</button>{canEditDocuments && <button className="delete" disabled={working === item.document_id} onClick={() => void removeDocument(item)}><Trash2 /></button>}</article>)}{!documents.length && <p className="empty-inline">এখনো কোনো document upload হয়নি।</p>}</div></section>}</>}</main></div>;
}
