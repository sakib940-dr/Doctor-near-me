# Doctor Module Menu & UI Redesign — Implementation Audit

## Old menu → new information architecture

| Existing Doctor feature / entry | New location | Preservation decision |
|---|---|---|
| Doctor Dashboard recent appointments + appointment metrics | Bottom: **Appointment Management**; metrics also consolidated in **Analytics** | `/dashboard` for Doctor redirects to `/doctor/appointments`; old implementation code/routes are not deleted. |
| Analytics | Bottom: **Analytics** | Existing public-profile analytics retained; Doctor appointment analytics added here. |
| Premium | **Settings** → Premium Membership link | Existing `/doctor/premium` route retained. |
| Appointments | Bottom: **Appointment Management** | Existing actions retained: confirm, reject, complete, no-show, cancel, prescription. |
| Prescription | Bottom: **Prescription** | Existing `/doctor/prescriptions` module retained. |
| Chamber Details | Hamburger → **Public Content Management** → Step 2 | Existing canonical chamber/provider rows reused. |
| Schedule | Public Content Step 2 via existing Chamber Details workflow | Existing schedule data/service retained; old `/doctor/schedules` route remains compatible. |
| Visiting Card | Public Content Step 1 | Existing profile/doctor/specialty data reused; no duplicate Visiting Card table. |
| Public Profile Content | Public Content Steps 3–6 | Existing About, slider, services, treatment cost, investigation cost services/tables reused. |
| Verification | Hamburger: **Verification Application** | Existing evidence/review system extended with explicit Apply/Re-Apply lifecycle. |
| Doctor Profile | Bottom: **My Profile** | Existing personal/contact data retained; DOB, gender, blood group and address reuse existing `profiles` columns; Study Information is shown from existing verification data; verification identity is locked when submitted/approved. |
| Provider Invitations | Hamburger: **Hospital / Provider Invitation** | Existing invitation/referral flow and badge retained. |
| Public profile link/view | Bottom: **Public Profile View** | Resolves and navigates to the actual visitor-facing public route in the same app tab. |
| Support / Feedback / Help | New hamburger destinations | Support chat + feedback are persisted by new additive tables/RPCs; Help reuses published CMS pages plus built-in guidance. |

## Hamburger menu after redesign

1. Settings
2. Public Content Management
3. Verification Application
4. Hospital / Provider Invitation
5. Support / Chat with Admin
6. Feedback / Bug Report
7. FAQ / Help

No old Doctor Dashboard, Analytics, Premium, Appointments, Prescription, Chamber, Schedule, Visiting Card, Public Content or Profile duplicate entries remain in the Doctor hamburger menu.

## Bottom navigation after redesign

1. Appointment Management
2. Prescription
3. Analytics
4. My Profile
5. Public Profile View

On tablet/mobile it is a fixed bottom navigation. On desktop it becomes a responsive horizontal primary navigation while the hamburger destinations remain in the sidebar/drawer.

## Public Content Management persistence

The six steps do not introduce parallel content tables. They load and save the existing canonical Doctor data:

- Visiting Card → existing Doctor/profile/specialty data
- Chamber + location/schedule → existing provider/chamber/link/schedule data
- About + slider → existing Doctor public-content data
- Services → existing service data
- Treatment costs → existing treatment cost data
- Investigation costs → existing investigation cost data

Saved/Incomplete status is recomputed from the database after save/focus/navigation. Therefore refresh and logout do not erase completed step data.

## Verification lifecycle

- Draft: Doctor may edit verification information and evidence.
- Apply: explicit `submit_my_doctor_verification_application()` stamps `verification_submitted_at` and places the application in the review queue.
- Pending submitted: verification information/evidence are locked and cannot be re-submitted.
- Approved: verification identity remains locked.
- Rejected: review reason remains visible; Doctor may edit and explicitly Re-Apply.
- Legacy generic profile/Visiting Card RPC behavior is guarded so editing a rejected credential cannot silently auto-resubmit the application.
- Existing legacy Pending doctors with evidence are backfilled as submitted to avoid accidentally unlocking real in-progress applications.

## Database change policy

Existing migrations 01–61 were not modified. All required schema/RPC changes are isolated in:

`supabase/62_doctor_module_menu_ui_redesign.sql`

Migration 62 adds only the state/data needed by requirements that did not previously have persistence: explicit Doctor verification submission state, Doctor↔Admin support chat, and Doctor feedback/bug reports. My Profile's private details reuse existing `profiles.date_of_birth`, `gender`, `blood_group`, and `address_line` columns through field-specific RPCs; no new private-profile table is created. Existing Doctor, appointment, prescription, provider invitation, chamber, schedule and public-content relations are reused.

## Compatibility

Legacy Doctor routes remain registered so existing bookmarks/deep links do not break. They are simply removed from the redesigned Doctor menu where they would duplicate the new information architecture.
