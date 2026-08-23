import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarCheck,
  CalendarDays,
  Check,
  Clock3,
  FileText,
  LoaderCircle,
  MapPin,
  TrendingUp,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAuth } from "../contexts/AuthContext";
import {
  getMyAppointments,
  updateAppointmentStatus,
} from "../services/appointments";
import {
  getDoctorAnalytics,
  type DoctorAnalytics,
} from "../services/doctorDashboard";
import { formatDateSafe } from "../lib/dateSafe";
import type { AppointmentRow, AppointmentStatus } from "../types";
import { useVisitorLanguage, type VisitorLanguage } from "../contexts/VisitorLanguageContext";

function statusLabel(status: AppointmentStatus, language: VisitorLanguage) {
  const labels: Record<AppointmentStatus, [string, string]> = {
    pending: ["অপেক্ষমাণ", "Pending"], confirmed: ["নিশ্চিত", "Confirmed"], rejected: ["প্রত্যাখ্যাত", "Rejected"],
    cancelled: ["বাতিল", "Cancelled"], completed: ["সম্পন্ন", "Completed"], no_show: ["অনুপস্থিত", "No Show"],
  };
  return labels[status][language === "bn" ? 0 : 1];
}
type Action = { id: string; status: AppointmentStatus };
const APPOINTMENT_PAGE_SIZE = 30;

