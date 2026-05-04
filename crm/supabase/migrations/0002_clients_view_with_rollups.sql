-- View that decorates crm.clients with engagement + activity roll-ups.
-- The legacy SQLite query did this with correlated subqueries inside the
-- GET /api/clients route. Pushing it down to a view keeps the route
-- handler boring (a flat select with filters + sort).
--
-- Usage from the app: supabase.from('clients_with_rollups').select('*')

CREATE OR REPLACE VIEW crm.clients_with_rollups AS
SELECT
  c.*,
  (SELECT COUNT(*)::int FROM crm.engagements e WHERE e.client_id = c.id)
    AS total_engagements,
  (SELECT COUNT(*)::int FROM crm.engagements e
     WHERE e.client_id = c.id AND e.status IN ('new', 'working'))
    AS open_engagements,
  (SELECT COUNT(*)::int FROM crm.engagements e
     WHERE e.client_id = c.id AND e.status = 'won')
    AS won_engagements,
  (SELECT COALESCE(SUM(COALESCE(e.closed_value, e.estimated_value)), 0)::numeric
     FROM crm.engagements e
     WHERE e.client_id = c.id AND e.status = 'won')
    AS lifetime_revenue,
  (SELECT MAX(a.created_at)
     FROM crm.activities a
     WHERE a.client_id = c.id)
    AS last_activity_at
FROM crm.clients c;

-- Inherit RLS from the base table (Postgres views invoke the underlying
-- table's RLS policies for the SELECT clauses).
GRANT SELECT ON crm.clients_with_rollups TO authenticated;
