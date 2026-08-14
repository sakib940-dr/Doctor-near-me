# Visitor / Patient Frontend Update

This package changes only the visitor/patient-facing frontend.

## Updated
- Visitor homepage doctor cards redesigned as wide medical visiting cards with large doctor photos.
- Doctor photos are resolved from the existing public doctor-profile RPC so professional profile photos display on visitor cards without backend changes.
- Homepage doctor, specialty, and hospital/chamber sections are horizontally swipeable.
- "সব দেখুন" doctor directory uses a vertical list with 20 doctors per page.
- Doctor public profile redesigned with a large green hero/photo, prescription-style professional information, compact visit-fee + appointment actions, contact bottom sheet, about section, and chamber schedules.
- Call/WhatsApp options use existing public contact data when available; Facebook is only shown if existing public profile data provides a URL.
- Mobile-first responsive styling and fixed bottom navigation spacing improved.

## Backend safety
- No Supabase SQL/migration files were modified.
- No auth/RLS/RPC/database schema changes were made.

## Verification
- All 48 TS/TSX source files parse successfully with the TypeScript parser.
- Full local npm build could not be completed in this container because the supplied package had empty React type-definition directories and a fresh npm install was unavailable here. The deployment environment should run a clean dependency install before `npm run build`.
