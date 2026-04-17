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

const STAGE_ORDER = ['prospect', 'lead', 'outreach', 'discovery_call', 'proposal', 'follow_up', 'closed_won'];

router.get('/velocity', (req, res) => {
  // Average days deals spend in each stage (using stage_entered_at)
  const velocity = req.db.prepare(`
    SELECT stage,
      ROUND(AVG(julianday(COALESCE(
        CASE WHEN stage IN ('closed_won', 'closed_lost') THEN closed_at ELSE NULL END,
        datetime('now')
      )) - julianday(stage_entered_at)), 1) AS avg_days,
      COUNT(*) AS deal_count
    FROM deals
    WHERE stage_entered_at IS NOT NULL
    GROUP BY stage
  `).all();

  // Sort by pipeline order
  velocity.sort((a, b) => {
    const ia = STAGE_ORDER.indexOf(a.stage);
    const ib = STAGE_ORDER.indexOf(b.stage);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  // Stage conversion: count deals that ever reached each stage via stage_change activities
  const stageCounts = {};
  for (const s of STAGE_ORDER) {
    const row = req.db.prepare(
      "SELECT COUNT(DISTINCT deal_id) AS n FROM activities WHERE type = 'stage_change' AND content LIKE ?"
    ).get(`%→ ${s}%`);
    stageCounts[s] = row?.n || 0;
  }
  // Also count deals currently in each stage (for prospects that never had a stage_change)
  const currentCounts = req.db.prepare('SELECT stage, COUNT(*) AS n FROM deals GROUP BY stage').all();
  for (const { stage, n } of currentCounts) {
    if (stageCounts[stage] !== undefined) stageCounts[stage] = Math.max(stageCounts[stage], n);
    else stageCounts[stage] = n;
  }

  const conversion = [];
  for (let i = 0; i < STAGE_ORDER.length - 1; i++) {
    const from = STAGE_ORDER[i];
    const to = STAGE_ORDER[i + 1];
    const fromCount = stageCounts[from] || 0;
    const toCount = stageCounts[to] || 0;
    conversion.push({
      from,
      to,
      from_count: fromCount,
      to_count: toCount,
      rate: fromCount > 0 ? Math.round((toCount / fromCount) * 100) / 100 : 0,
    });
  }

  res.json({ velocity, conversion });
});

router.get('/time-investment', (req, res) => {
  // Per-deal time investment
  const deals = req.db.prepare(`
    SELECT d.id AS deal_id, c.name AS company_name, d.stage, d.estimated_value,
      COALESCE(SUM(t.time_minutes), 0) AS total_minutes,
      COUNT(CASE WHEN t.time_minutes IS NOT NULL AND t.time_minutes > 0 THEN 1 END) AS tasks_with_time,
      COUNT(t.id) AS tasks_total
    FROM deals d
    LEFT JOIN companies c ON d.company_id = c.id
    LEFT JOIN tasks t ON t.deal_id = d.id
    GROUP BY d.id
    ORDER BY total_minutes DESC
  `).all();

  // Read hourly rate from ICP config
  let hourlyRate = 100;
  try {
    const icpPath = require('path').join(__dirname, '..', 'config', 'icp.json');
    delete require.cache[require.resolve(icpPath)];
    hourlyRate = require(icpPath).hourly_rate_usd || 100;
  } catch (e) {}

  const enriched = deals.map((d) => {
    const totalHours = Math.round((d.total_minutes / 60) * 100) / 100;
    const costAtRate = Math.round(totalHours * hourlyRate);
    const roi = costAtRate > 0 && d.estimated_value > 0
      ? Math.round((d.estimated_value / costAtRate) * 100) / 100
      : null;
    return { ...d, total_hours: totalHours, cost_at_rate: costAtRate, roi };
  });

  const totalMinutes = deals.reduce((s, d) => s + d.total_minutes, 0);
  const dealsWithTime = enriched.filter((d) => d.total_minutes > 0);
  const closedWonWithTime = dealsWithTime.filter((d) => d.stage === 'closed_won');

  res.json({
    deals: enriched,
    summary: {
      total_hours: Math.round((totalMinutes / 60) * 100) / 100,
      avg_hours_per_deal: dealsWithTime.length > 0
        ? Math.round((totalMinutes / 60 / dealsWithTime.length) * 100) / 100
        : 0,
      avg_hours_per_closed_won: closedWonWithTime.length > 0
        ? Math.round((closedWonWithTime.reduce((s, d) => s + d.total_minutes, 0) / 60 / closedWonWithTime.length) * 100) / 100
        : 0,
      hourly_rate: hourlyRate,
    },
  });
});

module.exports = router;
