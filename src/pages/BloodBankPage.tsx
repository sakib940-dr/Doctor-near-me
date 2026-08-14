import { FormEvent, useEffect, useState } from 'react';
import { Droplets, LoaderCircle, Phone, User } from 'lucide-react';
import PublicHeader from '../components/PublicHeader';
import { isSupabaseConfigured } from '../lib/supabase';
import { getDistricts, getUpazilas, searchBloodDonors } from '../services/discovery';
import type { District, Upazila } from '../types';

const bloodGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const messageFrom = (error: unknown) => error instanceof Error ? error.message : 'তথ্য লোড করা যায়নি।';

interface DonorRow {
  donor_id: string;
  donor_name: string;
  phone: string | null;
  blood_group: string;
  district_id: number | null;
  upazila_id: number | null;
  last_donation_date: string | null;
}

export default function BloodBankPage() {
  const [bloodGroup, setBloodGroup] = useState('');
  const [districtId, setDistrictId] = useState('');
  const [upazilaId, setUpazilaId] = useState('');
  const [districts, setDistricts] = useState<District[]>([]);
  const [upazilas, setUpazilas] = useState<Upazila[]>([]);
  const [rows, setRows] = useState<DonorRow[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'রক্ত ব্যাংক | সিরাজগঞ্জ ডাক্তার';
    if (!isSupabaseConfigured) return;
    getDistricts().then(setDistricts).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!districtId || !isSupabaseConfigured) { setUpazilas([]); return; }
    getUpazilas(Number(districtId)).then(setUpazilas).catch(() => setUpazilas([]));
  }, [districtId]);

  async function handleSearch(event: FormEvent) {
    event.preventDefault();
    if (!bloodGroup) return;
    if (!isSupabaseConfigured) { setError('লাইভ অনুসন্ধানের জন্য Supabase environment variables প্রয়োজন।'); return; }
    setLoading(true);
    setSearched(true);
    setError(null);
    try {
      const result = await searchBloodDonors({
        bloodGroup,
        districtId: districtId ? Number(districtId) : null,
        upazilaId: upazilaId ? Number(upazilaId) : null,
      });
      setRows(result);
    } catch (searchError) {
      setError(messageFrom(searchError));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-shell directory-page">
      <PublicHeader />
      <main>
        <section className="directory-hero blood-hero">
          <div className="container">
            <span><Droplets size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />জরুরি রক্তদাতা নেটওয়ার্ক</span>
            <h1>রক্তদাতা খুঁজুন</h1>
            <p>রক্তের গ্রুপ ও এলাকা অনুযায়ী স্বেচ্ছাসেবী রক্তদাতা খুঁজে নিন</p>
          </div>
        </section>

        <section className="container">
          <form className="blood-search-form" onSubmit={handleSearch}>
            <select value={bloodGroup} onChange={(event) => setBloodGroup(event.target.value)} required>
              <option value="">রক্তের গ্রুপ নির্বাচন করুন</option>
              {bloodGroups.map((group) => <option key={group} value={group}>{group}</option>)}
            </select>
            <select value={districtId} onChange={(event) => { setDistrictId(event.target.value); setUpazilaId(''); }}>
              <option value="">সকল জেলা</option>
              {districts.map((district) => <option key={district.id} value={district.id}>{district.name_bn}</option>)}
            </select>
            <select value={upazilaId} disabled={!districtId} onChange={(event) => setUpazilaId(event.target.value)}>
              <option value="">সকল উপজেলা</option>
              {upazilas.map((upazila) => <option key={upazila.id} value={upazila.id}>{upazila.name_bn}</option>)}
            </select>
            <button type="submit" disabled={loading || !bloodGroup}>{loading ? <LoaderCircle className="spin" size={18} /> : 'খুঁজুন'}</button>
          </form>

          {error && <div className="error-box" role="alert">{error}</div>}
          {loading && <div className="loading-box"><LoaderCircle className="spin" /> খোঁজা হচ্ছে…</div>}

          {!loading && searched && rows.length === 0 && !error && (
            <div className="empty-state">
              <span>🩸</span>
              <h3>কোনো রক্তদাতা পাওয়া যায়নি</h3>
              <p>এই মুহূর্তে এই এলাকায় সরাসরি ফলাফল দেখানো যাচ্ছে না। জরুরি প্রয়োজনে লগইন করে আবার চেষ্টা করুন অথবা নিকটস্থ হাসপাতালে যোগাযোগ করুন।</p>
            </div>
          )}

          {!loading && rows.length > 0 && (
            <div className="donor-list">
              {rows.map((donor) => (
                <article className="donor-card" key={donor.donor_id}>
                  <div className="donor-avatar"><User size={22} /></div>
                  <div className="donor-body">
                    <h3>{donor.donor_name}</h3>
                    <span className="donor-group">{donor.blood_group}</span>
                  </div>
                  {donor.phone ? <a className="chamber-call" href={`tel:${donor.phone}`}><Phone size={16} /> {donor.phone}</a> : <span className="donor-nophone">ফোন নম্বর গোপন রাখা হয়েছে</span>}
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
