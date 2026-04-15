-- Default admin user (password: "changeme" — bcrypt hash)
-- Hash generated with: bcryptjs.hashSync('changeme', 10)
INSERT OR IGNORE INTO users (name, email, password_hash, role)
VALUES ('Josh Horsley', 'josh@tkbsmarketing.com', '$2a$10$placeholder_will_be_set_by_setup', 'admin');

-- Default pipeline stages are not stored in a table — they're defined in stage_actions.
-- The deal.stage field is free-text, and the UI reads distinct stages from stage_actions.

-- Default stage actions
INSERT INTO stage_actions (stage, action_type, config, sort_order) VALUES
  ('prospect', 'create_tasks', '{"tasks":[{"description":"Research prospect digital presence","due_offset_days":0},{"description":"Qualify — worth reaching out?","due_offset_days":1}]}', 0),
  ('lead', 'create_tasks', '{"tasks":[{"description":"Research prospect","due_offset_days":0},{"description":"Send first outreach","due_offset_days":1}]}', 0),
  ('outreach', 'start_cadence', '{"reminders":[{"day":3,"template":"cold_email_2"},{"day":7,"template":"cold_email_3"},{"day":14,"template":"cold_email_4"}],"stale_after_days":21}', 0),
  ('discovery_call', 'trigger_skill', '{"skill":"tkbs-initial-analysis","prompt_template":"Build a presentation for {company}, {contact}, located in {location}, {industry} business, {type}. Additional context: {source_detail}, {notes}"}', 0),
  ('discovery_call', 'create_tasks', '{"tasks":[{"description":"Prep for discovery call","due_offset_days":-1},{"description":"Log call notes","due_offset_days":0}]}', 1),
  ('proposal', 'trigger_skill', '{"skill":"tkbs-proposals","prompt_template":"Build a proposal for {company}, {contact}. Package: {package_type}. Services: {services_discussed}. Pricing notes: {pricing_notes}. Call notes: {call_notes}"}', 0),
  ('proposal', 'create_tasks', '{"tasks":[{"description":"Send proposal","due_offset_days":1}]}', 1),
  ('follow_up', 'start_cadence', '{"reminders":[{"day":1,"template":"followup_thankyou"},{"day":4,"template":"followup_checkin"},{"day":10,"template":"followup_valueadd"},{"day":21,"template":"followup_breakup"}]}', 0),
  ('closed_won', 'create_tasks', '{"tasks":[{"description":"Send welcome email","due_offset_days":0},{"description":"Schedule kickoff meeting","due_offset_days":1},{"description":"Send onboarding checklist","due_offset_days":2}]}', 0),
  ('closed_won', 'activate_launch_on_dashboard', '{}', 1),
  ('closed_lost', 'record', '{"require_lost_reason":true,"cancel_pending_tasks":true}', 0);

-- Default integration settings (disabled until configured)
INSERT OR IGNORE INTO integration_settings (type, config) VALUES ('gmail', '{}');
INSERT OR IGNORE INTO integration_settings (type, config) VALUES ('slack', '{}');
INSERT OR IGNORE INTO integration_settings (type, config) VALUES ('google_calendar', '{}');
INSERT OR IGNORE INTO integration_settings (type, config) VALUES ('twilio', '{}');
INSERT OR IGNORE INTO integration_settings (type, config) VALUES ('webhooks', '{}');
