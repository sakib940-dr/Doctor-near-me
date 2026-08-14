# Marketplace Specialty Discovery Audit

## Implemented
- Replaced the static specialty-chip block on `VisitorHomePage.tsx` with up to six specialty marketplace sections.
- Each section loads up to 8 doctors using `searchDoctors`, scoped by `specialtyIds` and the visitor's selected district/upazila.
- Topics with no matching doctors are not rendered.
- Added horizontal scroll rows with CSS scroll-snap and desktop left/right arrow controls; arrows are hidden on mobile.
- Added consistently placed `সব দেখুন` links in every specialty section header.
- Added a loading skeleton for specialty rows.

## Doctor card
- Larger image-first card with consistent 4:3 media ratio in marketplace rows.
- Bold name, secondary specialty/degree/designation text, compact verified badge, prominent consultation fee, location/distance.
- 180ms hover/press transitions and 44px+ meaningful action areas.
- Removed the previous per-card public-profile RPC so specialty rows do not trigger dozens of additional requests.
- Directory/provider-profile contexts retain a wide layout while sharing the updated card styling.

## Provider card
- Larger 16:8 image/logo area, bold name, compact shared verified badge, secondary address text.
- Marketplace hover/press treatment and 44px+ website/profile actions.
- Public provider listing becomes a responsive 3/2/1-column marketplace grid.

## Responsive review
- 360/390px: specialty cards swipe horizontally; arrow controls hidden; verified badge collapses to icon; provider list single-column.
- 768px: mobile swipe behavior and safe card widths.
- 980/1024px: provider listing 2 columns; specialty rows remain horizontal.
- 1280/1440px: desktop arrow navigation visible; card widths remain controlled and do not over-stretch.

## Build note
A full local `npm ci` could not complete in the execution environment before timeout, so dependency-backed Vite compilation was not available here. Source braces, imports/references, CSS braces, and ZIP integrity were checked statically. Vercel's clean dependency install remains the authoritative build verification.
