-- TKBS CRM — 0005 Engagement packages (multi-select) + new source enum
-- =========================================================================
-- Engagements used to have a single `package_type` enum (boost/launch/both/
-- undecided). The new model is a JSONB array of selected services so a
-- proposal can itemize what we're actually delivering. Same for `source` —
-- the previous referral/cold/web/content/paid_ads enum gets replaced with
-- a more accurate set that maps to how leads actually reach us.
--
-- All existing rows are migrated to the new shape. None of the old enum
-- values survive after this migration runs.
-- =========================================================================

-- ---------------------------------------------------------------------------
-- Packages (multi-select array)
-- ---------------------------------------------------------------------------

ALTER TABLE crm.engagements
  ADD COLUMN packages JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Migrate existing package_type values into the array. The legacy values
-- map roughly to "we have something selected" but don't correspond 1:1 to
-- the new line-item options, so we just preserve whatever was there as a
-- single-element array prefixed with `legacy_` so it's obviously old data.
UPDATE crm.engagements
SET packages = jsonb_build_array('legacy_' || package_type)
WHERE package_type IS NOT NULL;

ALTER TABLE crm.engagements DROP COLUMN package_type;

-- ---------------------------------------------------------------------------
-- Source enum migration
-- ---------------------------------------------------------------------------

-- Drop the old CHECK so we can rename in place.
ALTER TABLE crm.engagements DROP CONSTRAINT IF EXISTS engagements_source_check;

-- Map old values to the closest new value. Best-effort — anything we
-- can't map cleanly becomes NULL so it shows up as "—" in the UI and the
-- user can recategorize.
UPDATE crm.engagements SET source = 'warm_referral'
  WHERE source = 'referral';
UPDATE crm.engagements SET source = 'cold_outreach'
  WHERE source = 'cold';
UPDATE crm.engagements SET source = 'tkbs_marketing_material'
  WHERE source IN ('web', 'content');
UPDATE crm.engagements SET source = 'social_media'
  WHERE source = 'paid_ads';

ALTER TABLE crm.engagements
  ADD CONSTRAINT engagements_source_check
  CHECK (source IN (
    'warm_referral',
    'warm_outreach',
    'cold_outreach',
    'tkbs_marketing_material',
    'social_media',
    'booked_call_with_tkbs'
  ));
