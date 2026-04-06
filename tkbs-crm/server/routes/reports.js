const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

router.get('/summary', (req, res) => {
  const activeDeals = req.db.prepare(
    "SELECT COUNT(*) as count FROM deals WHERE stage NOT IN ('closed_won', 'closed_lost')"
  ).get().count;

  const pipelineValue = req.db.prepare(
    "SELECT COALESCE(SUM(estimated_value), 0) as total FROM deals WHERE stage NOT IN ('closed_won', 'closed_lost')"
  ).get().total;

  const won = req.db.prepare("SELECT COUNT(*) as count FROM deals WHERE stage = 'closed_won'").get().count;
  const lost = req.db.prepare("SELECT COUNT(*) as count FROM deals WHERE stage = 'closed_lost'").get().count;
  const totalClosed = won + lost;
  const winRate = totalClosed > 0 ? Math.round((won / totalClosed) * 100) : 0;

  const avgCycle = req.db.prepare(
    "SELECT AVG(julianday(closed_at) - julianday(created_at)) as avg_days FROM deals WHERE stage = 'closed_won' AND closed_at IS NOT NULL"
  ).get().avg_days;

  res.json({
    summary: {
      activeDeals,
      pipelineValue,
      winRate,
      avgDealCycle: avgCycle ? Math.round(avgCycle) : null,
      totalWon: won,
      totalLost: lost,
    },
  });
});

router.get('/funnel', (req, res) => {
  const stages = req.db.prepare(
    'SELECT stage, COUNT(*) as count FROM deals GROUP BY stage ORDER BY count DESC'
  ).all();
  res.json({ funnel: stages });
});

router.get('/sources', (req, res) => {
  const sources = req.db.prepare(
    'SELECT source, COUNT(*) as count FROM deals WHERE source IS NOT NULL GROUP BY source ORDER BY count DESC'
  ).all();
  res.json({ sources });
});

router.get('/lost-reasons', (req, res) => {
  const reasons = req.db.prepare(
    "SELECT lost_reason, COUNT(*) as count FROM deals WHERE stage = 'closed_lost' AND lost_reason IS NOT NULL GROUP BY lost_reason ORDER BY count DESC"
  ).all();
  res.json({ reasons });
});

router.get('/monthly', (req, res) => {
  const monthly = req.db.prepare(
    "SELECT strftime('%Y-%m', closed_at) as month, SUM(estimated_value) as revenue, COUNT(*) as count FROM deals WHERE stage = 'closed_won' AND closed_at IS NOT NULL GROUP BY month ORDER BY month DESC LIMIT 12"
  ).all();
  res.json({ monthly });
});

module.exports = router;
