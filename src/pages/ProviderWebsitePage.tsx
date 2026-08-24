import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  CalendarDays,
  ExternalLink,
  LoaderCircle,
  MapPin,
  Phone,
  Star,
} from "lucide-react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useVisitorLanguage } from "../contexts/VisitorLanguageContext";
import FollowSaveButton from "../components/FollowSaveButton";
import PublicHeader from "../components/PublicHeader";
import StructuredReviewSection from "../components/StructuredReviewSection";
import VisitorBottomNav from "../components/VisitorBottomNav";
import HospitalDoctorCard from "../features/hospital/components/HospitalDoctorCard";
import { getPublicHospitalDoctors } from "../features/hospital/services/hospitalDoctors";
import type { HospitalDoctorCard as HospitalDoctorCardRow } from "../features/hospital/types";
import { getImageUrl } from "../lib/storage";
import { buildWhatsAppAppointmentUrl } from "../lib/whatsapp";
import { getPublicHospitalPageBase } from "../features/hospital/services/hospitalDoctors";
import {
  providerGallery,
  providerReviews,
  type ProviderGalleryImage,
  type ProviderReview,
} from "../services/providerWebsiteContent";
import type { ProviderPublicPageContent } from "../services/providerPublicContent";
import {
  getProviderPublicStats,
  recordProviderInteraction,
} from "../services/engagement";
import type {
  ProviderDirectoryRow,
  PublicProfileStats,
} from "../types";

const text = (
  v: { bn?: string; en?: string } | null | undefined,
  lang: "bn" | "en",
) => v?.[lang] || v?.bn || v?.en || "";
const media = (
  path: string | null | undefined,
  variant: "master" | "thumbnail" = "master",
) => getImageUrl(path, "public-images", variant) || path || "";

