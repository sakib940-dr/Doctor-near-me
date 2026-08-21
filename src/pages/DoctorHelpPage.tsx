import { useEffect, useState } from 'react';
import { BookOpenCheck, CircleHelp, LoaderCircle } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getDoctorHelpPages } from '../services/doctorSupport';

export default function DoctorHelpPage() {
  const { account } = useAuth();
  const [pages, setPages] = useState<Awaited<ReturnType<typeof getDoctorHelpPages>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { getDoctorHelpPages().then(setPages).catch((e: unknown) => setError(e instanceof Error ? e.message : 'Help content লোড করা যায়নি।')).finally(() => setLoading(false)); }, []);
  if (account && account.role !== 'doctor') return <Navigate to="/dashboard" replace />;

  return <div className="app-shell doctor-module-page"><main className="doctor-module-main container">
    <header className="doctor-module-heading"><span><CircleHelp /></span><div><small>Doctor module guide</small><h1>FAQ / Help</h1><p>Doctor module-এর গুরুত্বপূর্ণ workflow, navigation এবং published help content.</p></div></header>
    {loading && <div className="loading-box"><LoaderCircle className="spin" /> Help লোড হচ্ছে…</div>}{error && <div className="error-box">{error}</div>}
    <section className="doctor-help-grid">
      <article className="doctor-module-card"><header><BookOpenCheck /><div><h2>Quick Guide</h2><p>নতুন Doctor navigation structure</p></div></header><ol><li>Appointment Management থেকে Today/Upcoming এবং সব appointment পরিচালনা করুন।</li><li>Prescription tab থেকে existing prescription workflow ব্যবহার করুন।</li><li>Analytics-এ appointment + public profile analytics একসাথে দেখুন।</li><li>Public Content Management-এর ৬টি step আলাদাভাবে Save করুন।</li><li>Verification application submit হলে Pending অবস্থায় edit locked থাকবে।</li><li>My Profile private information; Public Profile View visitor-facing live profile.</li></ol></article>
      {pages.map((page) => <article className="doctor-module-card doctor-cms-help" key={page.slug}><header><CircleHelp /><div><h2>{page.title_bn}</h2>{page.title_en && <p>{page.title_en}</p>}</div></header><div className="doctor-help-body">{page.body_bn.split(/\n{2,}/).filter(Boolean).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div></article>)}
      {!loading && !pages.length && <article className="doctor-module-card doctor-cms-help"><h2>FAQ content এখনো publish করা হয়নি</h2><p>Admin CMS থেকে FAQ/Help publish করলে এখানে automatically দেখা যাবে।</p></article>}
    </section>
  </main></div>;
}
