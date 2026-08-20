# Free-Tier Resource Optimization Audit

Baseline: cumulative production branch after Admin Final Polish + Global 3 MB Image Policy. SEO remains on hold.

## Read-path changes
- Public-safe in-memory TTL cache with in-flight dedupe and bounded entry count.
- Homepage primary/secondary doctor rails batched into two bounded RPC groups; below-fold group remains lazy.
- Doctor search, marketplace and Near Me return complete card data in one RPC, removing client hydration/N+1 calls.
- Provider doctors, public providers, admin users/appointments, Super Admin users, verification queue, blood donors, and appointment management use bounded pagination.
- Doctor/Provider public page base data is bundled; viewer-specific follow state remains private/non-persistent.
- Notification Bell uses one preview RPC and 3-minute visible-tab polling; Notification Center uses one paginated page+unread RPC.
- Patient and Doctor dashboard appointment summaries are aggregated server-side.
- Structured review summary + rows is bundled; profile follower/review stats are batch aggregated.
- Provider/Doctor content reorder uses one write RPC instead of per-row PATCH calls.

## Cache safety
Only public-safe directory/reference/content reads use TTL value caching. Authenticated notification, appointment, dashboard, follow-state and other private reads use in-flight dedupe only and are not persisted in browser cache storage.

## Storage/bandwidth
Existing optimized WebP master/thumbnail delivery, lazy-loading, image dimensions and global 3 MB upload policy are preserved. Cards continue to request thumbnail variants.

## Database
Migration 59 adds targeted partial/composite indexes and read-only/batched RPCs. Existing RLS/auth/business rules remain authoritative.

## Hosting
No new Vercel Function, KV, Redis, paid feature, SEO server, domain rule, service-worker cache rule or private-data cache was added.
