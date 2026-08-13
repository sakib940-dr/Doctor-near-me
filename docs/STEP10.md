# Step 10 — Ambulance Directory + Verification

Run only:

`10_ambulance_directory_verification.sql`

Run it after Step 09 succeeds.

Adds:

- `ambulance` and narrow-scope `verification_officer` roles
- Ambulance self-registration and Admin manual entry
- AC, non-AC, ICU, freezer, basic, and other vehicle types
- Private verification documents
- Pending listings hidden from all public search results
- Mandatory rejection reason and owner notification
- Availability toggle and private live-location updates
- Nearest ambulance search with district/upazila and vehicle filters
- Direct-call phone data for approved ambulance results
- Optional hospital linkage with hospital-owner/Admin approval
- Verification queue ordered oldest-first
- Verification actions recorded in the Admin audit log

Important behavior:

- A new ambulance starts as `pending`, unverified, and unavailable.
- Approval does not automatically mark it available; the owner must turn availability on.
- Editing identity, contact, vehicle, or location data sends an approved listing back to verification.
- A fresh live location is used for distance for 30 minutes. Afterwards search falls back to the verified base pin.
- Exact live coordinates are not returned by the public search RPC.
- Verification Officers do not receive Admin, CMS, homepage, or user-management permissions.

Public RPC:

- `search_ambulances(...)`

Authenticated RPCs:

- `get_my_ambulance_services()`
- `register_ambulance_service(...)`
- `update_my_ambulance_service(...)`
- `set_my_ambulance_availability(...)`
- `request_ambulance_hospital_link(...)`
- `respond_to_ambulance_hospital_link(...)`
- `get_hospital_ambulance_link_requests(...)`
- `get_ambulance_verification_queue(...)`
- `set_ambulance_verification(...)`

Previous migrations 01–09 remain unchanged and stored separately.