export default function ProviderWebsitePage() {
  const { slug = "" } = useParams();
  const { language: lang } = useVisitorLanguage();
  const tr = (bn: string, en: string) => (lang === "bn" ? bn : en);
  const navigate = useNavigate(),
    location = useLocation();
  const [provider, setProvider] = useState<ProviderDirectoryRow | null>(null);
  const [doctors, setDoctors] = useState<HospitalDoctorCardRow[]>([]);
  const [providerStats, setProviderStats] = useState<PublicProfileStats | null>(
    null,
  );
  const [services, setServices] = useState<
    ProviderPublicPageContent["services"]
  >([]);
  const [gallery, setGallery] = useState<ProviderGalleryImage[]>([]);
  const [slider, setSlider] = useState<
    ProviderPublicPageContent["slider_images"]
  >([]);
  const [reviews, setReviews] = useState<ProviderReview[]>([]);
  const [treatment, setTreatment] = useState<
    ProviderPublicPageContent["treatment_costs"]
  >([]);
  const [investigation, setInvestigation] = useState<
    ProviderPublicPageContent["investigation_costs"]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [slide, setSlide] = useState(0);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const base = await getPublicHospitalPageBase(slug);
        if (!base) {
          if (alive) setProvider(null);
          return;
        }
        const p = base.provider;
        const canonical = `/providers/${encodeURIComponent(base.route.slug)}/website`;
        if (location.pathname !== canonical)
          navigate(canonical, { replace: true });
        const [g, r, stats, managedDoctors] = await Promise.all([
          providerGallery.getAll(p.id, true),
          providerReviews.getAll(p.id, true),
          getProviderPublicStats(p.id).catch(() => null),
          getPublicHospitalDoctors(p.id),
        ]);
        if (!alive) return;
        setProvider(p);
        setDoctors(managedDoctors);
        setServices(base.content?.services ?? []);
        setGallery(g);
        setSlider(base.content?.slider_images ?? []);
        setReviews(r.filter((review) => review.review_source !== "patient"));
        setTreatment(base.content?.treatment_costs ?? []);
        setInvestigation(base.content?.investigation_costs ?? []);
        setProviderStats(stats);
      } catch (e) {
        if (alive)
          setError(e instanceof Error ? e.message : "ডেটা লোড করা যায়নি");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [slug, location.pathname, navigate]);
  useEffect(() => {
    if (!provider?.id) return;
    void recordProviderInteraction(
      provider.id,
      "profile_view",
      "provider_website",
    ).catch(() => undefined);
  }, [provider?.id]);
  useEffect(() => {
    if (slider.length < 2) return;
    const id = window.setInterval(
      () => setSlide((v) => (v + 1) % slider.length),
      5000,
    );
    return () => clearInterval(id);
  }, [slider.length]);
  const hero = useMemo(
    () =>
      slider[slide]?.image
        ? media(slider[slide].image)
        : media(provider?.banner_url),
    [slider, slide, provider],
  );
  const whatsappUrl =
    provider && (provider.whatsapp || provider.phone)
      ? buildWhatsAppAppointmentUrl(
          provider.whatsapp || provider.phone || "",
          lang === "bn"
            ? provider.name_bn
            : provider.name_en || provider.name_bn,
        )
      : null;
  if (loading)
    return (
      <div className="app-shell">
        <PublicHeader mobileBottomNav />
        <main className="container loading-box">
          <LoaderCircle className="spin" /> {tr("ওয়েবসাইট লোড হচ্ছে…", "Loading website…")}
        </main>
      </div>
    );
  if (error || !provider)
    return (
      <div className="app-shell">
        <PublicHeader mobileBottomNav />
        <main className="container provider-site-empty">
          <Building2 />
          <h1>{tr("প্রতিষ্ঠান পাওয়া যায়নি", "Provider Not Found")}</h1>
          <p>{error || tr("এই প্রতিষ্ঠানের পাবলিক ওয়েবসাইট এখন পাওয়া যাচ্ছে না।", "This provider's public website is currently unavailable.")}</p>
          <Link to="/providers">{tr("প্রতিষ্ঠানের তালিকায় ফিরুন", "Back to Providers")}</Link>
        </main>
      </div>
    );
  return (
    <div className="app-shell provider-site">
      <PublicHeader mobileBottomNav />
      <main>
        <section
          className="provider-site-hero"
          style={
            hero
              ? {
                  backgroundImage: `linear-gradient(90deg,rgba(3,41,37,.86),rgba(3,41,37,.35)),url(${hero})`,
                }
              : undefined
          }
        >
          <div className="container provider-site-hero-inner">
            <div className="provider-site-logo">
              {provider.logo_url ? (
                <img
                  src={media(provider.logo_url, "thumbnail")}
                  alt=""
                  width="320"
                  height="320"
                  decoding="async"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
              ) : (
                <Building2 />
              )}
            </div>
            <div>
              <span>
                {provider.provider_type === "hospital" ? tr("হাসপাতাল", "Hospital") : tr("চেম্বার", "Chamber")}
                {provider.verified ? ` • ${tr("ভেরিফায়েড", "Verified")}` : ""}
              </span>
              <h1>
                {lang === "bn"
                  ? provider.name_bn
                  : provider.name_en || provider.name_bn}
              </h1>
              <p>
                {slider[slide]
                  ? text(slider[slide].caption, lang)
                  : provider.short_description || ""}
              </p>
              <div className="provider-site-actions">
                {provider.phone && (
                  <a
                    href={`tel:${provider.phone}`}
                    onClick={() =>
                      void recordProviderInteraction(
                        provider.id,
                        "call_click",
                        "provider_website",
                      ).catch(() => undefined)
                    }
                  >
                    <Phone /> {provider.phone}
                  </a>
                )}
                {doctors[0] && (
                  <Link
                    to="#hospital-doctors"
                    onClick={() =>
                      void recordProviderInteraction(
                        provider.id,
                        "appointment_click",
                        "provider_website",
                      ).catch(() => undefined)
                    }
                  >
                    <CalendarDays /> {tr("অ্যাপয়েন্টমেন্ট", "Appointment")}
                  </Link>
                )}
                <FollowSaveButton
                  targetType="provider"
                  targetId={provider.id}
                  stats={providerStats}
                  variant="button"
                  entityLabel={
                    provider.provider_type === "hospital"
                      ? tr("হাসপাতাল", "hospital")
                      : tr("চেম্বার", "chamber")
                  }
                  onStatsChange={setProviderStats}
                />
              </div>
              <div className="provider-site-followers">
                <b>
                  {(providerStats?.follower_count ?? 0).toLocaleString(
                    lang === "bn" ? "bn-BD" : "en-US",
                  )}
                </b>{" "}
                {lang === "bn" ? "মোট অনুসারী" : "followers"}
              </div>
            </div>
          </div>
        </section>
        <div className="container provider-site-body">
          <section className="provider-site-section">
            <h2>{lang === "bn" ? "আমাদের সম্পর্কে" : "About"}</h2>
            <p>
              {(lang === "bn"
                ? provider.about_bn ||
                  provider.short_description ||
                  provider.about_en
                : provider.about_en ||
                  provider.about_bn ||
                  provider.short_description) ||
                (lang === "bn"
                  ? "প্রতিষ্ঠানের বিস্তারিত তথ্য শিগগিরই যোগ হবে।"
                  : "More information will be added soon.")}
            </p>
            <div className="provider-info-grid">
              <span>
                <MapPin />
                {provider.address || "—"}
              </span>
              {provider.opening_note && <span>{provider.opening_note}</span>}
              {provider.map_url && (
                <a
                  href={provider.map_url}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() =>
                    void recordProviderInteraction(
                      provider.id,
                      "map_click",
                      "provider_website",
                    ).catch(() => undefined)
                  }
                >
                  <ExternalLink /> {tr("ম্যাপ", "Map")}
                </a>
              )}
            </div>
          </section>
          <section className="provider-site-section" id="hospital-doctors">
            <h2>{lang === "bn" ? "ডাক্তারবৃন্দ" : "Doctors"}</h2>
            {doctors.length ? (
              <div className="hospital-public-doctor-list">
                {doctors.map((doctor) => <HospitalDoctorCard key={doctor.id} doctor={doctor} hospital={provider} />)}
              </div>
            ) : (
              <p className="provider-empty">
                {tr("এখনো কোনো ডাক্তার যুক্ত করা হয়নি।", "No doctors have been added yet.")}
              </p>
            )}
          </section>
          <section className="provider-site-section">
            <h2>{lang === "bn" ? "সেবাসমূহ" : "Services"}</h2>
            {services.length ? (
              <div className="provider-content-grid">
                {services.map((x) => (
                  <article key={x.id}>
                    {x.image && (
                      <img
                        src={media(x.image, "thumbnail")}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        width="360"
                        height="360"
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
                    )}
                    <h3>{text(x.name, lang)}</h3>
                    <p>{text(x.description, lang)}</p>
                  </article>
                ))}
              </div>
            ) : (
              <p className="provider-empty">{tr("কোনো সেবা যোগ করা হয়নি।", "No services have been added.")}</p>
            )}
          </section>
          <section className="provider-site-section">
            <h2>{lang === "bn" ? "গ্যালারি" : "Gallery"}</h2>
            {gallery.length ? (
              <div className="provider-gallery-public">
                {gallery.map((x) => (
                  <figure key={x.id}>
                    {x.image && (
                      <img
                        src={media(x.image, "thumbnail")}
                        alt={text(x.caption, lang)}
                        loading="lazy"
                        decoding="async"
                        width="480"
                        height="480"
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
                    )}
                    <figcaption>{text(x.caption, lang)}</figcaption>
                  </figure>
                ))}
              </div>
            ) : (
              <p className="provider-empty">{tr("ছবির সংগ্রহে কোনো ছবি নেই।", "No gallery images are available.")}</p>
            )}
          </section>
          <StructuredReviewSection
            targetType="provider"
            targetId={provider.id}
            entityLabel={
              provider.provider_type === "hospital" ? tr("হাসপাতাল", "hospital") : tr("চেম্বার", "chamber")
            }
            language={lang}
          />
          {reviews.length ? (
            <section className="provider-site-section">
              <h2>
                {lang === "bn"
                  ? "প্রতিষ্ঠানের প্রকাশিত মতামত"
                  : "Published testimonials"}
              </h2>
              <div className="provider-review-grid">
                {reviews.map((x) => (
                  <article key={x.id}>
                    <div>
                      {Array.from({ length: x.rating }).map((_, i) => (
                        <Star key={i} />
                      ))}
                    </div>
                    <h3>{x.name}</h3>
                    <p>{text(x.text, lang) || x.comment || ""}</p>
                    {x.reply && <small>{tr("উত্তর", "Reply")}: {text(x.reply, lang)}</small>}
                  </article>
                ))}
              </div>
            </section>
          ) : null}
          <section className="provider-site-section">
            <h2>{lang === "bn" ? "খরচের তালিকা" : "Costs"}</h2>
            <div className="provider-cost-columns">
              <CostList
                title={lang === "bn" ? "চিকিৎসা" : "Treatment"}
                rows={treatment}
                lang={lang}
              />
              <CostList
                title={lang === "bn" ? "পরীক্ষা" : "Investigation"}
                rows={investigation}
                lang={lang}
              />
            </div>
          </section>
          <section className="provider-site-section provider-contact">
            <h2>{lang === "bn" ? "যোগাযোগ" : "Contact"}</h2>
            <p>{provider.address}</p>
            {provider.phone && (
              <a
                href={`tel:${provider.phone}`}
                onClick={() =>
                  void recordProviderInteraction(
                    provider.id,
                    "call_click",
                    "provider_website",
                  ).catch(() => undefined)
                }
              >
                {provider.phone}
              </a>
            )}
            {whatsappUrl && (
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noreferrer"
                onClick={() =>
                  void recordProviderInteraction(
                    provider.id,
                    "whatsapp_click",
                    "provider_website",
                  ).catch(() => undefined)
                }
              >
                WhatsApp
              </a>
            )}
            {provider.website_url && (
              <a href={provider.website_url} target="_blank" rel="noreferrer">
                {tr("অফিশিয়াল ওয়েবসাইট", "Official Website")}
              </a>
            )}
          </section>
        </div>
      </main>
      <VisitorBottomNav />
    </div>
  );
}
function CostList({
  title,
  rows,
  lang,
}: {
  title: string;
  rows: ProviderPublicPageContent["treatment_costs"];
  lang: "bn" | "en";
}) {
  return (
    <div>
      <h3>{title}</h3>
      {rows.length ? (
        <table>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{text(r.name, lang)}</td>
                <td>{text(r.cost, lang)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="provider-empty">{lang === "bn" ? "কোনো তথ্য নেই।" : "No information is available."}</p>
      )}
    </div>
  );
}
