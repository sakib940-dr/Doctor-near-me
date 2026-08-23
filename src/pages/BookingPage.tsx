import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  Clock3,
  LoaderCircle,
  MapPin,
  ShieldCheck,
  Stethoscope,
} from "lucide-react";
import {
  Link,
  Navigate,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useVisitorLanguage } from "../contexts/VisitorLanguageContext";
import { doctorPublicPath } from "../lib/publicRoutes";
import { createPatientAppointment } from "../services/appointments";
import { getDoctorPublicProfile } from "../services/discovery";
import type { DoctorPublicProfile } from "../types";

const today = () => {
  const date = new Date();
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
};
const maxDate = () => {
  const date = new Date();
  date.setDate(date.getDate() + 180);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
};
const displayTime = (time: string) => time.slice(0, 5);

export default function BookingPage() {
  const { doctorId = "" } = useParams();
  const { account } = useAuth();
  const { language } = useVisitorLanguage();
  const tr = (bn: string, en: string) => (language === "bn" ? bn : en);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedProviderId = searchParams.get("provider") || "";
  const [profile, setProfile] = useState<DoctorPublicProfile | null>(null);
  const [providerId, setProviderId] = useState("");
  const [date, setDate] = useState("");
  const [scheduleKey, setScheduleKey] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDoctorPublicProfile(doctorId)
      .then((result) => {
        setProfile(result);
        const requested = result?.chambers.find(
          (item) => item.id === requestedProviderId,
        );
        if (requested) setProviderId(requested.id);
        else if (result?.chambers[0]) setProviderId(result.chambers[0].id);
      })
      .catch((loadError: unknown) =>
        setError(
          loadError instanceof Error
            ? loadError.message
            : "ডাক্তার তথ্য লোড হয়নি।",
        ),
      )
      .finally(() => setLoading(false));
  }, [doctorId, requestedProviderId]);
  const chamber = profile?.chambers.find((item) => item.id === providerId);
  const day = date ? new Date(`${date}T12:00:00`).getDay() : null;
  const schedules = useMemo(
    () =>
      chamber?.schedules.filter((schedule) => day === schedule.day_of_week) ??
      [],
    [chamber, day],
  );
  const selectedSchedule = schedules.find(
    (schedule) => `${schedule.start_time}-${schedule.end_time}` === scheduleKey,
  );
  const canBookOnline = Boolean(profile?.doctor.accepting_appointments);

  if (account && account.role !== "patient")
    return <Navigate to="/dashboard" replace />;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedSchedule) {
      setError(tr("তারিখ অনুযায়ী সাক্ষাতের সময় নির্বাচন করুন।", "Select a visiting time for the chosen date."));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await createPatientAppointment({
        doctorId,
        providerId,
        appointmentDate: date,
        startTime: selectedSchedule.start_time,
        endTime: selectedSchedule.end_time,
        patientNote: note,
      });
      navigate("/appointments?created=1", { replace: true });
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : tr("অ্যাপয়েন্টমেন্ট অনুরোধ পাঠানো যায়নি।", "The appointment request could not be sent."),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="app-shell booking-page">
      <main className="booking-main container">
        <Link className="back-link" to={doctorPublicPath(null, doctorId)}>
          <ArrowLeft /> {tr("ডাক্তারের প্রোফাইলে ফিরুন", "Back to Doctor Profile")}
        </Link>
        {loading && (
          <div className="loading-box">
            <LoaderCircle className="spin" /> {tr("তথ্য লোড হচ্ছে…", "Loading information…")}
          </div>
        )}
        {!loading && !profile && (
          <div className="empty-state">
            <span>
              <Stethoscope />
            </span>
            <h3>{tr("ডাক্তার পাওয়া যায়নি", "Doctor Not Found")}</h3>
          </div>
        )}
        {profile && !canBookOnline && (
          <div className="empty-state booking-unavailable">
            <span>
              <ShieldCheck />
            </span>
            <h3>{tr("অনলাইন অ্যাপয়েন্টমেন্ট এখন চালু নেই", "Online Appointments Are Currently Unavailable")}</h3>
            <p>{tr("এই ডাক্তার বর্তমানে অনলাইনে অ্যাপয়েন্টমেন্ট গ্রহণ করছেন না। প্রোফাইল থেকে ফোন বা হোয়াটসঅ্যাপে যোগাযোগ করতে পারেন।", "This doctor is not currently accepting online appointments. You can contact the chamber by phone or WhatsApp from the profile.")}</p>
          </div>
        )}
        {profile && canBookOnline && (
          <div className="booking-layout">
            <section className="booking-summary">
              <span>
                <Stethoscope />
              </span>
              <h1>{profile.doctor.name}</h1>
              <p>
                {profile.doctor.designation ||
                  profile.doctor.professional_title}
              </p>
              <div className="directory-tags">
                {profile.specialties.map((specialty) => (
                  <span key={specialty.id}>{language === "bn" ? specialty.name_bn : specialty.name_en || specialty.name_bn}</span>
                ))}
              </div>
              <div className="booking-safety">
                <ShieldCheck />
                <p>
                  {tr("এটি একটি অ্যাপয়েন্টমেন্ট অনুরোধ। ডাক্তার বা চেম্বার নিশ্চিত করলে এর অবস্থা পরিবর্তন হবে।", "This is an appointment request. Its status will change after the doctor or chamber confirms it.")}
                </p>
              </div>
            </section>
            <form className="booking-form" onSubmit={submit}>
              <h2>{tr("অ্যাপয়েন্টমেন্টের সময় বেছে নিন", "Choose an Appointment Time")}</h2>
              <label className="auth-field">
                <span>{tr("চেম্বার / হাসপাতাল", "Chamber / Hospital")}</span>
                <div>
                  <MapPin />
                  <select
                    required
                    value={providerId}
                    onChange={(event) => {
                      setProviderId(event.target.value);
                      setScheduleKey("");
                    }}
                  >
                    {profile.chambers.map((item) => (
                      <option key={item.id} value={item.id}>
                        {language === "bn" ? item.name_bn : item.name_en || item.name_bn}
                      </option>
                    ))}
                  </select>
                </div>
              </label>
              {chamber && <p className="selected-address">{chamber.address}</p>}
              <label className="auth-field">
                <span>{tr("তারিখ", "Date")}</span>
                <div>
                  <CalendarDays />
                  <input
                    required
                    type="date"
                    min={today()}
                    max={maxDate()}
                    value={date}
                    onChange={(event) => {
                      setDate(event.target.value);
                      setScheduleKey("");
                    }}
                  />
                </div>
              </label>
              <fieldset className="schedule-picker">
                <legend>{tr("সাক্ষাতের সময়", "Visiting Time")}</legend>
                {!date ? (
                  <p>{tr("আগে তারিখ নির্বাচন করুন।", "Select a date first.")}</p>
                ) : schedules.length ? (
                  schedules.map((schedule) => {
                    const key = `${schedule.start_time}-${schedule.end_time}`;
                    return (
                      <label
                        className={scheduleKey === key ? "selected" : ""}
                        key={key}
                      >
                        <input
                          type="radio"
                          name="schedule"
                          checked={scheduleKey === key}
                          onChange={() => setScheduleKey(key)}
                        />
                        <Clock3 />
                        <span>
                          <strong>
                            {displayTime(schedule.start_time)} –{" "}
                            {displayTime(schedule.end_time)}
                          </strong>
                          <small>
                            {schedule.fee == null
                              ? tr("ফি জানতে যোগাযোগ করুন", "Contact for fee")
                              : `৳${schedule.fee}`}
                          </small>
                        </span>
                      </label>
                    );
                  })
                ) : (
                  <p>{tr("এই দিনে সাক্ষাতের সময়সূচি নেই। অন্য তারিখ নির্বাচন করুন।", "No visiting schedule is available on this date. Choose another date.")}</p>
                )}
              </fieldset>
              <label className="booking-note">
                <span>
                  {tr("সমস্যা বা নোট", "Problem or Note")} <small>({note.length}/500)</small>
                </span>
                <textarea
                  maxLength={500}
                  rows={4}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder={tr("সংক্ষেপে রোগীর সমস্যা লিখুন (ঐচ্ছিক)", "Briefly describe the patient's problem (optional)")}
                />
              </label>
              {error && (
                <div className="auth-message error" role="alert">
                  {error}
                </div>
              )}
              <button
                className="auth-submit"
                type="submit"
                disabled={submitting || !selectedSchedule}
              >
                {submitting ? (
                  <LoaderCircle className="spin" />
                ) : (
                  tr("অ্যাপয়েন্টমেন্ট অনুরোধ পাঠান", "Send Appointment Request")
                )}
              </button>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
