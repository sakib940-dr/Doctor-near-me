# Step 21 — Admin Reference and Homepage CMS

Step 21 gives Admin and Super Admin an audited interface for public discovery
and homepage content. It covers Specialties, patient-friendly Discovery Topics,
Homepage Sections, scheduled/district Banners, bilingual content pages, and
non-sensitive public site settings.

## Run the database patch first

Run after `supabase/19_admin_operations_dashboard.sql`:

`supabase/20_admin_cms_security.sql`

Expected result:

`STEP 20 ADMIN CMS SECURITY PASSED`

The patch:

- replaces direct authenticated CMS/reference writes with validated Admin RPCs;
- keeps inactive records recoverable instead of permanently deleting content;
- validates unique slugs, section keys, ordering, limits, paths, JSON filters,
  topic mappings, banner schedules, district targeting, and publish readiness;
- restricts banner records to Admin-owned `public-images/{uid}/cms/` uploads,
  while allowing another Admin to retain an existing banner image during edits;
- limits normal Admin settings to `public_brand`, `social_links`, and
  `default_location`; sensitive integrations remain Super Admin-only;
- sends every successful mutation to `admin_audit_logs`;
- preserves public reads for active/published content through the existing
  homepage configuration API.

## Route

- `/admin/cms` — Specialty, Discovery Topics, Sections, Banners, and
  Content & Settings tabs

## Live test sequence

1. Use staging data and fictional banner/content assets only.
2. Create/edit/reorder/deactivate a Specialty and verify public filters.
3. Create a Discovery Topic, map multiple Specialties, and verify homepage data.
4. Change Homepage Section ordering, visibility, card limit, view-all path, and
   JSON filter configuration. Test an invalid JSON object and invalid path.
5. Upload a banner under 5 MB, set district and date targeting, then confirm it
   appears only when active and inside its configured schedule.
6. Save About/FAQ/Help drafts and publish one valid Bangla page.
7. Edit the three allowed public JSON settings and test an invalid JSON value.
8. Confirm a Patient/Doctor cannot open the route or call any CMS mutation RPC.
9. Confirm direct authenticated CMS table writes fail after this migration.
10. Check `/admin` Activity for each save; Super Admin should see the full trail.

## Verification

```powershell
npm.cmd run typecheck
npm.cmd run build
npm.cmd run dev
```

## Next frontend slice

Step 22 will implement the Super Admin control center: privileged role changes,
Admin/Verification Officer onboarding, protected account-state controls, safe
deletion/anonymization workflow, and full platform audit review.
