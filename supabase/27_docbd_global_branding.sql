-- ============================================================
-- STEP 27 — DOCBD.INFO GLOBAL BRANDING
-- Run after Step 26. Safe to re-run.
-- Reuses the existing public_brand setting; no new table/field.
-- ============================================================

update public.site_settings
set setting_value = '{"site_name_bn":"docbd.info","site_name_en":"docbd.info"}'::jsonb,
    is_public = true,
    description = 'Public brand name',
    updated_at = now()
where setting_key = 'public_brand';
