import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import {
  ArrowLeft,
  Building2,
  Camera,
  Crosshair,
  ImagePlus,
  LoaderCircle,
  MapPin,
  Save,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { Link, Navigate } from "react-router-dom";
import ProviderWebsiteContentTabs from "../components/ProviderWebsiteContentTabs";
import { useAuth } from "../contexts/AuthContext";
import { useVisitorLanguage } from "../contexts/VisitorLanguageContext";
import {
  captureCurrentCoordinates,
  validateCoordinates,
} from "../lib/geolocation";
import { getImageUrl } from "../lib/storage";
import {
  getDistricts,
  getUpazilas,
  resolveLocationContext,
} from "../services/discovery";
import {
  cleanupProviderMedia,
  getMyProviderDashboard,
  saveMyProviderProfile,
  uploadProviderMedia,
} from "../services/providerDashboard";
import type { District, ProviderDashboardItem, Upazila } from "../types";

const messageFrom = (error: unknown) =>
  error instanceof Error
    ? error.message
    : typeof error === "object" &&
        error !== null &&
        "message" in error &&
        typeof error.message === "string"
      ? error.message
      : "প্রতিষ্ঠানের profile সংরক্ষণ করা যায়নি।";

function emptyProvider(type: "hospital" | "chamber"): ProviderDashboardItem {
  return {
    id: "",
    provider_type: type,
    name_bn: "",
    name_en: "",
    short_description: "",
    about_bn: "",
    about_en: "",
    logo_url: null,
    banner_url: null,
    phone: "",
    whatsapp: "",
    email: "",
    facebook_url: "",
    website_url: "",
    address: "",
    district_id: null,
    upazila_id: null,
    latitude: null,
    longitude: null,
    google_maps_url: "",
    opening_note: "",
    emergency_available: false,
    departments: [],
    services: [],
    gallery_paths: [],
    status: "pending",
    verified: false,
    doctor_links: [],
  };
}

export default function ProviderProfilePage() {
  const { account, user, refreshAccount } = useAuth();
  const { language } = useVisitorLanguage();
  const tr = (bn: string, en: string) => (language === "bn" ? bn : en);
  const statusLabels = {
    pending: tr("ভেরিফিকেশন অপেক্ষমাণ", "Verification Pending"), approved: tr("অনুমোদিত", "Approved"),
    rejected: tr("প্রত্যাখ্যাত", "Rejected"), suspended: tr("স্থগিত", "Suspended"),
  };
  const roleType = account?.role === "chamber" ? "chamber" : "hospital";
  const [providers, setProviders] = useState<ProviderDashboardItem[]>([]);
  const [profile, setProfile] = useState<ProviderDashboardItem>(
    emptyProvider(roleType),
  );
  const [districts, setDistricts] = useState<District[]>([]);
  const [upazilas, setUpazilas] = useState<Upazila[]>([]);
  const [departments, setDepartments] = useState("");
  const [services, setServices] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [galleryFiles, setGalleryFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [capturingLocation, setCapturingLocation] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getMyProviderDashboard(), getDistricts()])
      .then(([rows, districtRows]) => {
        setProviders(rows);
        setDistricts(districtRows);
        if (rows[0]) selectProvider(rows[0]);
        else setProfile(emptyProvider(roleType));
      })
      .catch((loadError: unknown) => setError(messageFrom(loadError)))
      .finally(() => setLoading(false));
  }, [roleType]);

  useEffect(() => {
    if (!profile.district_id) {
      setUpazilas([]);
      return;
    }
    getUpazilas(profile.district_id)
      .then(setUpazilas)
      .catch(() => setError("উপজেলা / এলাকার তালিকা লোড করা যায়নি।"));
  }, [profile.district_id]);

  if (account && !["hospital", "chamber"].includes(account.role))
    return <Navigate to="/dashboard" replace />;

  function selectProvider(item: ProviderDashboardItem) {
    setProfile(item);
    setDepartments(item.departments.join(", "));
    setServices(item.services.join(", "));
    setLogoFile(null);
    setBannerFile(null);
    setGalleryFiles([]);
    setError(null);
    setNotice(null);
  }

  function set<K extends keyof ProviderDashboardItem>(
    key: K,
    value: ProviderDashboardItem[K],
  ) {
    setProfile((current) => ({ ...current, [key]: value }));
  }

  function addGallery(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    if (profile.gallery_paths.length + galleryFiles.length + files.length > 8) {
      setError(tr("ছবির সংগ্রহে সর্বোচ্চ ৮টি ছবি রাখা যাবে।", "The gallery can contain up to 8 images."));
      return;
    }
    setGalleryFiles((current) => [...current, ...files]);
  }

  async function captureProviderLocation() {
    setCapturingLocation(true);
    setError(null);
    setNotice(null);
    try {
      const coordinates = await captureCurrentCoordinates();
      setProfile((current) => ({
        ...current,
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
      }));
      try {
        const resolved = await resolveLocationContext(
          coordinates.latitude,
          coordinates.longitude,
        );
        setProfile((current) => ({
          ...current,
          district_id: resolved.district_id,
          upazila_id: resolved.upazila_id,
        }));
        setNotice(tr(`বর্তমান অবস্থান নেওয়া হয়েছে${coordinates.accuracy ? ` (আনুমানিক ${Math.round(coordinates.accuracy)} মিটার নির্ভুলতা)` : ""}। শনাক্ত এলাকা ও স্থানাঙ্ক যাচাই করে সংরক্ষণ করুন।`, `Current location captured${coordinates.accuracy ? ` (approximately ${Math.round(coordinates.accuracy)} m accuracy)` : ""}. Verify the detected area and coordinates before saving.`));
      } catch {
        setNotice(tr(`জিপিএস স্থানাঙ্ক নেওয়া হয়েছে${coordinates.accuracy ? ` (আনুমানিক ${Math.round(coordinates.accuracy)} মিটার নির্ভুলতা)` : ""}। জেলা/উপজেলা/এলাকা নিজে যাচাই করে সংরক্ষণ করুন।`, `GPS coordinates captured${coordinates.accuracy ? ` (approximately ${Math.round(coordinates.accuracy)} m accuracy)` : ""}. Verify the district and area manually before saving.`));
      }
    } catch (captureError) {
      setError(messageFrom(captureError));
    } finally {
      setCapturingLocation(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    const coordinateError = validateCoordinates(
      profile.latitude,
      profile.longitude,
    );
    if (coordinateError) {
      setError(coordinateError);
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    const persisted = providers.find((item) => item.id === profile.id) || null;
    const previousLogo = persisted?.logo_url ?? profile.logo_url;
    const previousBanner = persisted?.banner_url ?? profile.banner_url;
    const previousGallery = persisted?.gallery_paths ?? profile.gallery_paths;
    const newlyUploaded: string[] = [];
    try {
      const logoPath = logoFile
        ? await uploadProviderMedia(logoFile, user.id, "logo")
        : profile.logo_url;
      if (logoFile && logoPath) newlyUploaded.push(logoPath);
      const bannerPath = bannerFile
        ? await uploadProviderMedia(bannerFile, user.id, "banner")
        : profile.banner_url;
      if (bannerFile && bannerPath) newlyUploaded.push(bannerPath);
      const uploadedGallery: string[] = [];
      for (const file of galleryFiles) {
        const path = await uploadProviderMedia(file, user.id, "gallery");
        uploadedGallery.push(path);
        newlyUploaded.push(path);
      }
      const finalGallery = [...profile.gallery_paths, ...uploadedGallery];
      const result = await saveMyProviderProfile({
        providerId: profile.id || null,
        nameBn: profile.name_bn,
        nameEn: profile.name_en,
        shortDescription: profile.short_description,
        aboutBn: profile.about_bn || null,
        aboutEn: profile.about_en || null,
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
        departments: departments
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
        services: services
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
        galleryPaths: finalGallery,
      });
      if (previousLogo && previousLogo !== logoPath)
        await cleanupProviderMedia(previousLogo).catch(() => undefined);
      if (previousBanner && previousBanner !== bannerPath)
        await cleanupProviderMedia(previousBanner).catch(() => undefined);
      for (const oldPath of previousGallery.filter(
        (path) => !finalGallery.includes(path),
      ))
        await cleanupProviderMedia(oldPath).catch(() => undefined);
      const rows = await getMyProviderDashboard();
      setProviders(rows);
      const saved = rows.find((item) => item.id === result.provider_id);
      if (saved) selectProvider(saved);
      await refreshAccount();
      setNotice(tr("প্রতিষ্ঠানের প্রোফাইল সফলভাবে সংরক্ষণ হয়েছে।", "Provider profile saved successfully."));
    } catch (saveError) {
      for (const path of newlyUploaded)
        await cleanupProviderMedia(path).catch(() => undefined);
      setError(messageFrom(saveError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="app-shell provider-dashboard-page">
      <main className="provider-dashboard-main container">
        <Link className="back-link" to="/dashboard">
          <ArrowLeft /> {tr("ড্যাশবোর্ডে ফিরুন", "Back to Dashboard")}
        </Link>
        <div className="provider-page-heading">
          <span>
            <Building2 />
          </span>
          <div>
            <small>
              {profile.provider_type === "hospital" ? tr("হাসপাতাল", "Hospital") : tr("চেম্বার", "Chamber")} {tr("স্ব-পরিচালনা", "Self-service")}
            </small>
            <h1>{tr("প্রতিষ্ঠানের প্রোফাইল", "Provider Profile")}</h1>
            <p>{tr("পাবলিক প্রোফাইল, যোগাযোগ, বিভাগ, সেবা এবং ছবির সংগ্রহ পরিচালনা করুন।", "Manage the public profile, contact details, departments, services, and gallery.")}</p>
          </div>
        </div>
        {providers.length > 1 && (
          <label className="provider-selector">
            {tr("প্রতিষ্ঠান", "Provider")}
            <select
              value={profile.id}
              onChange={(event) => {
                const found = providers.find(
                  (item) => item.id === event.target.value,
                );
                if (found) selectProvider(found);
              }}
            >
              {providers.map((item) => (
                <option key={item.id} value={item.id}>
                  {language === "bn" ? item.name_bn : item.name_en || item.name_bn}
                </option>
              ))}
            </select>
          </label>
        )}
        {loading ? (
          <div className="loading-box">
            <LoaderCircle className="spin" /> {tr("প্রোফাইল লোড হচ্ছে…", "Loading profile…")}
          </div>
        ) : (
          <form className="provider-profile-form" onSubmit={submit}>
            <section className={`provider-verification ${profile.status}`}>
              <div>
                <ShieldAlert />
                <span>
                  <strong>
                    {profile.id
                      ? statusLabels[profile.status]
                      : tr("নতুন প্রতিষ্ঠান", "New Provider")}
                  </strong>
                  <small>
                    {profile.verified
                      ? tr("পাবলিক ডিরেক্টরিতে ভেরিফায়েড", "Verified in the public directory")
                      : tr("ভেরিফিকেশন ব্যাজ অপেক্ষমাণ; পাবলিক প্রোফাইল চালু আছে", "Verification badge pending; the public profile remains available")}
                  </small>
                </span>
              </div>
              <p>{tr("ফোন, হোয়াটসঅ্যাপ, সেবা ও অবস্থান আপনি যেকোনো সময় পরিবর্তন করতে পারবেন।", "You can update phone, WhatsApp, services, and location at any time.")}</p>
            </section>
            <section className="provider-media-card">
              <div className="provider-banner-preview">
                {getImageUrl(profile.banner_url, "public-images") ? (
                  <img
                    src={
                      getImageUrl(
                        profile.banner_url,
                        "public-images",
                        "thumbnail",
                      ) || ""
                    }
                    alt="Banner"
                    width="640"
                    height="360"
                    decoding="async"
                  />
                ) : (
                  <ImagePlus />
                )}
              </div>
              <div className="provider-logo-preview">
                {getImageUrl(profile.logo_url, "public-images") ? (
                  <img
                    src={
                      getImageUrl(
                        profile.logo_url,
                        "public-images",
                        "thumbnail",
                      ) || ""
                    }
                    alt="Logo"
                    width="320"
                    height="320"
                    decoding="async"
                  />
                ) : (
                  <Building2 />
                )}
              </div>
              <div className="provider-media-actions">
                <label>
                  <Camera /> {tr("লোগো", "Logo")}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/avif"
                    onChange={(event) =>
                      setLogoFile(event.target.files?.[0] || null)
                    }
                  />
                  <small className="image-upload-hint">
                    {tr("প্রস্তাবিত মাপ: ৮০০×৮০০ পিক্সেল • সর্বোচ্চ ৫ এমবি • আপলোডের আগে ১০০–২০০ কেবি WebP-তে স্বয়ংক্রিয়ভাবে সংকুচিত হবে", "Recommended: 800×800 px • maximum 5 MB • automatically compressed to a 100–200 KB WebP before upload")}
                  </small>
                </label>
                <label>
                  <ImagePlus /> {tr("ব্যানার", "Banner")}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/avif"
                    onChange={(event) =>
                      setBannerFile(event.target.files?.[0] || null)
                    }
                  />
                  <small className="image-upload-hint">
                    {tr("প্রস্তাবিত মাপ: ১৬০০×৯০০ পিক্সেল • সর্বোচ্চ ৫ এমবি • আপলোডের আগে ১০০–২০০ কেবি WebP-তে স্বয়ংক্রিয়ভাবে সংকুচিত হবে", "Recommended: 1600×900 px • maximum 5 MB • automatically compressed to a 100–200 KB WebP before upload")}
                  </small>
                </label>
              </div>
            </section>
            <section className="provider-form-section">
              <h2>{tr("মৌলিক তথ্য", "Basic Information")}</h2>
              <div className="patient-form-grid">
                <label className="auth-field">
                  <span>{tr("বাংলা নাম", "Name in Bangla")}</span>
                  <div>
                    <input
                      required
                      minLength={2}
                      value={profile.name_bn}
                      onChange={(event) => set("name_bn", event.target.value)}
                    />
                  </div>
                </label>
                <label className="auth-field">
                  <span>{tr("ইংরেজি নাম", "Name in English")}</span>
                  <div>
                    <input
                      value={profile.name_en || ""}
                      onChange={(event) => set("name_en", event.target.value)}
                    />
                  </div>
                </label>
                <label className="auth-field">
                  <span>{tr("ফোন", "Phone")}</span>
                  <div>
                    <input
                      inputMode="tel"
                      value={profile.phone || ""}
                      onChange={(event) => set("phone", event.target.value)}
                    />
                  </div>
                </label>
                <label className="auth-field">
                  <span>WhatsApp</span>
                  <div>
                    <input
                      inputMode="tel"
                      value={profile.whatsapp || ""}
                      onChange={(event) => set("whatsapp", event.target.value)}
                    />
                  </div>
                </label>
                <label className="auth-field">
                  <span>{tr("ইমেইল", "Email")}</span>
                  <div>
                    <input
                      type="email"
                      value={profile.email || ""}
                      onChange={(event) => set("email", event.target.value)}
                    />
                  </div>
                </label>
                <label className="auth-field">
                  <span>Facebook URL</span>
                  <div>
                    <input
                      type="url"
                      value={profile.facebook_url || ""}
                      onChange={(event) =>
                        set("facebook_url", event.target.value)
                      }
                    />
                  </div>
                </label>
                <label className="auth-field">
                  <span>Website URL</span>
                  <div>
                    <input
                      type="url"
                      value={profile.website_url || ""}
                      onChange={(event) =>
                        set("website_url", event.target.value)
                      }
                    />
                  </div>
                </label>
                <label className="auth-field">
                  <span>{tr("খোলা থাকার তথ্য", "Opening Note")}</span>
                  <div>
                    <input
                      value={profile.opening_note || ""}
                      onChange={(event) =>
                        set("opening_note", event.target.value)
                      }
                      placeholder={tr("২৪ ঘণ্টা / সকাল ৮টা–রাত ১০টা", "24 hours / 8 AM–10 PM")}
                    />
                  </div>
                </label>
              </div>
              <label className="provider-text-field">
                <span>{tr("সংক্ষিপ্ত বিবরণ", "Short Description")}</span>
                <textarea
                  rows={5}
                  maxLength={2000}
                  value={profile.short_description || ""}
                  onChange={(event) =>
                    set("short_description", event.target.value)
                  }
                />
              </label>
              <div className="provider-bilingual-about-grid">
                <label className="provider-text-field">
                  <span>{tr("হাসপাতাল সম্পর্কে — বাংলা", "About Hospital — Bangla")}</span>
                  <textarea
                    rows={5}
                    maxLength={4000}
                    value={profile.about_bn || ""}
                    onChange={(event) => set("about_bn", event.target.value)}
                    placeholder={tr("হাসপাতালের পরিচিতি, সেবা ও রোগীসেবা সম্পর্কে লিখুন", "Write about the hospital, its services, and patient care in Bangla")}
                  />
                </label>
                <label className="provider-text-field">
                  <span>{tr("হাসপাতাল সম্পর্কে — ইংরেজি", "About Hospital — English")}</span>
                  <textarea
                    rows={5}
                    maxLength={4000}
                    value={profile.about_en || ""}
                    onChange={(event) => set("about_en", event.target.value)}
                    placeholder={tr("ইংরেজি সংস্করণ (ঐচ্ছিক)", "English version (optional)")}
                  />
                </label>
              </div>
            </section>
            <section className="provider-form-section">
              <h2>{tr("ঠিকানা ও ম্যাপ", "Address & Map")}</h2>
              <div className="provider-location-guide">
                <Crosshair />
                <div>
                  <strong>{tr("সঠিক অবস্থান নির্ধারণ করুন", "Set the Correct Location")}</strong>
                  <p>{tr("সম্ভব হলে প্রতিষ্ঠান বা হাসপাতালে উপস্থিত থেকে ডিভাইসের অবস্থান ব্যবহারের অনুমতি দিন এবং ‘বর্তমান অবস্থান’ নির্বাচন করুন। অক্ষাংশ, দ্রাঘিমাংশ ও শনাক্ত জেলা/এলাকা যাচাই করে সংরক্ষণ করুন। জিপিএস না থাকলে স্থানাঙ্ক নিজে লিখতে পারবেন।", "If possible, use Current Location while physically present at the provider. Verify the latitude, longitude, and detected district/area before saving. You can enter coordinates manually if GPS is unavailable or denied.")}</p>
                </div>
                <button
                  type="button"
                  disabled={capturingLocation}
                  onClick={() => void captureProviderLocation()}
                >
                  {capturingLocation ? (
                    <LoaderCircle className="spin" />
                  ) : (
                    <Crosshair />
                  )}
                  {capturingLocation ? tr("অবস্থান নেওয়া হচ্ছে…", "Getting location…") : tr("বর্তমান অবস্থান", "Current Location")}
                </button>
              </div>
              <label className="provider-text-field">
                <span>{tr("বিস্তারিত ঠিকানা", "Detailed Address")}</span>
                <textarea
                  rows={3}
                  value={profile.address || ""}
                  onChange={(event) => set("address", event.target.value)}
                />
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
                <label className="auth-field">
                  <span>{tr("অক্ষাংশ", "Latitude")}</span>
                  <div>
                    <input
                      type="number"
                      step="any"
                      min={-90}
                      max={90}
                      value={profile.latitude ?? ""}
                      onChange={(event) =>
                        set(
                          "latitude",
                          event.target.value
                            ? Number(event.target.value)
                            : null,
                        )
                      }
                    />
                  </div>
                </label>
                <label className="auth-field">
                  <span>{tr("দ্রাঘিমাংশ", "Longitude")}</span>
                  <div>
                    <input
                      type="number"
                      step="any"
                      min={-180}
                      max={180}
                      value={profile.longitude ?? ""}
                      onChange={(event) =>
                        set(
                          "longitude",
                          event.target.value
                            ? Number(event.target.value)
                            : null,
                        )
                      }
                    />
                  </div>
                </label>
              </div>
              <label className="auth-field">
                <span>Google Maps URL</span>
                <div>
                  <input
                    type="url"
                    value={profile.google_maps_url || ""}
                    onChange={(event) =>
                      set("google_maps_url", event.target.value)
                    }
                  />
                </div>
              </label>
            </section>
            <section className="provider-form-section">
              <h2>{tr("বিভাগ ও সেবা", "Departments & Services")}</h2>
              <label className="provider-text-field">
                <span>
                  {tr("বিভাগ", "Departments")} <small>{tr("কমা দিয়ে লিখুন", "Separate with commas")}</small>
                </span>
                <textarea
                  rows={3}
                  value={departments}
                  onChange={(event) => setDepartments(event.target.value)}
                  placeholder="Cardiology, Orthopedics, Pediatrics"
                />
              </label>
              <label className="provider-text-field">
                <span>
                  {tr("সেবাসমূহ", "Services")} <small>{tr("কমা দিয়ে লিখুন", "Separate with commas")}</small>
                </span>
                <textarea
                  rows={3}
                  value={services}
                  onChange={(event) => setServices(event.target.value)}
                  placeholder="ICU, OT, Pathology, Diagnostic"
                />
              </label>
              <label className="provider-emergency">
                <input
                  type="checkbox"
                  checked={profile.emergency_available}
                  onChange={(event) =>
                    set("emergency_available", event.target.checked)
                  }
                />{" "}
                {tr("জরুরি সেবা পাওয়া যায়", "Emergency service available")}
              </label>
            </section>
            <section className="provider-form-section">
              <h2>{tr("ছবির সংগ্রহ", "Gallery")}</h2>
              <div className="provider-gallery">
                {profile.gallery_paths.map((path) => (
                  <div key={path}>
                    <img
                      src={
                        getImageUrl(path, "public-images", "thumbnail") || ""
                      }
                      alt={tr("প্রতিষ্ঠানের ছবি", "Provider gallery")}
                      loading="lazy"
                      decoding="async"
                      width="480"
                      height="480"
                    />
                    <button
                      type="button"
                      aria-label={tr("ছবি সরান", "Remove image")}
                      onClick={() =>
                        set(
                          "gallery_paths",
                          profile.gallery_paths.filter((item) => item !== path),
                        )
                      }
                    >
                      <Trash2 />
                    </button>
                  </div>
                ))}
                {galleryFiles.map((file, index) => (
                  <div
                    className="gallery-pending"
                    key={`${file.name}-${index}`}
                  >
                    <ImagePlus />
                    <small>{file.name}</small>
                    <button
                      type="button"
                      onClick={() =>
                        setGalleryFiles((current) =>
                          current.filter((_, itemIndex) => itemIndex !== index),
                        )
                      }
                    >
                      <Trash2 />
                    </button>
                  </div>
                ))}
              </div>
              <label className="gallery-upload">
                <ImagePlus /> {tr("ছবির সংগ্রহে ছবি যোগ করুন", "Add Gallery Images")}
                <input
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp,image/avif"
                  onChange={addGallery}
                />
                <small className="gallery-help image-upload-hint">
                  {tr("প্রস্তাবিত মাপ: সর্বোচ্চ ১৪০০×১৪০০ পিক্সেল • সর্বোচ্চ ৫ এমবি • আপলোডের আগে ১০০–২০০ কেবি WebP-তে স্বয়ংক্রিয়ভাবে সংকুচিত হবে • সর্বোচ্চ ৮টি ছবি", "Recommended: up to 1400×1400 px • maximum 5 MB • automatically compressed to a 100–200 KB WebP before upload • up to 8 images")}
                </small>
              </label>
            </section>
            {error && (
              <div className="auth-message error" role="alert">
                {error}
              </div>
            )}
            {notice && <div className="auth-message success">{notice}</div>}
            <button
              className="auth-submit provider-save"
              type="submit"
              disabled={saving}
            >
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
        {!loading && profile.id && (
          <ProviderWebsiteContentTabs providerId={profile.id} />
        )}
      </main>
    </div>
  );
}
