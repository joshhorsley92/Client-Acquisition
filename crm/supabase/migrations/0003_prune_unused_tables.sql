-- 0003 — Prune tables that ship in 0001 but have no UI or service
-- consumer. Keeping them around dilutes \dt and signals "feature exists
-- when it doesn't." Re-introduce in a future migration if/when the
-- corresponding feature ships.
--
-- Tables dropped:
--   - documents          — no Documents view / list / download anywhere.
--                          The engagements GET endpoint joined this and
--                          always returned []; that join is removed.
--   - script_templates   — /api/scripts routes exist but no Scripts page
--                          consumes them. The whole scripts API is gone
--                          alongside this table.
--   - email_messages     — Gmail integration scoped out of v1.0.
--   - sms_messages       — Twilio integration scoped out of v1.0.
--   - outbound_webhooks  — webhook dispatch deferred to v1.x.
--
-- Drop order respects FKs (none point IN to these tables).

DROP TABLE IF EXISTS crm.documents          CASCADE;
DROP TABLE IF EXISTS crm.script_templates   CASCADE;
DROP TABLE IF EXISTS crm.email_messages     CASCADE;
DROP TABLE IF EXISTS crm.sms_messages       CASCADE;
DROP TABLE IF EXISTS crm.outbound_webhooks  CASCADE;
