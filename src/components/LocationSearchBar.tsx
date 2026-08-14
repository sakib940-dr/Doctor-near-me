import { LoaderCircle, LocateFixed, MapPin, Search } from 'lucide-react';
import { FormEvent } from 'react';
import type { District, Upazila } from '../types';
import type { GeoStatus } from '../hooks/useGeolocation';

export default function LocationSearchBar({
  districts,
  upazilas,
  districtId,
  upazilaId,
  onDistrictChange,
  onUpazilaChange,
  query,
  onQueryChange,
  onSubmit,
  geoStatus,
  onRequestLocation,
}: {
  districts: District[];
  upazilas: Upazila[];
  districtId: string;
  upazilaId: string;
  onDistrictChange: (value: string) => void;
  onUpazilaChange: (value: string) => void;
  query: string;
  onQueryChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  geoStatus: GeoStatus;
  onRequestLocation: () => void;
}) {
  return (
    <form className="loc-search-bar" onSubmit={onSubmit}>
      <div className="loc-search-row">
        <label className="loc-field">
          <MapPin size={16} />
          <span className="sr-only">জেলা নির্বাচন করুন</span>
          <select value={districtId} onChange={(event) => onDistrictChange(event.target.value)}>
            <option value="">জেলা</option>
            {districts.map((district) => <option key={district.id} value={district.id}>{district.name_bn}</option>)}
          </select>
        </label>
        <label className="loc-field">
          <span className="sr-only">উপজেলা নির্বাচন করুন</span>
          <select value={upazilaId} disabled={!districtId} onChange={(event) => onUpazilaChange(event.target.value)}>
            <option value="">উপজেলা</option>
            {upazilas.map((upazila) => <option key={upazila.id} value={upazila.id}>{upazila.name_bn}</option>)}
          </select>
        </label>
        <button
          className={geoStatus === 'granted' ? 'loc-gps-btn active' : 'loc-gps-btn'}
          type="button"
          onClick={onRequestLocation}
          disabled={geoStatus === 'requesting'}
          title="আমার বর্তমান লোকেশন ব্যবহার করুন"
        >
          {geoStatus === 'requesting' ? <LoaderCircle className="spin" size={16} /> : <LocateFixed size={16} />}
        </button>
      </div>
      <div className="loc-query-row">
        <Search size={18} />
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="ডাক্তার, রোগ বা স্পেশালিটি খুঁজুন…"
          aria-label="ডাক্তার খুঁজুন"
        />
        <button type="submit">খুঁজুন</button>
      </div>
    </form>
  );
}
