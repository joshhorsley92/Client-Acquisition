const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

router.get('/', (req, res) => {
  const q = (req.query.q || '').trim();
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);
  const perType = 5;

  if (!q || q.length < 2) {
    return res.json({ results: [] });
  }

  const term = `%${q}%`;
  const termStart = `${q}%`;

  try {
    // --- Deals (JOIN companies + contacts) ---
    const deals = req.db.prepare(`
      SELECT d.id, d.stage, d.source, d.source_detail, d.call_notes,
             c.name AS company_name, ct.name AS contact_name
      FROM deals d
      LEFT JOIN companies c ON d.company_id = c.id
      LEFT JOIN contacts ct ON d.contact_id = ct.id
      WHERE c.name LIKE ? OR ct.name LIKE ? OR d.source_detail LIKE ? OR d.call_notes LIKE ?
      LIMIT ?
    `).all(term, term, term, term, perType).map(row => ({
      type: 'deal',
      id: row.id,
      title: row.company_name || 'Deal #' + row.id,
      subtitle: (row.stage || '') + ' \u00b7 ' + (row.source || ''),
      url: '/deals/' + row.id,
      _name: row.company_name || row.contact_name || '',
    }));

    // --- Companies ---
    const companies = req.db.prepare(`
      SELECT id, name, industry, location
      FROM companies
      WHERE name LIKE ? OR industry LIKE ? OR location LIKE ?
      LIMIT ?
    `).all(term, term, term, perType).map(row => ({
      type: 'company',
      id: row.id,
      title: row.name,
      subtitle: [row.industry, row.location].filter(Boolean).join(' \u00b7 '),
      url: '/companies',
      _name: row.name || '',
    }));

    // --- Contacts ---
    const contacts = req.db.prepare(`
      SELECT id, name, email, phone
      FROM contacts
      WHERE name LIKE ? OR email LIKE ? OR phone LIKE ?
      LIMIT ?
    `).all(term, term, term, perType).map(row => ({
      type: 'contact',
      id: row.id,
      title: row.name,
      subtitle: row.email || row.phone || '',
      url: '/contacts',
      _name: row.name || '',
    }));

    // --- Call recordings (JOIN deals + companies) ---
    const calls = req.db.prepare(`
      SELECT cr.id, cr.review_status, cr.call_date, cr.notes,
             co.name AS company_name
      FROM call_recordings cr
      LEFT JOIN deals d ON cr.deal_id = d.id
      LEFT JOIN companies co ON d.company_id = co.id
      WHERE co.name LIKE ? OR cr.notes LIKE ?
      LIMIT ?
    `).all(term, term, perType).map(row => ({
      type: 'call',
      id: row.id,
      title: row.company_name || 'Call #' + row.id,
      subtitle: (row.review_status || '') + ' \u00b7 ' + (row.call_date || ''),
      url: '/calls/' + row.id,
      _name: row.company_name || '',
    }));

    // Merge and sort: exact-start matches first, then contains
    const all = [...deals, ...companies, ...contacts, ...calls];
    const lowerQ = q.toLowerCase();

    all.sort((a, b) => {
      const aStarts = a._name.toLowerCase().startsWith(lowerQ) || a.title.toLowerCase().startsWith(lowerQ);
      const bStarts = b._name.toLowerCase().startsWith(lowerQ) || b.title.toLowerCase().startsWith(lowerQ);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      return 0;
    });

    // Strip internal helper field and cap at limit
    const results = all.slice(0, limit).map(({ _name, ...rest }) => rest);

    res.json({ results });
  } catch (err) {
    console.error('[search] Error:', err.message);
    res.status(500).json({ error: 'Search failed' });
  }
});

module.exports = router;
