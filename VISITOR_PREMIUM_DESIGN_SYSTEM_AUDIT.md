# Visitor Premium Design System Audit — v18

## Shared design tokens
- Primary healthcare accent: teal/emerald (`--brand-700: #0b8467`)
- Shared surface, text, border variables
- Shared spacing scale: 4–64px
- Shared radius scale: 8/12/16/20/24px + pill
- Shared shadow scale: xs/sm/md/lg
- Shared 170ms interaction transition
- Legacy visitor/green variables are aliased to the new brand tokens for compatibility.

## Visitor landing consistency changes
- PublicHeader now uses route-aware active states instead of a hardcoded doctor state.
- VisitorBottomNav now highlights Home/Doctors/Providers and blood/ambulance hash destinations.
- Header, bottom nav, hero search card, marketplace doctor/provider cards, section headings, emergency cards, trust strip and footer use the same teal token system.
- Alternating soft sections retain a consistent surface/border treatment.
- Section vertical spacing and header spacing are normalized.
- Emergency Blood/Ambulance area now uses elevated cards, subtle gradients and consistent icon containers.
- Trust strip is now a three-card trust/stat badge strip rather than a flat solid band.
- Doctor/provider hover/press states and action controls share radius/shadow/transition tokens.

## Responsive rule audit
### 360px
- Header logo/text remains within one row; hamburger is a 44px target.
- Mobile menu opens as a rounded elevated panel.
- Visitor sections use compact 32px vertical rhythm.
- Section headers retain readable hierarchy and View All remains tappable.
- Emergency cards stack to one column.
- Trust badges stack to one column.
- Bottom nav stays fixed with safe-area padding; each destination has a >=60px row target.
- Horizontal doctor discovery remains swipeable and snap-aligned.

### 768px
- Mobile/desktop navigation boundary checked around 760/761px existing breakpoint.
- Bottom nav disappears above the mobile boundary.
- Desktop header navigation resumes without crowding.
- Emergency cards remain two-column where space permits.
- Section spacing increases to tablet rhythm.

### 1024px
- Header nav spacing is reduced through the tablet override to avoid crowding.
- Marketplace rows retain horizontal navigation and card sizing.
- Emergency two-card composition remains balanced.
- Section headings and CTA links remain aligned on one row where possible.

### 1440px
- Container is capped at 1200px with 64px viewport gutters.
- Section rhythm expands to 68px without excessive whitespace.
- Cards remain constrained rather than stretching with the viewport.
- Header, hero, marketplace rows, emergency cards and trust strip keep a consistent visual density.

## Build validation note
CSS braces are balanced. Source-level class/import checks passed for the modified visitor files. A full local Vite build could not complete because dependency installation timed out in this execution environment; the subsequent TypeScript run therefore reported missing React/Vite packages rather than source-specific errors.
