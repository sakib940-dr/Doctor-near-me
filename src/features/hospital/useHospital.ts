import { useEffect, useState } from 'react';
import { getMyProviderDashboard } from '../../services/providerDashboard';
import type { HospitalProvider } from './types';

export function useHospital() {
  const [providers, setProviders] = useState<HospitalProvider[]>([]);
  const [providerId, setProviderId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getMyProviderDashboard().then((rows) => {
      if (!alive) return;
      const hospitals = rows.filter((row) => row.provider_type === 'hospital');
      setProviders(hospitals);
      setProviderId((current) => current || hospitals[0]?.id || '');
    }).catch((reason: unknown) => {
      if (alive) setError(reason instanceof Error ? reason.message : 'Hospital profile could not be loaded.');
    }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  return { providers, providerId, setProviderId, provider: providers.find((row) => row.id === providerId) ?? null, loading, error };
}
