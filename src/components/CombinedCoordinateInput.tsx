import { useEffect, useRef, useState } from 'react';
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

const digitMap:Record<string,string>={'০':'0','১':'1','২':'2','৩':'3','৪':'4','৫':'5','৬':'6','৭':'7','৮':'8','৯':'9','٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9'};
function parseCoordinatePair(input:string):[number,number]|null{
  const normalized=input.replace(/[০-৯٠-٩]/g,(digit)=>digitMap[digit]||digit).replace(/[−–—]/g,'-').trim();
  const urlPair=normalized.match(/(?:@|[?&](?:q|query|destination)=)(-?\d{1,2}(?:\.\d+)?)\s*(?:,|%2C)\s*(-?\d{1,3}(?:\.\d+)?)/i);
  const plainPair=normalized.match(/^\s*\(?\s*(-?\d{1,2}(?:\.\d+)?)\s*[,;|\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*\)?\s*$/);
  const match=urlPair||plainPair;
  if(!match)return null;
  const lat=Number(match[1]),lng=Number(match[2]);
  return Number.isFinite(lat)&&Number.isFinite(lng)&&lat>=-90&&lat<=90&&lng>=-180&&lng<=180?[lat,lng]:null;
}

export default function CombinedCoordinateInput({
  latitude, longitude, onChange, onCurrentLocation, loading = false,
  label = 'Map location (Latitude, Longitude)', gpsLabel = 'Current GPS',
  loadingLabel = 'Getting location…', helper = 'Example: 23.8103, 90.4125', required = false,
}: Props) {
  const [value, setValue] = useState(() => format(latitude, longitude));
  const [invalid,setInvalid]=useState(false);
  const inputRef=useRef<HTMLInputElement>(null);
  useEffect(() => {
    setValue(format(latitude, longitude));
    if(latitude!=null&&longitude!=null){setInvalid(false);inputRef.current?.setCustomValidity('');}
  }, [latitude, longitude]);

  function update(next: string) {
    setValue(next);
    if (!next.trim()) { setInvalid(false);inputRef.current?.setCustomValidity('');onChange(null, null);return; }
    const pair=parseCoordinatePair(next);
    const hasError=!pair;
    setInvalid(hasError);
    inputRef.current?.setCustomValidity(hasError?'Latitude ও Longitude সঠিকভাবে লিখুন। উদাহরণ: 23.8103, 90.4125':'');
    if(pair)onChange(pair[0],pair[1]);
    else onChange(null,null);
  }

  return <label className="combined-coordinate-field">
    <span>{label}</span>
    <div className="combined-coordinate-row">
      <div><MapPin /><input ref={inputRef} required={required} inputMode="decimal" value={value} onChange={(event) => update(event.target.value)} onBlur={(event)=>{const pair=parseCoordinatePair(event.target.value);if(pair){setValue(format(pair[0],pair[1]));setInvalid(false);event.currentTarget.setCustomValidity('');}}} aria-invalid={invalid} placeholder="23.8103, 90.4125" /></div>
      {onCurrentLocation && <button type="button" disabled={loading} onClick={onCurrentLocation}>{loading ? <LoaderCircle className="spin" /> : <Crosshair />}<span>{loading ? loadingLabel : gpsLabel}</span></button>}
    </div>
    <small className={invalid?'coordinate-error':''}>{invalid?'সঠিক format দিন: Latitude, Longitude — যেমন 23.8103, 90.4125':helper}</small>
  </label>;
}
