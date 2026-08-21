import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import {
  BadgeCheck,
  Building2,
  Camera,
  GraduationCap,
  LoaderCircle,
  Save,
  ShieldAlert,
  Stethoscope,
  UserCircle,
} from 'lucide-react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { doctorPublicPath } from '../lib/publicRoutes';
import { getImageUrl } from '../lib/storage';
import {
  cleanupDoctorPhoto,
  getMyDoctorProfile,
  updateMyDoctorVisitingCard,
  uploadDoctorPhoto,
} from '../services/doctorDashboard';
import { getSpecialties } from '../services/discovery';
import { getMyDoctorVerificationProfile } from '../services/verification';
import type { MyDoctorProfile, Specialty } from '../types';

const statusLabels = {
  pending: 'যাচাই অপেক্ষমাণ',
  approved: 'অনুমোদিত',
  rejected: 'প্রত্যাখ্যাত',
  expired: 'মেয়াদ শেষ',
};

const messageFrom = (error: unknown) => error instanceof Error ? error.message : 'Visiting Card সংরক্ষণ করা যায়নি।';

export default function DoctorVisitingCardPage({ onSaved }: { onSaved?: () => void | Promise<void> } = {}) {
  const { account, user, refreshAccount } = useAuth();
  const [profile, setProfile] = useState<MyDoctorProfile | null>(null);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [verificationSubmittedAt, setVerificationSubmittedAt] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getMyDoctorProfile(), getSpecialties(), getMyDoctorVerificationProfile()])
      .then(([doctorProfile, specialtyRows, verificationProfile]) => {
        setProfile(doctorProfile);
        setSpecialties(specialtyRows);
        setVerificationSubmittedAt(verificationProfile?.verification_submitted_at ?? null);
      })
      .catch((loadError: unknown) => setError(messageFrom(loadError)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const avatarUrl = useMemo(
    () => preview || getImageUrl(profile?.doctor.profile_photo_url, 'avatars'),
    [preview, profile?.doctor.profile_photo_url],
  );

  const selectedSpecialties = useMemo(() => {
    if (!profile) return [];
    const selected = new Set(profile.specialty_ids);
    return specialties.filter((item) => selected.has(item.id));
  }, [profile, specialties]);

  if (account && account.role !== 'doctor') return <Navigate to="/dashboard" replace />;

  const verificationIdentityLocked = profile?.doctor.verification_status === 'approved'
    || (profile?.doctor.verification_status === 'pending' && Boolean(verificationSubmittedAt));

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
    if (!profile.specialty_ids.length) {
      setError('কমপক্ষে একটি বিশেষত্ব নির্বাচন করুন।');
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

      const previousStatus = profile.doctor.verification_status;
      const result = await updateMyDoctorVisitingCard({
        fullName: profile.doctor.full_name || '',
        profilePhotoUrl: photoPath,
        professionalTitle: profile.doctor.professional_title,
        degree: profile.doctor.degree,
        designation: profile.doctor.designation,
        bmdcRegistrationNo: profile.doctor.bmdc_registration_no,
        medicalCollege: profile.doctor.medical_college,
        presentJob: profile.doctor.present_job,
        specialtyIds: profile.specialty_ids,
      }).catch(async (profileUpdateError) => {
        if (uploadedPhotoPath) await cleanupDoctorPhoto(uploadedPhotoPath).catch(() => undefined);
        throw profileUpdateError;
      });

      // Step 32 also treats Medical College as verification identity. Re-read
      // the canonical profile so a DB-triggered reset is reflected immediately.
      const [refreshedProfile, refreshedVerification] = await Promise.all([getMyDoctorProfile(), getMyDoctorVerificationProfile()]);
      if (refreshedProfile) setProfile(refreshedProfile);
      setVerificationSubmittedAt(refreshedVerification?.verification_submitted_at ?? null);
      if (uploadedPhotoPath && previousPhotoPath && previousPhotoPath !== uploadedPhotoPath) {
        await cleanupDoctorPhoto(previousPhotoPath).catch(() => undefined);
      }
      setPhoto(null);
      setPreview(null);
      await refreshAccount();
      const verificationReset = result.credentials_changed
        || (previousStatus === 'approved' && refreshedProfile?.doctor.verification_status === 'pending');
      setNotice(verificationReset
        ? 'Visiting Card সংরক্ষিত হয়েছে। পরিবর্তিত verification identity এখন draft; Verification Application থেকে Apply/Re-Apply করুন।'
        : 'Visiting Card সফলভাবে সংরক্ষণ হয়েছে।');
      await onSaved?.();
    } catch (saveError) {
      setError(messageFrom(saveError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="app-shell doctor-dashboard-page visiting-card-page">
      <main className="doctor-dashboard-main container">
        <div className="doctor-page-heading visiting-card-heading">
          <span><UserCircle /></span>
          <div>
            <small>Doctor public identity</small>
            <h1>Visiting Card</h1>
            <p>Public doctor cards-এ দেখানো সংক্ষিপ্ত পেশাগত তথ্য পরিচালনা করুন। বিস্তারিত Doctor Details page অপরিবর্তিত থাকবে।</p>
          </div>
        </div>

        {loading ? (
          <div className="loading-box"><LoaderCircle className="spin" /> Visiting Card লোড হচ্ছে…</div>
        ) : !profile ? (
          <div className="error-box">ডাক্তার প্রোফাইল পাওয়া যায়নি।</div>
        ) : (
          <form className="visiting-card-layout" onSubmit={submit}>
            <aside className="visiting-card-preview-panel">
              <div className={`verification-banner compact ${profile.doctor.verification_status}`}>
                <div>
                  {profile.doctor.verification_status === 'approved' ? <BadgeCheck /> : <ShieldAlert />}
                  <span>
                    <strong>{statusLabels[profile.doctor.verification_status]}</strong>
                    <small>{profile.doctor.bmdc_verified ? 'BMDC যাচাইকৃত' : 'BMDC verification pending'}</small>
                  </span>
                </div>
              </div>

              <Link
                className={`doctor-visiting-card-preview ${['rejected', 'expired'].includes(profile.doctor.verification_status) ? 'preview-disabled' : ''}`}
                to={['rejected', 'expired'].includes(profile.doctor.verification_status) ? '/doctor/visiting-card' : doctorPublicPath(profile.doctor.profile_slug, profile.doctor.id)}
                aria-disabled={['rejected', 'expired'].includes(profile.doctor.verification_status)}
                onClick={(event) => {
                  if (['rejected', 'expired'].includes(profile.doctor.verification_status)) event.preventDefault();
                }}
              >
                <div className="doctor-visiting-card-photo">
                  {avatarUrl ? <img src={avatarUrl} alt={profile.doctor.full_name || 'Doctor'} /> : <Stethoscope />}
                  <span>{profile.doctor.verification_status === 'approved' ? <BadgeCheck /> : <ShieldAlert />} {profile.doctor.verification_status === 'approved' ? 'Verified' : 'Not verified yet'}</span>
                </div>
                <div className="doctor-visiting-card-copy">
                  <small>docbd.info</small>
                  <h2>{profile.doctor.full_name || 'Doctor Name'}</h2>
                  <strong>{selectedSpecialties[0]?.name_bn || profile.doctor.professional_title || 'বিশেষজ্ঞ চিকিৎসক'}</strong>
                  {profile.doctor.degree && <p><GraduationCap /> {profile.doctor.degree}</p>}
                  {profile.doctor.designation && <p><BadgeCheck /> {profile.doctor.designation}</p>}
                  {profile.doctor.medical_college && <p><GraduationCap /> {profile.doctor.medical_college}</p>}
                  {profile.doctor.present_job && <p><Building2 /> {profile.doctor.present_job}</p>}
                  {profile.doctor.bmdc_registration_no && <em>BMDC: {profile.doctor.bmdc_registration_no}</em>}
                </div>
              </Link>

              {['rejected', 'expired'].includes(profile.doctor.verification_status) && (
                <p className="visiting-card-preview-note">Rejected/expired verification status public listing থেকে excluded থাকে।</p>
              )}
              {profile.doctor.verification_status === 'pending' && <p className="visiting-card-preview-note">Pending doctor Super Admin publication policy অনুযায়ী “Not verified yet” badge সহ public হতে পারে।</p>}
            </aside>

            <div className="visiting-card-editor">
              <section className="visiting-card-section">
                <div className="section-title">
                  <div><h2>পরিচয় ও ছবি</h2><p>এই তথ্য public doctor card এবং existing Doctor Details page-এ reuse হবে।</p></div>
                </div>
                <div className="visiting-card-photo-editor">
                  <div className="doctor-photo-preview">
                    {avatarUrl ? <img src={avatarUrl} alt="ডাক্তার প্রোফাইল" width="800" height="800" decoding="async" /> : <Stethoscope />}
                  </div>
                  <label><Camera /> Profile Photo<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={choosePhoto} /></label>
                  <small className="image-upload-hint">প্রস্তাবিত সাইজ: 800×800 px • সর্বোচ্চ 3 MB • আপলোডের পর ছবি স্বয়ংক্রিয়ভাবে অপটিমাইজ হবে</small>
                </div>
                <div className="patient-form-grid visiting-card-form-grid">
                  <label className="auth-field"><span>Doctor Name</span><div><input required minLength={2} value={profile.doctor.full_name || ''} onChange={(event) => setDoctor('full_name', event.target.value)} /></div></label>
                  <label className="auth-field"><span>Professional Title</span><div><input value={profile.doctor.professional_title || ''} onChange={(event) => setDoctor('professional_title', event.target.value)} placeholder="যেমন: Consultant Cardiologist" /></div></label>
                </div>
              </section>

              <section className="visiting-card-section">
                <h2>Professional Information</h2>
                <div className="patient-form-grid visiting-card-form-grid">
                  <label className="auth-field"><span>Degree</span><div><input disabled={verificationIdentityLocked} value={profile.doctor.degree || ''} onChange={(event) => setDoctor('degree', event.target.value)} placeholder="MBBS, FCPS" /></div></label>
                  <label className="auth-field"><span>Designation</span><div><input disabled={verificationIdentityLocked} value={profile.doctor.designation || ''} onChange={(event) => setDoctor('designation', event.target.value)} placeholder="যেমন: Associate Professor" /></div></label>
                  <label className="auth-field"><span>BMDC Number</span><div><input disabled={verificationIdentityLocked} value={profile.doctor.bmdc_registration_no || ''} onChange={(event) => setDoctor('bmdc_registration_no', event.target.value)} /></div></label>
                  <label className="auth-field"><span>Medical College</span><div><input disabled={verificationIdentityLocked} value={profile.doctor.medical_college || ''} onChange={(event) => setDoctor('medical_college', event.target.value)} placeholder="Medical college / institute" /></div></label>
                  <label className="auth-field visiting-card-wide-field"><span>Present Job / Hospital</span><div><input value={profile.doctor.present_job || ''} onChange={(event) => setDoctor('present_job', event.target.value)} placeholder="Current hospital, clinic or academic position" /></div></label>
                </div>
              </section>

              <section className="visiting-card-section">
                <h2>Specialty</h2>
                <fieldset className="specialty-picker visiting-card-specialty-picker">
                  <legend>কমপক্ষে একটি specialty নির্বাচন করুন</legend>
                  {specialties.map((specialty) => (
                    <label className={profile.specialty_ids.includes(specialty.id) ? 'selected' : ''} key={specialty.id}>
                      <input type="checkbox" checked={profile.specialty_ids.includes(specialty.id)} onChange={() => toggleSpecialty(specialty.id)} />
                      <span>{specialty.name_bn}</span>
                    </label>
                  ))}
                </fieldset>
              </section>

              <p className="visiting-card-security-note">Verification application submit হওয়ার পর Degree, Designation, BMDC ও Medical College তথ্য review শেষ না হওয়া পর্যন্ত locked থাকবে।</p>
              {error && <div className="auth-message error" role="alert">{error}</div>}
              {notice && <div className="auth-message success">{notice}</div>}
              <button className="auth-submit doctor-save visiting-card-save" type="submit" disabled={saving}>
                {saving ? <LoaderCircle className="spin" /> : <><Save /> Visiting Card সংরক্ষণ করুন</>}
              </button>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}
