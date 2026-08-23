import { useEffect, useState } from "react";
import { ArrowLeft, FileText, LoaderCircle } from "lucide-react";
import { Link } from "react-router-dom";
import PublicHeader from "../components/PublicHeader";
import { getPublicContentPage } from "../services/providerReception";
import type { PublicContentPage } from "../types";
import { useVisitorLanguage } from "../contexts/VisitorLanguageContext";

export default function PublicLegalPage({
  slug: safeSlug,
}: {
  slug: "terms" | "privacy";
}) {
  const { language } = useVisitorLanguage();
  const tr = (bn: string, en: string) => (language === "bn" ? bn : en);
  const [page, setPage] = useState<PublicContentPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setLoading(true);
    getPublicContentPage(safeSlug)
      .then(setPage)
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Content লোড করা যায়নি।"),
      )
      .finally(() => setLoading(false));
  }, [safeSlug]);
  return (
    <div className="app-shell public-legal-page">
      <PublicHeader />
      <main className="container public-legal-main">
        <Link className="back-link" to="/auth">
          <ArrowLeft /> {tr("লগইনে ফিরুন", "Back to Login")}
        </Link>
        {loading ? (
          <div className="loading-box">
            <LoaderCircle className="spin" /> {tr("নীতিমালা লোড হচ্ছে…", "Loading policy…")}
          </div>
        ) : error ? (
          <div className="error-box">{error}</div>
        ) : (
          <article>
            <header>
              <FileText />
              <div>
                <small>docbd.info</small>
                <h1>
                  {(language === "bn" ? page?.title_bn : page?.title_en || page?.title_bn) ||
                    (safeSlug === "terms"
                      ? "Terms & Conditions"
                      : "Privacy Policy")}
                </h1>
                {page?.updated_at && (
                  <p>
                    {tr("সর্বশেষ আপডেট", "Last Updated")}:{" "}
                    {new Intl.DateTimeFormat(language === "bn" ? "bn-BD" : "en-US", {
                      dateStyle: "long",
                    }).format(new Date(page.updated_at))}
                  </p>
                )}
              </div>
            </header>
            <div className="public-legal-content">
              {(language === "bn" ? page?.body_bn : page?.body_en || page?.body_bn)?.trim() ||
                tr("এই নীতিমালার বিস্তারিত বিষয়বস্তু প্রকাশের অপেক্ষায় আছে।", "The full policy content is awaiting publication.")}
            </div>
          </article>
        )}
      </main>
    </div>
  );
}
