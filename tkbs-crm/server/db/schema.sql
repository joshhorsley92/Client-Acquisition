-- TKBS CRM v2 — Clients & Engagements
--
-- Clean-slate schema. The v1 tables (companies, contacts, deals, tasks) and
-- their supporting deal_id FKs have been replaced with a unified clients +
-- engagements model. See C:\Users\motor\.claude\plans\josh-and-i-have-cached-seal.md
-- for the why.

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('admin', 'member')),
  totp_secret TEXT,
  totp_enabled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- One row per business relationship. Persists across all engagements.
CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  website TEXT,
  industry TEXT,
  location TEXT,
  type TEXT CHECK(type IN ('B2B', 'B2C')),
  employee_count TEXT,
  revenue_estimate TEXT,
  primary_contact_name TEXT,
  email TEXT,
  phone TEXT,
  role TEXT,
  preferred_contact TEXT CHECK(preferred_contact IN ('email', 'phone', 'text', 'linkedin')),
  additional_contacts TEXT NOT NULL DEFAULT '[]',
  social_links TEXT NOT NULL DEFAULT '{}',
  enrichment_data TEXT NOT NULL DEFAULT '{}',
  enrichment_status TEXT NOT NULL DEFAULT 'none' CHECK(enrichment_status IN ('none', 'running', 'succeeded', 'failed')),
  fit_score INTEGER,
  fit_score_breakdown TEXT,
  notes TEXT,
  owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_clients_owner_id ON clients(owner_id);
CREATE INDEX IF NOT EXISTS idx_clients_created_at ON clients(created_at DESC);

-- One row per sale/project under a client. A client may have many engagements
-- over time (Launch this year, Boost next year). Status drives the workflow.
CREATE TABLE IF NOT EXISTS engagements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new', 'working', 'won', 'lost')),
  package_type TEXT CHECK(package_type IN ('boost', 'launch', 'both', 'undecided')),
  source TEXT CHECK(source IN ('referral', 'cold', 'web', 'content', 'paid_ads')),
  source_detail TEXT,
  estimated_value REAL NOT NULL DEFAULT 0,
  closed_value REAL,
  lost_reason TEXT,
  notes TEXT,
  dashboard_user_id TEXT,
  dashboard_org_id TEXT,
  launch_client_id TEXT,
  launch_activated_at TEXT,
  owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  opened_at TEXT NOT NULL DEFAULT (datetime('now')),
  status_changed_at TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_engagements_client_id ON engagements(client_id);
CREATE INDEX IF NOT EXISTS idx_engagements_status ON engagements(status);
CREATE INDEX IF NOT EXISTS idx_engagements_closed_at ON engagements(closed_at);

-- Activities attach to a client; optionally also to a specific engagement.
-- Pre-engagement research notes can live at the client level (engagement_id null).
CREATE TABLE IF NOT EXISTS activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  engagement_id INTEGER REFERENCES engagements(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK(type IN ('email', 'call', 'meeting', 'note', 'status_change', 'system')),
  content TEXT,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_activities_client_id ON activities(client_id);
CREATE INDEX IF NOT EXISTS idx_activities_engagement_id ON activities(engagement_id);
CREATE INDEX IF NOT EXISTS idx_activities_created_at ON activities(created_at DESC);

CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  engagement_id INTEGER NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN ('analysis_deck', 'proposal', 'other')),
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  generated_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Single remaining automation: fire on engagement status transition.
-- v2 ships with one configured action (activate_launch_on_dashboard on 'won').
CREATE TABLE IF NOT EXISTS status_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  status TEXT NOT NULL,
  action_type TEXT NOT NULL CHECK(action_type IN ('activate_launch_on_dashboard')),
  config TEXT NOT NULL DEFAULT '{}',
  enabled INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- Scripts are pruned in seed-scripts.js to only Brand Profile intake, proposal
-- conversation support, and closed_won onboarding. The `stage` column is kept
-- as a categorization field; valid values are now just these three.
CREATE TABLE IF NOT EXISTS script_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stage TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('email', 'call_script', 'objection', 'checklist', 'follow_up')),
  format TEXT NOT NULL DEFAULT 'markdown' CHECK(format IN ('markdown', 'structured')),
  content TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS generation_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  engagement_id INTEGER NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN ('analysis_deck', 'proposal', 'ai_content')),
  status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running', 'completed', 'failed')),
  output TEXT,
  error TEXT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS integration_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL UNIQUE,
  config TEXT NOT NULL DEFAULT '{}',
  enabled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS email_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  engagement_id INTEGER REFERENCES engagements(id) ON DELETE SET NULL,
  direction TEXT NOT NULL CHECK(direction IN ('outbound', 'inbound')),
  gmail_message_id TEXT,
  gmail_thread_id TEXT,
  subject TEXT,
  body_text TEXT,
  body_html TEXT,
  from_email TEXT,
  to_email TEXT,
  sent_at TEXT,
  opened_at TEXT,
  clicked_at TEXT,
  tracking_pixel_id TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_email_messages_client_id ON email_messages(client_id);
CREATE INDEX IF NOT EXISTS idx_email_messages_engagement_id ON email_messages(engagement_id);

CREATE TABLE IF NOT EXISTS outbound_webhooks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  events TEXT NOT NULL DEFAULT '[]',
  headers TEXT NOT NULL DEFAULT '{}',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sms_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  engagement_id INTEGER REFERENCES engagements(id) ON DELETE SET NULL,
  direction TEXT NOT NULL CHECK(direction IN ('outbound', 'inbound')),
  twilio_sid TEXT,
  from_number TEXT,
  to_number TEXT,
  body TEXT,
  status TEXT DEFAULT 'sent',
  sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sms_messages_client_id ON sms_messages(client_id);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  metadata TEXT,
  ip_address TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON audit_log(user_id);

CREATE TABLE IF NOT EXISTS call_recordings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  engagement_id INTEGER REFERENCES engagements(id) ON DELETE SET NULL,
  call_date TEXT,
  duration_minutes INTEGER,
  audio_path TEXT,
  audio_original_name TEXT,
  audio_size_bytes INTEGER,
  transcript TEXT,
  transcript_source TEXT CHECK(transcript_source IN ('pasted', 'whisper', 'zoom', 'meet', 'manual')),
  notes TEXT,
  extracted_profile_json TEXT,
  review_status TEXT NOT NULL DEFAULT 'none' CHECK(review_status IN ('none', 'pending', 'approved', 'rejected')),
  pushed_to_dashboard_at TEXT,
  dashboard_user_id TEXT,
  dashboard_org_id TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_call_recordings_client_id ON call_recordings(client_id);
CREATE INDEX IF NOT EXISTS idx_call_recordings_engagement_id ON call_recordings(engagement_id);
CREATE INDEX IF NOT EXISTS idx_call_recordings_created_at ON call_recordings(created_at DESC);
