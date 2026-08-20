import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BadgeCheck, Camera, LoaderCircle, MapPin, Save, ShieldAlert, Stethoscope } from 'lucide-react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getImageUrl } from '../lib/storage';
import { cleanupDoctorPhoto, getMyDoctorProfile, updateMyDoctorProfile, uploadDoctorPhoto } from '../services/doctorDashboard';
import { getDistricts, getSpecialties, getUpazilas } from '../services/discovery';
import type { District, MyDoctorProfile, Specialty, Upazila } from '../types';

const statusLabels = { pending: 'যাচাই অপেক্ষমাণ', approved: 'অনুমোদিত', rejected: 'প্রত্যাখ্যাত', expired: 'মেয়াদ শেষ' };
const messageFrom = (error: unknown) => error instanceof Error ? error.message : 'ডাক্তার প্রোফাইল সংরক্ষণ করা যায়নি।';

export default function DoctorProfessionalProfilePage() {
  const { account, user, refreshAccount } = useAuth();
  const [profile, setProfile] = useState<MyDoctorProfile | null>(null);
  const [districts, setDistricts] = useState<District[]>([]);
  const [upazilas, setUpazilas] = useState<Upazila[]>([]);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [languages, setLanguages] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getMyDoctorProfile(), getDistricts(), getSpecialties()])
      .then(([doctorProfile, districtRows, specialtyRows]) => {
        setProfile(doctorProfile);
        setDistricts(districtRows);
        setSpecialties(specialtyRows);
        setLanguages(doctorProfile?.doctor.languages?.join(', ') || '');
      })
      .catch((loadError: unknown) => setError(messageFrom(loadError)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const districtId = profile?.doctor.district_id;
    if (!districtId) { setUpazilas([]); return; }
    getUpazilas(districtId).then(setUpazilas).catch(() => setError('উপজেলা / এলাকার তালিকা লোড করা যায়নি।'));
  }, [profile?.doctor.district_id]);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const avatarUrl = useMemo(() => preview || getImageUrl(profile?.doctor.profile_photo_url, 'avatars'), [preview, profile?.doctor.profile_photo_url]);

  if (account && account.role !== 'doctor') return <Navigate to="/dashboard" replace />;

  function setDoctor<K extends keyof MyDoctorProfile['doctor']>(key: K, value: MyDoctorProfile['doctor'][K]) {
    setProfile((current) => current ? { ...current, doctor: { ...current.doctor, [key]: value } } : current);
  }

  function toggleSpecialty(id: number) {
    setProfile((current) => current ? {
      ...current,
      specialty_ids: current.specialty_ids.includes(id)
        ? current.specialty_ids.filter((specialtyId) => specialtyId !== id)
        : [...current.specialty_ids, id],
    } : current);
  }

  function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] || null;
    if (!file) return;
    setPhoto(file);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(file));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile || !user) return;
    if (!profile.specialty_ids.length) { setError('কমপক্ষে একটি বিশেষত্ব নির্বাচন করুন।'); return; }
    setSaving(true); setError(null); setNotice(null);
    const previousPhotoPath = profile.doctor.profile_photo_url;
    let uploadedPhotoPath: string | null = null;
    try {
      let photoPath = previousPhotoPath;
      if (photo) { uploadedPhotoPath = await uploadDoctorPhoto(photo, user.id); photoPath = uploadedPhotoPath; }
      const result = await updateMyDoctorProfile({
        fullName: profile.doctor.full_name || '',
        phone: profile.doctor.phone,
        professionalTitle: profile.doctor.professional_title,
        degree: profile.doctor.degree,
        designation: profile.doctor.designation,
        bmdcRegistrationNo: profile.doctor.bmdc_registration_no,
        bio: profile.doctor.bio,
        consultationFee: profile.doctor.consultation_fee,
        experienceYears: profile.doctor.experience_years,
        profileHeadline: profile.doctor.profile_headline,
        profilePhotoUrl: photoPath,
        consultationNote: profile.doctor.consultation_note,
        languages: languages.split(',').map((language) => language.trim()).filter(Boolean),
        acceptingAppointments: profile.doctor.accepting_appointments,
        districtId: profile.doctor.district_id,
        upazilaId: profile.doctor.upazila_id,
        specialtyIds: profile.specialty_ids,
      });
      setProfile((current) => current ? { ...current, doctor: { ...current.doctor, profile_photo_url: photoPath, verification_status: result.verification_status } } : current);
      if (uploadedPhotoPath && previousPhotoPath && previousPhotoPath !== uploadedPhotoPath) await cleanupDoctorPhoto(previousPhotoPath).catch(() => undefined);
      setPhoto(null); setPreview(null);
      await refreshAccount();
      setNotice(result.credentials_changed ? 'প্রোফাইল সংরক্ষিত হয়েছে। পেশাগত তথ্য বদলানোর কারণে পুনরায় verification প্রয়োজন।' : 'ডাক্তার প্রোফাইল সফলভাবে সংরক্ষণ হয়েছে।');
    } catch (saveError) { if (uploadedPhotoPath) await cleanupDoctorPhoto(uploadedPhotoPath).catch(() => undefined); setError(messageFrom(saveError)); } finally { setSaving(false); }
  }

  return <div className="app-shell doctor-dashboard-page"><main className="doctor-dashboard-main container"><Link className="back-link" to="/dashboard"><ArrowLeft /> Dashboard-এ ফিরুন</Link><div className="doctor-page-heading"><span><Stethoscope /></span><div><small>Doctor self-service</small><h1>পেশাগত প্রোফাইল</h1><p>Public directory-তে দেখানো তথ্য ও appointment preference পরিচালনা করুন।</p></div></div>{loading ? <div className="loading-box"><LoaderCircle className="spin" /> প্রোফাইল লোড হচ্ছে…</div> : !profile ? <div className="error-box">ডাক্তার প্রোফাইল পাওয়া যায়নি।</div> : <form className="doctor-profile-form" onSubmit={submit}><section className={`verification-banner ${profile.doctor.verification_status}`}><div>{profile.doctor.verification_status === 'approved' ? <BadgeCheck /> : <ShieldAlert />}<span><strong>{statusLabels[profile.doctor.verification_status]}</strong><small>{profile.doctor.bmdc_verified ? 'BMDC তথ্য যাচাইকৃত' : 'BMDC verification এখনো সম্পন্ন হয়নি'}</small></span></div><p>Degree, designation বা BMDC নম্বর পরিবর্তন করলে status আবার pending হবে।</p></section><div className="doctor-form-layout"><aside className="doctor-photo-card"><div className="doctor-photo-preview">{avatarUrl ? <img src={avatarUrl} alt="ডাক্তার প্রোফাইল" width="800" height="800" decoding="async" /> : <Stethoscope />}</div><label><Camera /> ছবি পরিবর্তন<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={choosePhoto} /></label><small className="image-upload-hint">প্রস্তাবিত সাইজ: 800×800 px • সর্বোচ্চ 3 MB • আপলোডের পর ছবি স্বয়ংক্রিয়ভাবে অপটিমাইজ হবে</small><label className="accepting-toggle"><input type="checkbox" checked={profile.doctor.accepting_appointments} onChange={(event) => setDoctor('accepting_appointments', event.target.checked)} /><span><strong>Appointment নিচ্ছি</strong><small>বন্ধ করলে নতুন booking request আসবে না</small></span></label></aside><div className="doctor-form-sections"><section><h2>ব্যক্তিগত ও অবস্থান</h2><div className="patient-form-grid"><label className="auth-field"><span>পূর্ণ নাম</span><div><input required minLength={2} value={profile.doctor.full_name || ''} onChange={(event) => setDoctor('full_name', event.target.value)} /></div></label><label className="auth-field"><span>ইমেইল</span><div><input disabled value={profile.doctor.email || ''} /></div></label><label className="auth-field"><span>মোবাইল নম্বর</span><div><input inputMode="tel" value={profile.doctor.phone || ''} onChange={(event) => setDoctor('phone', event.target.value)} /></div></label><label className="auth-field"><span>Professional title</span><div><input value={profile.doctor.professional_title || ''} onChange={(event) => setDoctor('professional_title', event.target.value)} placeholder="যেমন: হৃদরোগ বিশেষজ্ঞ" /></div></label><label className="auth-field"><span>জেলা</span><div><MapPin /><select value={profile.doctor.district_id ?? ''} onChange={(event) => { setDoctor('district_id', event.target.value ? Number(event.target.value) : null); setDoctor('upazila_id', null); }}><option value="">নির্বাচন করুন</option>{districts.map((district) => <option key={district.id} value={district.id}>{district.name_bn}</option>)}</select></div></label><label className="auth-field"><span>উপজেলা / এলাকা</span><div><MapPin /><select disabled={!profile.doctor.district_id} value={profile.doctor.upazila_id ?? ''} onChange={(event) => setDoctor('upazila_id', event.target.value ? Number(event.target.value) : null)}><option value="">নির্বাচন করুন</option>{upazilas.map((upazila) => <option key={upazila.id} value={upazila.id}>{upazila.name_bn}</option>)}</select></div></label></div></section><section><h2>Credential ও বিশেষত্ব</h2><div className="patient-form-grid"><label className="auth-field"><span>ডিগ্রি</span><div><input value={profile.doctor.degree || ''} onChange={(event) => setDoctor('degree', event.target.value)} placeholder="MBBS, FCPS" /></div></label><label className="auth-field"><span>পদবি / Designation</span><div><input value={profile.doctor.designation || ''} onChange={(event) => setDoctor('designation', event.target.value)} /></div></label><label className="auth-field"><span>BMDC registration</span><div><input value={profile.doctor.bmdc_registration_no || ''} onChange={(event) => setDoctor('bmdc_registration_no', event.target.value)} /></div></label><label className="auth-field"><span>অভিজ্ঞতা (বছর)</span><div><input type="number" min="0" max="80" value={profile.doctor.experience_years ?? ''} onChange={(event) => setDoctor('experience_years', event.target.value ? Number(event.target.value) : null)} /></div></label><label className="auth-field"><span>ভিজিট ফি (৳)</span><div><input type="number" min="0" step="1" value={profile.doctor.consultation_fee ?? ''} onChange={(event) => setDoctor('consultation_fee', event.target.value ? Number(event.target.value) : null)} /></div></label><label className="auth-field"><span>ভাষা <small>কমা দিয়ে লিখুন</small></span><div><input value={languages} onChange={(event) => setLanguages(event.target.value)} placeholder="বাংলা, English" /></div></label></div><fieldset className="specialty-picker"><legend>বিশেষত্ব (কমপক্ষে একটি)</legend>{specialties.map((specialty) => <label className={profile.specialty_ids.includes(specialty.id) ? 'selected' : ''} key={specialty.id}><input type="checkbox" checked={profile.specialty_ids.includes(specialty.id)} onChange={() => toggleSpecialty(specialty.id)} /><span>{specialty.name_bn}</span></label>)}</fieldset></section><section><h2>Public profile details</h2><label className="doctor-text-field"><span>Profile headline</span><input maxLength={180} value={profile.doctor.profile_headline || ''} onChange={(event) => setDoctor('profile_headline', event.target.value)} /></label><label className="doctor-text-field"><span>নিজের সম্পর্কে</span><textarea rows={6} maxLength={4000} value={profile.doctor.bio || ''} onChange={(event) => setDoctor('bio', event.target.value)} /></label><label className="doctor-text-field"><span>Consultation note</span><textarea rows={3} value={profile.doctor.consultation_note || ''} onChange={(event) => setDoctor('consultation_note', event.target.value)} placeholder="রোগী আসার আগে যা জানবেন" /></label></section>{error && <div className="auth-message error" role="alert">{error}</div>}{notice && <div className="auth-message success">{notice}</div>}<button className="auth-submit doctor-save" type="submit" disabled={saving}>{saving ? <LoaderCircle className="spin" /> : <><Save /> প্রোফাইল সংরক্ষণ করুন</>}</button></div></div></form>}</main></div>;
}
