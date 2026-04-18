const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// Top-level KPIs
router.get('/summary', (req, res) => {
  const clientCount = req.db.prepare('SELECT COUNT(*) AS count FROM clients').get().count;

  const openEngagements = req.db.prepare(
    "SELECT COUNT(*) AS count FROM engagements WHERE status IN ('new', 'working')"
  ).get().count;

  const pipelineValue = req.db.prepare(
    "SELECT COALESCE(SUM(estimated_value), 0) AS total FROM engagements WHERE status IN ('new', 'working')"
  ).get().total;

  const lifetimeRevenue = req.db.prepare(
    "SELECT COALESCE(SUM(COALESCE(closed_value, estimated_value)), 0) AS total FROM engagements WHERE status = 'won'"
  ).get().total;

  const won = req.db.prepare("SELECT COUNT(*) AS count FROM engagements WHERE status = 'won'").get().count;
  const lost = req.db.prepare("SELECT COUNT(*) AS count FROM engagements WHERE status = 'lost'").get().count;
  const totalClosed = won + lost;
  const winRate = totalClosed > 0 ? Math.round((won / totalClosed) * 100) : 0;

  const avgCycle = req.db.prepare(
    "SELECT AVG(julianday(closed_at) - julianday(opened_at)) AS avg_days FROM engagements WHERE status = 'won' AND closed_at IS NOT NULL"
  ).get().avg_days;

  res.json({
    summary: {
      clients: clientCount,
      openEngagements,
      pipelineValue,
      lifetimeRevenue,
      winRate,
      totalWon: won,
      totalLost: lost,
      avgEngagementCycle: avgCycle ? Math.round(avgCycle) : null,
    },
  });
});

// Engagement count by status
router.get('/status', (req, res) => {
  const rows = req.db.prepare(
    'SELECT status, COUNT(*) AS count FROM engagements GROUP BY status ORDER BY count DESC'
  ).all();
  res.json({ status: rows });
});

router.get('/sources', (req, res) => {
  const sources = req.db.prepare(
    'SELECT source, COUNT(*) AS count FROM engagements WHERE source IS NOT NULL GROUP BY source ORDER BY count DESC'
  ).all();
  res.json({ sources });
});

router.get('/lost-reasons', (req, res) => {
  const reasons = req.db.prepare(
    "SELECT lost_reason, COUNT(*) AS count FROM engagements WHERE status = 'lost' AND lost_reason IS NOT NULL GROUP BY lost_reason ORDER BY count DESC"
  ).all();
  res.json({ reasons });
});

// Monthly closed-won revenue (last 12 months)
router.get('/monthly', (req, res) => {
  const monthly = req.db.prepare(`
    SELECT strftime('%Y-%m', closed_at) AS month,
      SUM(COALESCE(closed_value, estimated_value)) AS revenue,
      COUNT(*) AS count
    FROM engagements
    WHERE status = 'won' AND closed_at IS NOT NULL
    GROUP BY month
    ORDER BY month DESC
    LIMIT 12
  `).all();
  res.json({ monthly });
});

// Per-client lifetime revenue — headline v2 analytic.
router.get('/client-revenue', (req, res) => {
  const rows = req.db.prepare(`
    SELECT
      c.id, c.name, c.industry, c.website,
      COUNT(e.id) AS total_engagements,
      COUNT(CASE WHEN e.status = 'won' THEN 1 END) AS won_engagements,
      COUNT(CASE WHEN e.status IN ('new', 'working') THEN 1 END) AS open_engagements,
      COALESCE(SUM(CASE WHEN e.status = 'won' THEN COALESCE(e.closed_value, e.estimated_value) END), 0) AS lifetime_revenue,
      COALESCE(SUM(CASE WHEN e.status IN ('new', 'working') THEN e.estimated_value END), 0) AS open_pipeline,
      MIN(CASE WHEN e.status = 'won' THEN e.closed_at END) AS first_won_at,
      MAX(CASE WHEN e.status = 'won' THEN e.closed_at END) AS last_won_at
    FROM clients c
    LEFT JOIN engagements e ON e.client_id = c.id
    GROUP BY c.id
    ORDER BY lifetime_revenue DESC
  `).all();
  res.json({ clients: rows });
});

module.exports = router;
