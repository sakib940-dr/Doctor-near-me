# STEP 49 — Visitor District / Upazila Picker Responsive Fix

Baseline: STEP48 Global Language / Lean Search / Auth.

## Root causes fixed
- VisitorHomePage renders the selector list with `.visitor-picker-list`, while the older responsive CSS still targeted `.visitor-picker-options`. On mobile the option buttons therefore had no row/list layout and district names flowed together like paragraph text.
- A legacy `@media (min-width: 768px)` rule forced `.visitor-picker-backdrop { display: none !important; }`, so district/upazila buttons changed React state on laptop/desktop but the dialog was always hidden.

## Fix
- Added complete `.visitor-picker-list` row styles with independent touch targets, scrolling, active state, keyboard focus, safe-area spacing, and long-name wrapping.
- Mobile remains a bottom sheet with 48–50px option rows and bounded viewport height.
- Tablet/desktop/laptop now uses a centered responsive modal (two-column option grid) instead of hiding the picker.
- Picker locks background scrolling while open and closes with Escape, backdrop click, close button, or selection.
- Existing district/upazila state, GPS resolution, localStorage persistence, discovery queries and ranking logic are unchanged.
- No SQL migration required.
