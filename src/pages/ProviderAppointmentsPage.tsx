import { useEffect, useState } from "react";
import {
  ArrowLeft,
  CalendarCheck,
  CalendarDays,
  Check,
  Clock3,
  LoaderCircle,
  MapPin,
  Stethoscope,
  UserRound,
  X,
} from "lucide-react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useVisitorLanguage, type VisitorLanguage } from "../contexts/VisitorLanguageContext";
import {
  getMyAppointments,
  updateAppointmentStatus,
} from "../services/appointments";
import {
  getMyProviderReceptionAppointments,
  updateProviderReceptionAppointment,
} from "../services/providerReception";
import type {
  AppointmentRow,
  AppointmentStatus,
  ProviderReceptionAppointment,
} from "../types";

function statusLabel(status: AppointmentStatus, language: VisitorLanguage) {
  const values: Record<AppointmentStatus, [string, string]> = {
    pending: ["অপেক্ষমাণ", "Pending"], confirmed: ["নিশ্চিত", "Confirmed"], rejected: ["প্রত্যাখ্যাত", "Rejected"],
    cancelled: ["বাতিল", "Cancelled"], completed: ["সম্পন্ন", "Completed"], no_show: ["অনুপস্থিত", "No Show"],
  };
  return values[status][language === "bn" ? 0 : 1];
}
type Action = { id: string; status: AppointmentStatus };
const APPOINTMENT_PAGE_SIZE = 30;

