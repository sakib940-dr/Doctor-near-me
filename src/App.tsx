import { useEffect, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import PwaUpdatePrompt from './components/PwaUpdatePrompt';
import PwaInstallPromotion from './components/PwaInstallPromotion';
import PushPermissionPromotion from './components/PushPermissionPromotion';
import PushNotificationManager from './components/PushNotificationManager';
import DashboardShell from './components/DashboardShell';
import AccountStateFallback from './components/AccountStateFallback';
import type { DashboardRole } from './types';
import { useAuth } from './contexts/AuthContext';
import { useVisitorLanguage } from './contexts/VisitorLanguageContext';
import AdminCmsPage from './pages/AdminCmsPage';
import AdminDashboardPage from './pages/AdminDashboardPage';
import AdminBmdcCorrectionPage from './pages/AdminBmdcCorrectionPage';
import AdminDoctorSupportPage from './pages/AdminDoctorSupportPage';
import AdminStorageCleanupPage from './pages/AdminStorageCleanupPage';
import AmbulanceHospitalLinksPage from './pages/AmbulanceHospitalLinksPage';
import AmbulanceServicesPage from './pages/AmbulanceServicesPage';
import AppointmentsPage from './pages/AppointmentsPage';
import AuthPage from './pages/AuthPage';
import BloodBankPage from './pages/BloodBankPage';
import CategoriesPage from './pages/CategoriesPage';
import BookingPage from './pages/BookingPage';
import DashboardPage from './pages/DashboardPage';
import DoctorAppointmentsPage from './pages/DoctorAppointmentsPage';
import DoctorFeedbackPage from './pages/DoctorFeedbackPage';
import DoctorHelpPage from './pages/DoctorHelpPage';
import DoctorChamberDetailsPage from './pages/DoctorChamberDetailsPage';
import DoctorDirectory from './pages/DoctorDirectory';
import DoctorProfessionalProfilePage from './pages/DoctorProfessionalProfilePage';
import DoctorPublicProfileContentPage from './pages/DoctorPublicProfileContentPage';
import DoctorPublicContentManagementPage from './pages/DoctorPublicContentManagementPage';
import DoctorPublicProfileViewPage from './pages/DoctorPublicProfileViewPage';
import DoctorProfile from './pages/DoctorProfile';
import DoctorPrescriptionPage from './pages/DoctorPrescriptionPage';
import DoctorSchedulePage from './pages/DoctorSchedulePage';
import DoctorSettingsPage from './pages/DoctorSettingsPage';
import DoctorSupportPage from './pages/DoctorSupportPage';
import DoctorVisitingCardPage from './pages/DoctorVisitingCardPage';
import DoctorVerificationPage from './pages/DoctorVerificationPage';
import OnboardingPage from './pages/OnboardingPage';
import PatientProfilePage from './pages/PatientProfilePage';
import ProfileAnalyticsPage from './pages/ProfileAnalyticsPage';
import PremiumMemberPage from './pages/PremiumMemberPage';
import PremiumAdminPage from './pages/PremiumAdminPage';
import ProviderAmbulanceLinksPage from './pages/ProviderAmbulanceLinksPage';
import ProviderAppointmentsPage from './pages/ProviderAppointmentsPage';
import ProviderDoctorsPage from './pages/ProviderDoctorsPage';
import ProviderDoctorsPublicPage from './pages/ProviderDoctorsPublicPage';
import ProviderProfilePage from './pages/ProviderProfilePage';
import PublicProviderProfilePage from './pages/PublicProviderProfilePage';
import ProviderWebsitePage from './pages/ProviderWebsitePage';
import PublicProvidersPage from './pages/PublicProvidersPage';
import PublicLegalPage from './pages/PublicLegalPage';
import SavedProfilesPage from './pages/SavedProfilesPage';
import SuperAdminPage from './pages/SuperAdminPage';
import VerificationEvidencePage from './pages/VerificationEvidencePage';
import VerificationOfficerPage from './pages/VerificationOfficerPage';
import VisitorHomePage from './pages/VisitorHomePage';
import NotificationsPage from './pages/NotificationsPage';
import { makePageTitle } from './lib/brand';
import HospitalShell from './features/hospital/HospitalShell';
import HospitalDashboardPage from './features/hospital/pages/HospitalDashboardPage';
import HospitalAppointmentsPage from './features/hospital/pages/HospitalAppointmentsPage';
import HospitalDoctorsPage from './features/hospital/pages/HospitalDoctorsPage';
import HospitalGalleryPage from './features/hospital/pages/HospitalGalleryPage';
import HospitalStaffPage from './features/hospital/pages/HospitalStaffPage';
import HospitalAdminSupportPage from './features/hospital/pages/HospitalAdminSupportPage';
import HospitalOnboardingPage from './features/hospital/pages/HospitalOnboardingPage';
import HospitalDoctorPublicPage from './features/hospital/pages/HospitalDoctorPublicPage';
import { HospitalAppointmentSettingsPage, HospitalProfilePreviewPage, HospitalSecurityPage } from './features/hospital/pages/HospitalUtilityPages';
import {
  HospitalInformationPage, HospitalInvestigationCostsPage, HospitalPublicProfileManagementPage,
  HospitalReceptionSettingsPage, HospitalServicesPage, HospitalSettingsPage, HospitalSupportPage,
  HospitalTreatmentCostsPage,
} from './features/hospital/pages/HospitalContentPages';

export default function App() {
  useRouteDocumentTitle();
  return (
    <>
      <Routes>
      <Route path="/" element={<VisitorHomePage />} />
      <Route path="/doctors" element={<DoctorDirectoryRoute />} />
      <Route path="/doctor/:doctorId" element={<DoctorProfile />} />
      <Route path="/doctors/:doctorId" element={<DoctorProfile />} />
      <Route path="/providers" element={<PublicProvidersPage />} />
      <Route path="/categories" element={<CategoriesPage />} />
      <Route path="/providers/:slug/website" element={<ProviderWebsitePage />} />
      <Route path="/providers/:providerId/doctors" element={<ProviderDoctorsPublicPage />} />
      <Route path="/hospital/:providerId" element={<PublicProviderProfilePage />} />
      <Route path="/hospital-doctors/:cardId" element={<HospitalDoctorPublicPage />} />
      <Route path="/chamber/:providerId" element={<PublicProviderProfilePage />} />
      <Route path="/providers/:providerId" element={<PublicProviderProfilePage />} />
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/terms" element={<PublicLegalPage slug="terms" />} />
      <Route path="/privacy" element={<PublicLegalPage slug="privacy" />} />
      <Route path="/onboarding" element={<ProtectedRoute><OnboardingPage /></ProtectedRoute>} />
      <Route path="/dashboard" element={<ProtectedRoute><PatientDashboardRoute /></ProtectedRoute>} />
      <Route path="/notifications" element={<ProtectedRoute><NotificationCenterRoute /></ProtectedRoute>} />
      <Route path="/profile" element={<ProtectedRoute><DashboardShell role="patient"><PatientProfilePage /></DashboardShell></ProtectedRoute>} />
      <Route path="/appointments" element={<ProtectedRoute><DashboardShell role="patient"><AppointmentsPage /></DashboardShell></ProtectedRoute>} />
      <Route path="/saved" element={<ProtectedRoute><SavedProfilesPage /></ProtectedRoute>} />
      <Route path="/blood" element={<ProtectedRoute><BloodBankPage /></ProtectedRoute>} />
      <Route path="/doctors/:doctorId/book" element={<ProtectedRoute><DashboardShell role="patient"><BookingPage /></DashboardShell></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><DashboardShell role="patient"><PatientProfilePage /></DashboardShell></ProtectedRoute>} />
      <Route path="/doctor/settings" element={<ProtectedRoute><DashboardShell role="doctor"><DoctorSettingsPage /></DashboardShell></ProtectedRoute>} />
      <Route path="/doctor/public-content" element={<ProtectedRoute><DashboardShell role="doctor"><DoctorPublicContentManagementPage /></DashboardShell></ProtectedRoute>} />
      <Route path="/doctor/support" element={<ProtectedRoute><DashboardShell role="doctor"><DoctorSupportPage /></DashboardShell></ProtectedRoute>} />
      <Route path="/doctor/feedback" element={<ProtectedRoute><DashboardShell role="doctor"><DoctorFeedbackPage /></DashboardShell></ProtectedRoute>} />
      <Route path="/doctor/help" element={<ProtectedRoute><DashboardShell role="doctor"><DoctorHelpPage /></DashboardShell></ProtectedRoute>} />
      <Route path="/doctor/public-view" element={<ProtectedRoute><DoctorPublicProfileViewPage /></ProtectedRoute>} />
      <Route path="/doctor/profile" element={<ProtectedRoute><DashboardShell role="doctor"><DoctorProfessionalProfilePage /></DashboardShell></ProtectedRoute>} />
      <Route path="/doctor/public-profile" element={<ProtectedRoute><DashboardShell role="doctor"><DoctorPublicProfileContentPage /></DashboardShell></ProtectedRoute>} />
      <Route path="/doctor/analytics" element={<ProtectedRoute><DashboardShell role="doctor"><ProfileAnalyticsPage /></DashboardShell></ProtectedRoute>} />
      <Route path="/doctor/premium" element={<ProtectedRoute><DashboardShell role="doctor"><PremiumMemberPage /></DashboardShell></ProtectedRoute>} />
      <Route path="/doctor/visiting-card" element={<ProtectedRoute><DashboardShell role="doctor"><DoctorVisitingCardPage /></DashboardShell></ProtectedRoute>} />
      <Route path="/doctor/verification" element={<ProtectedRoute><DashboardShell role="doctor"><DoctorVerificationPage /></DashboardShell></ProtectedRoute>} />
      <Route path="/doctor/chambers" element={<ProtectedRoute><DashboardShell role="doctor"><DoctorChamberDetailsPage /></DashboardShell></ProtectedRoute>} />
      <Route path="/doctor/schedules" element={<ProtectedRoute><DashboardShell role="doctor"><DoctorSchedulePage /></DashboardShell></ProtectedRoute>} />
      <Route path="/doctor/appointments" element={<ProtectedRoute><DashboardShell role="doctor"><DoctorAppointmentsPage /></DashboardShell></ProtectedRoute>} />
      <Route path="/doctor/prescriptions" element={<ProtectedRoute><DashboardShell role="doctor"><DoctorPrescriptionPage /></DashboardShell></ProtectedRoute>} />
      <Route path="/hospital-console" element={<ProtectedRoute><HospitalShell><HospitalDashboardPage /></HospitalShell></ProtectedRoute>} />
      <Route path="/hospital-console/appointments" element={<ProtectedRoute><HospitalShell><HospitalAppointmentsPage /></HospitalShell></ProtectedRoute>} />
      <Route path="/hospital-console/appointment-settings" element={<ProtectedRoute><HospitalShell><HospitalAppointmentSettingsPage /></HospitalShell></ProtectedRoute>} />
      <Route path="/hospital-console/doctors" element={<ProtectedRoute><HospitalShell><HospitalDoctorsPage /></HospitalShell></ProtectedRoute>} />
      <Route path="/hospital-console/analytics" element={<ProtectedRoute><HospitalShell><ProfileAnalyticsPage /></HospitalShell></ProtectedRoute>} />
      <Route path="/hospital-console/public-profile" element={<ProtectedRoute><HospitalShell><HospitalPublicProfileManagementPage /></HospitalShell></ProtectedRoute>} />
      <Route path="/hospital-console/information" element={<ProtectedRoute><HospitalShell><HospitalInformationPage /></HospitalShell></ProtectedRoute>} />
      <Route path="/hospital-console/gallery" element={<ProtectedRoute><HospitalShell><HospitalGalleryPage /></HospitalShell></ProtectedRoute>} />
      <Route path="/hospital-console/services" element={<ProtectedRoute><HospitalShell><HospitalServicesPage /></HospitalShell></ProtectedRoute>} />
      <Route path="/hospital-console/treatment-costs" element={<ProtectedRoute><HospitalShell><HospitalTreatmentCostsPage /></HospitalShell></ProtectedRoute>} />
      <Route path="/hospital-console/investigation-costs" element={<ProtectedRoute><HospitalShell><HospitalInvestigationCostsPage /></HospitalShell></ProtectedRoute>} />
      <Route path="/hospital-console/reception" element={<ProtectedRoute><HospitalShell><HospitalReceptionSettingsPage /></HospitalShell></ProtectedRoute>} />
      <Route path="/hospital-console/staff" element={<ProtectedRoute><HospitalShell><HospitalStaffPage /></HospitalShell></ProtectedRoute>} />
      <Route path="/hospital-console/verification" element={<ProtectedRoute><HospitalShell><VerificationEvidencePage /></HospitalShell></ProtectedRoute>} />
      <Route path="/hospital-console/settings" element={<ProtectedRoute><HospitalShell><HospitalSettingsPage /></HospitalShell></ProtectedRoute>} />
      <Route path="/hospital-console/support" element={<ProtectedRoute><HospitalShell><HospitalSupportPage /></HospitalShell></ProtectedRoute>} />
      <Route path="/hospital-console/admin-support" element={<ProtectedRoute><HospitalShell><HospitalAdminSupportPage /></HospitalShell></ProtectedRoute>} />
      <Route path="/hospital-console/security" element={<ProtectedRoute><HospitalShell><HospitalSecurityPage /></HospitalShell></ProtectedRoute>} />
      <Route path="/hospital-console/onboarding" element={<ProtectedRoute><HospitalShell><HospitalOnboardingPage /></HospitalShell></ProtectedRoute>} />
      <Route path="/hospital-console/profile-preview" element={<ProtectedRoute><HospitalShell><HospitalProfilePreviewPage /></HospitalShell></ProtectedRoute>} />
      <Route path="/hospital-console/premium" element={<ProtectedRoute><HospitalShell><PremiumMemberPage /></HospitalShell></ProtectedRoute>} />
      <Route path="/hospital-console/ambulances" element={<ProtectedRoute><HospitalShell><ProviderAmbulanceLinksPage /></HospitalShell></ProtectedRoute>} />
      <Route path="/provider/profile" element={<ProtectedRoute><RoleAwareDashboardShell allowed={['hospital', 'chamber']}><ProviderProfilePage /></RoleAwareDashboardShell></ProtectedRoute>} />
      <Route path="/provider/doctors" element={<ProtectedRoute><RoleAwareDashboardShell allowed={['hospital', 'chamber']}><ProviderDoctorsPage /></RoleAwareDashboardShell></ProtectedRoute>} />
      <Route path="/provider/appointments" element={<ProtectedRoute><RoleAwareDashboardShell allowed={['hospital', 'chamber']}><ProviderAppointmentsPage /></RoleAwareDashboardShell></ProtectedRoute>} />
      <Route path="/provider/analytics" element={<ProtectedRoute><RoleAwareDashboardShell allowed={['hospital', 'chamber']}><ProfileAnalyticsPage /></RoleAwareDashboardShell></ProtectedRoute>} />
      <Route path="/provider/premium" element={<ProtectedRoute><RoleAwareDashboardShell allowed={['hospital', 'chamber']}><PremiumMemberPage /></RoleAwareDashboardShell></ProtectedRoute>} />
      <Route path="/provider/ambulances" element={<ProtectedRoute><RoleAwareDashboardShell allowed={['hospital']}><ProviderAmbulanceLinksPage /></RoleAwareDashboardShell></ProtectedRoute>} />
      <Route path="/ambulance/services" element={<ProtectedRoute><RoleAwareDashboardShell allowed={['ambulance']}><AmbulanceServicesPage /></RoleAwareDashboardShell></ProtectedRoute>} />
      <Route path="/ambulance/hospitals" element={<ProtectedRoute><RoleAwareDashboardShell allowed={['ambulance']}><AmbulanceHospitalLinksPage /></RoleAwareDashboardShell></ProtectedRoute>} />
      <Route path="/verification/evidence" element={<ProtectedRoute><RoleAwareDashboardShell allowed={['doctor', 'hospital', 'chamber']}><VerificationEvidencePage /></RoleAwareDashboardShell></ProtectedRoute>} />
      <Route path="/verification/reviews" element={<ProtectedRoute><RoleAwareDashboardShell allowed={['verification_officer', 'admin', 'super_admin']}><VerificationOfficerPage /></RoleAwareDashboardShell></ProtectedRoute>} />
      <Route path="/admin" element={<ProtectedRoute><RoleAwareDashboardShell allowed={['admin', 'super_admin']}><AdminDashboardPage /></RoleAwareDashboardShell></ProtectedRoute>} />
      <Route path="/admin/bmdc" element={<ProtectedRoute><RoleAwareDashboardShell allowed={['admin', 'super_admin']}><AdminBmdcCorrectionPage /></RoleAwareDashboardShell></ProtectedRoute>} />
      <Route path="/admin/cms" element={<ProtectedRoute><RoleAwareDashboardShell allowed={['admin', 'super_admin']}><AdminCmsPage /></RoleAwareDashboardShell></ProtectedRoute>} />
      <Route path="/admin/doctor-support" element={<ProtectedRoute><RoleAwareDashboardShell allowed={['admin', 'super_admin']}><AdminDoctorSupportPage /></RoleAwareDashboardShell></ProtectedRoute>} />
      <Route path="/admin/storage-cleanup" element={<ProtectedRoute><RoleAwareDashboardShell allowed={['admin', 'super_admin']}><AdminStorageCleanupPage /></RoleAwareDashboardShell></ProtectedRoute>} />
      <Route path="/admin/premium" element={<ProtectedRoute><RoleAwareDashboardShell allowed={['admin', 'super_admin']}><PremiumAdminPage /></RoleAwareDashboardShell></ProtectedRoute>} />
      <Route path="/super-admin" element={<ProtectedRoute><RoleAwareDashboardShell allowed={['super_admin']}><SuperAdminPage /></RoleAwareDashboardShell></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <PushNotificationManager />
      <PushPermissionPromotion />
      <PwaInstallPromotion />
      <PwaUpdatePrompt />
    </>
  );
}


function PatientDashboardRoute() {
  const { account, loading } = useAuth();
  if (loading) return <AccountStateFallback loading />;
  if (account?.role === 'patient') return <Navigate to="/" replace />;
  if (account?.role === 'hospital') return <Navigate to="/hospital-console" replace />;
  return <DashboardPage />;
}

function DoctorDirectoryRoute() {
  const { account, loading } = useAuth();
  if (!loading && account?.role === 'patient') return <DashboardShell role="patient"><DoctorDirectory embedded /></DashboardShell>;
  return <DoctorDirectory />;
}


function NotificationCenterRoute() {
  const { user, account, loading, accountError, refreshAccount, signOut } = useAuth();
  if (loading) return <AccountStateFallback loading />;
  if (!user) return <Navigate to="/auth" replace />;
  if (!account) return <AccountStateFallback message={accountError} onRetry={refreshAccount} onSignOut={signOut} />;
  if (account.role === 'hospital') return <HospitalShell><NotificationsPage /></HospitalShell>;
  return <DashboardShell role={account.role as DashboardRole}><NotificationsPage /></DashboardShell>;
}

function RoleAwareDashboardShell({ allowed, children }: { allowed: DashboardRole[]; children: ReactNode }) {
  const { account, loading, accountError, refreshAccount, signOut } = useAuth();
  if (loading) return <AccountStateFallback loading />;
  if (!account) return <AccountStateFallback message={accountError} onRetry={refreshAccount} onSignOut={signOut} />;
  if (!allowed.includes(account.role as DashboardRole)) return <Navigate to="/dashboard" replace />;
  return <DashboardShell role={account.role as DashboardRole}>{children}</DashboardShell>;
}

function useRouteDocumentTitle() {
  const location = useLocation();
  const { language } = useVisitorLanguage();
  const tr = (bn: string, en: string) => language === 'bn' ? bn : en;

  useEffect(() => {
    const path = location.pathname;
    let page: string | null = null;

    if (path === '/auth') page = tr('লগইন ও নিবন্ধন', 'Login & Signup');
    else if (path === '/onboarding') page = tr('প্রোফাইল সেটআপ', 'Onboarding');
    else if (path === '/dashboard') page = tr('ড্যাশবোর্ড', 'Dashboard');
    else if (path === '/notifications') page = tr('নোটিফিকেশন', 'Notifications');
    else if (path === '/admin/bmdc') page = 'Admin BMDC Correction';
    else if (path === '/doctors') page = tr('ডাক্তার খুঁজুন', 'Find Doctors');
    else if (path === '/doctor/settings') page = 'Doctor Settings';
    else if (path === '/doctor/public-content') page = 'Public Content Management';
    else if (path === '/doctor/support') page = 'Doctor Support';
    else if (path === '/doctor/feedback') page = 'Feedback / Bug Report';
    else if (path === '/doctor/help') page = 'FAQ / Help';
    else if (path === '/doctor/public-view') page = 'Public Profile View';
    else if (path === '/doctor/visiting-card') page = 'Visiting Card';
    else if (path === '/doctor/chambers') page = 'Chamber Details';
    else if (path === '/doctor/verification') page = 'Verification';
    else if (path === '/doctor/prescriptions') page = 'Prescription';
    else if (path === '/doctor/premium' || path === '/provider/premium') page = 'Premium Membership';
    else if (path === '/admin/premium') page = 'Premium Admin';
    else if (path === '/doctor/schedules') page = 'Schedule';
    else if (path === '/doctor/appointments') page = 'Appointments';
    else if (path === '/doctor/profile') page = 'Doctor Profile';
    else if (path === '/doctor/public-profile') page = 'Public Profile Content';
    else if (path === '/doctor/analytics') page = 'Doctor Analytics';
    else if (path.startsWith('/doctor/') || path.startsWith('/doctors/')) page = 'Doctor Profile';
    else if (path.startsWith('/hospital-console')) page = 'Hospital Console';
    else if (path === '/provider/analytics') page = 'Hospital Analytics';
    else if (path.startsWith('/provider/')) page = 'Hospital';
    else if (path.startsWith('/ambulance/')) page = 'Ambulance';
    else if (path.startsWith('/admin')) page = 'Admin';
    else if (path.startsWith('/super-admin')) page = 'Super Admin';
    else if (path.startsWith('/verification/')) page = 'Verification';
    else if (path === '/profile') page = 'Profile';
    else if (path === '/appointments') page = 'Appointments';
    else if (path === '/saved') page = 'সংরক্ষিত';
    else if (path === '/categories') page = 'ক্যাটাগরি';
    else if (path === '/blood') page = 'Blood Bank';

    document.title = makePageTitle(page);
  }, [language, location.pathname]);
}
