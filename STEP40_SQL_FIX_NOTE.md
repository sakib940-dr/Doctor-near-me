# STEP 40 SQL Fix

Fixed `get_my_saved_profile_cards()` in `supabase/40_marketplace_homepage_read_layer.sql`.

The previous SQL ended the `UNION ALL` query with `ORDER BY saved_at DESC`, but `saved_at` was a `RETURNS TABLE` output name and was not visible in that SQL query scope on PostgreSQL, producing error 42703.

The fixed function wraps both branches in a named `saved` subquery, explicitly aliases `f.created_at AS saved_at`, and orders by `saved.saved_at DESC`.

If STEP 39 succeeded and STEP 40 failed on this error, do not rerun STEP 39. Run the corrected STEP 40, confirm success, then run STEP 41.
