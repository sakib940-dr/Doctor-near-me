# Bulk Admin + Verification Audit

## Admin Users tab
- Added per-row checkboxes and a select-all checkbox for manageable users on the current page.
- Bulk action bar appears only when one or more users are selected.
- Supports bulk suspend and bulk restore.
- One common reason field is shared by the selected users; suspension requires at least 3 characters, matching the existing RPC rule.
- Destructive bulk suspend and bulk restore both use a two-click confirmation state.
- The UI excludes the current admin account and Admin/Super Admin targets from ordinary admin bulk selection, matching existing single-action restrictions.
- Every selected target is sent through `setAdminUserAccountStatus(...)` individually. The existing `admin_set_user_account_status` RPC writes its own audit log for each actual status change.

## Verification queue
- Added checkboxes only for pending rows plus a visible-pending select-all control.
- Added a two-step `Approve selected` bulk action.
- Every selected row is approved through a separate `decideVerificationReview(...)` call.
- The existing `decide_verification_review` RPC creates a notification and a separate `admin_audit_logs` row on every successful call, so bulk approval preserves per-entity audit history.
- Partial failures are surfaced without hiding successful approvals.

## Backend changes
No new SQL migration or bulk mutation RPC was added. Existing audited RPCs are intentionally reused per target to preserve permissions and separate audit entries.

## Responsive
- Admin bulk bar: multi-column desktop, two-column tablet, stacked mobile.
- Verification selection checkbox keeps a 44px interaction area.
- Queue row detail remains a separate button from selection.
