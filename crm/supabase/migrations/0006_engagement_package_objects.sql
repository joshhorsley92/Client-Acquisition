-- TKBS CRM — 0006 Engagement packages: slugs → objects
-- =========================================================================
-- 0005 stored packages as JSONB array of slug strings:  ["ad_copy", ...]
-- This migration upgrades each entry to a small object so we can attach
-- per-package metadata:
--   { "slug": "ad_copy", "details": "..." }
--   { "slug": "other",   "label":   "Newsletter setup",
--                        "details": "Mailchimp template + 4 sends/mo" }
--
-- Also drops the `legacy_*` placeholder values left behind by 0005's
-- best-effort migration of the old package_type enum — they were never
-- real package selections, just markers that something was set.
-- =========================================================================

UPDATE crm.engagements
SET packages = COALESCE(
  (
    SELECT jsonb_agg(jsonb_build_object('slug', value))
    FROM jsonb_array_elements_text(packages) AS slug(value)
    WHERE value NOT LIKE 'legacy_%'
  ),
  '[]'::jsonb
)
WHERE packages IS NOT NULL AND packages != '[]'::jsonb;
