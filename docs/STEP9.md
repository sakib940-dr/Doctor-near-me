# Step 9 — Homepage Discovery + CMS Foundation

Run only:

`09_homepage_discovery_cms.sql`

Run it after Step 08 succeeds.

Adds:

- রোগ/অঙ্গভিত্তিক discovery topics and specialty mapping
- Admin-managed homepage sections with reorder/hide/filter configuration
- Scheduled and district-targeted homepage banners
- Draftable About, Terms, Privacy, FAQ, and Help pages
- Public site settings for brand, social links, and default location
- One-call public homepage configuration RPC
- Advanced Bangla/English doctor search and combined filters
- Today-available, fee, degree, designation, specialty, district, and upazila filters
- Safe public result shapes that do not expose profile email, phone, or date of birth
- A fix for the Step 03 district-only doctor search predicate

After running:

1. Add rows to `discovery_topics` (for example: হৃদরোগ, চোখ, দাঁত).
2. Map each topic to one or more existing specialties in `discovery_topic_specialties`.
3. Upload banner images to storage, then save only each object path in `homepage_banners.image_path`.
4. Review and publish legal/help content; seeded content pages remain drafts intentionally.

Public RPCs:

- `get_homepage_configuration(p_district_id)`
- `search_doctors_advanced(...)`
- `doctors_by_area(...)`

Previous migrations 01–08 remain unchanged and stored separately.
