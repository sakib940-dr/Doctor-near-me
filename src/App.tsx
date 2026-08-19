import { useEffect, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import DashboardShell from './components/DashboardShell';
import type { DashboardRole } from './types';
import { useAuth } from './contexts/AuthContext';
import AdminCmsPage from './pages/AdminCmsPage';
import AdminDashboardPage from './pages/AdminDashboardPage';
import AmbulanceHospitalLinksPage from './pages/AmbulanceHospitalLinksPage';
import AmbulanceServicesPage from './pages/AmbulanceServicesPage';
import AppointmentsPage from './pages/AppointmentsPage';
import AuthPage from './pages/AuthPage';
import BookingPage from './pages/BookingPage';
import DashboardPage from './pages/DashboardPage';
import DoctorAppointmentsPage from './pages/DoctorAppointmentsPage';
import DoctorChamberDetailsPage from './pages/DoctorChamberDetailsPage';
import DoctorDirectory from './pages/DoctorDirectory';
import DoctorInvitationsPage from './pages/DoctorInvitationsPage';
import DoctorProfessionalProfilePage from './pages/DoctorProfessionalProfilePage';
import DoctorProfile from './pages/DoctorProfile';
import DoctorPrescriptionPage from './pages/DoctorPrescriptionPage';
import DoctorSchedulePage from './pages/DoctorSchedulePage';
import DoctorVisitingCardPage from './pages/DoctorVisitingCardPage';
import DoctorVerificationPage from './pages/DoctorVerificationPage';
import OnboardingPage from './pages/OnboardingPage';
import PatientProfilePage from './pages/PatientProfilePage';
import ProviderAmbulanceLinksPage from './pages/ProviderAmbulanceLinksPage';
import ProviderAppointmentsPage from './pages/ProviderAppointmentsPage';
import ProviderDoctorsPage from './pages/ProviderDoctorsPage';
import ProviderProfilePage from './pages/ProviderProfilePage';
import PublicProviderProfilePage from './pages/PublicProviderProfilePage';
import ProviderWebsitePage from './pages/ProviderWebsitePage';
import PublicProvidersPage from './pages/PublicProvidersPage';
import SuperAdminPage from './pages/SuperAdminPage';
import VerificationEvidencePage from './pages/VerificationEvidencePage';
import VerificationOfficerPage from './pages/VerificationOfficerPage';
import VisitorHomePage from './pages/VisitorHomePage';
import { makePageTitle } from './lib/brand';

export default function App() {
  useRouteDocumentTitle();
  return (
    <Routes>
      <Route path="/" element={<VisitorHomePage />} />
      <Route path="/doctors" element={<DoctorDirectoryRoute />} />
      <Route path="/doctors/:doctorId" element={<DoctorProfile />} />
      <Route path="/providers" element={<PublicProvidersPage />} />
      <Route path="/providers/:slug/website" element={<ProviderWebsitePage />} />
      <Route path="/providers/:providerId" element={<PublicProviderProfilePage />} />
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/onboarding" element={<ProtectedRoute><OnboardingPage /></ProtectedRoute>} />
      <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
      <Route path="/profile" element={<ProtectedRoute><DashboardShell role="patient"><PatientProfilePage /></DashboardShell></ProtectedRoute>} />
      <Route path="/appointments" element={<ProtectedRoute><DashboardShell role="patient"><AppointmentsPage /></DashboardShell></ProtectedRoute>} />
      <Route path="/doctors/:doctorId/book" element={<ProtectedRoute><DashboardShell role="patient"><BookingPage /></DashboardShell></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><DashboardShell role="patient"><PatientProfilePage /></DashboardShell></ProtectedRoute>} />
      <Route path="/doctor/profile" element={<ProtectedRoute><DashboardShell role="doctor"><DoctorProfessionalProfilePage /></DashboardShell></ProtectedRoute>} />
      <Route path="/doctor/visiting-card" element={<ProtectedRoute><DashboardShell role="doctor"><DoctorVisitingCardPage /></DashboardShell></ProtectedRoute>} />
      <Route path="/doctor/verification" element={<ProtectedRoute><DashboardShell role="doctor"><DoctorVerificationPage /></DashboardShell></ProtectedRoute>} />
      <Route path="/doctor/chambers" element={<ProtectedRoute><DashboardShell role="doctor"><DoctorChamberDetailsPage /></DashboardShell></ProtectedRoute>} />
      <Route path="/doctor/schedules" element={<ProtectedRoute><DashboardShell role="doctor"><DoctorSchedulePage /></DashboardShell></ProtectedRoute>} />
      <Route path="/doctor/appointments" element={<ProtectedRoute><DashboardShell role="doctor"><DoctorAppointmentsPage /></DashboardShell></ProtectedRoute>} />
      <Route path="/doctor/invitations" element={<ProtectedRoute><DashboardShell role="doctor"><DoctorInvitationsPage /></DashboardShell></ProtectedRoute>} />
      <Route path="/doctor/prescriptions" element={<ProtectedRoute><DashboardShell role="doctor"><DoctorPrescriptionPage /></DashboardShell></ProtectedRoute>} />
      <Route path="/provider/profile" element={<ProtectedRoute><RoleAwareDashboardShell allowed={['hospital', 'chamber']}><ProviderProfilePage /></RoleAwareDashboardShell></ProtectedRoute>} />
      <Route path="/provider/doctors" element={<ProtectedRoute><RoleAwareDashboardShell allowed={['hospital', 'chamber']}><ProviderDoctorsPage /></RoleAwareDashboardShell></ProtectedRoute>} />
      <Route path="/provider/appointments" element={<ProtectedRoute><RoleAwareDashboardShell allowed={['hospital', 'chamber']}><ProviderAppointmentsPage /></RoleAwareDashboardShell></ProtectedRoute>} />
      <Route path="/provider/ambulances" element={<ProtectedRoute><RoleAwareDashboardShell allowed={['hospital']}><ProviderAmbulanceLinksPage /></RoleAwareDashboardShell></ProtectedRoute>} />
      <Route path="/ambulance/services" element={<ProtectedRoute><RoleAwareDashboardShell allowed={['ambulance']}><AmbulanceServicesPage /></RoleAwareDashboardShell></ProtectedRoute>} />
      <Route path="/ambulance/hospitals" element={<ProtectedRoute><RoleAwareDashboardShell allowed={['ambulance']}><AmbulanceHospitalLinksPage /></RoleAwareDashboardShell></ProtectedRoute>} />
      <Route path="/verification/evidence" element={<ProtectedRoute><RoleAwareDashboardShell allowed={['doctor', 'hospital', 'chamber']}><VerificationEvidencePage /></RoleAwareDashboardShell></ProtectedRoute>} />
      <Route path="/verification/reviews" element={<ProtectedRoute><RoleAwareDashboardShell allowed={['verification_officer', 'admin', 'super_admin']}><VerificationOfficerPage /></RoleAwareDashboardShell></ProtectedRoute>} />
      <Route path="/admin" element={<ProtectedRoute><RoleAwareDashboardShell allowed={['admin', 'super_admin']}><AdminDashboardPage /></RoleAwareDashboardShell></ProtectedRoute>} />
      <Route path="/admin/cms" element={<ProtectedRoute><RoleAwareDashboardShell allowed={['admin', 'super_admin']}><AdminCmsPage /></RoleAwareDashboardShell></ProtectedRoute>} />
      <Route path="/super-admin" element={<ProtectedRoute><RoleAwareDashboardShell allowed={['super_admin']}><SuperAdminPage /></RoleAwareDashboardShell></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function DoctorDirectoryRoute() {
  const { account, loading } = useAuth();
  if (!loading && account?.role === 'patient') return <DashboardShell role="patient"><DoctorDirectory embedded /></DashboardShell>;
  return <DoctorDirectory />;
}

function RoleAwareDashboardShell({ allowed, children }: { allowed: DashboardRole[]; children: ReactNode }) {
  const { account, loading } = useAuth();
  if (loading) return null;
  if (!account || !allowed.includes(account.role as DashboardRole)) return <Navigate to="/dashboard" replace />;
  return <DashboardShell role={account.role as DashboardRole}>{children}</DashboardShell>;
}

function useRouteDocumentTitle() {
  const location = useLocation();

  useEffect(() => {
    const path = location.pathname;
    let page: string | null = null;

    if (path === '/auth') page = 'Login & Signup';
    else if (path === '/onboarding') page = 'Onboarding';
    else if (path === '/dashboard') page = 'Dashboard';
    else if (path === '/doctors') page = 'ডাক্তার খুঁজুন';
    else if (path.startsWith('/doctors/')) page = 'Doctor Profile';
    else if (path === '/providers') page = 'হাসপাতাল ও চেম্বার';
    else if (path.startsWith('/providers/')) page = 'Provider Profile';
    else if (path === '/doctor/visiting-card') page = 'Visiting Card';
    else if (path === '/doctor/chambers') page = 'Chamber Details';
    else if (path === '/doctor/verification') page = 'Verification';
    else if (path === '/doctor/prescriptions') page = 'Prescription';
    else if (path === '/doctor/schedules') page = 'Schedule';
    else if (path === '/doctor/appointments') page = 'Appointments';
    else if (path === '/doctor/profile') page = 'Doctor Profile';
    else if (path.startsWith('/doctor/')) page = 'Doctor';
    else if (path.startsWith('/provider/')) page = 'Hospital';
    else if (path.startsWith('/ambulance/')) page = 'Ambulance';
    else if (path.startsWith('/admin')) page = 'Admin';
    else if (path.startsWith('/super-admin')) page = 'Super Admin';
    else if (path.startsWith('/verification/')) page = 'Verification';
    else if (path === '/profile') page = 'Profile';
    else if (path === '/appointments') page = 'Appointments';

    document.title = makePageTitle(page);
  }, [location.pathname]);
}
