# Dashboard visual consistency audit

## Shared visual system
- Shared stat component: `DashboardStatCard`
- Shared stat classes: `dashboard-stat-grid`, `dashboard-stat-card`
- Shared recent activity classes: `dashboard-recent-card`, `dashboard-recent-list`, `dashboard-recent-date`, `dashboard-recent-info`, `dashboard-recent-status`
- Shared loading class: `dashboard-skeleton`
- Accent: `#0f766e`
- Shared card radius: `18px`
- Shared shadow: `0 10px 30px rgba(15, 23, 42, .065)`
- Shared stat icon: 44x44 desktop, 42x42 mobile; SVG 21x21
- Shared title size: 17px; metric size: 30px; helper text: 12px
- Recharts bar explicitly uses the shared teal accent.

## Screenshot-level breakpoint checklist
### 360px
- Doctor: 4 stat cards stack to one column; chart does not overflow; recent status wraps below content; fixed bottom nav has safe content spacing.
- Patient: 3 stat cards stack to one column; recent list matches doctor card treatment; Find Doctor CTA stacks vertically and button becomes full width.

### 390px / 430px
- Doctor: heading/action wrapping, stat icon/metric alignment, recent list truncation/status placement.
- Patient: same stat/recent typography and shadow as doctor; CTA icon/card spacing checked; no horizontal overflow.

### 768px
- Doctor: sidebar boundary active, bottom nav hidden; stat grid switches from mobile behavior toward tablet layout.
- Patient: same shell boundary and content spacing; 3-card grid follows patient layout without visual style drift.

### 1024px
- Doctor: 2-column stat grid; chart and recent panels stack according to responsive rule; card spacing remains 18px.
- Patient: 2-column stat grid with third card spanning appropriately; recent + CTA stack; shared card radius/shadow retained.

### 1440px
- Doctor: 4-column stat grid; chart/recent two-panel desktop composition; typography/icon sizes remain fixed and balanced.
- Patient: 3-column stat grid; recent + CTA desktop two-panel composition; exact shared stat/recent card treatment matches doctor.

## Duplication cleanup
- Removed unused legacy `.patient-stat-grid` and `.patient-stat-card` rules.
- Replaced doctor-prefixed dashboard-only stat/recent/skeleton class names with role-neutral shared dashboard classes.
- Merged doctor/patient stat rendering into one `DashboardStatCard` component.
- Patient-only selectors now cover layout/CTA differences rather than duplicating shared card visuals.
