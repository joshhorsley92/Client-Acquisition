-- TKBS CRM v1.0 — Initial Postgres schema
-- =========================================================================
-- All CRM tables live in a dedicated `crm` schema so they don't collide
-- with the sibling Dashboard's `public.*` tables in the same Supabase
-- project. The Supabase JS client is configured with `db.schema='crm'`
-- so app code calls `.from('clients')` and gets `crm.clients` for free.
--
-- What changed from the legacy SQLite schema:
--   - `users` table is gone. Supabase Auth (auth.users) is the source of
--     truth. `crm.profiles` bridges to it for CRM-specific fields (role,
--     display name).
--   - `scrape_jobs` table is gone. The Python lead-acquisition pipeline
--     is removed in v1.0; manual CSV import is the lead intake.
--   - INTEGER AUTOINCREMENT → BIGSERIAL.
--   - TEXT timestamps → TIMESTAMPTZ with `now()` defaults.
--   - JSON-as-TEXT columns → JSONB (faster + indexable).
--   - Boolean-as-INTEGER (totp_enabled etc.) → BOOLEAN.
--   - File-on-disk paths → Supabase Storage paths
--     (`audio_path` → `audio_storage_path`).
-- =========================================================================

CREATE SCHEMA IF NOT EXISTS crm;
-- Supabase requires grants to ALL of these roles for the schema to be
-- selectable in the Data API "Exposed schemas" dropdown. RLS still gates
-- per-row access, so anon/authenticated grants here are safe.
GRANT USAGE ON SCHEMA crm TO postgres, anon, authenticated, service_role;

