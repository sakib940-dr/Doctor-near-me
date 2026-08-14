# Patient Responsive Audit (v14)

Reviewed: Patient dashboard, PatientProfilePage, AppointmentsPage, DoctorDirectory, BookingPage.

## Breakpoints covered
- 360px / narrow mobile via <=430px rules
- 390px / narrow mobile compatibility
- 430px / narrow mobile boundary
- 768px / mobile-to-desktop shell boundary (<=767 mobile)
- 1024px / tablet and compact desktop
- 1440px / wide desktop max-width behavior

## Fixes
- Added min-width:0/overflow wrapping across patient grids, forms, cards and list rows.
- Patient forms collapse to one column on mobile.
- Appointments heading/actions stack on mobile; status/date/body cannot force horizontal overflow.
- Booking becomes single column on tablet/mobile; schedule choices collapse; Booking now uses DashboardShell for patient navigation.
- Doctor directory filter becomes a slide-in panel below 900px; result grid and toolbar collapse safely.
- Directory search becomes stacked at <=430px.
- Fixed mobile bottom-nav safe padding for dashboard/profile/appointments/directory/booking.
- Added wide desktop container cap at >=1280px.

## Validation
- CSS brace count balanced.
- Booking route confirmed wrapped with DashboardShell role="patient".
- npm ci/build could not complete in the local container because dependency installation timed out; Vercel should perform a clean dependency install.