export default function ProviderAppointmentsPage() {
  const { account } = useAuth();
  const { language } = useVisitorLanguage();
  const tr = (bn: string, en: string) => (language === "bn" ? bn : en);
  const [params, setParams] = useSearchParams();
  const selected = (params.get("status") as AppointmentStatus | null) ?? "all";
  const [rows, setRows] = useState<AppointmentRow[]>([]);
  const [receptionRows, setReceptionRows] = useState<
    ProviderReceptionAppointment[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<Action | null>(null);
  const [working, setWorking] = useState<Action | null>(null);
  const [receptionWorking, setReceptionWorking] = useState<string | null>(null);
  const [serials, setSerials] = useState<Record<string, string>>({});
  const tabs: Array<{ value: AppointmentStatus | "all"; label: string }> = [
    { value: "all", label: tr("সব", "All") }, { value: "pending", label: tr("নতুন অনুরোধ", "New Requests") },
    { value: "confirmed", label: tr("নিশ্চিত", "Confirmed") }, { value: "completed", label: tr("সম্পন্ন", "Completed") },
    { value: "cancelled", label: tr("বাতিল", "Cancelled") },
  ];
  const load = () => {
    setLoading(true);
    setError(null);
    Promise.all([
      getMyAppointments(
        selected === "all" ? null : selected,
        APPOINTMENT_PAGE_SIZE,
        0,
      ),
      getMyProviderReceptionAppointments(selected === "all" ? null : selected),
    ])
      .then(([page, reception]) => {
        setRows(page);
        setReceptionRows(reception);
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
  };
  useEffect(load, [selected]);
  if (account && !["hospital", "chamber"].includes(account.role))
    return <Navigate to="/dashboard" replace />;

  async function act(
    id: string,
    status: AppointmentStatus,
    confirmation = false,
  ) {
    if (
      confirmation &&
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
      load();
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

  async function actReception(
    item: ProviderReceptionAppointment,
    status: AppointmentStatus,
  ) {
    setReceptionWorking(item.appointment_id);
    setError(null);
    try {
      await updateProviderReceptionAppointment({
        appointmentId: item.appointment_id,
        status,
        serialNumber:
          status === "confirmed" && serials[item.appointment_id]
            ? Number(serials[item.appointment_id])
            : null,
      });
      await load();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : tr("রিসেপশনের অ্যাপয়েন্টমেন্ট হালনাগাদ করা যায়নি।", "The reception appointment could not be updated."),
      );
    } finally {
      setReceptionWorking(null);
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
            <CalendarDays />
          </span>
          <div>
            <small>{tr("স্বাধীন রিসেপশন তালিকা", "Independent Reception Queue")}</small>
            <h1>{tr("অ্যাপয়েন্টমেন্ট সারসংক্ষেপ", "Appointment Overview")}</h1>
            <p>{tr("রিসেপশন পরিচালিত ডাক্তার কার্ডের সিরিয়াল অনুরোধ এবং প্রচলিত অ্যাপয়েন্টমেন্ট এক জায়গা থেকে পরিচালনা করুন।", "Manage reception doctor-card serial requests and existing appointments in one place.")}</p>
          </div>
        </div>
        <div className="appointment-tabs">
          {tabs.map((tab) => (
            <button
              className={selected === tab.value ? "active" : ""}
              key={tab.value}
              onClick={() =>
                setParams(tab.value === "all" ? {} : { status: tab.value })
              }
            >
              {tab.label}
            </button>
          ))}
        </div>
        {!loading && (
          <div className="provider-stat-row">
            <div className="provider-stat-card amber">
              <span><Clock3 /></span>
              <div>
                <strong>{receptionRows.filter((item) => item.status === "pending").length}</strong>
                <small>{tr("রিসেপশন অপেক্ষমাণ", "Reception Pending")}</small>
              </div>
            </div>
            <div className="provider-stat-card">
              <span><CalendarCheck /></span>
              <div>
                <strong>{receptionRows.length}</strong>
                <small>{tr("রিসেপশন অনুরোধ", "Reception Requests")}</small>
              </div>
            </div>
            <div className="provider-stat-card">
              <span><CalendarDays /></span>
              <div>
                <strong>{rows.length}</strong>
                <small>{tr("ডাক্তারের অ্যাপয়েন্টমেন্ট", "Doctor Appointments")}</small>
              </div>
            </div>
          </div>
        )}
        {error && <div className="error-box">{error}</div>}
        {loading ? (
          <div className="loading-box">
            <LoaderCircle className="spin" /> {tr("অ্যাপয়েন্টমেন্ট লোড হচ্ছে…", "Loading appointments…")}
          </div>
        ) : (
          <>
            <section className="provider-reception-queue">
              <div className="section-title">
                <div>
                  <h2>{tr("রিসেপশনের সিরিয়াল অনুরোধ", "Reception Serial Requests")}</h2>
                  <p>{tr("হাসপাতাল পরিচালিত ডাক্তার কার্ড থেকে আসা অনুরোধ", "Requests from hospital-managed doctor cards")}</p>
                </div>
                <b>{receptionRows.length}</b>
              </div>
              <div className="appointment-list provider-appointment-list">
                {receptionRows.map((item) => (
                  <article key={item.appointment_id}>
                    <div className="appointment-date">
                      <CalendarDays />
                      <strong>
                        {new Intl.DateTimeFormat("bn-BD", {
                          dateStyle: "medium",
                        }).format(
                          new Date(`${item.appointment_date}T12:00:00`),
                        )}
                      </strong>
                      <span className={`status-${item.status}`}>
                        {statusLabel(item.status, language)}
                      </span>
                    </div>
                    <div className="appointment-body">
                      <span className="appointment-doctor-icon">
                        <UserRound />
                      </span>
                      <div>
                        <h2>{item.patient_name || "রোগী"}</h2>
                        <p>
                          <Stethoscope /> {item.doctor_name} • Reception card
                        </p>
                        <div className="appointment-meta">
                          {item.preferred_time && (
                            <span>
                              <Clock3 /> Preferred{" "}
                              {item.preferred_time.slice(0, 5)}
                            </span>
                          )}
                          {item.patient_phone && (
                            <span>{tr("ফোন", "Phone")}: {item.patient_phone}</span>
                          )}
                          {item.serial_number && (
                            <span>{tr("সিরিয়াল", "Serial")} #{item.serial_number}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    {item.patient_note && (
                      <p className="appointment-note">
                        <strong>{tr("রোগীর নোট", "Patient Note")}:</strong> {item.patient_note}
                      </p>
                    )}
                    {item.status === "pending" && (
                      <div className="doctor-appointment-actions reception-confirm-actions">
                        <input
                          type="number"
                          min={1}
                          value={serials[item.appointment_id] || ""}
                          onChange={(event) =>
                            setSerials((current) => ({
                              ...current,
                              [item.appointment_id]: event.target.value,
                            }))
                          }
                          placeholder="Serial (auto)"
                        />
                        <button
                          className="positive"
                          disabled={receptionWorking === item.appointment_id}
                          onClick={() => void actReception(item, "confirmed")}
                        >
                          <Check /> Confirm
                        </button>
                        <button
                          className="danger"
                          disabled={receptionWorking === item.appointment_id}
                          onClick={() => void actReception(item, "rejected")}
                        >
                          <X /> Reject
                        </button>
                      </div>
                    )}
                    {item.status === "confirmed" && (
                      <div className="doctor-appointment-actions">
                        <button
                          className="positive"
                          disabled={receptionWorking === item.appointment_id}
                          onClick={() => void actReception(item, "completed")}
                        >
                          <CalendarCheck /> সম্পন্ন
                        </button>
                        <button
                          disabled={receptionWorking === item.appointment_id}
                          onClick={() => void actReception(item, "no_show")}
                        >
                          অনুপস্থিত
                        </button>
                        <button
                          className="danger"
                          disabled={receptionWorking === item.appointment_id}
                          onClick={() => void actReception(item, "cancelled")}
                        >
                          <X /> বাতিল
                        </button>
                      </div>
                    )}
                  </article>
                ))}
              </div>
              {!receptionRows.length && (
                <div className="empty-inline">
                  {tr("এই অবস্থায় রিসেপশনের কোনো অনুরোধ নেই।", "There are no reception requests with this status.")}
                </div>
              )}
            </section>
            {rows.length ? (
              <>
                <section className="provider-existing-appointment-queue">
                  <div className="section-title">
                    <div>
                      <h2>{tr("ডাক্তারের প্রচলিত অ্যাপয়েন্টমেন্ট", "Existing Doctor Appointments")}</h2>
                      <p>{tr("ডাক্তারের সময়সূচিভিত্তিক বুকিং থেকে আসা অনুরোধ", "Requests from the doctor's schedule-based booking flow")}</p>
                    </div>
                    <b>{rows.length}</b>
                  </div>
                  <div className="appointment-list provider-appointment-list">
                    {rows.map((row) => (
                      <article key={row.appointment_id}>
                        <div className="appointment-date">
                          <CalendarDays />
                          <strong>
                            {new Intl.DateTimeFormat("bn-BD", {
                              dateStyle: "medium",
                            }).format(
                              new Date(`${row.appointment_date}T12:00:00`),
                            )}
                          </strong>
                          <span className={`status-${row.status}`}>
                            {statusLabel(row.status, language)}
                          </span>
                        </div>
                        <div className="appointment-body">
                          <span className="appointment-doctor-icon">
                            <UserRound />
                          </span>
                          <div>
                            <h2>{row.patient_name || "রোগী"}</h2>
                            <p>
                              <Stethoscope /> {row.doctor_name} •{" "}
                              {row.provider_name}
                            </p>
                            <div className="appointment-meta">
                              {row.start_time && (
                                <span>
                                  <Clock3 /> {row.start_time.slice(0, 5)}–
                                  {row.end_time?.slice(0, 5)}
                                </span>
                              )}
                              {row.address && (
                                <span>
                                  <MapPin /> {row.address}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="appointment-fee">
                            <small>{tr("পরামর্শ ফি", "Consultation Fee")}</small>
                            <strong>
                              {row.consultation_fee == null
                                ? "—"
                                : `৳${row.consultation_fee}`}
                            </strong>
                          </div>
                        </div>
                        {row.patient_note && (
                          <p className="appointment-note">
                            <strong>{tr("রোগীর নোট", "Patient Note")}:</strong> {row.patient_note}
                          </p>
                        )}
                        {row.status === "pending" && (
                          <div className="doctor-appointment-actions">
                            <button
                              className="positive"
                              disabled={Boolean(working)}
                              onClick={() =>
                                void act(row.appointment_id, "confirmed")
                              }
                            >
                              <Check /> Confirm
                            </button>
                            <button
                              className={
                                confirmAction?.id === row.appointment_id
                                  ? "danger confirming"
                                  : "danger"
                              }
                              disabled={Boolean(working)}
                              onClick={() =>
                                void act(row.appointment_id, "rejected", true)
                              }
                            >
                              <X />{" "}
                              {confirmAction?.id === row.appointment_id
                                ? "নিশ্চিত করুন"
                                : "Reject"}
                            </button>
                            {confirmAction?.id === row.appointment_id && (
                              <button onClick={() => setConfirmAction(null)}>
                                ফিরে যান
                              </button>
                            )}
                          </div>
                        )}
                        {row.status === "confirmed" && (
                          <div className="doctor-appointment-actions">
                            <button
                              className="positive"
                              disabled={Boolean(working)}
                              onClick={() =>
                                void act(row.appointment_id, "completed")
                              }
                            >
                              <CalendarCheck /> সম্পন্ন
                            </button>
                            <button
                              disabled={Boolean(working)}
                              onClick={() =>
                                void act(row.appointment_id, "no_show")
                              }
                            >
                              অনুপস্থিত
                            </button>
                            <button
                              className={
                                confirmAction?.id === row.appointment_id
                                  ? "danger confirming"
                                  : "danger"
                              }
                              disabled={Boolean(working)}
                              onClick={() =>
                                void act(row.appointment_id, "cancelled", true)
                              }
                            >
                              <X />{" "}
                              {confirmAction?.id === row.appointment_id
                                ? "নিশ্চিত করুন"
                                : "বাতিল"}
                            </button>
                            {confirmAction?.id === row.appointment_id && (
                              <button onClick={() => setConfirmAction(null)}>
                                ফিরে যান
                              </button>
                            )}
                          </div>
                        )}
                      </article>
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
                            <LoaderCircle className="spin" /> লোড হচ্ছে…
                          </>
                        ) : (
                          "আরও দেখুন"
                        )}
                      </button>
                    </div>
                  )}
                </section>
              </>
            ) : null}
            {!rows.length && !receptionRows.length && (
              <div className="empty-state">
                <span>📅</span>
                <h3>{tr("এই অবস্থায় কোনো অ্যাপয়েন্টমেন্ট নেই", "No Appointments with This Status")}</h3>
                <p>{tr("রোগীর অনুরোধ এলে এখানে দেখা যাবে।", "Patient requests will appear here.")}</p>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
