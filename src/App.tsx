import { Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import AdminCmsPage from './pages/AdminCmsPage';
import AdminDashboardPage from './pages/AdminDashboardPage';
import AmbulanceHospitalLinksPage from './pages/AmbulanceHospitalLinksPage';
import AmbulanceServicesPage from './pages/AmbulanceServicesPage';
import AppointmentsPage from './pages/AppointmentsPage';
import AuthPage from './pages/AuthPage';
import BookingPage from './pages/BookingPage';
import DashboardPage from './pages/DashboardPage';
import DoctorAppointmentsPage from './pages/DoctorAppointmentsPage';
import DoctorDirectory from './pages/DoctorDirectory';
import DoctorInvitationsPage from './pages/DoctorInvitationsPage';
import DoctorProfessionalProfilePage from './pages/DoctorProfessionalProfilePage';
import DoctorProfile from './pages/DoctorProfile';
import DoctorSchedulePage from './pages/DoctorSchedulePage';
import OnboardingPage from './pages/OnboardingPage';
import PatientProfilePage from './pages/PatientProfilePage';
import ProviderAmbulanceLinksPage from './pages/ProviderAmbulanceLinksPage';
import ProviderAppointmentsPage from './pages/ProviderAppointmentsPage';
import ProviderDoctorsPage from './pages/ProviderDoctorsPage';
import ProviderProfilePage from './pages/ProviderProfilePage';
import PublicProviderProfilePage from './pages/PublicProviderProfilePage';
import PublicProvidersPage from './pages/PublicProvidersPage';
import SuperAdminPage from './pages/SuperAdminPage';
import VerificationEvidencePage from './pages/VerificationEvidencePage';
import VerificationOfficerPage from './pages/VerificationOfficerPage';
import VisitorHomePage from './pages/VisitorHomePage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<VisitorHomePage />} />
      <Route path="/doctors" element={<DoctorDirectory />} />
      <Route path="/doctors/:doctorId" element={<DoctorProfile />} />
      <Route path="/providers" element={<PublicProvidersPage />} />
      <Route path="/providers/:providerId" element={<PublicProviderProfilePage />} />
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/onboarding" element={<ProtectedRoute><OnboardingPage /></ProtectedRoute>} />
      <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
      <Route path="/profile" element={<ProtectedRoute><PatientProfilePage /></ProtectedRoute>} />
      <Route path="/appointments" element={<ProtectedRoute><AppointmentsPage /></ProtectedRoute>} />
      <Route path="/doctors/:doctorId/book" element={<ProtectedRoute><BookingPage /></ProtectedRoute>} />
      <Route path="/doctor/profile" element={<ProtectedRoute><DoctorProfessionalProfilePage /></ProtectedRoute>} />
      <Route path="/doctor/schedules" element={<ProtectedRoute><DoctorSchedulePage /></ProtectedRoute>} />
      <Route path="/doctor/appointments" element={<ProtectedRoute><DoctorAppointmentsPage /></ProtectedRoute>} />
      <Route path="/doctor/invitations" element={<ProtectedRoute><DoctorInvitationsPage /></ProtectedRoute>} />
      <Route path="/provider/profile" element={<ProtectedRoute><ProviderProfilePage /></ProtectedRoute>} />
      <Route path="/provider/doctors" element={<ProtectedRoute><ProviderDoctorsPage /></ProtectedRoute>} />
      <Route path="/provider/appointments" element={<ProtectedRoute><ProviderAppointmentsPage /></ProtectedRoute>} />
      <Route path="/provider/ambulances" element={<ProtectedRoute><ProviderAmbulanceLinksPage /></ProtectedRoute>} />
      <Route path="/ambulance/services" element={<ProtectedRoute><AmbulanceServicesPage /></ProtectedRoute>} />
      <Route path="/ambulance/hospitals" element={<ProtectedRoute><AmbulanceHospitalLinksPage /></ProtectedRoute>} />
      <Route path="/verification/evidence" element={<ProtectedRoute><VerificationEvidencePage /></ProtectedRoute>} />
      <Route path="/verification/reviews" element={<ProtectedRoute><VerificationOfficerPage /></ProtectedRoute>} />
      <Route path="/admin" element={<ProtectedRoute><AdminDashboardPage /></ProtectedRoute>} />
      <Route path="/admin/cms" element={<ProtectedRoute><AdminCmsPage /></ProtectedRoute>} />
      <Route path="/super-admin" element={<ProtectedRoute><SuperAdminPage /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
