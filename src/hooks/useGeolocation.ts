import { useCallback, useState } from 'react';

export type GeoStatus = 'idle' | 'requesting' | 'granted' | 'denied' | 'unsupported';

export function useGeolocation() {
  const [status, setStatus] = useState<GeoStatus>('idle');
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const requestLocation = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setStatus('unsupported');
      setError('আপনার ব্রাউজার লোকেশন সমর্থন করে না।');
      return;
    }
    setStatus('requesting');
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({ latitude: position.coords.latitude, longitude: position.coords.longitude });
        setStatus('granted');
      },
      () => {
        setStatus('denied');
        setError('লোকেশন অনুমতি পাওয়া যায়নি। জেলা/উপজেলা বেছে নিন।');
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 300000 },
    );
  }, []);

  return { status, coords, error, requestLocation };
}
