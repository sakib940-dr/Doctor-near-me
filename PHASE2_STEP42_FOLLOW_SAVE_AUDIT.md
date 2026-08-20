# Phase 2 STEP 42 — Patient Follow / Save Completion

## Reused architecture

- Canonical relationship table: `public.patient_follows` from STEP 39.
- Duplicate protection remains the existing partial unique indexes for Patient+Doctor and Patient+Provider.
- Public counts/state use `get_public_profile_stats` / `get_public_profile_stats_batch`.
- Saved list uses the corrected STEP 40 `get_my_saved_profile_cards()` read model.
- No second favorites/saves/followers table was added.

## UI integration

A reusable `src/components/FollowSaveButton.tsx` is now the single Follow/Save action for:

- marketplace Doctor cards,
- marketplace Hospital/Provider cards,
- Doctor public profile,
- Hospital/Provider public profile,
- Provider website hero,
- Saved profiles page.

Logged-out visitors are sent to the existing `/auth` flow with the current public URL stored as the return path. Authenticated non-Patient roles do not receive a Follow button. Active Patient accounts mutate only through `toggle_my_follow`.

The Patient Saved page is split into Saved Doctors and Saved Hospitals/Chambers and remains backed only by `patient_follows`.

## Follower counts

Doctor and Provider public profiles show `মোট অনুসারী` from server-side unique follow rows. No frontend fake counter is used.

## Analytics

STEP 42 extends private `profile_interactions` event history with `follow_gain` and `follow_loss`. These events are inserted only by the protected `toggle_my_follow` RPC and only when the canonical row actually changes. The public interaction RPC still does not accept follow events.

Owner summaries now expose:

- `followers`: exact current total,
- `followers_new`: follow gains in the selected period,
- `followers_lost`: unfollows in the selected period,
- `followers_net`: gains minus losses.

Doctor Dashboard displays total followers and 30-day gain/loss/net context. Provider/Hospital per-provider metrics are available through the existing owner aggregate RPC, avoiding an incorrect cross-provider merge for accounts that own multiple providers.

Historical gain/loss events begin from migration 42; pre-42 current follower totals remain exact, but old follow/unfollow history cannot be reconstructed.

## Security

- `patient_follows` RLS remains enabled.
- Direct INSERT/UPDATE/DELETE stays revoked from authenticated clients.
- Only an active Patient role can call the mutation RPC successfully.
- Doctor/Provider accounts cannot forge follower rows.
- Unfollow/follow is idempotent and database-unique across devices/sessions.
- Public Doctor/provider eligibility checks are preserved before following.
- Raw follower event rows remain private; owner dashboards receive aggregates only.
