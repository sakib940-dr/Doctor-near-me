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
  Trash2,
  UserCircle,
} from 'lucide-react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { doctorPublicPath } from '../lib/publicRoutes';
import { getImageUrl } from '../lib/storage';
import {
  cleanupDoctorPhoto,
  getMyDoctorProfile,
  updateMyDoctorVisitingCardV3,
  uploadDoctorPhoto,
} from '../services/doctorDashboard';
import { getSpecialties } from '../services/discovery';
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
  const [removePhoto, setRemovePhoto] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getMyDoctorProfile(), getSpecialties()])
      .then(([doctorProfile, specialtyRows]) => {
        setProfile(doctorProfile);
        setSpecialties(specialtyRows);
      })
      .catch((loadError: unknown) => setError(messageFrom(loadError)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const avatarUrl = useMemo(
    () => removePhoto ? null : (preview || getImageUrl(profile?.doctor.profile_photo_url, 'avatars')),
    [preview, removePhoto, profile?.doctor.profile_photo_url],
  );

  const selectedSpecialties = useMemo(() => {
    if (!profile) return [];
    const selected = new Set(profile.specialty_ids);
    return specialties.filter((item) => selected.has(item.id));
  }, [profile, specialties]);

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
    setRemovePhoto(false);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(file));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile || !user) return;
    if (!profile.specialty_ids.length && !profile.doctor.specialty_text?.trim()) {
      setError('Manual Specialty অথবা কমপক্ষে একটি Specialty Category দিন।');
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);
    const previousPhotoPath = profile.doctor.profile_photo_url;
    let uploadedPhotoPath: string | null = null;
    try {
      let photoPath = removePhoto ? null : previousPhotoPath;
      if (photo) { uploadedPhotoPath = await uploadDoctorPhoto(photo, user.id); photoPath = uploadedPhotoPath; }

      await updateMyDoctorVisitingCardV3({
        fullName: profile.doctor.full_name || '',
        profilePhotoUrl: photoPath,
        professionalTitle: profile.doctor.professional_title,
        degree: profile.doctor.degree,
        designation: profile.doctor.designation,
        medicalCollege: profile.doctor.medical_college,
        presentJob: profile.doctor.present_job,
        specialtyText: profile.doctor.specialty_text || null,
        publicAddress: profile.doctor.public_address || null,
        specialtyIds: profile.specialty_ids,
        showMedicalCollegePublic: profile.doctor.show_medical_college_public !== false,
      }).catch(async (profileUpdateError) => {
        if (uploadedPhotoPath) await cleanupDoctorPhoto(uploadedPhotoPath).catch(() => undefined);
        throw profileUpdateError;
      });

      const refreshedProfile = await getMyDoctorProfile();
      if (refreshedProfile) setProfile(refreshedProfile);
      if ((uploadedPhotoPath || removePhoto) && previousPhotoPath && previousPhotoPath !== uploadedPhotoPath) {
        await cleanupDoctorPhoto(previousPhotoPath).catch(() => undefined);
      }
      setPhoto(null);
      setPreview(null);
      setRemovePhoto(false);
      await refreshAccount();
      setNotice('Visiting Card সফলভাবে সংরক্ষণ হয়েছে। Degree, specialty, job এবং public address visitor-facing information হিসেবে updated হয়েছে।');
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
                  <strong>{profile.doctor.specialty_text || selectedSpecialties[0]?.name_bn || profile.doctor.professional_title || 'বিশেষজ্ঞ চিকিৎসক'}</strong>
                  {profile.doctor.degree && <p><GraduationCap /> {profile.doctor.degree}</p>}
                  {profile.doctor.designation && <p><BadgeCheck /> {profile.doctor.designation}</p>}
                  {profile.doctor.medical_college && profile.doctor.show_medical_college_public !== false && <p><GraduationCap /> {profile.doctor.medical_college}</p>}
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
                  <label><Camera /> {avatarUrl ? 'Replace Photo' : 'Profile Photo'}<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={choosePhoto} /></label>
                  {avatarUrl && <button type="button" className="secondary-action danger" onClick={() => { setPhoto(null); if (preview) URL.revokeObjectURL(preview); setPreview(null); setRemovePhoto(true); }}><Trash2 /> Delete Photo</button>}
                  <small className="image-upload-hint">প্রস্তাবিত সাইজ: 800×800 px • সর্বোচ্চ 5 MB • upload-এর আগে 100–200 KB WebP-তে auto-compress হবে</small>
                </div>
                <div className="patient-form-grid visiting-card-form-grid">
                  <label className="auth-field"><span>Doctor Name</span><div><input required minLength={2} value={profile.doctor.full_name || ''} onChange={(event) => setDoctor('full_name', event.target.value)} /></div></label>
                  <label className="auth-field"><span>Professional Title</span><div><input value={profile.doctor.professional_title || ''} onChange={(event) => setDoctor('professional_title', event.target.value)} placeholder="যেমন: Consultant Cardiologist" /></div></label>
                </div>
              </section>

              <section className="visiting-card-section">
                <h2>Professional Information</h2>
                <div className="patient-form-grid visiting-card-form-grid">
                  <label className="auth-field"><span>Degree</span><div><input value={profile.doctor.degree || ''} onChange={(event) => setDoctor('degree', event.target.value)} placeholder="MBBS, FCPS" /></div></label>
                  <label className="auth-field"><span>Designation</span><div><input value={profile.doctor.designation || ''} onChange={(event) => setDoctor('designation', event.target.value)} placeholder="যেমন: Associate Professor" /></div></label>
                  <label className="auth-field"><span>BMDC Number</span><div><input readOnly value={profile.doctor.bmdc_registration_no || ''} /></div><small className="field-helper">Verification Application থেকে auto-filled; এখানে editable নয়।</small></label>
                  <div className="auth-field visiting-card-medical-college-field">
                    <span>Medical College</span>
                    <div><input readOnly value={profile.doctor.medical_college || ''} /></div>
                    <label className="visiting-card-public-toggle">
                      <span>
                        <strong>Show on Visitor Page</strong>
                        <small>{profile.doctor.show_medical_college_public !== false ? 'ON • public cards/profile-এ দেখা যাবে' : 'OFF • শুধু আপনার dashboard-এ থাকবে'}</small>
                      </span>
                      <input
                        type="checkbox"
                        checked={profile.doctor.show_medical_college_public !== false}
                        onChange={(event) => setDoctor('show_medical_college_public', event.target.checked)}
                        aria-label="Show Medical College on visitor pages"
                      />
                      <i aria-hidden="true" />
                    </label>
                    <small className="field-helper">Medical College verification record থেকে আসে; visibility আপনি নিয়ন্ত্রণ করতে পারবেন।</small>
                  </div>
                  <label className="auth-field visiting-card-wide-field"><span>Present Job / Hospital</span><div><input value={profile.doctor.present_job || ''} onChange={(event) => setDoctor('present_job', event.target.value)} placeholder="Current hospital, clinic or academic position" /></div></label>
                </div>
              </section>

              <section className="visiting-card-section">
                <h2>Specialty & Public Address</h2>
                <div className="patient-form-grid visiting-card-form-grid">
                  <label className="auth-field visiting-card-wide-field"><span>Manual Specialty Text</span><div><input value={profile.doctor.specialty_text || ''} onChange={(event) => setDoctor('specialty_text', event.target.value)} placeholder="Dental Surgeon / Eye Specialist / Medicine Specialist" /></div></label>
                  <label className="auth-field visiting-card-wide-field"><span>Public Visiting-card Address</span><div><input value={profile.doctor.public_address || ''} onChange={(event) => setDoctor('public_address', event.target.value)} placeholder="Visitor card/details page-এ দেখানোর short address" /></div></label>
                </div>
                <fieldset className="specialty-picker visiting-card-specialty-picker">
                  <legend>Existing Specialty Category (manual specialty-এর পাশাপাশি)</legend>
                  {specialties.map((specialty) => (
                    <label className={profile.specialty_ids.includes(specialty.id) ? 'selected' : ''} key={specialty.id}>
                      <input type="checkbox" checked={profile.specialty_ids.includes(specialty.id)} onChange={() => toggleSpecialty(specialty.id)} />
                      <span>{specialty.name_bn}</span>
                    </label>
                  ))}
                </fieldset>
              </section>

              <p className="visiting-card-security-note">BMDC Verification Application থেকে আসে এবং Visiting Card-এ read-only। Submitted verification-এর Degree, Designation ও Medical College review শেষ না হওয়া পর্যন্ত locked থাকবে।</p>
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
