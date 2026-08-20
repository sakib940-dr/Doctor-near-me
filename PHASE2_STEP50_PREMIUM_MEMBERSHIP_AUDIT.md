# Phase 2 STEP 50 — Premium Membership Architecture Audit

## Scope
STEP 50 adds Doctor/Hospital self-service Premium progress and Admin-controlled Premium criteria without changing the existing public ranking model. Existing STEP 39 `premium_memberships`, follower tables, referral foundation, and public Premium badges/rank helpers are reused.

## Premium source of truth
`premium_memberships` remains the only Premium status source. Doctor/Hospital clients have no INSERT/UPDATE/DELETE grant on that table. Owner requests go through `request_my_premium_membership`; Admin decisions go through `admin_decide_premium_membership`. Existing `is_doctor_premium` / `is_provider_premium` still determine active Premium status using status + start/end dates.

## Admin-configurable policy
Private `site_settings.premium_membership_policy` controls:
- Premium applications enabled/paused
- minimum followers
- minimum approved referrals
- profile completion requirement and percentage
- verification requirement
- minimum eligible achievement count
- manual Admin approval
- Premium duration
- referral claim window
- whether referral claims require Admin approval

No positive follower/referral/achievement threshold is hardcoded. Safe defaults are zero thresholds with manual Admin approval enabled.

## Progress calculation
`build_premium_progress(doctor_id, provider_id)` centralizes progress. It derives actual follower count from `patient_follows`, approved valid referral count from `referrals` joined to active referred accounts, profile completion from canonical Doctor/Provider fields, verification from existing verification state, and eligible achievements from internal Admin-awarded rules. It returns complete/pending criteria, Premium status and dates.

## Referral hardening
Existing `referral_codes` and `referrals` are reused. Direct client mutation is revoked. A Doctor/Hospital gets one unique server-generated code using `get_or_create_my_referral_code`. A referred account can claim through `claim_referral_code` only while active, within the configured signup window, cannot refer itself, and cannot receive concurrent active referral credit from multiple referrers. Existing malformed/self/mismatched/duplicate legacy rows are invalidated conservatively. Admin can require referral approval and review the queue. Premium progress counts only approved referrals whose referred account still exists and is active.

This minimizes fake/duplicate referrals without storing IP addresses, device fingerprints or other unnecessary privacy-sensitive identifiers.

## Achievement rules
Because no existing public badge/achievement system existed, STEP 50 does not create decorative public badges. It adds private Premium eligibility rules/awards only. Admin controls whether a rule is active and whether it counts toward Premium. Awards are not public profile decorations.

## Dashboard / Admin UI
Doctor: `/doctor/premium`
Hospital/Chamber: `/provider/premium`
Admin: `/admin/premium`

Owner page shows what Premium is, benefits, server-calculated progress, completed/missing criteria, current membership state, duration and secure referral link. Admin page manages policy, Premium status, achievement rules/awards and referral review.

## Global discovery priority
No duplicate sorting system was added. Existing central helpers remain authoritative:
- `doctor_public_rank_tier/score`
- `provider_public_rank_tier/score`

They already implement Premium > Verified > New > Unverified and are consumed by Homepage marketplace reads, Search, area/category/specialty discovery, ranked Hospital listings and linked Hospital Doctor lists. Near Me retains its existing distance-aware combined ranking. An expired membership immediately stops qualifying as Premium because `is_*_premium` checks `expires_at > now()`.

## Public badge
Existing Doctor/Hospital cards and Details pages already consume publication-safe stats and render the Premium badge from database Premium state. STEP 50 does not add a frontend Premium toggle.

## Security notes
- RLS remains enabled.
- Doctor/Hospital cannot directly mutate `premium_memberships`.
- Doctor/Hospital cannot directly insert/update referral credit.
- Achievement mutation is Admin-only RPC.
- Admin RPCs re-check Admin authorization server-side.
- Suspended/banned accounts remain excluded by existing publication rules; STEP 50 progress/request also requires an active owner account.
- Premium never bypasses Doctor/Hospital publication/verification safety rules.

## Validation performed
- 84 TS/TSX source files parsed with TypeScript 5.8.3: 0 syntax errors.
- Missing relative imports: 0.
- Rough unused-import check on STEP50-modified files: 0 findings.
- Stubbed local semantic TypeScript scan: no STEP50-specific errors; one unrelated existing AdminCms stub artifact only.
- CSS brace balance: 0.
- Prior SQL migrations 01–48 are byte-identical to STEP49 baseline.
- Migration50 dollar-quote balance passed.
- Migration50 static security/architecture checks passed.
- Existing central rank/public Premium badge assertions passed.
- `npm install` was attempted but timed out in this environment; therefore dependency-backed `npm run typecheck`/`npm run build` stop at missing React/Router/Lucide packages. Vercel remains the final dependency-backed build check.
