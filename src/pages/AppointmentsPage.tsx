import { useEffect, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  Clock3,
  LoaderCircle,
  MapPin,
  Stethoscope,
  XCircle,
} from "lucide-react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useVisitorLanguage, type VisitorLanguage } from "../contexts/VisitorLanguageContext";
import { cancelAppointment, getMyAppointments } from "../services/appointments";
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
const APPOINTMENT_PAGE_SIZE = 30;

export default function AppointmentsPage() {
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
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const tabs: Array<{ value: AppointmentStatus | "all"; label: string }> = [
    { value: "all", label: tr("সব", "All") }, { value: "pending", label: tr("অপেক্ষমাণ", "Pending") },
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
  if (account && account.role !== "patient")
    return <Navigate to="/dashboard" replace />;

  async function cancel(id: string) {
    if (confirmId !== id) {
      setConfirmId(id);
      return;
    }
    setWorkingId(id);
    setError(null);
    try {
      await cancelAppointment(id);
      setConfirmId(null);
      load();
    } catch (cancelError) {
      setError(
        cancelError instanceof Error ? cancelError.message : tr("বাতিল করা যায়নি।", "The appointment could not be cancelled."),
      );
    } finally {
      setWorkingId(null);
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

  async function cancelReception(id: string) {
    if (confirmId !== id) {
      setConfirmId(id);
      return;
    }
    setWorkingId(id);
    setError(null);
    try {
      await updateProviderReceptionAppointment({
        appointmentId: id,
        status: "cancelled",
      });
      setConfirmId(null);
      load();
    } catch (cancelError) {
      setError(
        cancelError instanceof Error
          ? cancelError.message
          : tr("রিসেপশনের অ্যাপয়েন্টমেন্ট বাতিল করা যায়নি।", "The reception appointment could not be cancelled."),
      );
    } finally {
      setWorkingId(null);
    }
  }

  return (
    <div className="app-shell appointments-page">
      <main className="appointments-main container">
        <Link className="back-link" to="/dashboard">
          <ArrowLeft /> {tr("ড্যাশবোর্ডে ফিরুন", "Back to Dashboard")}
        </Link>
        <div className="appointments-heading">
          <div>
            <span>{tr("রোগীর অ্যাকাউন্ট", "Patient Account")}</span>
            <h1>{tr("আমার অ্যাপয়েন্টমেন্ট", "My Appointments")}</h1>
            <p>{tr("ডাক্তারের বুকিং ও হাসপাতাল রিসেপশনের সিরিয়াল এক জায়গায় দেখুন।", "View doctor bookings and hospital reception serials in one place.")}</p>
          </div>
          <Link to="/doctors">{tr("ডাক্তার খুঁজুন", "Find a Doctor")}</Link>
        </div>
        {params.get("created") === "1" && (
          <div className="auth-message success">
            {tr("অ্যাপয়েন্টমেন্ট অনুরোধ সফলভাবে পাঠানো হয়েছে।", "Appointment request sent successfully.")}
          </div>
        )}
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
        {error && (
          <div className="error-box" role="alert">
            {error}
          </div>
        )}
        {loading ? (
          <div className="loading-box">
            <LoaderCircle className="spin" /> {tr("অ্যাপয়েন্টমেন্ট লোড হচ্ছে…", "Loading appointments…")}
          </div>
        ) : (
          <>
            {receptionRows.length > 0 && (
              <section className="patient-reception-appointments">
                <div className="section-title">
                  <div>
                    <h2>{tr("হাসপাতাল রিসেপশনের সিরিয়াল", "Hospital Reception Serials")}</h2>
                    <p>{tr("হাসপাতালের ডাক্তার কার্ড থেকে নেওয়া অনুরোধ", "Requests made from hospital doctor cards")}</p>
                  </div>
                  <b>{receptionRows.length}</b>
                </div>
                <div className="appointment-list">
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
                          <Stethoscope />
                        </span>
                        <div>
                          <h2>{item.doctor_name}</h2>
                          <p>{item.provider_name} Reception</p>
                          <div className="appointment-meta">
                            {item.preferred_time && (
                              <span>
                                <Clock3 /> Preferred{" "}
                                {item.preferred_time.slice(0, 5)}
                              </span>
                            )}
                            {item.serial_number && (
                              <span className="patient-serial-number">
                                Serial #{item.serial_number}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      {item.patient_note && (
                        <p className="appointment-note">
                          নোট: {item.patient_note}
                        </p>
                      )}
                      {["pending", "confirmed"].includes(item.status) && (
                        <div className="appointment-actions">
                          {confirmId === item.appointment_id && (
                            <span>আপনি কি নিশ্চিত?</span>
                          )}
                          <button
                            className={
                              confirmId === item.appointment_id
                                ? "confirming"
                                : ""
                            }
                            disabled={workingId === item.appointment_id}
                            onClick={() =>
                              void cancelReception(item.appointment_id)
                            }
                          >
                            {workingId === item.appointment_id ? (
                              <LoaderCircle className="spin" />
                            ) : (
                              <XCircle />
                            )}
                            {confirmId === item.appointment_id
                              ? "হ্যাঁ, বাতিল করুন"
                              : "বাতিল করুন"}
                          </button>
                          {confirmId === item.appointment_id && (
                            <button onClick={() => setConfirmId(null)}>
                              না
                            </button>
                          )}
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              </section>
            )}
            {rows.length ? (
              <>
                <section>
                  <div className="section-title">
                    <div>
                      <h2>{tr("ডাক্তারের অ্যাপয়েন্টমেন্ট", "Doctor Appointments")}</h2>
                      <p>{tr("ডাক্তারের প্রোফাইল থেকে করা বুকিং", "Bookings made from doctor profiles")}</p>
                    </div>
                    <b>{rows.length}</b>
                  </div>
                  <div className="appointment-list">
                    {rows.map((appointment) => (
                      <article key={appointment.appointment_id}>
                        <div className="appointment-date">
                          <CalendarDays />
                          <strong>
                            {new Intl.DateTimeFormat("bn-BD", {
                              dateStyle: "medium",
                            }).format(
                              new Date(
                                `${appointment.appointment_date}T12:00:00`,
                              ),
                            )}
                          </strong>
                          <span className={`status-${appointment.status}`}>
                            {statusLabel(appointment.status, language)}
                          </span>
                        </div>
                        <div className="appointment-body">
                          <span className="appointment-doctor-icon">
                            <Stethoscope />
                          </span>
                          <div>
                            <h2>{appointment.doctor_name}</h2>
                            <p>
                              {appointment.provider_name ||
                                "চেম্বার নির্ধারিত নয়"}
                            </p>
                            <div className="appointment-meta">
                              {appointment.start_time && (
                                <span>
                                  <Clock3 />{" "}
                                  {appointment.start_time.slice(0, 5)} –{" "}
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
                            <small>ভিজিট ফি</small>
                            <strong>
                              {appointment.consultation_fee == null
                                ? "—"
                                : `৳${appointment.consultation_fee}`}
                            </strong>
                          </div>
                        </div>
                        {appointment.patient_note && (
                          <p className="appointment-note">
                            নোট: {appointment.patient_note}
                          </p>
                        )}
                        {["pending", "confirmed"].includes(
                          appointment.status,
                        ) && (
                          <div className="appointment-actions">
                            {confirmId === appointment.appointment_id && (
                              <span>আপনি কি নিশ্চিত?</span>
                            )}
                            <button
                              className={
                                confirmId === appointment.appointment_id
                                  ? "confirming"
                                  : ""
                              }
                              type="button"
                              disabled={
                                workingId === appointment.appointment_id
                              }
                              onClick={() =>
                                void cancel(appointment.appointment_id)
                              }
                            >
                              {workingId === appointment.appointment_id ? (
                                <LoaderCircle className="spin" />
                              ) : (
                                <XCircle />
                              )}{" "}
                              {confirmId === appointment.appointment_id
                                ? "হ্যাঁ, বাতিল করুন"
                                : "বাতিল করুন"}
                            </button>
                            {confirmId === appointment.appointment_id && (
                              <button
                                type="button"
                                onClick={() => setConfirmId(null)}
                              >
                                না
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
                <h3>{tr("কোনো অ্যাপয়েন্টমেন্ট নেই", "No Appointments")}</h3>
                <p>{tr("ডাক্তারের প্রোফাইল বা হাসপাতালের ডাক্তার কার্ড থেকে অ্যাপয়েন্টমেন্ট নিতে পারবেন।", "You can book from a doctor profile or a hospital doctor card.")}</p>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
