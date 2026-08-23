import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BadgeCheck, Camera, GraduationCap, LoaderCircle, MapPin, Save, ShieldAlert, Stethoscope } from 'lucide-react';
import { Link, Navigate } from 'react-router-dom';
import PrescriptionAdviceTemplatesManager from '../components/PrescriptionAdviceTemplatesManager';
import { useAuth } from '../contexts/AuthContext';
import { getImageUrl } from '../lib/storage';
import {
  cleanupDoctorPhoto,
  getMyDoctorPrivateProfile,
  getMyDoctorProfile,
  updateMyDoctorPrivateProfile,
  updateMyDoctorProfile,
  uploadDoctorPhoto,
  type DoctorPrivateProfile,
} from '../services/doctorDashboard';
import { getDistricts, getSpecialties, getUpazilas } from '../services/discovery';
import { getMyDoctorVerificationProfile } from '../services/verification';
import type { District, DoctorVerificationProfile, MyDoctorProfile, Specialty, Upazila } from '../types';

const statusLabels: Record<MyDoctorProfile['doctor']['verification_status'], string> = {
  pending: 'যাচাই অপেক্ষমাণ',
  approved: 'অনুমোদিত',
  rejected: 'প্রত্যাখ্যাত',
  expired: 'মেয়াদ শেষ',
};
const bloodGroups = ['', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const emptyPrivateProfile: DoctorPrivateProfile = { date_of_birth: null, gender: null, blood_group: null, address_line: null, permanent_address: null };
const messageFrom = (error: unknown) => error instanceof Error ? error.message : typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string' ? error.message : 'ডাক্তার প্রোফাইল সংরক্ষণ করা যায়নি।';

export default function DoctorProfessionalProfilePage() {
  const { account, user, refreshAccount } = useAuth();
  const [profile, setProfile] = useState<MyDoctorProfile | null>(null);
  const [privateProfile, setPrivateProfile] = useState<DoctorPrivateProfile>(emptyPrivateProfile);
  const [verificationProfile, setVerificationProfile] = useState<DoctorVerificationProfile | null>(null);
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
    Promise.all([
      getMyDoctorProfile(),
      getMyDoctorPrivateProfile(),
      getMyDoctorVerificationProfile(),
      getDistricts(),
      getSpecialties(),
    ])
      .then(([doctorProfile, privateDetails, verificationDetails, districtRows, specialtyRows]) => {
        setProfile(doctorProfile);
        setPrivateProfile(privateDetails);
        setVerificationProfile(verificationDetails);
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

  const avatarUrl = useMemo(
    () => preview || getImageUrl(profile?.doctor.profile_photo_url, 'avatars'),
    [preview, profile?.doctor.profile_photo_url],
  );

  const age = useMemo(() => {
    if (!privateProfile.date_of_birth) return '';
    const dob = new Date(`${privateProfile.date_of_birth}T00:00:00`);
    if (Number.isNaN(dob.getTime())) return '';
    const now = new Date();
    let years = now.getFullYear() - dob.getFullYear();
    const beforeBirthday = now.getMonth() < dob.getMonth() || (now.getMonth() === dob.getMonth() && now.getDate() < dob.getDate());
    if (beforeBirthday) years -= 1;
    return years >= 0 ? String(years) : '';
  }, [privateProfile.date_of_birth]);

  if (account && account.role !== 'doctor') return <Navigate to="/dashboard" replace />;

  function setDoctor<K extends keyof MyDoctorProfile['doctor']>(key: K, value: MyDoctorProfile['doctor'][K]) {
    setProfile((current) => current ? { ...current, doctor: { ...current.doctor, [key]: value } } : current);
  }

  function setPrivate<K extends keyof DoctorPrivateProfile>(key: K, value: DoctorPrivateProfile[K]) {
    setPrivateProfile((current) => ({ ...current, [key]: value }));
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
    if (privateProfile.date_of_birth && privateProfile.date_of_birth > new Date().toISOString().slice(0, 10)) {
      setError('জন্মতারিখ ভবিষ্যতের হতে পারবে না।');
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);
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
      }).catch(async (profileUpdateError) => {
        if (uploadedPhotoPath) await cleanupDoctorPhoto(uploadedPhotoPath).catch(() => undefined);
        throw profileUpdateError;
      });

      await updateMyDoctorPrivateProfile(privateProfile);
      const [refreshedProfile, refreshedPrivate, refreshedVerification] = await Promise.all([
        getMyDoctorProfile(),
        getMyDoctorPrivateProfile(),
        getMyDoctorVerificationProfile(),
      ]);
      if (refreshedProfile) setProfile(refreshedProfile);
      setPrivateProfile(refreshedPrivate);
      setVerificationProfile(refreshedVerification);

      if (uploadedPhotoPath && previousPhotoPath && previousPhotoPath !== uploadedPhotoPath) {
        await cleanupDoctorPhoto(previousPhotoPath).catch(() => undefined);
      }
      setPhoto(null);
      setPreview(null);
      await refreshAccount();
      setNotice(result.credentials_changed
        ? 'প্রোফাইল সংরক্ষিত হয়েছে। পরিবর্তিত credential এখন draft; Verification Application থেকে Apply/Re-Apply করুন।'
        : 'My Profile সফলভাবে সংরক্ষণ হয়েছে।');
    } catch (saveError) {
      setError(messageFrom(saveError));
    } finally {
      setSaving(false);
    }
  }

  return <div className="app-shell doctor-dashboard-page"><main className="doctor-dashboard-main container">
    <Link className="back-link" to="/doctor/appointments"><ArrowLeft /> Appointment Management-এ ফিরুন</Link>
    <div className="doctor-page-heading"><span><Stethoscope /></span><div><small>Doctor self-service</small><h1>My Profile</h1><p>Personal Information, Study Information, phone, address এবং existing account-level doctor information পরিচালনা করুন।</p></div></div>

    {loading ? <div className="loading-box"><LoaderCircle className="spin" /> প্রোফাইল লোড হচ্ছে…</div> : !profile ? <div className="error-box">ডাক্তার প্রোফাইল পাওয়া যায়নি।</div> : <form className="doctor-profile-form" onSubmit={submit}>
      <section className={`verification-banner ${profile.doctor.verification_status}`}>
        <div>{profile.doctor.verification_status === 'approved' ? <BadgeCheck /> : <ShieldAlert />}<span><strong>{statusLabels[profile.doctor.verification_status]}</strong><small>{profile.doctor.bmdc_verified ? 'BMDC তথ্য যাচাইকৃত' : 'BMDC verification এখনো সম্পন্ন হয়নি'}</small></span></div>
        <p>Medical Type, Medical College, Session, Batch এবং BMDC Verification Application থেকে managed/locked। Degree, Designation ও অন্যান্য visitor-facing profile fields এখানে edit করা যাবে।</p>
      </section>

      <div className="doctor-form-layout">
        <aside className="doctor-photo-card">
          <div className="doctor-photo-preview">{avatarUrl ? <img src={avatarUrl} alt="ডাক্তার প্রোফাইল" width="800" height="800" decoding="async" /> : <Stethoscope />}</div>
          <label><Camera /> ছবি পরিবর্তন<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={choosePhoto} /></label>
          <small className="image-upload-hint">প্রস্তাবিত সাইজ: 800×800 px • সর্বোচ্চ 5 MB • upload-এর আগে 100–200 KB WebP-তে auto-compress হবে</small>
          <label className="accepting-toggle"><input type="checkbox" checked={profile.doctor.accepting_appointments} onChange={(event) => setDoctor('accepting_appointments', event.target.checked)} /><span><strong>Appointment নিচ্ছি</strong><small>বন্ধ করলে নতুন booking request আসবে না</small></span></label>
        </aside>

        <div className="doctor-form-sections">
          <section>
            <h2>Personal Information</h2>
            <div className="onboarding-private-note"><ShieldAlert /><span><strong>Private Information</strong><small>এই information আপনার personal profile-এর জন্য। DOB, age, gender, blood group, current address এবং permanent address public doctor profile বা visitor page-এ দেখানো হবে না। Doctor Name public profile-এর display name হিসেবেও ব্যবহৃত হয়; login email/phone public নয়।</small></span></div>
            <div className="patient-form-grid">
              <label className="auth-field"><span>পূর্ণ নাম</span><div><input required minLength={2} value={profile.doctor.full_name || ''} onChange={(event) => setDoctor('full_name', event.target.value)} /></div></label>
              <label className="auth-field"><span>ইমেইল</span><div><input disabled value={profile.doctor.email || ''} /></div></label>
              <label className="auth-field"><span>Login Phone</span><div><input readOnly inputMode="tel" value={profile.doctor.phone || ''} /></div><small className="field-helper">Signup/login credential; normal profile থেকে editable নয়।</small></label>
              <label className="auth-field"><span>Date of Birth</span><div><input type="date" value={privateProfile.date_of_birth || ''} onChange={(event) => setPrivate('date_of_birth', event.target.value || null)} /></div></label><label className="auth-field"><span>Age</span><div><input readOnly value={age} placeholder="DOB দিলে automatically calculate হবে" /></div></label>
              <label className="auth-field"><span>লিঙ্গ</span><div><select value={privateProfile.gender || ''} onChange={(event) => setPrivate('gender', (event.target.value || null) as DoctorPrivateProfile['gender'])}><option value="">নির্বাচন করুন</option><option value="male">পুরুষ</option><option value="female">নারী</option><option value="other">অন্যান্য</option></select></div></label>
              <label className="auth-field"><span>রক্তের গ্রুপ</span><div><select value={privateProfile.blood_group || ''} onChange={(event) => setPrivate('blood_group', event.target.value || null)}>{bloodGroups.map((group) => <option key={group || 'none'} value={group}>{group || 'নির্বাচন করুন'}</option>)}</select></div></label>
            </div>
          </section>

          <section>
            <h2>Private Address</h2>
            <label className="auth-field doctor-profile-address-field"><span>Current Address</span><div><input maxLength={500} value={privateProfile.address_line || ''} onChange={(event) => setPrivate('address_line', event.target.value || null)} placeholder="Current address" /></div></label>
            <label className="auth-field doctor-profile-address-field"><span>Permanent Address</span><div><input maxLength={500} value={privateProfile.permanent_address || ''} onChange={(event) => setPrivate('permanent_address', event.target.value || null)} placeholder="Permanent address" /></div></label>
          </section>

          <section>
            <h2>Search Location</h2>
            <div className="onboarding-public-note"><MapPin /><span><strong>Search / Directory Location</strong><small>District এবং Upazila visitor search/filter ও doctor discovery-তে ব্যবহার হতে পারে। Detailed Current/Permanent Address private থাকবে।</small></span></div>
            <div className="patient-form-grid">
              <label className="auth-field"><span>জেলা</span><div><MapPin /><select value={profile.doctor.district_id ?? ''} onChange={(event) => { setDoctor('district_id', event.target.value ? Number(event.target.value) : null); setDoctor('upazila_id', null); }}><option value="">নির্বাচন করুন</option>{districts.map((district) => <option key={district.id} value={district.id}>{district.name_bn}</option>)}</select></div></label>
              <label className="auth-field"><span>উপজেলা / এলাকা</span><div><MapPin /><select disabled={!profile.doctor.district_id} value={profile.doctor.upazila_id ?? ''} onChange={(event) => setDoctor('upazila_id', event.target.value ? Number(event.target.value) : null)}><option value="">নির্বাচন করুন</option>{upazilas.map((upazila) => <option key={upazila.id} value={upazila.id}>{upazila.name_bn}</option>)}</select></div></label>
            </div>
          </section>

          <section>
            <h2>Study Information</h2>
            <div className="doctor-study-info-grid">
              <div><GraduationCap /><span><small>Medical Type</small><strong>{verificationProfile?.medical_type || profile.doctor.medical_type || 'যোগ করা হয়নি'}</strong></span></div>
              <div><GraduationCap /><span><small>Medical College</small><strong>{verificationProfile?.medical_college || 'যোগ করা হয়নি'}</strong></span></div>
              <div><GraduationCap /><span><small>Session</small><strong>{verificationProfile?.medical_session || 'যোগ করা হয়নি'}</strong></span></div>
              <div><GraduationCap /><span><small>Batch</small><strong>{verificationProfile?.medical_batch || 'যোগ করা হয়নি'}</strong></span></div>
            </div>
            <p className="doctor-profile-section-note">Study Information verification record-এর অংশ। এটি Verification Application থেকে edit করা হয় এবং submitted/approved অবস্থায় locked থাকে।</p>
          </section>

          <section>
            <h2>Public Information</h2>
            <div className="onboarding-public-note"><Stethoscope /><span><strong>Visitor-facing Information</strong><small>এই professional fields public profile/card-এর সাথে সম্পর্কিত। Visiting Card/Public Content Management-এ dedicated public editorsও আছে।</small></span></div>
            <div className="patient-form-grid">
              <label className="auth-field"><span>Professional title</span><div><input value={profile.doctor.professional_title || ''} onChange={(event) => setDoctor('professional_title', event.target.value)} placeholder="যেমন: হৃদরোগ বিশেষজ্ঞ" /></div></label>
              <label className="auth-field"><span>ডিগ্রি</span><div><input value={profile.doctor.degree || ''} onChange={(event) => setDoctor('degree', event.target.value)} placeholder="MBBS, FCPS" /></div></label>
              <label className="auth-field"><span>পদবি / Designation</span><div><input value={profile.doctor.designation || ''} onChange={(event) => setDoctor('designation', event.target.value)} /></div></label>
              <label className="auth-field"><span>BMDC registration</span><div><input readOnly value={profile.doctor.bmdc_registration_no || ''} /></div><small className="field-helper">Verification Application থেকে managed; My Profile থেকে editable নয়।</small></label>
              <label className="auth-field"><span>অভিজ্ঞতা (বছর)</span><div><input type="number" min="0" max="80" value={profile.doctor.experience_years ?? ''} onChange={(event) => setDoctor('experience_years', event.target.value ? Number(event.target.value) : null)} /></div></label>
              <label className="auth-field"><span>ভিজিট ফি (৳)</span><div><input type="number" min="0" step="1" value={profile.doctor.consultation_fee ?? ''} onChange={(event) => setDoctor('consultation_fee', event.target.value ? Number(event.target.value) : null)} /></div></label>
              <label className="auth-field"><span>ভাষা <small>কমা দিয়ে লিখুন</small></span><div><input value={languages} onChange={(event) => setLanguages(event.target.value)} placeholder="বাংলা, English" /></div></label>
            </div>
            <fieldset className="specialty-picker"><legend>বিশেষত্ব (কমপক্ষে একটি)</legend>{specialties.map((specialty) => <label className={profile.specialty_ids.includes(specialty.id) ? 'selected' : ''} key={specialty.id}><input type="checkbox" checked={profile.specialty_ids.includes(specialty.id)} onChange={() => toggleSpecialty(specialty.id)} /><span>{specialty.name_bn}</span></label>)}</fieldset>
          </section>

          <section>
            <h2>Appointment & Profile Preferences</h2>
            <label className="doctor-text-field"><span>Profile headline</span><input maxLength={180} value={profile.doctor.profile_headline || ''} onChange={(event) => setDoctor('profile_headline', event.target.value)} /></label>
            <label className="doctor-text-field"><span>Consultation note</span><textarea rows={3} value={profile.doctor.consultation_note || ''} onChange={(event) => setDoctor('consultation_note', event.target.value)} placeholder="রোগী আসার আগে যা জানবেন" /></label>
            <p className="doctor-profile-section-note">About Doctor content Public Content Management-এর Step 3 থেকে edit হবে, যাতে একই content-এর duplicate editor না থাকে।</p>
          </section>


          <PrescriptionAdviceTemplatesManager />

          {error && <div className="auth-message error" role="alert">{error}</div>}
          {notice && <div className="auth-message success">{notice}</div>}
          <button className="auth-submit doctor-save" type="submit" disabled={saving}>{saving ? <LoaderCircle className="spin" /> : <><Save /> My Profile সংরক্ষণ করুন</>}</button>
        </div>
      </div>
    </form>}
  </main></div>;
}
