-- TKBS CRM — 0008 Engagement title (custom override)
-- =========================================================================
-- Adds an optional `title` column to engagements. When NULL, the UI
-- falls back to the auto-derived package list ("Ad Copy, Landing Page #3").
-- When set, the custom title is used everywhere the engagement is named —
-- detail-page header, kanban cards, list table, AutomationRunModal label.
-- =========================================================================

ALTER TABLE crm.engagements
  ADD COLUMN title TEXT;
