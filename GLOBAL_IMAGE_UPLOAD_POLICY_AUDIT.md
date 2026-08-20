# Global Image Upload Policy Audit

- Global original image limit: 3 MB (3,145,728 bytes).
- Exact rejection message: `ছবির সর্বোচ্চ সাইজ 3 MB`.
- Global capture-phase guard covers all current/future image-capable file inputs before React handlers run.
- Shared optimizer remains the only public image upload path and never falls back to storing an unoptimized original image.
- WebP master + thumbnail variants, content fingerprint dedupe, aspect-preserving contain/cover and quality-protected target compression are preserved.
- Profile/category use safe cover crop; slider/banner preserve 16:9 quality; gallery/service/logo use aspect-preserving contain.
- `avatars` and `public-images` storage buckets are capped at 3 MB via migration 58.
- `verification-documents` is not bucket-capped because it also stores PDFs; image files in that mixed bucket still pass through the same 3 MB image guard + verification optimizer.
- Size gate tests: 500 KB accepted, 2 MB accepted, 3 MB accepted, 3.1 MB rejected with the exact Bengali error.
