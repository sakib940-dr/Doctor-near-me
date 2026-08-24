import { useEffect, useState } from 'react';
import { Crosshair, LoaderCircle, MapPin } from 'lucide-react';

type Props = {
  latitude: number | null;
  longitude: number | null;
  onChange: (latitude: number | null, longitude: number | null) => void;
  onCurrentLocation?: () => void;
  loading?: boolean;
  label?: string;
  gpsLabel?: string;
  loadingLabel?: string;
  helper?: string;
  required?: boolean;
};

const format = (latitude: number | null, longitude: number | null) =>
  latitude == null || longitude == null ? '' : `${latitude}, ${longitude}`;

export default function CombinedCoordinateInput({
  latitude, longitude, onChange, onCurrentLocation, loading = false,
  label = 'Map location (Latitude, Longitude)', gpsLabel = 'Current GPS',
  loadingLabel = 'Getting location…', helper = 'Example: 23.8103, 90.4125', required = false,
}: Props) {
  const [value, setValue] = useState(() => format(latitude, longitude));
  useEffect(() => setValue(format(latitude, longitude)), [latitude, longitude]);

  function update(next: string) {
    setValue(next);
    if (!next.trim()) { onChange(null, null); return; }
    const parts = next.trim().split(/[\s,]+/).filter(Boolean);
    if (parts.length !== 2) { onChange(null, null); return; }
    const lat = Number(parts[0]);
    const lng = Number(parts[1]);
    if (Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) onChange(lat, lng);
    else onChange(null, null);
  }

  return <label className="combined-coordinate-field">
    <span>{label}</span>
    <div className="combined-coordinate-row">
      <div><MapPin /><input required={required} inputMode="decimal" value={value} onChange={(event) => update(event.target.value)} placeholder="23.8103, 90.4125" /></div>
      {onCurrentLocation && <button type="button" disabled={loading} onClick={onCurrentLocation}>{loading ? <LoaderCircle className="spin" /> : <Crosshair />}<span>{loading ? loadingLabel : gpsLabel}</span></button>}
    </div>
    <small>{helper}</small>
  </label>;
}
