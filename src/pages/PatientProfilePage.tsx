import { FormEvent, useEffect, useState } from "react";
import {
  ArrowLeft,
  LoaderCircle,
  MapPin,
  Save,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useVisitorLanguage } from "../contexts/VisitorLanguageContext";
import {
  getMyPatientProfile,
  updateMyPatientProfile,
} from "../services/appointments";
import { getDistricts, getUpazilas } from "../services/discovery";
import type { District, PatientProfile, Upazila } from "../types";

const bloodGroups = ["", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const emptyProfile: PatientProfile = {
  user_id: "",
  full_name: "",
  email: "",
  phone: "",
  date_of_birth: null,
  gender: null,
  blood_group: null,
  address_line: "",
  district_id: null,
  upazila_id: null,
  emergency_contact_name: "",
  emergency_contact_phone: "",
  preferred_language: "bn",
  profile_completed: false,
};
const messageFrom = (error: unknown) =>
  error instanceof Error ? error.message : "প্রোফাইল সংরক্ষণ করা যায়নি।";

export default function PatientProfilePage() {
  const { account, refreshAccount } = useAuth();
  const { language } = useVisitorLanguage();
  const tr = (bn: string, en: string) => (language === "bn" ? bn : en);
  const [profile, setProfile] = useState<PatientProfile>(emptyProfile);
  const [districts, setDistricts] = useState<District[]>([]);
  const [upazilas, setUpazilas] = useState<Upazila[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getMyPatientProfile(), getDistricts()])
      .then(([patient, districtRows]) => {
        if (patient) setProfile(patient);
        setDistricts(districtRows);
      })
      .catch((loadError: unknown) => setError(messageFrom(loadError)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!profile.district_id) {
      setUpazilas([]);
      return;
    }
    getUpazilas(profile.district_id)
      .then(setUpazilas)
      .catch(() => setError(tr("উপজেলা / এলাকার তালিকা লোড করা যায়নি।", "The upazila / area list could not be loaded.")));
  }, [profile.district_id]);

  if (account && account.role !== "patient")
    return <Navigate to="/dashboard" replace />;

  function set<K extends keyof PatientProfile>(
    key: K,
    value: PatientProfile[K],
  ) {
    setProfile((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await updateMyPatientProfile({
        full_name: profile.full_name,
        phone: profile.phone,
        date_of_birth: profile.date_of_birth,
        gender: profile.gender,
        blood_group: profile.blood_group,
        address_line: profile.address_line,
        district_id: profile.district_id,
        upazila_id: profile.upazila_id,
        emergency_contact_name: profile.emergency_contact_name,
        emergency_contact_phone: profile.emergency_contact_phone,
      });
      await refreshAccount();
      setNotice(tr("প্রোফাইল সফলভাবে সংরক্ষণ হয়েছে।", "Profile saved successfully."));
    } catch (saveError) {
      setError(messageFrom(saveError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="app-shell patient-profile-page">
      <main className="patient-main container">
        <Link className="back-link" to="/dashboard">
          <ArrowLeft /> {tr("ড্যাশবোর্ডে ফিরুন", "Back to Dashboard")}
        </Link>
        <div className="patient-page-heading">
          <span>
            <UserRound />
          </span>
          <div>
            <h1>{tr("আমার প্রোফাইল", "My Profile")}</h1>
            <p>{tr("অ্যাপয়েন্টমেন্ট ও জরুরি যোগাযোগের জন্য সঠিক তথ্য রাখুন।", "Keep accurate information for appointments and emergency contact.")}</p>
          </div>
        </div>
        {loading ? (
          <div className="loading-box">
            <LoaderCircle className="spin" /> {tr("প্রোফাইল লোড হচ্ছে…", "Loading profile…")}
          </div>
        ) : (
          <form className="patient-form" onSubmit={submit}>
            <section>
              <h2>{tr("ব্যক্তিগত তথ্য", "Personal Information")}</h2>
              <div className="patient-form-grid">
                <label className="auth-field">
                  <span>{tr("পূর্ণ নাম", "Full Name")}</span>
                  <div>
                    <input
                      required
                      minLength={2}
                      value={profile.full_name || ""}
                      onChange={(event) => set("full_name", event.target.value)}
                    />
                  </div>
                </label>
                <label className="auth-field">
                  <span>{tr("ইমেইল", "Email")}</span>
                  <div>
                    <input disabled value={profile.email || ""} />
                  </div>
                </label>
                <label className="auth-field">
                  <span>{tr("মোবাইল নম্বর", "Mobile Number")}</span>
                  <div>
                    <input
                      inputMode="tel"
                      value={profile.phone || ""}
                      onChange={(event) => set("phone", event.target.value)}
                    />
                  </div>
                </label>
                <label className="auth-field">
                  <span>{tr("জন্মতারিখ", "Date of Birth")}</span>
                  <div>
                    <input
                      type="date"
                      value={profile.date_of_birth || ""}
                      onChange={(event) =>
                        set("date_of_birth", event.target.value || null)
                      }
                    />
                  </div>
                </label>
                <label className="auth-field">
                  <span>{tr("লিঙ্গ", "Gender")}</span>
                  <div>
                    <select
                      value={profile.gender || ""}
                      onChange={(event) =>
                        set(
                          "gender",
                          (event.target.value ||
                            null) as PatientProfile["gender"],
                        )
                      }
                    >
                      <option value="">{tr("নির্বাচন করুন", "Select")}</option>
                      <option value="male">{tr("পুরুষ", "Male")}</option>
                      <option value="female">{tr("নারী", "Female")}</option>
                      <option value="other">{tr("অন্যান্য", "Other")}</option>
                    </select>
                  </div>
                </label>
                <label className="auth-field">
                  <span>{tr("রক্তের গ্রুপ", "Blood Group")}</span>
                  <div>
                    <select
                      value={profile.blood_group || ""}
                      onChange={(event) =>
                        set("blood_group", event.target.value || null)
                      }
                    >
                      {bloodGroups.map((group) => (
                        <option key={group} value={group}>
                          {group || tr("নির্বাচন করুন", "Select")}
                        </option>
                      ))}
                    </select>
                  </div>
                </label>
              </div>
            </section>
            <section>
              <h2>{tr("ঠিকানা", "Address")}</h2>
              <label className="auth-field">
                <span>{tr("বিস্তারিত ঠিকানা", "Detailed Address")}</span>
                <div>
                  <input
                    value={profile.address_line || ""}
                    onChange={(event) =>
                      set("address_line", event.target.value)
                    }
                    placeholder={tr("গ্রাম/রোড/এলাকা", "Village / Road / Area")}
                  />
                </div>
              </label>
              <div className="patient-form-grid">
                <label className="auth-field">
                  <span>{tr("জেলা", "District")}</span>
                  <div>
                    <MapPin />
                    <select
                      value={profile.district_id ?? ""}
                      onChange={(event) => {
                        set(
                          "district_id",
                          event.target.value
                            ? Number(event.target.value)
                            : null,
                        );
                        set("upazila_id", null);
                      }}
                    >
                      <option value="">{tr("নির্বাচন করুন", "Select")}</option>
                      {districts.map((district) => (
                        <option key={district.id} value={district.id}>
                          {language === "bn" ? district.name_bn : district.name_en || district.name_bn}
                        </option>
                      ))}
                    </select>
                  </div>
                </label>
                <label className="auth-field">
                  <span>{tr("উপজেলা / এলাকা", "Upazila / Area")}</span>
                  <div>
                    <MapPin />
                    <select
                      disabled={!profile.district_id}
                      value={profile.upazila_id ?? ""}
                      onChange={(event) =>
                        set(
                          "upazila_id",
                          event.target.value
                            ? Number(event.target.value)
                            : null,
                        )
                      }
                    >
                      <option value="">{tr("নির্বাচন করুন", "Select")}</option>
                      {upazilas.map((upazila) => (
                        <option key={upazila.id} value={upazila.id}>
                          {language === "bn" ? upazila.name_bn : upazila.name_en || upazila.name_bn}
                        </option>
                      ))}
                    </select>
                  </div>
                </label>
              </div>
            </section>
            <section>
              <h2>{tr("জরুরি যোগাযোগ", "Emergency Contact")}</h2>
              <div className="patient-form-grid">
                <label className="auth-field">
                  <span>{tr("যোগাযোগের ব্যক্তির নাম", "Contact Person Name")}</span>
                  <div>
                    <input
                      value={profile.emergency_contact_name || ""}
                      onChange={(event) =>
                        set("emergency_contact_name", event.target.value)
                      }
                    />
                  </div>
                </label>
                <label className="auth-field">
                  <span>{tr("জরুরি মোবাইল নম্বর", "Emergency Mobile Number")}</span>
                  <div>
                    <input
                      inputMode="tel"
                      value={profile.emergency_contact_phone || ""}
                      onChange={(event) =>
                        set("emergency_contact_phone", event.target.value)
                      }
                    />
                  </div>
                </label>
              </div>
            </section>
            {error && (
              <div className="auth-message error" role="alert">
                {error}
              </div>
            )}
            {notice && (
              <div className="auth-message success">
                <ShieldCheck /> {notice}
              </div>
            )}
            <button className="auth-submit" type="submit" disabled={saving}>
              {saving ? (
                <LoaderCircle className="spin" />
              ) : (
                <>
                  <Save /> {tr("প্রোফাইল সংরক্ষণ করুন", "Save Profile")}
                </>
              )}
            </button>
          </form>
        )}
      </main>
    </div>
  );
}
