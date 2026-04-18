-- Default admin user (password: "changeme" — bcrypt hash set during setup)
INSERT OR IGNORE INTO users (name, email, password_hash, role)
VALUES ('Josh Horsley', 'josh@tkbsmarketing.com', '$2a$10$placeholder_will_be_set_by_setup', 'admin');

-- v2: the only automated action is firing Dashboard launch activation when an
-- engagement closes 'won'. Every other task/cadence/skill trigger is gone.
INSERT INTO status_actions (status, action_type, config, sort_order) VALUES
  ('won', 'activate_launch_on_dashboard', '{}', 0);

-- Integration settings (disabled until configured via /api/integrations UI)
INSERT OR IGNORE INTO integration_settings (type, config) VALUES ('gmail', '{}');
INSERT OR IGNORE INTO integration_settings (type, config) VALUES ('slack', '{}');
INSERT OR IGNORE INTO integration_settings (type, config) VALUES ('google_calendar', '{}');
INSERT OR IGNORE INTO integration_settings (type, config) VALUES ('twilio', '{}');
INSERT OR IGNORE INTO integration_settings (type, config) VALUES ('webhooks', '{}');
