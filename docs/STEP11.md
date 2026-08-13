# Step 11 — Reference Data, Storage Security, and Smoke Tests

Run after Step 10:

1. `supabase/11_reference_data_storage.sql`
2. `supabase/11b_rpc_acl_hardening.sql`
3. `tests/step11_smoke.sql`

Adds:

- 8 divisions and 64 districts with Bangla/English names
- 495 upazilas with stable source codes and coordinates
- All 9 Sirajganj upazilas
- 26 medical specialties
- 16 patient-friendly disease/organ discovery topics
- Bangla/English search keywords and topic-to-specialty mappings
- Public avatar/image buckets
- Public object URLs without anonymous bucket-list access
- Private verification-document bucket
- Owner-folder upload policies
- Ambulance document owner/verification-staff policies
- Reference-data health RPC and fail-fast migration assertions
- Explicit anonymous RPC permission hardening
- A read-only staging smoke-test script

## Data provenance

Location seed source:

- Bangladesh Administrative Divisions Dataset, CC-BY-4.0
- Snapshot updated 2026-06-01
- https://github.com/open-admin-data/bangladesh-administrative-divisions

The 8-division/64-district structure and Sirajganj's 9 upazilas were
cross-checked against the Bangladesh National Portal.

The source snapshot contains 495 upazilas. During the August 2026 check, the
National Portal header displayed a higher total while individual government
pages were not fully consistent. Sirajganj data is verified; nationwide launch
should include a final government geocode reconciliation.

## Storage object paths

- Avatar bucket: `{user-id}/avatar.webp`
- Public images bucket: `{user-id}/image.webp`
- Verification documents bucket: `ambulances/{ambulance-id}/{file}`

Save only bucket/object paths in application tables. Build public URLs through
one frontend image helper so a future Cloudflare R2 migration remains easy.

## Expected smoke-test result

The last query returns:

`STEP 11 SMOKE TEST PASSED`

If an assertion fails, do not continue to frontend integration until the
reported migration, permission, or seed issue has been fixed.
