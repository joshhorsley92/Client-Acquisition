const router = require('express').Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { executeStageActions } = require('../services/stage-actions');

router.use(requireAuth);
router.use(requireAdmin);

// POST /api/import/bulk — import an array of prospects/leads
router.post('/bulk', (req, res) => {
  const { prospects, default_stage, default_source } = req.body;

  if (!prospects || !Array.isArray(prospects) || prospects.length === 0) {
    return res.status(400).json({ error: 'prospects array is required' });
  }

  if (prospects.length > 500) {
    return res.status(400).json({ error: 'Maximum 500 prospects per import' });
  }

  const stage = default_stage || 'prospect';
  const source = default_source || 'cold';
  const results = { imported: 0, skipped: 0, errors: [] };

  const importOne = req.db.transaction((prospect) => {
    const {
      company_name, contact_name, contact_email, contact_phone,
      location, industry, type, website, source: prospectSource, notes,
    } = prospect;

    if (!company_name && !contact_name) {
      results.errors.push({ prospect, error: 'company_name or contact_name required' });
      return;
    }

    // Deduplicate by company name
    let companyId = null;
    if (company_name) {
      const existing = req.db.prepare('SELECT id FROM companies WHERE name = ?').get(company_name);
      if (existing) {
        // Skip if there's already an active deal for this company
        const activeDeal = req.db.prepare(
          "SELECT id FROM deals WHERE company_id = ? AND stage NOT IN ('closed_won', 'closed_lost')"
        ).get(existing.id);
        if (activeDeal) {
          results.skipped++;
          return;
        }
        companyId = existing.id;
        // Update company info if new data provided
        if (location || industry || type || website) {
          req.db.prepare(
            "UPDATE companies SET location = COALESCE(?, location), industry = COALESCE(?, industry), type = COALESCE(?, type), website = COALESCE(?, website), updated_at = datetime('now') WHERE id = ?"
          ).run(location || null, industry || null, type || null, website || null, companyId);
        }
      } else {
        const result = req.db.prepare(
          'INSERT INTO companies (name, location, industry, type, website) VALUES (?, ?, ?, ?, ?)'
        ).run(company_name, location || null, industry || null, type || null, website || null);
        companyId = result.lastInsertRowid;
      }
    }

    // Deduplicate contact by email
    let contactId = null;
    if (contact_name || contact_email) {
      let existing = null;
      if (contact_email) {
        existing = req.db.prepare('SELECT id FROM contacts WHERE email = ?').get(contact_email);
      }
      if (existing) {
        contactId = existing.id;
        if (contact_phone) {
          req.db.prepare(
            'UPDATE contacts SET phone = COALESCE(phone, ?), company_id = COALESCE(company_id, ?) WHERE id = ?'
          ).run(contact_phone, companyId, contactId);
        }
      } else {
        const result = req.db.prepare(
          'INSERT INTO contacts (name, email, phone, company_id) VALUES (?, ?, ?, ?)'
        ).run(contact_name || 'Unknown', contact_email || null, contact_phone || null, companyId);
        contactId = result.lastInsertRowid;
      }
    }

    // Create deal
    const dealResult = req.db.prepare(
      `INSERT INTO deals (contact_id, company_id, stage, source, source_detail, owner_id)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(contactId, companyId, stage, prospectSource || source, notes || null, req.user.id);

    // Fire stage actions
    executeStageActions(req.db, dealResult.lastInsertRowid, stage, req.user.id);

    results.imported++;
  });

  for (const prospect of prospects) {
    try {
      importOne(prospect);
    } catch (err) {
      results.errors.push({ prospect: prospect.company_name || prospect.contact_name, error: err.message });
    }
  }

  res.json(results);
});

module.exports = router;
