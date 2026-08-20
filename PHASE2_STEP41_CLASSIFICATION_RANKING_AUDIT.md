# Phase 2 Step 41 — Degree Classification, Search Filter & Global Ranking

## Degree source of truth
`doctors.degree` remains canonical. `degree_master` and `degree_aliases` only classify/interpret the free-text field.

Classification is centralized in SQL `classify_degree_text(text)` and uses normalized, case-insensitive, punctuation-tolerant aliases managed by Admin.

Default classifications:
- MBBS -> general
- BDS -> general_dental
- any configured Specialist/Postgraduate degree -> specialist
- no recognized qualification -> unclassified

## Admin
Admin CMS > Degrees can manage Degree name/code, Basic/Postgraduate, General/Specialist, discipline, aliases and active state.
The same section manages `directory_ranking_policy` values:
- `new_entity_days`
- `near_me_distance_band_km`

## Search
Designation filter is removed from Visitor Doctor Directory UI and the frontend always sends `p_designations=null`.
The old RPC parameter remains for backward compatibility only.
Degree filter is populated from active Degree Master rows and is interpreted through `degree_text_matches_requested`.

## Global ranking
Doctor ranking is centralized through `doctor_public_rank_tier` / `doctor_public_rank_score`:
Premium > Verified > New > Unverified.

Applied to:
- search/category/specialty/district results (`search_doctors_advanced`)
- area results (`doctors_by_area`)
- marketplace/general/specialist sections (`get_public_marketplace_doctors`)
- provider doctor lists (`get_public_provider_doctors`)
- Near Me (`nearest_doctors` + `doctor_near_me_priority_score`)

Provider ranking is centralized through `provider_public_rank_tier` / `provider_public_rank_score` and `get_public_ranked_providers`.
Existing Hospital publication remains approved + verified, so public Hospital results are effectively Premium then Verified unless publication policy is separately changed later.

## Near Me
Nearest approved chamber is selected per Doctor first. Results then use central status priority adjusted by an Admin-configurable distance band. This preserves location relevance without discarding Premium/Verified priority.
