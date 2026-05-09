-- TKBS CRM — 0007 Engagement recurring revenue
-- =========================================================================
-- Adds MRR support to engagements. The pricing source of truth is the
-- per-package JSONB array (each entry now carries unit_price + pricing_type
-- 'one_time' | 'monthly'); the two new aggregate columns below are caches
-- recomputed by the engagement POST/PATCH routes whenever `packages`
-- changes. Caching keeps the reports SQL fast (no JSONB aggregations).
--
--   monthly_recurring_value: sum of unit_price across packages with
--                            pricing_type='monthly' (estimate, while open)
--   closed_monthly_value:    locked-in MRR at close time (mirrors the
--                            existing closed_value pattern)
--   contract_months:         expected length of the retainer; NULL means
--                            open-ended/ongoing
-- =========================================================================

ALTER TABLE crm.engagements
  ADD COLUMN monthly_recurring_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN contract_months         INTEGER,
  ADD COLUMN closed_monthly_value    NUMERIC(12,2);

-- Index supports the Reports "active MRR" rollup, which filters won
-- engagements with non-zero MRR.
CREATE INDEX idx_engagements_active_mrr
  ON crm.engagements (status, closed_monthly_value)
  WHERE status = 'won' AND closed_monthly_value IS NOT NULL AND closed_monthly_value > 0;