-- Auto-touches updated_at on UPDATE. One trigger per table that has it.
CREATE OR REPLACE FUNCTION crm.touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =========================================================================
-- profiles — bridges Supabase auth.users to CRM-specific user data.
-- Auto-populated by the handle_new_user_to_crm() trigger below whenever
-- an auth.users row is inserted (e.g., via supabase.auth.admin.createUser).
-- =========================================================================
CREATE TABLE crm.profiles (
  id          UUID         PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT         NOT NULL,
  email       TEXT         NOT NULL,
  role        TEXT         NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin')),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE TRIGGER profiles_touch BEFORE UPDATE ON crm.profiles
  FOR EACH ROW EXECUTE FUNCTION crm.touch_updated_at();

CREATE OR REPLACE FUNCTION crm.handle_new_user_to_crm()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO crm.profiles (id, name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'member')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, crm;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION crm.handle_new_user_to_crm();

-- =========================================================================
-- clients — one row per business relationship; persists across engagements.
-- =========================================================================
CREATE TABLE crm.clients (
  id                      BIGSERIAL    PRIMARY KEY,
  name                    TEXT         NOT NULL,
  website                 TEXT,
  industry                TEXT,
  location                TEXT,
  type                    TEXT         CHECK (type IN ('B2B', 'B2C')),
  employee_count          TEXT,
  revenue_estimate        TEXT,
  primary_contact_name    TEXT,
  email                   TEXT,
  phone                   TEXT,
  role                    TEXT,
  preferred_contact       TEXT         CHECK (preferred_contact IN ('email', 'phone', 'text', 'linkedin')),
  additional_contacts     JSONB        NOT NULL DEFAULT '[]'::jsonb,
  social_links            JSONB        NOT NULL DEFAULT '{}'::jsonb,
  enrichment_data         JSONB        NOT NULL DEFAULT '{}'::jsonb,
  enrichment_status       TEXT         NOT NULL DEFAULT 'none'
                                         CHECK (enrichment_status IN ('none', 'running', 'succeeded', 'failed')),
  fit_score               INTEGER,
  fit_score_breakdown     JSONB,
  notes                   TEXT,
  brand_profile           JSONB        NOT NULL DEFAULT '{}'::jsonb,
  brand_profile_sources   JSONB        NOT NULL DEFAULT '{}'::jsonb,
  source_lead_id          TEXT,
  source_platform         TEXT,
  source_url              TEXT,
  source_imported_at      TIMESTAMPTZ,
  owner_id                UUID         REFERENCES crm.profiles(id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_clients_owner_id        ON crm.clients(owner_id);
CREATE INDEX idx_clients_created_at      ON crm.clients(created_at DESC);
CREATE INDEX idx_clients_source_platform ON crm.clients(source_platform);
-- Partial UNIQUE so manual-entry clients (NULL source_lead_id) don't collide.
CREATE UNIQUE INDEX idx_clients_source_lead_id_unique
  ON crm.clients(source_lead_id) WHERE source_lead_id IS NOT NULL;
CREATE TRIGGER clients_touch BEFORE UPDATE ON crm.clients
  FOR EACH ROW EXECUTE FUNCTION crm.touch_updated_at();

-- =========================================================================
-- engagements — one sale/project per row under a client.
-- =========================================================================
CREATE TABLE crm.engagements (
  id                  BIGSERIAL    PRIMARY KEY,
  client_id           BIGINT       NOT NULL REFERENCES crm.clients(id) ON DELETE CASCADE,
  status              TEXT         NOT NULL DEFAULT 'new'
                                     CHECK (status IN ('new', 'working', 'won', 'lost')),
  package_type        TEXT         CHECK (package_type IN ('boost', 'launch', 'both', 'undecided')),
  source              TEXT         CHECK (source IN ('referral', 'cold', 'web', 'content', 'paid_ads')),
  source_detail       TEXT,
  estimated_value     NUMERIC(12,2) NOT NULL DEFAULT 0,
  closed_value        NUMERIC(12,2),
  lost_reason         TEXT,
  notes               TEXT,
  owner_id            UUID         REFERENCES crm.profiles(id) ON DELETE SET NULL,
  opened_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
  status_changed_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  closed_at           TIMESTAMPTZ,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_engagements_client_id ON crm.engagements(client_id);
CREATE INDEX idx_engagements_status    ON crm.engagements(status);
CREATE INDEX idx_engagements_closed_at ON crm.engagements(closed_at);
CREATE TRIGGER engagements_touch BEFORE UPDATE ON crm.engagements
  FOR EACH ROW EXECUTE FUNCTION crm.touch_updated_at();

-- =========================================================================
-- activities — append-only feed attached to a client (and optionally an
-- engagement). Used for emails, calls, meetings, notes, status changes,
-- and any system-generated events (e.g., "applied call profile").
-- =========================================================================
CREATE TABLE crm.activities (
  id              BIGSERIAL    PRIMARY KEY,
  client_id       BIGINT       NOT NULL REFERENCES crm.clients(id) ON DELETE CASCADE,
  engagement_id   BIGINT       REFERENCES crm.engagements(id) ON DELETE SET NULL,
  type            TEXT         NOT NULL CHECK (type IN ('email', 'call', 'meeting', 'note', 'status_change', 'system')),
  content         TEXT,
  metadata        JSONB        NOT NULL DEFAULT '{}'::jsonb,
  created_by      UUID         REFERENCES crm.profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_activities_client_id     ON crm.activities(client_id);
CREATE INDEX idx_activities_engagement_id ON crm.activities(engagement_id);
CREATE INDEX idx_activities_created_at    ON crm.activities(created_at DESC);

-- =========================================================================
-- call_recordings — audio + transcript per discovery call. Audio lives
-- in Supabase Storage (`audio_storage_path`); transcript_status drops
-- 'pending'/'processing' from the legacy schema since v1.0 doesn't run
-- Whisper (paste a transcript or skip).
-- =========================================================================
CREATE TABLE crm.call_recordings (
  id                       BIGSERIAL    PRIMARY KEY,
  client_id                BIGINT       NOT NULL REFERENCES crm.clients(id) ON DELETE CASCADE,
  engagement_id            BIGINT       REFERENCES crm.engagements(id) ON DELETE SET NULL,
  call_date                TIMESTAMPTZ,
  duration_minutes         INTEGER,
  audio_storage_path       TEXT,
  audio_original_name      TEXT,
  audio_size_bytes         BIGINT,
  transcript               TEXT,
  transcript_source        TEXT         CHECK (transcript_source IN ('pasted', 'whisper', 'zoom', 'meet', 'manual')),
  notes                    TEXT,
  extracted_profile_json   JSONB,
  review_status            TEXT         NOT NULL DEFAULT 'none'
                                          CHECK (review_status IN ('none', 'pending', 'approved', 'rejected')),
  created_by               UUID         REFERENCES crm.profiles(id) ON DELETE SET NULL,
  created_at               TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_call_recordings_client_id     ON crm.call_recordings(client_id);
CREATE INDEX idx_call_recordings_engagement_id ON crm.call_recordings(engagement_id);
CREATE INDEX idx_call_recordings_created_at    ON crm.call_recordings(created_at DESC);
CREATE TRIGGER call_recordings_touch BEFORE UPDATE ON crm.call_recordings
  FOR EACH ROW EXECUTE FUNCTION crm.touch_updated_at();

-- =========================================================================
-- documents — generated proposals, analysis decks, etc.
-- =========================================================================
CREATE TABLE crm.documents (
  id              BIGSERIAL    PRIMARY KEY,
  engagement_id   BIGINT       NOT NULL REFERENCES crm.engagements(id) ON DELETE CASCADE,
  type            TEXT         NOT NULL CHECK (type IN ('analysis_deck', 'proposal', 'other')),
  storage_path    TEXT         NOT NULL,
  file_name       TEXT         NOT NULL,
  generated_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_documents_engagement_id ON crm.documents(engagement_id);

-- =========================================================================
-- script_templates — Brand Profile intake / proposal / onboarding scripts.
-- =========================================================================
CREATE TABLE crm.script_templates (
  id           BIGSERIAL    PRIMARY KEY,
  stage        TEXT         NOT NULL,
  name         TEXT         NOT NULL,
  type         TEXT         NOT NULL CHECK (type IN ('email', 'call_script', 'objection', 'checklist', 'follow_up')),
  format       TEXT         NOT NULL DEFAULT 'markdown' CHECK (format IN ('markdown', 'structured')),
  content      TEXT         NOT NULL,
  sort_order   INTEGER      NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE TRIGGER script_templates_touch BEFORE UPDATE ON crm.script_templates
  FOR EACH ROW EXECUTE FUNCTION crm.touch_updated_at();

-- =========================================================================
-- generation_jobs — async Claude-generated artifacts (proposals, AI content).
-- =========================================================================
CREATE TABLE crm.generation_jobs (
  id              BIGSERIAL    PRIMARY KEY,
  engagement_id   BIGINT       NOT NULL REFERENCES crm.engagements(id) ON DELETE CASCADE,
  type            TEXT         NOT NULL CHECK (type IN ('analysis_deck', 'proposal', 'ai_content')),
  status          TEXT         NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  output          TEXT,
  error           TEXT,
  started_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ
);
CREATE INDEX idx_generation_jobs_engagement_id ON crm.generation_jobs(engagement_id);

-- =========================================================================
-- integration_settings — per-integration config + tokens (Slack, Twilio,
-- Google OAuth, etc.). One row per integration type.
-- =========================================================================
CREATE TABLE crm.integration_settings (
  id           BIGSERIAL    PRIMARY KEY,
  type         TEXT         NOT NULL UNIQUE,
  config       JSONB        NOT NULL DEFAULT '{}'::jsonb,
  enabled      BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE TRIGGER integration_settings_touch BEFORE UPDATE ON crm.integration_settings
  FOR EACH ROW EXECUTE FUNCTION crm.touch_updated_at();

-- =========================================================================
-- email_messages — Gmail thread/message tracking for client comms.
-- =========================================================================
CREATE TABLE crm.email_messages (
  id                  BIGSERIAL    PRIMARY KEY,
  client_id           BIGINT       NOT NULL REFERENCES crm.clients(id) ON DELETE CASCADE,
  engagement_id       BIGINT       REFERENCES crm.engagements(id) ON DELETE SET NULL,
  direction           TEXT         NOT NULL CHECK (direction IN ('outbound', 'inbound')),
  gmail_message_id    TEXT,
  gmail_thread_id     TEXT,
  subject             TEXT,
  body_text           TEXT,
  body_html           TEXT,
  from_email          TEXT,
  to_email            TEXT,
  sent_at             TIMESTAMPTZ,
  opened_at           TIMESTAMPTZ,
  clicked_at          TIMESTAMPTZ,
  tracking_pixel_id   TEXT,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_email_messages_client_id     ON crm.email_messages(client_id);
CREATE INDEX idx_email_messages_engagement_id ON crm.email_messages(engagement_id);
CREATE UNIQUE INDEX idx_email_messages_tracking_pixel_id_unique
  ON crm.email_messages(tracking_pixel_id) WHERE tracking_pixel_id IS NOT NULL;

-- =========================================================================
-- outbound_webhooks — fire on engagement state changes (Slack, Zapier, etc.)
-- =========================================================================
CREATE TABLE crm.outbound_webhooks (
  id           BIGSERIAL    PRIMARY KEY,
  name         TEXT         NOT NULL,
  url          TEXT         NOT NULL,
  events       JSONB        NOT NULL DEFAULT '[]'::jsonb,
  headers      JSONB        NOT NULL DEFAULT '{}'::jsonb,
  enabled      BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- =========================================================================
-- sms_messages — Twilio SMS tracking.
-- =========================================================================
CREATE TABLE crm.sms_messages (
  id              BIGSERIAL    PRIMARY KEY,
  client_id       BIGINT       NOT NULL REFERENCES crm.clients(id) ON DELETE CASCADE,
  engagement_id   BIGINT       REFERENCES crm.engagements(id) ON DELETE SET NULL,
  direction       TEXT         NOT NULL CHECK (direction IN ('outbound', 'inbound')),
  twilio_sid      TEXT,
  from_number     TEXT,
  to_number       TEXT,
  body            TEXT,
  status          TEXT         DEFAULT 'sent',
  sent_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_sms_messages_client_id ON crm.sms_messages(client_id);

-- =========================================================================
-- audit_log — every meaningful state change. Read-only for users (admins
-- only); writes happen via the service-role client from API routes.
-- =========================================================================
CREATE TABLE crm.audit_log (
  id              BIGSERIAL    PRIMARY KEY,
  user_id         UUID         REFERENCES crm.profiles(id) ON DELETE SET NULL,
  action          TEXT         NOT NULL,
  resource_type   TEXT,
  resource_id     TEXT,
  metadata        JSONB        NOT NULL DEFAULT '{}'::jsonb,
  ip_address      TEXT,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_log_created_at ON crm.audit_log(created_at DESC);
CREATE INDEX idx_audit_log_user_id    ON crm.audit_log(user_id);

-- =========================================================================
-- Row-Level Security policies
-- =========================================================================
-- Two-person internal CRM: every authenticated user with a crm.profiles
-- row gets full access to every domain table. Audit log is admin-read.
-- The service-role client bypasses RLS entirely (used for admin ops).

ALTER TABLE crm.profiles               ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.clients                ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.engagements            ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.activities             ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.call_recordings        ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.documents              ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.script_templates       ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.generation_jobs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.integration_settings   ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.email_messages         ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.outbound_webhooks      ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.sms_messages           ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.audit_log              ENABLE ROW LEVEL SECURITY;

-- Profiles: any authenticated user can read all profiles (so we can show
-- "owned by Joe" etc.), but only update their own. Admin promotion is done
-- via the service-role client (seed-users.mjs) so we don't need a recursive
-- RLS check here. Two-person internal CRM — no fine-grained read perms needed.
--
-- IMPORTANT: do NOT make this policy a self-referential subquery on
-- crm.profiles (e.g. `EXISTS (SELECT 1 FROM crm.profiles WHERE id = auth.uid())`).
-- That breaks because the subquery is itself RLS-gated, returning nothing,
-- and the outer query returns nothing — locking everyone out.
CREATE POLICY profiles_read_all ON crm.profiles
  FOR SELECT TO authenticated
  USING (true);
CREATE POLICY profiles_update_own ON crm.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Generic full-access policy applied to every domain table.
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'clients', 'engagements', 'activities', 'call_recordings',
      'documents', 'script_templates', 'generation_jobs',
      'integration_settings', 'email_messages', 'outbound_webhooks',
      'sms_messages'
    ])
  LOOP
    EXECUTE format(
      'CREATE POLICY %I_member_full_access ON crm.%I
         FOR ALL TO authenticated
         USING (EXISTS (SELECT 1 FROM crm.profiles WHERE id = auth.uid()))
         WITH CHECK (EXISTS (SELECT 1 FROM crm.profiles WHERE id = auth.uid()));',
      tbl, tbl
    );
  END LOOP;
END $$;

-- audit_log is admin-read-only; all writes go through service-role.
CREATE POLICY audit_log_admin_read ON crm.audit_log
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM crm.profiles WHERE id = auth.uid() AND role = 'admin'));

-- =========================================================================
-- Storage bucket for call recordings
-- =========================================================================
-- Bucket creation is idempotent. Storage RLS policies live in the
-- storage schema, not crm — they reference auth.uid() the same way.
-- File paths are scoped per-client: <client_id>/<random>-<safe_name>.
INSERT INTO storage.buckets (id, name, public)
  VALUES ('crm-call-recordings', 'crm-call-recordings', false)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY crm_recordings_member_read
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'crm-call-recordings'
    AND EXISTS (SELECT 1 FROM crm.profiles WHERE id = auth.uid())
  );

CREATE POLICY crm_recordings_member_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'crm-call-recordings'
    AND EXISTS (SELECT 1 FROM crm.profiles WHERE id = auth.uid())
  );

CREATE POLICY crm_recordings_member_delete
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'crm-call-recordings'
    AND EXISTS (SELECT 1 FROM crm.profiles WHERE id = auth.uid())
  );

-- =========================================================================
-- Schema permissions — required by Supabase for the schema to appear in the
-- Data API "Exposed schemas" dropdown. RLS still gates per-row access.
-- =========================================================================
GRANT ALL ON ALL TABLES    IN SCHEMA crm TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA crm TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA crm TO postgres, anon, authenticated, service_role;

-- Defaults so new objects (added in future migrations) get the same grants.
ALTER DEFAULT PRIVILEGES IN SCHEMA crm
  GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA crm
  GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA crm
  GRANT ALL ON FUNCTIONS TO postgres, anon, authenticated, service_role;
