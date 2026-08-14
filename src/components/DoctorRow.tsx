import { ChevronRight, LoaderCircle, LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import DoctorHorizontalCard from './DoctorHorizontalCard';
import type { DoctorSearchRow } from '../types';

export default function DoctorRow({
  id,
  icon: Icon,
  title,
  subtitle,
  doctors,
  loading,
  viewAllTo,
  emptyText,
}: {
  id?: string;
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  doctors: DoctorSearchRow[];
  loading?: boolean;
  viewAllTo: string;
  emptyText: string;
}) {
  return (
    <section className="container home-row" id={id}>
      <div className="home-row-head">
        <div className="home-row-heading"><span className="home-row-icon"><Icon size={18} /></span><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div></div>
        {doctors.length > 0 && <Link className="home-row-viewall" to={viewAllTo}>সব দেখুন <ChevronRight size={15} /></Link>}
      </div>

      {loading ? (
        <div className="loading-box"><LoaderCircle className="spin" /> লোড হচ্ছে…</div>
      ) : doctors.length === 0 ? (
        <div className="empty-state small"><p>{emptyText}</p></div>
      ) : (
        <div className="home-row-scroll">
          {doctors.map((doctor) => <div className="home-row-item" key={doctor.doctor_id}><DoctorHorizontalCard doctor={doctor} /></div>)}
        </div>
      )}
    </section>
  );
}
