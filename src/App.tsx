import { LoaderCircle } from 'lucide-react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import HomePage from './pages/HomePage';
import DoctorDirectory from './pages/DoctorDirectory';
import DoctorProfile from './pages/DoctorProfile';
import HospitalsListPage from './pages/HospitalsListPage';
import HospitalProfilePage from './pages/HospitalProfilePage';
import BloodBankPage from './pages/BloodBankPage';
import AmbulancePage from './pages/AmbulancePage';
import AuthPage from './pages/AuthPage';
import DashboardPage from './pages/DashboardPage';
import OnboardingPage from './pages/OnboardingPage';
import ProtectedRoute from './components/ProtectedRoute';
import AppointmentsPage from './pages/AppointmentsPage';
import BookingPage from './pages/BookingPage';
import PatientProfilePage from './pages/PatientProfilePage';
import DoctorProfessionalProfilePage from './pages/DoctorProfessionalProfilePage';
import DoctorSchedulePage from './pages/DoctorSchedulePage';
import DoctorAppointmentsPage from './pages/DoctorAppointmentsPage';
import ProviderProfilePage from './pages/ProviderProfilePage';
import ProviderDoctorsPage from './pages/ProviderDoctorsPage';
import ProviderAppointmentsPage from './pages/ProviderAppointmentsPage';
import DoctorInvitationsPage from './pages/DoctorInvitationsPage';
import AmbulanceServicesPage from './pages/AmbulanceServicesPage';
import AmbulanceHospitalLinksPage from './pages/AmbulanceHospitalLinksPage';
import ProviderAmbulanceLinksPage from './pages/ProviderAmbulanceLinksPage';
import VerificationEvidencePage from './pages/VerificationEvidencePage';
import VerificationOfficerPage from './pages/VerificationOfficerPage';
import AdminDashboardPage from './pages/AdminDashboardPage';
import AdminCmsPage from './pages/AdminCmsPage';
import SuperAdminPage from './pages/SuperAdminPage';

// লগইন থাকলে ভিজিটর ল্যান্ডিং পেজের বদলে নিজের role-এর dashboard-এ পাঠানো হয়
// (DashboardPage নিজেই প্রোফাইল অসম্পূর্ণ থাকলে /onboarding-এ রিডাইরেক্ট করে)।
// লগআউট করলে dashboard থেকে '/'-এ ফিরিয়ে আনা হয়, তখন account না থাকায়
// এখানে আবার visitor HomePage দেখানো হবে।
function RootRoute() {
  const { user, loading } = useAuth();
  if (loading) return <div className="route-state"><LoaderCircle className="spin" /> লোড হচ্ছে…</div>;
  if (user) return <Navigate to="/dashboard" replace />;
  return <HomePage />;
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<RootRoute />} />
      <Route path="/doctors" element={<DoctorDirectory />} />
      <Route path="/doctors/:doctorId" element={<DoctorProfile />} />
      <Route path="/hospitals" element={<HospitalsListPage />} />
      <Route path="/hospitals/:providerId" element={<HospitalProfilePage />} />
      <Route path="/blood-bank" element={<BloodBankPage />} />
      <Route path="/ambulance" element={<AmbulancePage />} />
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

export default App;
