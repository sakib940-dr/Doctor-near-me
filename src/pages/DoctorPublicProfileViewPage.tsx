import { useEffect, useState } from 'react';
import { Eye, LoaderCircle } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { doctorPublicPath } from '../lib/publicRoutes';
import { resolvePublicDoctorRoute } from '../services/discovery';

export default function DoctorPublicProfileViewPage() {
  const { account, user } = useAuth();
  const [target, setTarget] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    resolvePublicDoctorRoute(user.id)
      .then((route) => { if (active) setTarget(doctorPublicPath(route?.slug, route?.id || user.id)); })
      .catch(() => { if (active) setTarget(doctorPublicPath(null, user.id)); })
      .finally(() => { if (active) setFailed(false); });
    return () => { active = false; };
  }, [user?.id]);

  if (account && account.role !== 'doctor') return <Navigate to="/dashboard" replace />;
  if (target) return <Navigate to={target} replace />;

  return <div className="app-shell doctor-module-page"><main className="doctor-module-main container"><div className={failed ? 'error-box' : 'loading-box'}>{failed ? <Eye /> : <LoaderCircle className="spin" />} Published public profile খুলছে…</div></main></div>;
}