function localDateKey() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default function DoctorAppointmentsPage() {
  const { account } = useAuth();
  const { language } = useVisitorLanguage();
  const tr = (bn: string, en: string) => (language === "bn" ? bn : en);
  const [params, setParams] = useSearchParams();
  const selected = (params.get("status") as AppointmentStatus | null) ?? "all";
  const [rows, setRows] = useState<AppointmentRow[]>([]);
  const [overviewRows, setOverviewRows] = useState<AppointmentRow[]>([]);
  const [analytics, setAnalytics] = useState<DoctorAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<Action | null>(null);
  const [working, setWorking] = useState<Action | null>(null);

  const loadList = useCallback(() => {
    setLoading(true);
    setError(null);
    getMyAppointments(
      selected === "all" ? null : selected,
      APPOINTMENT_PAGE_SIZE,
      0,
    )
      .then((page) => {
        setRows(page);
        setHasMore(page.length === APPOINTMENT_PAGE_SIZE);
      })
      .catch((loadError: unknown) =>
        setError(
          loadError instanceof Error
            ? loadError.message
            : tr("অ্যাপয়েন্টমেন্ট লোড করা যায়নি।", "Appointments could not be loaded."),
        ),
      )
      .finally(() => setLoading(false));
  }, [selected]);

  const loadOverview = useCallback(() => {
    if (!account || account.role !== "doctor") return;
    setOverviewLoading(true);
    Promise.all([
      getDoctorAnalytics(account.user_id),
      getMyAppointments(null, 100, 0),
    ])
      .then(([nextAnalytics, appointments]) => {
        setAnalytics(nextAnalytics);
        setOverviewRows(appointments);
      })
      .catch((loadError: unknown) =>
        setError(
          loadError instanceof Error
            ? loadError.message
            : tr("অ্যাপয়েন্টমেন্টের সারসংক্ষেপ লোড করা যায়নি।", "Appointment overview could not be loaded."),
        ),
      )
      .finally(() => setOverviewLoading(false));
  }, [account]);

  useEffect(loadList, [loadList]);
  useEffect(loadOverview, [loadOverview]);
  if (account && account.role !== "doctor")
    return <Navigate to="/dashboard" replace />;

  const upcomingFive = useMemo(() => {
    const today = localDateKey();
    return overviewRows
      .filter(
        (row) =>
          row.appointment_date >= today &&
          (row.status === "pending" || row.status === "confirmed"),
      )
      .sort((a, b) =>
        `${a.appointment_date}T${a.start_time || "23:59"}`.localeCompare(
          `${b.appointment_date}T${b.start_time || "23:59"}`,
        ),
      )
      .slice(0, 5);
  }, [overviewRows]);

  const weeklyTotal =
    analytics?.last7Days.reduce((sum, row) => sum + row.count, 0) ?? 0;
  const weeklyChart = (analytics?.last7Days ?? []).map((row) => ({
    ...row,
    label: formatDateSafe(row.date, language === "bn" ? "bn-BD" : "en-US", { weekday: "short" }, "—", true),
  }));

  async function act(
    id: string,
    status: AppointmentStatus,
    needsConfirmation = false,
  ) {
    if (
      needsConfirmation &&
      (confirmAction?.id !== id || confirmAction.status !== status)
    ) {
      setConfirmAction({ id, status });
      return;
    }
    setWorking({ id, status });
    setError(null);
    try {
      await updateAppointmentStatus(id, status);
      setConfirmAction(null);
      loadList();
      loadOverview();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : tr("অবস্থা হালনাগাদ করা যায়নি।", "Status could not be updated."),
      );
    } finally {
      setWorking(null);
    }
  }

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const page = await getMyAppointments(
        selected === "all" ? null : selected,
        APPOINTMENT_PAGE_SIZE,
        rows.length,
      );
      setRows((current) => [
        ...current,
        ...page.filter(
          (item) =>
            !current.some(
              (existing) => existing.appointment_id === item.appointment_id,
            ),
        ),
      ]);
      setHasMore(page.length === APPOINTMENT_PAGE_SIZE);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : tr("আরও অ্যাপয়েন্টমেন্ট লোড করা যায়নি।", "More appointments could not be loaded."),
      );
    } finally {
      setLoadingMore(false);
    }
  }

  const actionProps = { working, confirmAction, setConfirmAction, act };
  const tabs: Array<{ value: AppointmentStatus | "all"; label: string }> = [
    { value: "all", label: tr("সব", "All") }, { value: "pending", label: tr("নতুন অনুরোধ", "New Requests") },
    { value: "confirmed", label: tr("নিশ্চিত", "Confirmed") }, { value: "completed", label: tr("সম্পন্ন", "Completed") },
    { value: "cancelled", label: tr("বাতিল", "Cancelled") },
  ];

  return (
    <div className="app-shell doctor-dashboard-page doctor-appointments-management">
      <main className="doctor-dashboard-main container">
        <div className="appointments-heading doctor-appointments-heading">
          <div>
            <span>{tr("অ্যাপয়েন্টমেন্ট ব্যবস্থাপনা", "Appointment Management")}</span>
            <h1>{tr("অ্যাপয়েন্টমেন্ট", "Appointments")}</h1>
            <p>
              {tr("আজকের ও আসন্ন তালিকা, সারসংক্ষেপ, ৭ দিনের প্রবণতা এবং সব অ্যাপয়েন্টমেন্ট এক জায়গায় পরিচালনা করুন।", "Manage today's and upcoming queue, summary, 7-day trend, and all appointments in one place.")}
            </p>
          </div>
        </div>
        {error && (
          <div className="error-box" role="alert">
            {error}
          </div>
        )}

        <section className="doctor-appointment-overview">
          <header>
            <div>
              <small>{tr("অগ্রাধিকার তালিকা", "Priority Queue")}</small>
              <h2>{tr("আজ ও আসন্ন • সর্বশেষ ৫টি", "Today + Upcoming • Latest 5")}</h2>
            </div>
            <span>
              <CalendarDays /> {tr(`${upcomingFive.length.toLocaleString("bn-BD")}টি দেখানো হচ্ছে`, `${upcomingFive.length} shown`)}
            </span>
          </header>
          {overviewLoading ? (
            <div className="loading-box">
              <LoaderCircle className="spin" /> {tr("সারসংক্ষেপ লোড হচ্ছে…", "Loading overview…")}
            </div>
          ) : upcomingFive.length ? (
            <div className="appointment-list doctor-appointment-list compact">
              {upcomingFive.map((appointment) => (
                <AppointmentCard
                  key={appointment.appointment_id}
                  appointment={appointment}
                  {...actionProps}
                />
              ))}
            </div>
          ) : (
            <div className="empty-inline">
              {tr("আজ বা সামনে কোনো অপেক্ষমাণ/নিশ্চিত অ্যাপয়েন্টমেন্ট নেই।", "There are no pending or confirmed appointments today or upcoming.")}
            </div>
          )}
        </section>

        <section className="doctor-appointment-summary-grid">
          <article>
            <span>
              <CalendarDays />
            </span>
            <div>
              <small>{tr("আজ", "Today")}</small>
              <strong>
                {(analytics?.todayAppointments ?? 0).toLocaleString("bn-BD")}
              </strong>
              <p>{tr("আজ নির্ধারিত", "Scheduled today")}</p>
            </div>
          </article>
          <article>
            <span>
              <Clock3 />
            </span>
            <div>
              <small>{tr("অপেক্ষমাণ", "Pending")}</small>
              <strong>
                {(analytics?.pendingAppointments ?? 0).toLocaleString("bn-BD")}
              </strong>
              <p>{tr("পদক্ষেপের অপেক্ষায়", "Awaiting action")}</p>
            </div>
          </article>
          <article>
            <span>
              <UsersRound />
            </span>
            <div>
              <small>{tr("মাসিক রোগী", "Monthly Patients")}</small>
              <strong>
                {(analytics?.monthlyUniquePatients ?? 0).toLocaleString(
                  "bn-BD",
                )}
              </strong>
              <p>{tr("স্বতন্ত্র রোগী", "Unique patients")}</p>
            </div>
          </article>
          <article>
            <span>
              <TrendingUp />
            </span>
            <div>
              <small>{tr("গত ৭ দিন", "Last 7 Days")}</small>
              <strong>{weeklyTotal.toLocaleString("bn-BD")}</strong>
              <p>{tr("মোট অ্যাপয়েন্টমেন্ট", "Total appointments")}</p>
            </div>
          </article>
        </section>

        <section className="doctor-appointment-week-card">
          <header>
            <div>
              <small>{tr("গত ৭ দিন", "Last 7 Days")}</small>
              <h2>{tr("অ্যাপয়েন্টমেন্ট প্রবণতা", "Appointment Trend")}</h2>
            </div>
            <strong>{tr(`${weeklyTotal.toLocaleString("bn-BD")}টি মোট`, `${weeklyTotal.toLocaleString("en-US")} total`)}</strong>
          </header>
          <div className="doctor-appointment-week-chart">
            {weeklyChart.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={weeklyChart}
                  margin={{ top: 8, right: 8, left: -24, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} />
                  <YAxis
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip />
                  <Bar
                    dataKey="count"
                    name={tr("অ্যাপয়েন্টমেন্ট", "Appointments")}
                    fill="#0f766e"
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="empty-inline">{tr("৭ দিনের প্রবণতার তথ্য নেই।", "No trend data is available for the last 7 days.")}</div>
            )}
          </div>
        </section>

        <section className="doctor-all-appointments-section">
          <header>
            <div>
              <small>{tr("সম্পূর্ণ তালিকা", "Complete Queue")}</small>
              <h2>{tr("সব অ্যাপয়েন্টমেন্ট", "All Appointments")}</h2>
            </div>
          </header>
          <div className="appointment-tabs">
            {tabs.map((tab) => (
              <button
                className={selected === tab.value ? "active" : ""}
                key={tab.value}
                type="button"
                onClick={() =>
                  setParams(tab.value === "all" ? {} : { status: tab.value })
                }
              >
                {tab.label}
              </button>
            ))}
          </div>
          {loading ? (
            <div className="loading-box">
              <LoaderCircle className="spin" /> {tr("অ্যাপয়েন্টমেন্ট লোড হচ্ছে…", "Loading appointments…")}
            </div>
          ) : rows.length ? (
            <>
              <div className="appointment-list doctor-appointment-list">
                {rows.map((appointment) => (
                  <AppointmentCard
                    key={appointment.appointment_id}
                    appointment={appointment}
                    {...actionProps}
                  />
                ))}
              </div>
              {hasMore && (
                <div className="public-load-more-wrap">
                  <button
                    className="public-load-more-button"
                    type="button"
                    disabled={loadingMore}
                    onClick={() => void loadMore()}
                  >
                    {loadingMore ? (
                      <>
                        <LoaderCircle className="spin" /> {tr("লোড হচ্ছে…", "Loading…")}
                      </>
                    ) : (
                      tr("আরও দেখুন", "View More")
                    )}
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="empty-state">
              <CalendarDays />
              <h3>{tr("এই অবস্থায় কোনো অ্যাপয়েন্টমেন্ট নেই", "No appointments with this status")}</h3>
              <p>{tr("নতুন অনুরোধ এলে এখানে দেখা যাবে।", "New requests will appear here.")}</p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function AppointmentCard({
  appointment,
  working,
  confirmAction,
  setConfirmAction,
  act,
}: {
  appointment: AppointmentRow;
  working: Action | null;
  confirmAction: Action | null;
  setConfirmAction: (value: Action | null) => void;
  act: (
    id: string,
    status: AppointmentStatus,
    needsConfirmation?: boolean,
  ) => Promise<void>;
}) {
  const { language } = useVisitorLanguage();
  const tr = (bn: string, en: string) => (language === "bn" ? bn : en);
  const busy = (status: AppointmentStatus) =>
    working?.id === appointment.appointment_id && working.status === status;
  return (
    <article>
      <div className="appointment-date">
        <CalendarDays />
        <strong>
          {new Intl.DateTimeFormat(language === "bn" ? "bn-BD" : "en-US", { dateStyle: "medium" }).format(
            new Date(`${appointment.appointment_date}T12:00:00`),
          )}
        </strong>
        <span className={`status-${appointment.status}`}>
          {statusLabel(appointment.status, language)}
        </span>
      </div>
      <div className="appointment-body">
        <span className="appointment-doctor-icon">
          <UserRound />
        </span>
        <div>
          <h2>{appointment.patient_name || tr("রোগী", "Patient")}</h2>
          <p>{appointment.provider_name || tr("চেম্বার নির্ধারিত নয়", "Chamber not specified")}</p>
          <div className="appointment-meta">
            {appointment.start_time && (
              <span>
                <Clock3 /> {appointment.start_time.slice(0, 5)} –{" "}
                {appointment.end_time?.slice(0, 5)}
              </span>
            )}
            {appointment.address && (
              <span>
                <MapPin /> {appointment.address}
              </span>
            )}
          </div>
        </div>
        <div className="appointment-fee">
          <small>{tr("পরামর্শ ফি", "Consultation Fee")}</small>
          <strong>
            {appointment.consultation_fee == null
              ? "—"
              : `৳${appointment.consultation_fee}`}
          </strong>
        </div>
      </div>
      {appointment.patient_note && (
        <p className="appointment-note">
          <strong>{tr("রোগীর নোট", "Patient Note")}:</strong> {appointment.patient_note}
        </p>
      )}
      {appointment.status === "pending" && (
        <div className="doctor-appointment-actions">
          <button
            className="positive"
            type="button"
            disabled={Boolean(working)}
            onClick={() => void act(appointment.appointment_id, "confirmed")}
          >
            <Check /> {busy("confirmed") ? tr("হালনাগাদ হচ্ছে…", "Updating…") : tr("নিশ্চিত করুন", "Confirm")}
          </button>
          <button
            className={
              confirmAction?.id === appointment.appointment_id &&
              confirmAction.status === "rejected"
                ? "danger confirming"
                : "danger"
            }
            type="button"
            disabled={Boolean(working)}
            onClick={() =>
              void act(appointment.appointment_id, "rejected", true)
            }
          >
            <X />{" "}
            {confirmAction?.id === appointment.appointment_id &&
            confirmAction.status === "rejected"
              ? tr("নিশ্চিত করুন", "Confirm")
              : tr("প্রত্যাখ্যান", "Reject")}
          </button>
          {confirmAction?.id === appointment.appointment_id && (
            <button type="button" onClick={() => setConfirmAction(null)}>
              {tr("ফিরে যান", "Go Back")}
            </button>
          )}
        </div>
      )}
      {appointment.status === "confirmed" && (
        <div className="doctor-appointment-actions">
          <Link
            className="rx-appointment-prescription-link"
            to={`/doctor/prescriptions?appointment=${appointment.appointment_id}`}
          >
            <FileText /> {tr("প্রেসক্রিপশন", "Prescription")}
          </Link>
          <button
            className="positive"
            type="button"
            disabled={Boolean(working)}
            onClick={() => void act(appointment.appointment_id, "completed")}
          >
            <CalendarCheck /> {tr("সম্পন্ন", "Complete")}
          </button>
          <button
            type="button"
            disabled={Boolean(working)}
            onClick={() => void act(appointment.appointment_id, "no_show")}
          >
            {tr("অনুপস্থিত", "No Show")}
          </button>
          <button
            className={
              confirmAction?.id === appointment.appointment_id &&
              confirmAction.status === "cancelled"
                ? "danger confirming"
                : "danger"
            }
            type="button"
            disabled={Boolean(working)}
            onClick={() =>
              void act(appointment.appointment_id, "cancelled", true)
            }
          >
            <X />{" "}
            {confirmAction?.id === appointment.appointment_id &&
            confirmAction.status === "cancelled"
              ? tr("নিশ্চিত করুন", "Confirm")
              : tr("বাতিল", "Cancel")}
          </button>
          {confirmAction?.id === appointment.appointment_id && (
            <button type="button" onClick={() => setConfirmAction(null)}>
              {tr("ফিরে যান", "Go Back")}
            </button>
          )}
        </div>
      )}
      {appointment.status === "completed" && (
        <div className="doctor-appointment-actions">
          <Link
            className="rx-appointment-prescription-link"
            to={`/doctor/prescriptions?appointment=${appointment.appointment_id}`}
          >
            <FileText /> {tr("প্রেসক্রিপশন", "Prescription")}
          </Link>
        </div>
      )}
    </article>
  );
}
