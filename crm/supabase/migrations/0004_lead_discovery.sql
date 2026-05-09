-- TKBS CRM — 0004 Lead Discovery
-- =========================================================================
-- Re-introduces the "Find New Clients" capability that was deleted in 0001
-- (the legacy Python+Selenium pipeline at the repo root). v2 stays in TS,
-- runs inside Netlify Functions, splits discovery and enrichment so each
-- function invocation fits in the 10–26s timeout budget, and lands results
-- in a staging table for human triage instead of pushing straight to clients.
--
-- Two new tables:
--   crm.scrape_jobs        — one row per discovery run; mirrors the
--                            generation_jobs polling pattern
--   crm.lead_candidates    — pre-triage pool; promote() copies a row into
--                            crm.clients, dismiss() marks it dead
-- =========================================================================

-- =========================================================================
-- scrape_jobs — job tracking for the discovery + enrichment pipeline.
-- The 'discovering' state is brief (a single source call). 'enriching' is
-- where most time is spent — the UI repeatedly calls /enrich-next while
-- this status holds. 'completed' fires when no candidates remain pending.
-- =========================================================================
CREATE TABLE crm.scrape_jobs (
  id                BIGSERIAL    PRIMARY KEY,
  status            TEXT         NOT NULL DEFAULT 'discovering'
                                   CHECK (status IN ('discovering','enriching','completed','failed')),
  source            TEXT         NOT NULL,
  params            JSONB        NOT NULL DEFAULT '{}'::jsonb,
  discovered_count  INTEGER      NOT NULL DEFAULT 0,
  enriched_count    INTEGER      NOT NULL DEFAULT 0,
  error             TEXT,
  log_output        TEXT         NOT NULL DEFAULT '',
  started_by        UUID         REFERENCES crm.profiles(id) ON DELETE SET NULL,
  started_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  completed_at      TIMESTAMPTZ
);
CREATE INDEX idx_scrape_jobs_started_at ON crm.scrape_jobs(started_at DESC);
CREATE INDEX idx_scrape_jobs_status     ON crm.scrape_jobs(status);

-- =========================================================================
-- lead_candidates — discovered businesses awaiting triage. Shape mirrors
-- crm.clients on the fields we promote (name, website, contact, industry,
-- enrichment_data) plus discovery-specific columns (source, opportunity
-- score, signals).
--
-- The (source, source_id) UNIQUE index is the dedup boundary — running the
-- same Google Places query twice silently no-ops on the second run.
-- =========================================================================
CREATE TABLE crm.lead_candidates (
  id                   BIGSERIAL    PRIMARY KEY,
  job_id               BIGINT       REFERENCES crm.scrape_jobs(id) ON DELETE SET NULL,
  source               TEXT         NOT NULL,
  source_id            TEXT         NOT NULL,
  name                 TEXT         NOT NULL,
  website              TEXT,
  phone                TEXT,
  email                TEXT,
  address              TEXT,
  city                 TEXT,
  state                TEXT,
  zip                  TEXT,
  industry             TEXT,
  google_rating        NUMERIC(3,2),
  google_reviews_ct    INTEGER,
  google_types         JSONB        NOT NULL DEFAULT '[]'::jsonb,
  enrichment_data      JSONB        NOT NULL DEFAULT '{}'::jsonb,
  opportunity_score    INTEGER,
  opportunity_signals  JSONB        NOT NULL DEFAULT '[]'::jsonb,
  status               TEXT         NOT NULL DEFAULT 'discovered'
                                       CHECK (status IN ('discovered','enriching','enriched','dismissed','promoted','failed')),
  promoted_client_id   BIGINT       REFERENCES crm.clients(id) ON DELETE SET NULL,
  enrich_error         TEXT,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
  enriched_at          TIMESTAMPTZ
);
CREATE UNIQUE INDEX idx_lead_candidates_source_id ON crm.lead_candidates(source, source_id);
CREATE INDEX        idx_lead_candidates_job       ON crm.lead_candidates(job_id);
CREATE INDEX        idx_lead_candidates_status    ON crm.lead_candidates(status);
CREATE INDEX        idx_lead_candidates_score     ON crm.lead_candidates(opportunity_score DESC NULLS LAST);
CREATE INDEX        idx_lead_candidates_created   ON crm.lead_candidates(created_at DESC);

-- =========================================================================
-- RLS — same shape as the rest of crm.* domain tables. Any authenticated
-- profile can read/write; the app is two-person internal so we don't need
-- per-row scoping.
-- =========================================================================
ALTER TABLE crm.scrape_jobs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.lead_candidates  ENABLE ROW LEVEL SECURITY;

CREATE POLICY scrape_jobs_member_full_access ON crm.scrape_jobs
  FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM crm.profiles WHERE id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM crm.profiles WHERE id = auth.uid()));

CREATE POLICY lead_candidates_member_full_access ON crm.lead_candidates
  FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM crm.profiles WHERE id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM crm.profiles WHERE id = auth.uid()));
