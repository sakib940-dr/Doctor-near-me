# Visitor Home Entry Redesign

## Implemented
- Premium location onboarding card shown only when no valid saved location exists.
- Existing `requestLocation()` remains the geolocation entry point.
- Permission grant: card fades out and location-scoped content refreshes with skeletons.
- Permission deny/unavailable: no blocking error; district/upazila fallback is highlighted.
- Hero uses layered radial/linear gradients plus subtle grid pattern.
- Search is a floating elevated card with shared focus/hover/active transitions.
- Desktop: district/upazila inline selects.
- Mobile (<768px): district/upazila buttons open animated bottom-sheet pickers.
- Search/location controls have 150-200ms interaction transitions.
- Responsive rules cover narrow mobile through wide desktop.

## Responsive source-level checks
- 360px: single-column search controls and area picker buttons; onboarding CTA full width.
- 390/430px: no horizontal search overflow; picker sheet full width.
- 768px: desktop inline selects take over; mobile sheet disabled.
- 1024px: floating search card adapts to three-column layout.
- 1280/1440px: hero spacing and content remain capped by shared container.

## Build note
A fresh dependency install could not complete in the local packaging environment, so Vite/TypeScript runtime compilation was not completed here. CSS brace/parenthesis integrity and source references were statically checked.
